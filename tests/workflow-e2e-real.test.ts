import { describe, expect, it } from 'vitest'

/**
 * Real end-to-end closure proof: drives actual sub-agents against the configured
 * provider, crossing the process boundary (`spawnSubAgent` forks a worker).
 *
 * Skipped unless ARMATURE_E2E_REAL=1, because it makes live LLM calls (slow, costs
 * tokens, non-deterministic). Requires a fresh build first — it imports from
 * `dist/`, NOT `src/`, on purpose: `spawnSubAgent` resolves its worker via
 * `import.meta.url` + 'sub-agent-worker.js', and that compiled worker only exists
 * next to the compiled `dist/agent/sub-agent.js`. Running the runtime through the
 * TS source (vitest's default `../src/...` resolution) would fork a non-existent
 * `src/agent/sub-agent-worker.js` and every sub-agent would fail to start.
 *
 *   npm run build && ARMATURE_E2E_REAL=1 npx vitest run tests/workflow-e2e-real.test.ts
 */
const REAL = process.env.ARMATURE_E2E_REAL === '1'

describe.skipIf(!REAL)('runWorkflow — real provider closure', () => {
  it(
    'fans two real sub-agents out and synthesizes their answers',
    async () => {
      // Dynamic dist imports: only load when the gate is on, so collection never
      // touches the build and the worker path resolves under dist/.
      const { resolveConfig, resolveProvider } = await import('../dist/config.js')
      const { runWorkflow } = await import('../dist/workflow/runtime.js')
      const { ArmatureWorkflowAgentRunner } = await import('../dist/workflow/runner.js')

      const config = resolveConfig({ cwd: process.cwd() })
      const provider = resolveProvider(config)
      const runner = new ArmatureWorkflowAgentRunner({
        cwd: process.cwd(),
        parent: { model: provider.model, apiKey: provider.apiKey, baseURL: provider.baseURL },
        timeoutMs: 120_000,
      })

      const script = `export const meta = { name: 'real_smoke', description: 'two trivial questions', phases: [{ title: 'Ask' }] }
const answers = await parallel([
  () => agent('Reply with exactly the word: ALPHA. No other text.', { label: 'alpha', agentType: 'explore' }),
  () => agent('Reply with exactly the word: BETA. No other text.', { label: 'beta', agentType: 'explore' }),
])
return { answers }`

      const run = await runWorkflow<{ answers: unknown[] }>(script, { runner })
      expect(run.agentCount).toBe(2)
      const answers = run.result.answers
      expect(Array.isArray(answers)).toBe(true)
      // Both sub-agents returned a non-empty string (the loop closed end to end).
      expect(answers.filter((a) => typeof a === 'string' && a.trim().length > 0)).toHaveLength(2)
      // And they answered the actual questions.
      const joined = answers.join(' ').toUpperCase()
      expect(joined).toContain('ALPHA')
      expect(joined).toContain('BETA')
    },
    180_000,
  )
})
