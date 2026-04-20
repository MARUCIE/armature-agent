import type { OrcaConfig } from '../config.js'
import { findAggregator, resolveModelEndpoint, resolveProvider } from '../config.js'
import { hooks } from '../hooks.js'
import { getPricingForModel } from '../model-catalog.js'
import { runCouncil, runPipeline, runRace, pickDiverseModels } from '../multi-model.js'
import type { PipelineStage } from '../multi-model.js'
import { MissionController } from '../mission/index.js'
import type { MissionEvent } from '../mission/index.js'
import { decomposePrompt, executePlan } from '../planner/index.js'
import { prepareMultiModelContext } from './chat-input.js'

export type AsyncReplSlashCommand = 'council' | 'race' | 'pipeline' | 'mission' | 'plan'

interface AsyncSlashSession {
  emitMultiModelProgress(command: string, models: Array<{ model: string; done: boolean; elapsedMs: number }>): void
  emitMultiModelResult(command: string, model: string, output: string, elapsedMs: number): void
  emitText(text: string): void
  emitSystemMessage(text: string, level?: 'info' | 'warn' | 'error'): void
  emitThinkingStart(): void
  emitThinkingEnd(ttfbMs: number): void
}

interface HandleAsyncReplSlashCommandOptions {
  command: AsyncReplSlashCommand
  input: string
  config: OrcaConfig
  cwd: string
  currentModel: string
  useInk: boolean
  session?: AsyncSlashSession
  sessionInjectedPaths: Set<string>
}

export async function handleAsyncReplSlashCommand({
  command,
  input,
  config,
  cwd,
  currentModel,
  useInk,
  session,
  sessionInjectedPaths,
}: HandleAsyncReplSlashCommandOptions): Promise<void> {
  switch (command) {
    case 'council':
    case 'race':
    case 'pipeline':
      await handleMultiModelSlashCommand({
        command,
        input,
        config,
        cwd,
        currentModel,
        useInk,
        session,
        sessionInjectedPaths,
      })
      return
    case 'mission':
      await handleMissionSlashCommand({ input, config, cwd, useInk, session })
      return
    case 'plan':
      await handlePlanSlashCommand({ input, config, cwd })
      return
  }
}

async function handleMultiModelSlashCommand({
  command,
  input,
  config,
  cwd,
  currentModel,
  useInk,
  session,
  sessionInjectedPaths,
}: {
  command: 'council' | 'race' | 'pipeline'
  input: string
  config: OrcaConfig
  cwd: string
  currentModel: string
  useInk: boolean
  session?: AsyncSlashSession
  sessionInjectedPaths: Set<string>
}): Promise<void> {
  let prompt = input.replace(/^\/(council|race|pipeline)\s*/, '').trim()
  if (!prompt) return

  const context = prepareMultiModelContext(prompt, cwd, sessionInjectedPaths)
  prompt = context.prompt

  await hooks.run('MultiModelStart', {
    event: 'MultiModelStart',
    prompt,
    cwd,
    model: currentModel,
    toolInput: { command, injectedFiles: context.injectedPaths.size },
  })

  const aggregatorId = findAggregator(config)
  const resolveEndpoint = (model: string) => resolveModelEndpoint(model, config, aggregatorId)

  switch (command) {
    case 'council':
      await runCouncilSlashCommand({ prompt, resolveEndpoint, useInk, session })
      return
    case 'race':
      await runRaceSlashCommand({ prompt, resolveEndpoint, useInk, session })
      return
    case 'pipeline':
      await runPipelineSlashCommand({ prompt, resolveEndpoint, useInk, session })
      return
  }
}

