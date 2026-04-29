import { Command } from 'commander'
import { createInterface } from 'node:readline'
import {
  clearStoredPermissionRules,
  configPermissionModeFromRepl,
  detectPermissionModeSource,
  inspectPermissionRule,
  normalizeStoredPermissionRules,
  removeStoredPermissionRule,
  readStoredPermissionAllowlist,
  readStoredPermissionMode,
  replPermissionModeFromConfig,
  resolveConfig,
  setStoredPermissionMode,
  summarizePermissionRules,
  type ReplPermissionMode,
} from '../config.js'

function assertReplMode(value: string): ReplPermissionMode {
  if (value === 'yolo' || value === 'auto' || value === 'plan') return value
  throw new Error(`invalid mode "${value}" (expected: yolo, auto, plan)`)
}

type PermissionRuleViewStatus = 'all' | 'canonical' | 'legacy' | 'unrecognized'

function normalizeRuleViewStatus(value?: string): PermissionRuleViewStatus {
  if (value === 'canonical' || value === 'legacy' || value === 'unrecognized') return value
  return 'all'
}

function filterRulesByStatus(rules: string[], status: PermissionRuleViewStatus): string[] {
  if (status === 'all') return rules
  return rules.filter((rule) => {
    const inspected = inspectPermissionRule(rule)
    if (status === 'legacy') return inspected.status === 'normalized'
    return inspected.status === status
  })
}

function renderRuleBlock(title: string, rules: string[], status: PermissionRuleViewStatus): void {
  const filteredRules = filterRulesByStatus(rules, status)
  console.log(`  \x1b[90m${title}:\x1b[0m ${filteredRules.length}${status === 'all' ? '' : ` (${status})`}`)
  if (filteredRules.length === 0) {
    console.log('    \x1b[90m(no stored rules)\x1b[0m')
    return
  }
  for (const rule of filteredRules) {
    const inspected = inspectPermissionRule(rule)
    if (inspected.status === 'canonical') {
      console.log(`    \x1b[90m- [canonical] ${rule}\x1b[0m`)
      continue
    }
    if (inspected.status === 'normalized') {
      console.log(`    \x1b[33m- [legacy] ${rule}\x1b[0m`)
      console.log(`      \x1b[90m→ ${inspected.normalized}\x1b[0m`)
      continue
    }
    console.log(`    \x1b[31m- [unrecognized] ${rule}\x1b[0m`)
  }
}

async function pickRule(title: string, rules: string[]): Promise<string | null> {
  if (rules.length === 0) return null

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  let visibleRules = [...rules]
  let query = ''

  try {
    while (true) {
      console.log()
      console.log(`  \x1b[90m${title}\x1b[0m`)
      console.log(`  \x1b[90mfilter:\x1b[0m ${query || '(none)'}`)
      if (visibleRules.length === 0) {
        console.log('    \x1b[33m(no matches)\x1b[0m')
      } else {
        visibleRules.slice(0, 20).forEach((rule, index) => {
          console.log(`    \x1b[90m${index + 1}. ${rule}\x1b[0m`)
        })
        if (visibleRules.length > 20) {
          console.log(`    \x1b[90m... ${visibleRules.length - 20} more match(es)\x1b[0m`)
        }
      }

      const answer = await new Promise<string>((resolve) => {
        rl.question('  \x1b[90mfilter text or number (empty cancels): \x1b[0m', (value) => {
          resolve(value.trim())
        })
      })

      if (!answer) return null

      const numeric = Number.parseInt(answer, 10)
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= visibleRules.length) {
        return visibleRules[numeric - 1] || null
      }

      const exact = visibleRules.find((rule) => rule === answer) || rules.find((rule) => rule === answer)
      if (exact) return exact

      query = answer
      visibleRules = rules.filter((rule) => rule.toLowerCase().includes(query.toLowerCase()))
    }
  } finally {
    rl.close()
  }
}

