export interface UnsupportedClaimFinding {
  kind: string
  claim: string
  requiredEvidence: string
}

interface ClaimRule {
  kind: string
  claim: string
  requiredEvidence: string
  patterns: RegExp[]
  hasEvidence: (tools: Set<string>) => boolean
}

const FILE_MUTATION_TOOLS = new Set([
  'write_file',
  'edit_file',
  'multi_edit',
  'patch_file',
  'delete_file',
  'move_file',
  'copy_file',
  'create_directory',
])

const COMMAND_TOOLS = new Set(['run_command', 'run_background'])
const MCP_TOOLS = new Set(['mcp_list_servers', 'mcp_list_resources', 'mcp_read_resource'])

function hasAny(tools: Set<string>, expected: Set<string>): boolean {
  for (const tool of expected) {
    if (tools.has(tool)) return true
  }
  return false
}

function hasMcpEvidence(tools: Set<string>): boolean {
  if (hasAny(tools, MCP_TOOLS)) return true
  for (const tool of tools) {
    if (tool.startsWith('mcp__')) return true
  }
  return false
}

const CLAIM_RULES: ClaimRule[] = [
  {
    kind: 'file-mutation',
    claim: 'local file was created, saved, written, updated, or generated',
    requiredEvidence: 'write_file/edit_file/multi_edit/patch_file or another file mutation tool',
    patterns: [
      /\b(?:saved|created|wrote|written|updated|generated)\b.{0,120}\b(?:file|document|\.md|\.txt|\.json|\.html|\.ts|\.tsx|\.py)\b/i,
      /(?:已|已经|成功|刚刚).{0,24}(?:创建|生成|写入|保存|更新|落盘).{0,120}(?:文件|文档|\.md|\.txt|\.json|\.html|\.ts|\.tsx|\.py)/i,
    ],
    hasEvidence: (tools) => hasAny(tools, FILE_MUTATION_TOOLS),
  },
  {
    kind: 'file-open',
    claim: 'local file was opened',
    requiredEvidence: 'open_file tool call',
    patterns: [
      /\b(?:opened|open(?:ed)? up)\b.{0,80}\b(?:file|document|\.md|\.txt|\.json|\.html)\b/i,
      /(?:已|已经|成功|刚刚).{0,24}(?:打开).{0,100}(?:文件|文档|\.md|\.txt|\.json|\.html)/i,
    ],
    hasEvidence: (tools) => tools.has('open_file'),
  },
  {
    kind: 'verification',
    claim: 'tests, lint, build, typecheck, or checks were run or passed',
    requiredEvidence: 'run_command/run_background tool call',
    patterns: [
      /\b(?:ran|run|executed)\b.{0,40}\b(?:tests?|lint|build|typecheck|checks?)\b/i,
      /\b(?:tests?|lint|build|typecheck|checks?)\b.{0,60}\b(?:passed|green|succeeded|completed|clean)\b/i,
      /(?:已|已经|成功|刚刚).{0,30}(?:运行|执行|跑完|通过).{0,50}(?:测试|检查|构建|lint|build|typecheck)/i,
      /(?:测试|检查|构建|lint|build|typecheck).{0,50}(?:已|已经|成功)?(?:通过|完成|正常)/i,
    ],
    hasEvidence: (tools) => hasAny(tools, COMMAND_TOOLS),
  },
  {
    kind: 'git-commit',
    claim: 'changes were committed',
    requiredEvidence: 'git_commit or run_command tool call',
    patterns: [
      /\b(?:committed|created commit|git commit(?:ted)?)\b/i,
      /(?:已|已经|成功|刚刚).{0,24}(?:提交|commit)/i,
    ],
    hasEvidence: (tools) => tools.has('git_commit') || hasAny(tools, COMMAND_TOOLS),
  },
  {
    kind: 'git-publish',
    claim: 'changes were pushed, published, released, or deployed',
    requiredEvidence: 'run_command tool call showing the publish/deploy action',
    patterns: [
      /\b(?:pushed|published|released|deployed)\b/i,
      /(?:已|已经|成功|刚刚).{0,24}(?:推送|发布|部署|上线)/i,
    ],
    hasEvidence: (tools) => hasAny(tools, COMMAND_TOOLS),
  },
  {
    kind: 'mcp',
    claim: 'MCP tools or resources were called',
    requiredEvidence: 'mcp_* or mcp__server__tool call',
    patterns: [
      /\b(?:used|called|queried|invoked)\b.{0,40}\bMCP\b/i,
      /(?:已|已经|成功|刚刚).{0,24}(?:调用|使用|查询).{0,40}MCP/i,
    ],
    hasEvidence: hasMcpEvidence,
  },
]

export function detectUnsupportedClaimEvidence(options: {
  responseText: string
  executedToolNames: string[]
}): UnsupportedClaimFinding[] {
  const text = options.responseText.trim()
  if (!text) return []

  const tools = new Set(options.executedToolNames)
  const findings: UnsupportedClaimFinding[] = []
  for (const rule of CLAIM_RULES) {
    if (rule.hasEvidence(tools)) continue
    if (!rule.patterns.some((pattern) => pattern.test(text))) continue
    findings.push({
      kind: rule.kind,
      claim: rule.claim,
      requiredEvidence: rule.requiredEvidence,
    })
  }
  return findings
}

export function buildUnsupportedClaimEvidenceNotice(options: {
  responseText: string
  executedToolNames: string[]
}): string | null {
  const findings = detectUnsupportedClaimEvidence(options)
  if (findings.length === 0) return null

  const lines = findings.map((finding) =>
    `- ${finding.claim}: no supporting ${finding.requiredEvidence} was recorded in this turn.`,
  )
  return [
    'Claim evidence guard: unsupported completion claim(s) detected.',
    ...lines,
    'Treat those claim(s) as pending until a tool call verifies them.',
  ].join('\n')
}