async function runCouncilSlashCommand({
  prompt,
  resolveEndpoint,
  useInk,
  session,
}: {
  prompt: string
  resolveEndpoint: (model: string) => ReturnType<typeof resolveModelEndpoint>
  useInk: boolean
  session?: AsyncSlashSession
}): Promise<void> {
  const models = pickDiverseModels(3)
  const available = models.filter((model) => resolveEndpoint(model) !== null)
  const unavailable = models.filter((model) => resolveEndpoint(model) === null)
  if (available.length === 0) {
    console.log(`\x1b[31m  council: no models with available endpoints.\x1b[0m`)
    console.log(`\x1b[33m  tried: ${models.join(', ')}\x1b[0m`)
    console.log(`\x1b[33m  hint: set multiple API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY)`)
    console.log(`        or configure an aggregator provider (poe, openrouter) in .orca.json\x1b[0m\n`)
    return
  }
  if (unavailable.length > 0) {
    console.log(`\x1b[33m  note: ${unavailable.join(', ')} unavailable (no endpoint), using ${available.length} models\x1b[0m`)
  }

  const councilStart = Date.now()
  const modelStatus = new Map<string, { done: boolean; ms: number }>()
  available.forEach((model) => modelStatus.set(model, { done: false, ms: 0 }))

  if (useInk) {
    const inkSession = requireSession(session)
    const emitProgress = () => {
      const elapsed = Date.now() - councilStart
      inkSession.emitMultiModelProgress('council', available.map((model) => {
        const status = modelStatus.get(model)!
        return { model, done: status.done, elapsedMs: status.done ? status.ms : elapsed }
      }))
    }
    emitProgress()

    const result = await runCouncil({
      prompt,
      models: available,
      judgeModel: available[0]!,
      resolveEndpoint,
      onModelStart: () => emitProgress(),
      onModelDone: (model, ms) => {
        modelStatus.set(model, { done: true, ms })
        emitProgress()
        inkSession.emitMultiModelResult('council', model, '', ms)
      },
    })

    for (const response of result.responses) {
      if (response.error) {
        inkSession.emitSystemMessage(`✗ ${response.model}: ${response.error}`, 'error')
      } else {
        inkSession.emitText(`\n**${response.model}** (${(response.durationMs / 1000).toFixed(1)}s)\n${response.text}\n`)
      }
    }
    inkSession.emitText(`\n**Verdict** (${result.verdict.model}, ${(result.verdict.durationMs / 1000).toFixed(1)}s)\n${result.verdict.text}\n`)

    const costLines = result.responses.map((response) => {
      const pricing = getPricingForModel(response.model)
      const cost = pricing
        ? ((response.inputTokens || 0) / 1e6 * pricing[0]) + ((response.outputTokens || 0) / 1e6 * pricing[1])
        : 0
      return `  ${response.model.padEnd(24)} ${(response.durationMs / 1000).toFixed(1)}s  ${cost > 0 ? '$' + cost.toFixed(4) : 'n/a'}`
    })
    inkSession.emitSystemMessage(`${result.responses.length} models · ${(result.totalDurationMs / 1000).toFixed(1)}s · agreement: ${result.agreement}`, 'info')
    if (costLines.some((line) => line.includes('$'))) {
      inkSession.emitSystemMessage('Cost comparison:\n' + costLines.join('\n'), 'info')
    }
    return
  }

  console.log(`\n\x1b[36m  ╭── Council: ${available.length} models ──╮\x1b[0m`)
  available.forEach((model) => {
    const endpoint = resolveEndpoint(model)
    console.log(`\x1b[90m  │ ${model} → ${endpoint?.provider || '?'}\x1b[0m`)
  })

  let lastLineLen = 0
  const renderProgress = () => {
    const elapsed = Date.now() - councilStart
    const parts = available.map((model) => {
      const status = modelStatus.get(model)!
      const name = model.length > 18 ? model.slice(0, 16) + '..' : model
      if (status.done) return `\x1b[32m✓ ${name} ${(status.ms / 1000).toFixed(1)}s\x1b[0m`
      return `\x1b[90m● ${name} ${(elapsed / 1000).toFixed(0)}s\x1b[0m`
    })
    const line = `  ${parts.join('  ')}`
    const clearLen = Math.max(lastLineLen, line.length + 10)
    process.stderr.write(`\r${' '.repeat(clearLen)}\r${line}`)
    lastLineLen = line.length
  }

  const progressTimer = setInterval(renderProgress, 500)
  const result = await runCouncil({
    prompt,
    models: available,
    judgeModel: available[0]!,
    resolveEndpoint,
    onModelStart: () => renderProgress(),
    onModelDone: (model, ms) => {
      modelStatus.set(model, { done: true, ms })
      renderProgress()
    },
  })
  clearInterval(progressTimer)
  process.stderr.write(`\r${' '.repeat(lastLineLen + 10)}\r`)
  console.log()

  for (const response of result.responses) {
    if (response.error) {
      console.log(`\x1b[31m  ✗ ${response.model}: ${response.error}\x1b[0m`)
    } else {
      console.log(`\x1b[90m  ── ${response.model} (${(response.durationMs / 1000).toFixed(1)}s) ──\x1b[0m\n  ${response.text.slice(0, 500)}${response.text.length > 500 ? '...' : ''}\n`)
    }
  }
  console.log(`\x1b[36m  ★ Verdict\x1b[0m \x1b[90m(${result.verdict.model}, ${(result.verdict.durationMs / 1000).toFixed(1)}s)\x1b[0m\n  ${result.verdict.text}\n`)
  console.log(`\x1b[90m  ─ ${result.responses.length} models · ${(result.totalDurationMs / 1000).toFixed(1)}s · agreement: ${result.agreement} ─\x1b[0m\n`)
}

