/**
 * OpenAI-compatible provider for proxy services (Poe, OpenRouter, etc.)
 *
 * Uses the OpenAI SDK to talk to any OpenAI-compatible endpoint.
 * This is used when the orca CLI targets a proxy provider that speaks
 * OpenAI protocol but serves multiple model families (Claude, GPT, Gemini).
 */

import { execSync } from 'node:child_process'

import { logWarning } from '../logger.js'
import { getContextWindowForModelOrDefault, getMaxOutputForModelOrDefault } from '../model-metadata.js'

export interface OpenAICompatOptions {
  apiKey: string
  baseURL: string
  model: string
  systemPrompt?: string
  maxTokens?: number
  /** Extra HTTP headers (e.g. for GitHub Copilot API) */
  headers?: Record<string, string>
  /** Reasoning effort level for models that support it (e.g. GPT-5.x via Copilot) */
  reasoningEffort?: string
}

export interface StreamEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'usage' | 'done' | 'error'
  text?: string
  toolName?: string
  toolInput?: string
  toolOutput?: string
  toolSuccess?: boolean
  inputTokens?: number
  outputTokens?: number
  error?: string
}

export interface ToolCallbacks {
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<{ success: boolean; output: string }> | { success: boolean; output: string }
  abortSignal?: AbortSignal
}

export interface ChatContentPartText {
  type: 'text'
  text: string
}

export interface ChatContentPartImage {
  type: 'image_url'
  image_url: {
    url: string
  }
}

export type PromptContent = string | Array<ChatContentPartText | ChatContentPartImage>

export function messageContentToText(content: PromptContent): string {
  if (typeof content === 'string') return content
  return content
    .map((part) => part.type === 'text'
      ? part.text
      : `[image:${part.image_url.url.slice(0, 48)}]`)
    .join('\n')
}

/**
 * Stream a chat completion from an OpenAI-compatible endpoint.
 * Yields StreamEvent objects for the CLI to render.
 */
/**
 * Resolve HTTP proxy from environment, with macOS system proxy fallback.
 *
 * Resolution order:
 *   1. HTTPS_PROXY / HTTP_PROXY / ALL_PROXY env vars
 *   2. macOS system proxy via `scutil --proxy` (Surge, Clash, Shadowrocket etc.)
 */
let _cachedSystemProxy: string | undefined | null = null // null = not checked yet

function detectMacOSSystemProxy(): string | undefined {
  if (process.platform !== 'darwin') return undefined
  try {
    const output = execSync('scutil --proxy 2>/dev/null', { encoding: 'utf-8', timeout: 2000 })
    // Check HTTPS proxy first, then HTTP
    const httpsEnabled = /HTTPSEnable\s*:\s*1/.test(output)
    if (httpsEnabled) {
      const hostMatch = output.match(/HTTPSProxy\s*:\s*(\S+)/)
      const portMatch = output.match(/HTTPSPort\s*:\s*(\d+)/)
      if (hostMatch && portMatch) {
        return `http://${hostMatch[1]}:${portMatch[1]}`
      }
    }
    const httpEnabled = /HTTPEnable\s*:\s*1/.test(output)
    if (httpEnabled) {
      const hostMatch = output.match(/HTTPProxy\s*:\s*(\S+)/)
      const portMatch = output.match(/HTTPPort\s*:\s*(\d+)/)
      if (hostMatch && portMatch) {
        return `http://${hostMatch[1]}:${portMatch[1]}`
      }
    }
  } catch { /* scutil not available or timed out */ }
  return undefined
}

function resolveProxy(): string | undefined {
  // Environment variables take priority
  const envProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY
  if (envProxy) return envProxy

  // Fallback: macOS system proxy (cached after first check)
  if (_cachedSystemProxy === null) {
    _cachedSystemProxy = detectMacOSSystemProxy()
  }
  return _cachedSystemProxy
}

function getToolLimitForBaseURL(baseURL: string | undefined): number | undefined {
  if (!baseURL) return undefined
  if (baseURL.includes('githubcopilot.com')) return 128
  return undefined
}

function limitToolsForProvider<T>(baseURL: string | undefined, tools: T[] | undefined): T[] | undefined {
  if (!tools || tools.length === 0) return tools
  const maxTools = getToolLimitForBaseURL(baseURL)
  if (!maxTools || tools.length <= maxTools) return tools
  logWarning('truncating tools for provider limit', {
    baseURL,
    requested: tools.length,
    sent: maxTools,
  })
  return tools.slice(0, maxTools)
}

