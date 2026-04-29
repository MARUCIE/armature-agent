/**
 * Orca CLI program assembly.
 *
 * Creates the Commander program with all subcommands registered.
 */

import { Command } from 'commander'
import { createInitCommand } from './commands/init.js'
import { createArchitectCommand, createChatCommand, createDebugCommand, createReflectCommand, createReviewCommand } from './commands/chat.js'
import { createDoctorCommand } from './commands/doctor.js'
import { createRunCommand } from './commands/run.js'
import { createCouncilCommand, createRaceCommand, createPipelineCommand } from './commands/multi.js'
import { createBenchCommand } from './commands/bench.js'
import { createLogsCommand } from './commands/logs.js'
import { createProvidersCommand } from './commands/providers.js'
import { createStatsCommand } from './commands/stats.js'
import { createSessionCommand } from './commands/session.js'
import { createQueueCommand } from './commands/queue.js'
import { createPermissionsCommand } from './commands/permissions.js'
import { createPRCommand } from './commands/pr.js'
import { createServeCommand } from './commands/serve.js'
import { createEvolveCommand } from './commands/evolve.js'
import { listWorkflowPresets } from './modes/index.js'
import { ORCA_VERSION } from './version.js'

export function createProgram(): Command {
  const workflowPresetHelp = listWorkflowPresets()
    .map((preset) => `  ${preset.commandName.padEnd(17)}${preset.description}`)
    .join('\n')

  const program = new Command()
    .name('orca')
    .version(ORCA_VERSION)
    .enablePositionalOptions()
    .passThroughOptions()
    .description(
      'Orca — provider-neutral agent runtime. 41 tools · 11 models · multi-model collaboration.\n\n' +
       'Commands:\n' +
       '  chat              Interactive REPL or one-shot query\n' +
       `${workflowPresetHelp}\n` +
       '  doctor            Run local Orca diagnostics\n' +
      '  run               Execute an agent task\n' +
      '  council           Ask N models, judge synthesizes (multi-model)\n' +
      '  race              First model to answer wins (speed race)\n' +
      '  pipeline           Plan → Code → Review chain across models\n' +
      '  bench             Run agent benchmark (self-evaluation)\n' +
      '  logs              Show local Orca runtime logs\n' +
       '  stats             Token usage and cost statistics\n' +
       '  evolve            Inspect gated self-evolution candidates\n' +
       '  session           Manage saved sessions\n' +
      '  queue             Inspect queued and completed task runs\n' +
      '  permissions       Inspect and configure approval modes\n' +
      '  pr                Checkout a GitHub PR and review it\n' +
      '  serve             Start headless agent server (HTTP + SSE)\n' +
      '  providers         List and test configured providers\n' +
      '  init              Initialize project configuration'
    )

  program.addCommand(createChatCommand())
  program.addCommand(createReflectCommand())
  program.addCommand(createReviewCommand())
  program.addCommand(createDebugCommand())
  program.addCommand(createArchitectCommand())
  program.addCommand(createDoctorCommand())
  program.addCommand(createRunCommand())
  program.addCommand(createCouncilCommand())
  program.addCommand(createRaceCommand())
  program.addCommand(createPipelineCommand())
  program.addCommand(createInitCommand())
  program.addCommand(createBenchCommand())
  program.addCommand(createLogsCommand())
  program.addCommand(createProvidersCommand())
  program.addCommand(createStatsCommand())
  program.addCommand(createEvolveCommand())
  program.addCommand(createSessionCommand())
  program.addCommand(createQueueCommand())
  program.addCommand(createPermissionsCommand())
  program.addCommand(createPRCommand())
  program.addCommand(createServeCommand())

  // Default: no subcommand → enter interactive REPL (like `claude` without args)
  program.argument('[prompt...]', 'Prompt text (omit for interactive REPL)')
  program.option('-m, --model <model>', 'Model name')
  program.option('-p, --provider <provider>', 'Provider (poe, anthropic, openai, google)')
  program.option('-k, --api-key <key>', 'API key')
  program.option('--safe', 'Enable permission prompts')
  program.option('--effort <level>', 'Thinking effort: low, medium, high, max')
  program.option('-c, --continue [id]', 'Resume the most recent saved session, or a specific session by id')
  program.action(async (prompt: string[], opts: Record<string, string | boolean | undefined>) => {
    // Delegate to chat command: orca "prompt" → orca chat "prompt"
    const args = ['node', 'orca', 'chat']
    if (prompt.length > 0) args.push(prompt.join(' '))
    if (opts.model) args.push('-m', String(opts.model))
    if (opts.provider) args.push('-p', String(opts.provider))
    if (opts.apiKey) args.push('-k', String(opts.apiKey))
    if (opts.safe) args.push('--safe')
    if (opts.effort) args.push('--effort', String(opts.effort))
    if (opts.continue === true) args.push('--continue')
    else if (opts.continue) args.push('--continue', String(opts.continue))
    await program.parseAsync(args)
  })

  return program
}

export async function run(argv?: string[]): Promise<void> {
  const program = createProgram()
  await program.parseAsync(argv || process.argv)
}