async function runRaceSlashCommand({
  prompt,
  resolveEndpoint,
  useInk,
  session,
}: {
  prompt: string
  resolveEndpoint: (model: string) => ReturnType<typeof resolveModelEndpoint>
  useInk: boolean
  session?: AsyncSlashSession
}): Promise<void> {
  const models = pickDiverseModels(5).filter((model) => resolveEndpoint(model) !== null)
  if (models.length === 0) {
    console.log(`\x1b[31m  race: no models with available endpoints. Set multiple API keys.\x1b[0m\n`)
    return
  }

  const raceStart = Date.now()
  const raceStatus = new Map<string, { done: boolean; ms: number; won: boolean }>()
  models.forEach((model) => raceStatus.set(model, { done: false, ms: 0, won: false }))

  if (useInk) {
    const inkSession = requireSession(session)
    const emitProgress = () => {
      const elapsed = Date.now() - raceStart
      inkSession.emitMultiModelProgress('race', models.map((model) => {
        const status = raceStatus.get(model)!
        return { model, done: status.done, elapsedMs: status.done ? status.ms : elapsed }
      }))
    }
    emitProgress()

    const result = await runRace({
      prompt,
      models,
      resolveEndpoint,
      onModelStart: () => emitProgress(),
      onModelDone: (model, ms, won) => {
        raceStatus.set(model, { done: true, ms, won: won || false })
        emitProgress()
        inkSession.emitMultiModelResult('race', model, '', ms)
      },
    })
    inkSession.emitText(`\n**Winner: ${result.winner.model}** (${(result.winner.durationMs / 1000).toFixed(1)}s)\n${result.winner.text}\n`)
    if (result.cancelled.length > 0) {
      inkSession.emitSystemMessage(`cancelled: ${result.cancelled.join(', ')}`, 'info')
    }
    inkSession.emitSystemMessage(`${(result.totalDurationMs / 1000).toFixed(1)}s total`, 'info')
    return
  }

  console.log(`\n\x1b[33m  ╭── Race: ${models.length} models ──╮\x1b[0m`)
  let raceLineLen = 0
  const renderProgress = () => {
    const elapsed = Date.now() - raceStart
    const parts = models.map((model) => {
      const status = raceStatus.get(model)!
      const name = model.length > 16 ? model.slice(0, 14) + '..' : model
      if (status.won) return `\x1b[32m★ ${name} ${(status.ms / 1000).toFixed(1)}s\x1b[0m`
      if (status.done) return `\x1b[90m✓ ${name}\x1b[0m`
      return `\x1b[90m◎ ${name} ${(elapsed / 1000).toFixed(0)}s\x1b[0m`
    })
    const line = `  ${parts.join('  ')}`
    const clearLen = Math.max(raceLineLen, line.length + 10)
    process.stderr.write(`\r${' '.repeat(clearLen)}\r${line}`)
    raceLineLen = line.length
  }

  const raceTimer = setInterval(renderProgress, 500)
  const result = await runRace({
    prompt,
    models,
    resolveEndpoint,
    onModelStart: () => renderProgress(),
    onModelDone: (model, ms, won) => {
      raceStatus.set(model, { done: true, ms, won: won || false })
      renderProgress()
    },
  })
  clearInterval(raceTimer)
  process.stderr.write(`\r${' '.repeat(raceLineLen + 10)}\r`)
  console.log(`\n\x1b[32m  Winner: ${result.winner.model} (${(result.winner.durationMs / 1000).toFixed(1)}s)\x1b[0m\n  ${result.winner.text}\n`)
  if (result.cancelled.length > 0) {
    console.log(`\x1b[90m  cancelled: ${result.cancelled.join(', ')}\x1b[0m`)
  }
  console.log(`\x1b[90m  ─ ${(result.totalDurationMs / 1000).toFixed(1)}s total ─\x1b[0m\n`)
}

