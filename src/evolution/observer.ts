import { EvolutionStore, type EvolutionObservation } from './store.js'
import { logWarning } from '../logger.js'

type ObserveInput = Parameters<EvolutionStore['observe']>[0]

export function observeRuntimeEvent(input: ObserveInput): EvolutionObservation | null {
  try {
    const store = new EvolutionStore()
    return store.observe(input)
  } catch (error) {
    logWarning('evolution observe failed', {
      category: input.category,
      command: input.command,
      summary: input.summary,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
