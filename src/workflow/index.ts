/**
 * Dynamic workflows for Armature CLI.
 *
 * The `workflow` tool lets the model write a small, deterministic JavaScript
 * orchestration script that fans work out across isolated sub-agents and then
 * synthesizes the results. See `doc/DYNAMIC_WORKFLOWS.md`.
 */

export { parseWorkflowScript } from './parser.js'
export type { WorkflowMeta, WorkflowMetaPhase, WorkflowAgentOptions } from './parser.js'

export { runWorkflow } from './runtime.js'
export type { WorkflowRunOptions, WorkflowRunResult } from './runtime.js'

export {
  ArmatureWorkflowAgentRunner,
  buildSchemaContract,
  parseSchemaResult,
} from './runner.js'
export type {
  WorkflowAgentRunner,
  WorkflowAgentRequest,
  ArmatureRunnerParentContext,
  ArmatureWorkflowAgentRunnerOptions,
} from './runner.js'

export { WorkflowProgress } from './display.js'
export type { WorkflowAgentStatus } from './display.js'