async function runPipelineSlashCommand({
  prompt,
  resolveEndpoint,
  useInk,
  session,
}: {
  prompt: string
  resolveEndpoint: (model: string) => ReturnType<typeof resolveModelEndpoint>
  useInk: boolean
  session?: AsyncSlashSession
}): Promise<void> {
  const stages: PipelineStage[] = [
    { role: 'plan', model: 'claude-opus-4.6' },
    { role: 'code', model: 'gpt-5.4' },
    { role: 'review', model: 'gemini-3.1-pro' },
  ]

  if (useInk) {
    const inkSession = requireSession(session)
    const stageModels = stages.map((stage) => ({ model: `${stage.role}: ${stage.model}`, done: false, elapsedMs: 0 }))
    inkSession.emitMultiModelProgress('pipeline', stageModels)

    const result = await runPipeline({
      prompt,
      stages,
      resolveEndpoint,
      onStageStart: (_stage, index) => {
        stageModels[index] = { ...stageModels[index]!, done: false, elapsedMs: 0 }
        inkSession.emitMultiModelProgress('pipeline', [...stageModels])
      },
      onStageDone: (_stage, index, ms) => {
        stageModels[index] = { ...stageModels[index]!, done: true, elapsedMs: ms }
        inkSession.emitMultiModelProgress('pipeline', [...stageModels])
      },
    })

    for (const { stage, response } of result.stages) {
      if (response.error) {
        inkSession.emitSystemMessage(`${stage.role} (${response.model}): ${response.error}`, 'error')
      } else {
        inkSession.emitText(`\n**${stage.role}** (${response.model}, ${(response.durationMs / 1000).toFixed(1)}s)\n${response.text}\n`)
      }
    }
    inkSession.emitSystemMessage(`${result.stages.length} stages · ${(result.totalDurationMs / 1000).toFixed(1)}s total`, 'info')
    return
  }

  console.log(`\n\x1b[35m  ╭── Pipeline: ${stages.length} stages ──╮\x1b[0m`)
  const result = await runPipeline({
    prompt,
    stages,
    resolveEndpoint,
    onStageStart: (stage, index) => process.stdout.write(`\x1b[90m  ${index + 1}. ${stage.role} (${stage.model})...\x1b[0m`),
    onStageDone: (_stage, _index, ms) => console.log(` \x1b[32m${(ms / 1000).toFixed(1)}s\x1b[0m`),
  })

  console.log()
  for (const { stage, response } of result.stages) {
    console.log(`\x1b[90m  ── ${stage.role} · ${response.model} (${(response.durationMs / 1000).toFixed(1)}s) ──\x1b[0m`)
    if (response.error) {
      console.log(`\x1b[31m  error: ${response.error}\x1b[0m\n`)
    } else {
      console.log(`  ${response.text.slice(0, 800)}${response.text.length > 800 ? '...' : ''}\n`)
    }
  }
  console.log(`\x1b[90m  ─ ${result.stages.length} stages · ${(result.totalDurationMs / 1000).toFixed(1)}s total ─\x1b[0m\n`)
}

