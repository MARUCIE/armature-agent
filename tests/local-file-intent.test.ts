import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rmSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildPostModelSaveRepairPlan,
  buildPreModelLocalFilePlan,
  extractLocalFilePaths,
} from '../src/commands/local-file-intent.js'
import type { ChatMessage } from '../src/providers/openai-compat.js'

function tempPath(name: string): string {
  return join(tmpdir(), `orca-local-file-intent-${process.pid}-${Date.now()}-${name}`)
}

describe('local file intent guard', () => {
  it('extracts backtick local paths from multilingual prompts', () => {
    const path = tempPath('demo.md')

    expect(extractLocalFilePaths(`请打开 \`${path}\` 验证`, process.cwd())).toEqual([path])
  })

  it('builds a direct write and open plan when the user provides file content', () => {
    const path = tempPath('direct.md')
    const plan = buildPreModelLocalFilePlan({
      prompt: `保存并打开 \`${path}\`\n\n\`\`\`md\n# Demo\nBody\n\`\`\``,
      history: [{ role: 'system', content: 'system' }],
      cwd: process.cwd(),
    })

    expect(plan?.reason).toBe('direct-write')
    expect(plan?.toolCalls).toEqual([
      { name: 'write_file', args: { path, content: '# Demo\nBody\n' } },
      { name: 'open_file', args: { path } },
    ])
  })

  it('repairs a missing file that was previously claimed in chat history', () => {
    const path = tempPath('claimed.md')
    rmSync(path, { force: true })
    const history: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'assistant', content: `已保存到 \`${path}\`\n\n# Draft\nContent\n` },
    ]

    const plan = buildPreModelLocalFilePlan({
      prompt: '本地没有这个文件，给我打开',
      history,
      cwd: process.cwd(),
    })

    expect(plan?.reason).toBe('repair-missing-claimed-file')
    expect(plan?.toolCalls.map((call) => call.name)).toEqual(['write_file', 'open_file'])
    expect(plan?.toolCalls[0]?.args).toMatchObject({ path })
    expect(String(plan?.toolCalls[0]?.args.content)).toContain('# Draft')
    expect(String(plan?.toolCalls[0]?.args.content)).not.toContain('已保存到')
  })

  it('does not repair an existing claimed file', () => {
    const path = tempPath('exists.md')
    writeFileSync(path, '# Already exists\n')
    try {
      const plan = buildPreModelLocalFilePlan({
        prompt: '本地没有这个文件，给我打开',
        history: [{ role: 'assistant', content: `已保存到 \`${path}\`\n\n# Draft\n` }],
        cwd: process.cwd(),
      })

      expect(plan?.reason).toBe('direct-open')
      expect(plan?.toolCalls).toEqual([{ name: 'open_file', args: { path } }])
    } finally {
      rmSync(path, { force: true })
    }
  })

  it('builds a post-model repair plan for false save claims with no tool call', () => {
    const path = tempPath('false-save.md')
    rmSync(path, { force: true })

    const plan = buildPostModelSaveRepairPlan({
      prompt: 'save this as a markdown file',
      responseText: `Saved to \`${path}\`.\n\n# Generated\nBody\n`,
      history: [{ role: 'system', content: 'system' }],
      cwd: process.cwd(),
      executedToolNames: [],
    })

    expect(plan?.reason).toBe('repair-false-save-claim')
    expect(plan?.toolCalls).toEqual([
      {
        name: 'write_file',
        args: {
          path,
          content: '# Generated\nBody\n',
        },
      },
    ])
  })

  it('uses fenced markdown body instead of writing assistant conversation text', () => {
    const path = tempPath('fenced-false-save.md')
    rmSync(path, { force: true })

    const plan = buildPostModelSaveRepairPlan({
      prompt: '把上面的对话扩写成一篇 md 文件并保存',
      responseText: `好的，我会整理对话并保存到 \`${path}\`。\n\n\`\`\`markdown\n# 女儿的奶水\n\n## 场景一\n正文内容\n\`\`\``,
      history: [{ role: 'system', content: 'system' }],
      cwd: process.cwd(),
      executedToolNames: [],
    })

    expect(plan?.reason).toBe('repair-false-save-claim')
    expect(plan?.toolCalls[0]?.args).toMatchObject({
      path,
      content: '# 女儿的奶水\n\n## 场景一\n正文内容\n',
    })
  })

  it('does not repair false save claims when the response has no generated artifact content', () => {
    const path = tempPath('chat-dump.md')
    rmSync(path, { force: true })

    const plan = buildPostModelSaveRepairPlan({
      prompt: '生成一个 md 文件',
      responseText: `我已经根据我们的对话整理好了，并保存到 \`${path}\`。你可以打开验证。`,
      history: [{ role: 'system', content: 'system' }],
      cwd: process.cwd(),
      executedToolNames: [],
    })

    expect(plan).toBeNull()
  })

  it('does not write refusal text as a repaired file', () => {
    const path = tempPath('refusal.md')
    rmSync(path, { force: true })

    const plan = buildPostModelSaveRepairPlan({
      prompt: 'save this as a markdown file',
      responseText: `无法在你的本地创建文件。你可以保存到 \`${path}\`。`,
      history: [{ role: 'system', content: 'system' }],
      cwd: process.cwd(),
      executedToolNames: [],
    })

    expect(plan).toBeNull()
  })
})