function getToolName(tool: Record<string, unknown>): string | undefined {
  const fn = tool.function as Record<string, unknown> | undefined
  return typeof fn?.name === 'string' ? fn.name : undefined
}

function shouldSkipReasoningEffortForChatCompletions(
  options: Pick<OpenAICompatOptions, 'baseURL' | 'model' | 'reasoningEffort'>,
  tools: Array<Record<string, unknown>> | undefined,
): boolean {
  if (!options.reasoningEffort || !tools || tools.length === 0) return false
  const isGpt5Family = options.model.toLowerCase().includes('gpt-5')
  if (!isGpt5Family) return false
  const usesChatCompletionsCompat =
    options.baseURL?.includes('githubcopilot.com') ||
    options.baseURL?.includes('api.openai.com')
  return Boolean(usesChatCompletionsCompat)
}

let proxyWarningShown = false

async function createOpenAIClient(apiKey: string, baseURL: string, extraHeaders?: Record<string, string>) {
  const { default: OpenAI } = await import('openai')

  const defaultHeaders = extraHeaders && Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined

  const proxyUrl = resolveProxy()
  if (proxyUrl) {
    if (!proxyWarningShown && proxyUrl.startsWith('http://') && baseURL.startsWith('https://')) {
      console.error('\x1b[33m  warn: using HTTP proxy for HTTPS traffic\x1b[0m')
      logWarning('using HTTP proxy for HTTPS traffic', { proxyUrl, baseURL })
      proxyWarningShown = true
    }
    // OpenAI SDK v6 uses native fetch; we override with proxy-aware fetch
    const { ProxyAgent, fetch: undiciFetch } = await import('undici')
    const dispatcher = new ProxyAgent(proxyUrl)
    const proxyFetch = (url: string | URL | Request, init?: RequestInit) =>
      undiciFetch(url as string, { ...(init as Record<string, unknown>), dispatcher } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>
    return new OpenAI({ apiKey, baseURL, fetch: proxyFetch, maxRetries: 0, defaultHeaders })
  }

  return new OpenAI({ apiKey, baseURL, maxRetries: 0, defaultHeaders })
}

/**
 * Retry wrapper for 429 rate limit errors.
 * Retries up to 3 times with exponential backoff (2s, 4s, 8s).
 */
async function withRateLimitRetry<T>(fn: () => Promise<T>, label?: string): Promise<T> {
  const MAX_RETRIES = 3
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // GitHub Copilot API returns 403 for rate limits (non-standard), treat same as 429
      const isRateLimit = message.includes('429') || message.includes('rate') ||
        (message.includes('403') && message.includes('forbidden'))
      if (!isRateLimit || attempt === MAX_RETRIES) throw err

      const delay = Math.pow(2, attempt + 1) * 1000 // 2s, 4s, 8s
      console.error(`\x1b[33m  rate limited${label ? ` (${label})` : ''} — retrying in ${delay / 1000}s (${attempt + 1}/${MAX_RETRIES})\x1b[0m`)
      logWarning('rate limited, retrying', { label, attempt: attempt + 1, delayMs: delay })
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}

/**
 * Stream a chat completion from an OpenAI-compatible endpoint.
 * Yields StreamEvent objects for the CLI to render.
 */
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: PromptContent }

function buildChatMessages(
  systemPrompt: PromptContent | undefined,
  history: ChatMessage[] | undefined,
  prompt: PromptContent,
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = []
  const systemPromptText = systemPrompt ? messageContentToText(systemPrompt) : ''
  let skippedDuplicateSystemPrompt = false

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }

  if (history) {
    for (const message of history) {
      if (
        message.role === 'system' &&
        systemPromptText &&
        !skippedDuplicateSystemPrompt &&
        messageContentToText(message.content) === systemPromptText
      ) {
        skippedDuplicateSystemPrompt = true
        continue
      }
      messages.push({ role: message.role, content: message.content })
    }
  }

  messages.push({ role: 'user', content: prompt })
  return messages
}