async function handleMissionSlashCommand({
  input,
  config,
  cwd,
  useInk,
  session,
}: {
  input: string
  config: OrcaConfig
  cwd: string
  useInk: boolean
  session?: AsyncSlashSession
}): Promise<void> {
  const missionGoal = input.replace(/^\/mission\s*/, '').trim()
  if (!missionGoal) return

  const resolved = resolveProvider(config)
  if (!resolved.baseURL) {
    console.log('\x1b[31m  mission: no provider baseURL configured.\x1b[0m')
    return
  }

  const controller = new MissionController(missionGoal, cwd, {
    apiKey: resolved.apiKey,
    baseURL: resolved.baseURL,
    model: resolved.model,
  })

  if (useInk) {
    const inkSession = requireSession(session)
    const levelMap: Record<string, 'info' | 'warn' | 'error'> = {
      plan_created: 'info',
      milestone_started: 'info',
      milestone_passed: 'info',
      milestone_failed: 'error',
      feature_started: 'info',
      feature_completed: 'info',
      feature_failed: 'warn',
      validation_started: 'info',
      validation_passed: 'info',
      validation_failed: 'error',
      mission_completed: 'info',
      mission_failed: 'error',
      mission_aborted: 'warn',
    }
    controller.onEvent((event: MissionEvent) => {
      inkSession.emitSystemMessage(`[mission] ${event.message}`, levelMap[event.type] || 'info')
    })

    inkSession.emitSystemMessage(`Mission: ${controller.getState().id}`, 'info')
    inkSession.emitSystemMessage(`Goal: ${missionGoal.slice(0, 80)}`, 'info')
    inkSession.emitThinkingStart()

    try {
      const plan = await controller.plan()
      inkSession.emitThinkingEnd(Date.now())

      const planLines = [`**Mission Plan** — ${plan.milestones.length} milestones, ${plan.features.length} features (~${plan.estimatedRuns} runs)`]
      for (const [index, milestone] of plan.milestones.entries()) {
        const featureNames = milestone.featureIds
          .map((featureId) => plan.features.find((feature) => feature.id === featureId)?.title || featureId)
          .map((title) => title.slice(0, 50))
        planLines.push(`\n**M${index + 1}: ${milestone.title}**`)
        for (const featureName of featureNames) {
          planLines.push(`- ${featureName}`)
        }
      }
      inkSession.emitText(planLines.join('\n') + '\n')

      inkSession.emitThinkingStart()
      const state = await controller.execute()
      inkSession.emitThinkingEnd(Date.now())
      inkSession.emitText(`\n${controller.getSummary()}\n`)
      inkSession.emitSystemMessage(`Mission ${state.phase}`, state.phase === 'completed' ? 'info' : 'error')
    } catch (err) {
      controller.abort()
      inkSession.emitThinkingEnd(Date.now())
      inkSession.emitSystemMessage(`mission error: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
    return
  }

  controller.onEvent((event: MissionEvent) => {
    const colors: Record<string, string> = {
      plan_created: '\x1b[36m',
      milestone_started: '\x1b[35m',
      milestone_passed: '\x1b[32m',
      milestone_failed: '\x1b[31m',
      feature_started: '\x1b[90m',
      feature_completed: '\x1b[32m',
      feature_failed: '\x1b[33m',
      validation_started: '\x1b[36m',
      validation_passed: '\x1b[32m',
      validation_failed: '\x1b[31m',
      mission_completed: '\x1b[32m',
      mission_failed: '\x1b[31m',
      mission_aborted: '\x1b[33m',
    }
    const color = colors[event.type] || '\x1b[90m'
    console.log(`${color}  [mission] ${event.message}\x1b[0m`)
  })

  console.log(`\n\x1b[36m  ╭── Mission: ${controller.getState().id} ──╮\x1b[0m`)
  console.log(`\x1b[90m  │ Goal: ${missionGoal.slice(0, 60)}${missionGoal.length > 60 ? '...' : ''}\x1b[0m`)
  console.log(`\x1b[90m  │ Phase 1: Planning...\x1b[0m`)

  try {
    const plan = await controller.plan()
    console.log(`\x1b[90m  │ ${plan.milestones.length} milestones, ${plan.features.length} features\x1b[0m`)
    console.log(`\x1b[90m  │ Estimated runs: ~${plan.estimatedRuns}\x1b[0m`)
    for (const [index, milestone] of plan.milestones.entries()) {
      const featureNames = milestone.featureIds
        .map((featureId) => plan.features.find((feature) => feature.id === featureId)?.title || featureId)
        .map((title) => title.slice(0, 50))
      console.log(`\x1b[90m  │ M${index + 1}: ${milestone.title}\x1b[0m`)
      for (const featureName of featureNames) {
        console.log(`\x1b[90m  │   - ${featureName}\x1b[0m`)
      }
    }
    console.log(`\x1b[90m  │ Phase 2: Executing...\x1b[0m`)
    const state = await controller.execute()
    console.log(`\x1b[90m  ╰── Mission ${state.phase} ──╯\x1b[0m`)
    console.log()
    console.log(controller.getSummary())
    console.log()
  } catch (err) {
    controller.abort()
    console.log(`\x1b[31m  mission error: ${err instanceof Error ? err.message : err}\x1b[0m`)
  }
}

async function handlePlanSlashCommand({
  input,
  config,
  cwd,
}: {
  input: string
  config: OrcaConfig
  cwd: string
}): Promise<void> {
  const planPrompt = input.replace(/^\/plan\s*/, '').trim()
  if (!planPrompt) return

  const resolved = resolveProvider(config)
  if (!resolved.baseURL) {
    console.log('\x1b[31m  plan: no provider baseURL configured.\x1b[0m')
    return
  }

  console.log(`\x1b[36m  Decomposing tasks...\x1b[0m`)

  try {
    const plan = await decomposePrompt(planPrompt, {
      apiKey: resolved.apiKey,
      baseURL: resolved.baseURL,
      model: resolved.model,
    })

    const mainCount = plan.tasks.filter((task) => task.type === 'main').length
    const sideCount = plan.tasks.filter((task) => task.type === 'side').length
    console.log(`\x1b[90m  ${plan.tasks.length} tasks: ${mainCount} main + ${sideCount} side\x1b[0m`)
    if (plan.reasoning) {
      console.log(`\x1b[90m  Strategy: ${plan.reasoning.slice(0, 100)}\x1b[0m`)
    }
    console.log()

    const { result } = await executePlan(plan, {
      apiKey: resolved.apiKey,
      baseURL: resolved.baseURL,
      model: resolved.model,
      cwd,
    })

    console.log()
    if (result.success) {
      console.log(`\x1b[32m  Plan completed: ${result.completed}/${result.totalTasks} tasks\x1b[0m`)
    } else {
      console.log(`\x1b[31m  Plan finished: ${result.completed} done, ${result.failed} failed, ${result.skipped} skipped\x1b[0m`)
    }
    console.log(`\x1b[90m  tokens: ${result.totalTokens.toLocaleString()} · ${(result.totalDurationMs / 1000).toFixed(1)}s\x1b[0m`)
  } catch (err) {
    console.log(`\x1b[31m  plan error: ${err instanceof Error ? err.message : err}\x1b[0m`)
  }
}

function requireSession(session: AsyncSlashSession | undefined): AsyncSlashSession {
  if (!session) {
    throw new Error('Ink session is required for async slash handling')
  }
  return session
}