export function createPermissionsCommand(): Command {
  const cmd = new Command('permissions')
    .description('Inspect and configure permission / approval mode')

  const render = (cwd: string) => {
    const resolved = resolveConfig({ cwd })
    const resolvedRepl = replPermissionModeFromConfig(resolved.permissionMode)
    const source = detectPermissionModeSource(cwd)
    const projectMode = readStoredPermissionMode('project', cwd)
    const globalMode = readStoredPermissionMode('global', cwd)
    const projectRuleList = readStoredPermissionAllowlist('project', cwd)
    const globalRuleList = readStoredPermissionAllowlist('global', cwd)
    const projectRules = summarizePermissionRules(projectRuleList, cwd, 'project')
    const globalRules = summarizePermissionRules(globalRuleList, cwd, 'global')

    console.log()
    console.log('  \x1b[1mPermission Modes\x1b[0m')
    console.log()
    console.log(`  \x1b[90mResolved:\x1b[0m ${resolved.permissionMode}  \x1b[90m(repl: ${resolvedRepl}, source: ${source})\x1b[0m`)
    console.log(`  \x1b[90mProject:\x1b[0m  ${projectMode || '(unset)'}`)
    console.log(`  \x1b[90mGlobal:\x1b[0m   ${globalMode || '(unset)'}`)
    console.log(`  \x1b[90mRules:\x1b[0m    project=${projectRules.total} (legacy ${projectRules.unrecognized + projectRules.normalized})  global=${globalRules.total} (legacy ${globalRules.unrecognized + globalRules.normalized})`)
    if (process.env.ORCA_PERMISSION_MODE) {
      console.log(`  \x1b[90mEnv:\x1b[0m      ${process.env.ORCA_PERMISSION_MODE}`)
    }
    console.log()
    console.log('  \x1b[90mModes:\x1b[0m')
    console.log('    yolo  -> bypassPermissions (no approval prompts)')
    console.log('    auto  -> acceptEdits (prompt on dangerous tools only)')
    console.log('    plan  -> plan (prompt on every tool call)')
    console.log()
  }

  cmd.action(() => render(process.cwd()))

  cmd.command('set')
    .argument('<mode>', 'yolo | auto | plan')
    .option('--scope <scope>', 'project or global', 'project')
    .description('Persist a permission mode into Orca config')
    .action((mode: string, opts: { scope: 'project' | 'global' }) => {
      const replMode = assertReplMode(mode)
      const path = setStoredPermissionMode(opts.scope, process.cwd(), configPermissionModeFromRepl(replMode))
      console.log(`  \x1b[90mupdated ${opts.scope} permission mode -> ${replMode}\x1b[0m`)
      console.log(`  \x1b[90mconfig: ${path}\x1b[0m`)
    })

  cmd.command('rules')
    .argument('[scope]', 'project | global | all', 'all')
    .option('--status <status>', 'all | canonical | legacy | unrecognized', 'all')
    .description('Inspect stored permission allowlist rules')
    .action((scope: string, options: { status?: string }) => {
      const normalized = scope === 'project' || scope === 'global' ? scope : 'all'
      const status = normalizeRuleViewStatus(options.status)
      const cwd = process.cwd()
      const projectRules = readStoredPermissionAllowlist('project', cwd)
      const globalRules = readStoredPermissionAllowlist('global', cwd)

      console.log()
      console.log('  \x1b[1mPermission Rules\x1b[0m')
      console.log()
      if (normalized === 'project' || normalized === 'all') {
        renderRuleBlock('Project', projectRules, status)
      }
      if (normalized === 'global' || normalized === 'all') {
        renderRuleBlock('Global', globalRules, status)
      }
      console.log()
    })

  cmd.command('normalize')
    .argument('[scope]', 'project | global | all', 'all')
    .description('Normalize stored permission rules to canonical descriptors')
    .action((scope: string) => {
      const normalized: 'project' | 'global' | 'all' =
        scope === 'project' || scope === 'global' ? scope : 'all'
      const cwd = process.cwd()
      const scopes: Array<'project' | 'global'> =
        normalized === 'all' ? ['project', 'global'] : [normalized]

      for (const targetScope of scopes) {
        const result = normalizeStoredPermissionRules(targetScope, cwd)
        console.log(`  \x1b[90mnormalized ${targetScope}: ${result.changedCount} changed, ${result.unresolvedCount} unresolved, ${result.total} total\x1b[0m`)
        console.log(`  \x1b[90mconfig: ${result.path}\x1b[0m`)
      }
    })

  cmd.command('revoke')
    .argument('<scope>', 'project or global')
    .argument('[rule]', 'exact rule key to remove')
    .description('Remove one stored permission rule')
    .action(async (scope: string, rule: string | undefined) => {
      const normalizedScope = scope === 'global' ? 'global' : 'project'
      const availableRules = readStoredPermissionAllowlist(normalizedScope, process.cwd())
      const resolvedRule = rule || await pickRule(`Select ${normalizedScope} rule to remove`, availableRules)
      if (!resolvedRule) {
        console.log(`  \x1b[33mno ${normalizedScope} rule selected.\x1b[0m`)
        return
      }
      const result = removeStoredPermissionRule(normalizedScope, process.cwd(), resolvedRule)
      if (!result.removed) {
        console.log(`  \x1b[33mno ${normalizedScope} rule matched.\x1b[0m`)
        return
      }
      console.log(`  \x1b[90mremoved ${normalizedScope} rule.\x1b[0m`)
      console.log(`  \x1b[90mconfig: ${result.path}\x1b[0m`)
    })

  cmd.command('clear')
    .argument('<scope>', 'project or global')
    .description('Clear all stored permission rules for a scope')
    .action((scope: string) => {
      const normalizedScope = scope === 'global' ? 'global' : 'project'
      const result = clearStoredPermissionRules(normalizedScope, process.cwd())
      console.log(`  \x1b[90mcleared ${result.removedCount} ${normalizedScope} rule(s).\x1b[0m`)
      console.log(`  \x1b[90mconfig: ${result.path}\x1b[0m`)
    })

  return cmd
}
