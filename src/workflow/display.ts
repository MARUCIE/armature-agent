/**
 * Workflow progress display.
 *
 * Accumulates phase/agent events from {@link runWorkflow} into a small snapshot
 * and renders a compact text tree for the REPL:
 *
 *   ◆ workflow review_changes — 3/5 done
 *     Review
 *       #1 ✓ review:bugs
 *       #2 ⋯ review:perf
 *     Verify
 *       #3 ✗ verify
 */

export type WorkflowAgentStatus = 'running' | 'done' | 'failed'

interface AgentEntry {
  id: number
  label: string
  phase: string
  status: WorkflowAgentStatus
}

const NO_PHASE = '(no phase)'

export class WorkflowProgress {
  private readonly name: string
  private readonly phaseOrder: string[] = []
  private readonly agents = new Map<number, AgentEntry>()

  constructor(name: string) {
    this.name = name || 'workflow'
  }

  phase(title: string): void {
    if (!this.phaseOrder.includes(title)) this.phaseOrder.push(title)
  }

  agentStart(event: { id: number; label: string; phase?: string }): void {
    const phase = event.phase || NO_PHASE
    if (!this.phaseOrder.includes(phase)) this.phaseOrder.push(phase)
    this.agents.set(event.id, { id: event.id, label: event.label, phase, status: 'running' })
  }

  agentEnd(event: { id: number; label: string; phase?: string; ok: boolean }): void {
    const existing = this.agents.get(event.id)
    if (existing) {
      existing.status = event.ok ? 'done' : 'failed'
      return
    }
    const phase = event.phase || NO_PHASE
    this.agents.set(event.id, { id: event.id, label: event.label, phase, status: event.ok ? 'done' : 'failed' })
  }

  /** Count of finished (done or failed) agents over total seen so far. */
  counts(): { finished: number; total: number; failed: number } {
    let finished = 0
    let failed = 0
    for (const agent of this.agents.values()) {
      if (agent.status !== 'running') finished++
      if (agent.status === 'failed') failed++
    }
    return { finished, total: this.agents.size, failed }
  }

  render(): string {
    const { finished, total } = this.counts()
    const lines: string[] = [`◆ workflow ${this.name} — ${finished}/${total} done`]
    const phases = this.phaseOrder.length > 0 ? this.phaseOrder : [NO_PHASE]
    for (const phase of phases) {
      const entries = [...this.agents.values()].filter((a) => a.phase === phase).sort((a, b) => a.id - b.id)
      if (entries.length === 0 && phase === NO_PHASE) continue
      if (phase !== NO_PHASE) lines.push(`  ${phase}`)
      for (const agent of entries) {
        lines.push(`    #${agent.id} ${statusGlyph(agent.status)} ${agent.label}`)
      }
    }
    return lines.join('\n')
  }
}

function statusGlyph(status: WorkflowAgentStatus): string {
  switch (status) {
    case 'done':
      return '✓'
    case 'failed':
      return '✗'
    default:
      return '⋯'
  }
}