export async function* streamChat(
  options: OpenAICompatOptions,
  prompt: PromptContent,
  history?: ChatMessage[],
  toolCallbacks?: ToolCallbacks,
  tools?: Array<Record<string, unknown>>,
): AsyncGenerator<StreamEvent> {
  const client = await createOpenAIClient(options.apiKey, options.baseURL, options.headers)
  const requestTools = limitToolsForProvider(options.baseURL, tools)
  const allowedToolNames = new Set((requestTools || []).map(getToolName).filter(Boolean))
  const skipReasoningEffort = shouldSkipReasoningEffortForChatCompletions(options, requestTools)

  const messages = buildChatMessages(options.systemPrompt, history, prompt)

  let totalInputTokens = 0
  let totalOutputTokens = 0

  // Context window for budget checks (conservative estimate)
  const modelContextWindow = getContextWindowForModelOrDefault(options.model)

  // ── Layer 3: Cumulative tool result budget ──────────────────────
  // Track total chars from tool results within this turn.
  // When budget is exhausted, refuse further read operations and signal
  // the model to stop reading and start producing output.
  //
  // Budget: 50K chars ≈ 12.5K tokens — leaves room for system prompt,
  // conversation history, and model output within a 200K window.
  const TOOL_BUDGET_CHARS = 50_000
  let cumulativeToolChars = 0
  let toolBudgetExhausted = false
  let consecutiveNoopCount = 0 // detect degenerate loops (e.g. run_command "true" spam)

  // Dynamic per-result limit: starts at 4000, shrinks as budget fills
  function getMaxToolResultChars(): number {
    const remaining = TOOL_BUDGET_CHARS - cumulativeToolChars
    if (remaining <= 0) return 200 // minimal: just error messages
    if (remaining < 10_000) return 1000 // tight: aggressive truncation
    if (remaining < 25_000) return 2000 // moderate: reduced truncation
    return 4000 // normal
  }

  try {
    for (let round = 0; /* no limit — loop until task completes, error, or abort */ ; round++) {
      // Check abort signal between rounds
      if (toolCallbacks?.abortSignal?.aborted) {
        yield { type: 'text', text: '\n\n[interrupted]' }
        yield { type: 'done' }
        return
      }

      // ── Layer 4: Per-round context hard stop ──────────────────
      // Before each API call, check total message size. If exceeding 85%
      // of context window, inject a stop signal and break the tool loop.
      const estimatedChars = messages.reduce((sum, m) => {
        const c = m.content as PromptContent | null | undefined
        return sum + (c ? messageContentToText(c).length : 0)
      }, 0)
      const estimatedTokens = Math.ceil(estimatedChars / 3) // conservative estimate

      if (estimatedTokens > modelContextWindow * 0.85) {
        // Hard stop: context is critically full
        messages.push({
          role: 'user',
          content: '[CONTEXT CRITICAL] You have used 85%+ of the context window with tool calls. STOP calling tools immediately. Summarize your findings and produce your final answer NOW. Do not read any more files.',
        })
        yield { type: 'text', text: `\n[context-guard: hard stop at ${Math.round(estimatedTokens / 1000)}K/${Math.round(modelContextWindow / 1000)}K tokens — forcing output]\n` }
        // Don't break — let the model produce one final response with the stop signal
      } else if (estimatedTokens > modelContextWindow * 0.75) {
        // Soft pressure: truncate old tool results to free space
        const keepCount = 4
        let freed = 0
        for (let i = 1; i < messages.length - keepCount; i++) {
          const msg = messages[i]!
          const content = msg.content as string | null
          if ((msg.role === 'tool' || msg.role === 'assistant') && typeof content === 'string' && content.length > 200) {
            const oldLen = content.length
            msg.content = content.slice(0, 150) + `\n[truncated: ${Math.ceil(oldLen / 3)} tokens freed for context budget]`
            freed += oldLen - (msg.content as string).length
          }
        }
        if (freed > 0) {
          yield { type: 'text', text: `\n[context-guard: truncated ${Math.ceil(freed / 3)} tokens from older messages]\n` }
        }
      }

      // Build request params — use max_completion_tokens for APIs that require it (Copilot, newer OpenAI)
      const maxOut = options.maxTokens || getMaxOutputForModelOrDefault(options.model)
      const useNewTokenParam = options.baseURL?.includes('githubcopilot.com') || options.baseURL?.includes('api.openai.com')
      const params: Record<string, unknown> = {
        model: options.model,
        messages,
        stream: true,
        ...(useNewTokenParam ? { max_completion_tokens: maxOut } : { max_tokens: maxOut }),
        ...(!skipReasoningEffort && options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
      }

      // Include tools if available (function calling)
      if (requestTools && requestTools.length > 0 && toolCallbacks?.onToolCall) {
        params.tools = requestTools
      }

      // Force stream=true typing with unknown cast (params built dynamically for tool support)
      const response = await withRateLimitRetry(
        () => client.chat.completions.create(
          params as unknown as Parameters<typeof client.chat.completions.create>[0],
          toolCallbacks?.abortSignal ? { signal: toolCallbacks.abortSignal } : undefined,
        ),
        options.model,
      )
      const stream = response as AsyncIterable<Record<string, unknown>>

      let textContent = ''
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = []
      let finishReason = ''

      for await (const rawChunk of stream) {
        if (toolCallbacks?.abortSignal?.aborted) {
          yield { type: 'text', text: '\n\n[interrupted]' }
          yield { type: 'done' }
          return
        }
        const chunk = rawChunk as Record<string, unknown>
        const choices = chunk.choices as Array<Record<string, unknown>> | undefined
        const choice = choices?.[0]
        if (!choice) continue

        const delta = choice.delta as Record<string, unknown> | undefined
        if (!delta) continue

        // Text content
        if (typeof delta.content === 'string' && delta.content) {
          yield { type: 'text', text: delta.content }
          textContent += delta.content
        }

        // Tool call deltas (streamed incrementally)
        const deltaToolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined
        if (deltaToolCalls) {
          for (const tc of deltaToolCalls) {
            const idx = typeof tc.index === 'number' ? tc.index : 0
            if (!toolCalls[idx]) {
              toolCalls[idx] = {
                id: (tc.id as string) || `call_${idx}`,
                name: (tc.function as Record<string, unknown>)?.name as string || '',
                arguments: '',
              }
            }
            const fnArgs = (tc.function as Record<string, unknown>)?.arguments as string | undefined
            if (fnArgs) {
              toolCalls[idx]!.arguments += fnArgs
            }
          }
        }

        // Usage info
        const usage = chunk.usage as Record<string, number> | undefined
        if (usage) {
          totalInputTokens += usage.prompt_tokens || 0
          totalOutputTokens += usage.completion_tokens || 0
        }

        if (choice.finish_reason) {
          finishReason = String(choice.finish_reason)
        }
      }

      // If model wants to call tools
      if (finishReason === 'tool_calls' && toolCalls.length > 0 && toolCallbacks?.onToolCall) {
        // ── Noop loop detector: catch degenerate patterns like run_command("true") spam ──
        const isNoop = toolCalls.every(tc => {
          const args = tc.arguments.trim()
          return (tc.name === 'run_command' && (args === '{"command":"true"}' || args === '{"command": "true"}' || args === '{}')) ||
                 (tc.name === 'sleep') ||
                 (args === '{}' && tc.name !== 'task_list' && tc.name !== 'mcp_list_servers')
        })
        if (isNoop) {
          consecutiveNoopCount++
          if (consecutiveNoopCount >= 3) {
            yield { type: 'text', text: '\n[loop-guard: detected degenerate tool loop — forcing stop]\n' }
            yield { type: 'usage', inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
            yield { type: 'done' }
            return
          }
        } else {
          consecutiveNoopCount = 0
        }

        // Add assistant message with tool calls to conversation
        messages.push({
          role: 'assistant',
          content: textContent || null,
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        })

        // Execute each tool and add results
        for (const tc of toolCalls) {
          if (!allowedToolNames.has(tc.name)) {
            throw new Error(`Provider requested disallowed tool: ${tc.name}`)
          }
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(tc.arguments) } catch { /* use empty */ }

          yield { type: 'tool_use', toolName: tc.name, toolInput: tc.arguments }

          const result = await toolCallbacks.onToolCall(tc.name, args)
          yield { type: 'tool_result', toolName: tc.name, toolSuccess: result.success, toolOutput: result.output }

          // ── Layer 3: Cumulative tool budget enforcement ────────
          // Track total tool result chars and progressively truncate
          // as budget fills up. When exhausted, return minimal message.
          let toolContent = result.output

          if (toolBudgetExhausted) {
            // Budget already exhausted — return minimal response
            toolContent = `[TOOL BUDGET EXHAUSTED] ${cumulativeToolChars} chars used of ${TOOL_BUDGET_CHARS} budget. STOP calling tools immediately. Do NOT call any more tools — no read_file, no run_command, no search. Produce your final answer using the information already gathered.`
          } else {
            const maxChars = getMaxToolResultChars()
            if (toolContent.length > maxChars) {
              const lines = toolContent.split('\n')
              const headLines = Math.min(40, Math.floor(lines.length / 2))
              const tailLines = Math.min(20, Math.floor(lines.length / 4))
              const headContent = lines.slice(0, headLines).join('\n')
              const tailContent = lines.slice(-tailLines).join('\n')
              const truncatedContent = headContent + `\n\n[... ${lines.length - headLines - tailLines} lines truncated (budget: ${Math.round(cumulativeToolChars / 1000)}K/${Math.round(TOOL_BUDGET_CHARS / 1000)}K chars used) ...]\n\n` + tailContent
              toolContent = truncatedContent.slice(0, maxChars)
            }
            cumulativeToolChars += toolContent.length
            if (cumulativeToolChars >= TOOL_BUDGET_CHARS) {
              toolBudgetExhausted = true
              yield { type: 'text', text: `\n[tool-budget: ${Math.round(cumulativeToolChars / 1000)}K chars exhausted — further reads will be suppressed]\n` }
            }
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolContent,
          })
        }

        // Continue the loop — model will process tool results
        continue
      }

      // Handle terminated — provider cut the response (e.g., Poe API timeout, proxy disconnect)
      if (finishReason === 'terminated' || finishReason === 'error') {
        if (round < 3) { // max 3 auto-retries for terminated responses
          messages.push({ role: 'assistant', content: textContent || '' })
          messages.push({ role: 'user', content: 'The response was terminated prematurely. Continue from where you left off and complete the task.' })
          yield { type: 'text', text: `\n[response terminated, retrying (${round + 1}/3)...]\n` }
          continue
        }
        // Exhausted retries — yield what we have and stop
        yield { type: 'text', text: '\n[response terminated after 3 retries]\n' }
        yield { type: 'usage', inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
        yield { type: 'done' }
        return
      }

      // Handle model hitting max_tokens — auto-continue
      if (finishReason === 'length') {
        messages.push({ role: 'assistant', content: textContent || '' })
        messages.push({ role: 'user', content: 'Continue from where you left off. Complete the task.' })
        yield { type: 'text', text: '\n[continuing...]\n' }
        continue
      }

      // Handle model stopping mid-task: if previous rounds had tool calls but
      // this final round has none, and text looks incomplete, auto-continue once
      if (finishReason === 'stop' && round > 0 && toolCalls.length === 0 && textContent) {
        const trimmed = textContent.trimEnd()
        const looksIncomplete = /[：:，,]$/.test(trimmed) ||
          /(?:现在|接下来|下面|I'll|Let me|I will|Now I|Here's|Let's)\s*\S*$/i.test(trimmed)
        if (looksIncomplete) {
          messages.push({ role: 'assistant', content: textContent })
          messages.push({ role: 'user', content: 'Continue. Execute the remaining steps to complete the task.' })
          yield { type: 'text', text: '\n[auto-continuing task...]\n' }
          continue
        }
      }

      // No more tool calls and task appears complete — we're done
      yield { type: 'usage', inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
      yield { type: 'done' }
      break
    }
  } catch (err) {
    if (toolCallbacks?.abortSignal?.aborted) {
      yield { type: 'text', text: '\n\n[interrupted]' }
      yield { type: 'done' }
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    yield { type: 'error', error: message }
    // Still yield usage so the caller can track what was consumed
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      yield { type: 'usage', inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
    }
  }
}

/**
 * One-shot chat completion (non-streaming) for quick tests.
 */
export async function chatOnce(
  options: OpenAICompatOptions,
  prompt: PromptContent,
  signal?: AbortSignal,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = await createOpenAIClient(options.apiKey, options.baseURL, options.headers)

  const messages: Array<Record<string, unknown>> = []

  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const maxOut = options.maxTokens || getMaxOutputForModelOrDefault(options.model)
  const useNewTokenParam = options.baseURL?.includes('githubcopilot.com') || options.baseURL?.includes('api.openai.com')
  const response = await withRateLimitRetry(
    () => client.chat.completions.create({
      model: options.model,
      messages,
      ...(useNewTokenParam ? { max_completion_tokens: maxOut } : { max_tokens: maxOut }),
    } as unknown as Parameters<typeof client.chat.completions.create>[0], signal ? { signal } : undefined),
    options.model,
  )

  const parsed = response as unknown as Record<string, unknown>
  const choices = parsed.choices as Array<Record<string, unknown>> | undefined
  const choice = choices?.[0]
  const message = choice?.message as Record<string, unknown> | undefined
  const content = message?.content as PromptContent | undefined
  const usage = parsed.usage as Record<string, number> | undefined
  return {
    text: content
      ? (typeof content === 'string'
          ? content
          : messageContentToText(content as PromptContent))
      : '',
    inputTokens: usage?.prompt_tokens || 0,
    outputTokens: usage?.completion_tokens || 0,
  }
}
