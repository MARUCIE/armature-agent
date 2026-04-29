import { describe, expect, it } from 'vitest'
import {
  applyWorkflowPresetPolicy,
  buildModePickerDescription,
  buildModePickerDescriptionWithPreset,
  buildModeSystemPromptBlock,
  buildStartupSystemPrompt,
  describeModeChanges,
  describeWorkflowPresetDefaults,
  describeWorkflowPresetPolicy,
  filterToolDefinitionsForMode,
  getWorkflowPreset,
  getWorkflowPresetForMode,
  listWorkflowPresets,
  ModeRegistry,
} from '../src/modes/index.js'
import { applyModeSystemPrompt } from '../src/commands/mode-system-prompt.js'
import { TOOL_DEFINITIONS } from '../src/tools.js'

describe('mode system prompt switching', () => {
  it('replaces the previous builtin mode prefix when switching to reflect', () => {
    const registry = new ModeRegistry()
    const codeReviewPrefix = registry.getMode('code-review')!.systemPromptPrefix
    const reflectPrefix = registry.getMode('reflect')!.systemPromptPrefix
    const currentSystemPrompt = `${codeReviewPrefix}\n\nBase prompt`

    const nextSystemPrompt = applyModeSystemPrompt({
      currentSystemPrompt,
      previousModePrefix: codeReviewPrefix,
      nextModePrefix: reflectPrefix,
    })

    expect(nextSystemPrompt).toContain(reflectPrefix)
    expect(nextSystemPrompt).toContain('Base prompt')
    expect(nextSystemPrompt).not.toContain(codeReviewPrefix)
  })

  it('replaces a custom multi-word mode prefix exactly once', () => {
    const customPrefix = 'You are in team handoff review mode. Compare plans, risks, and rollout assumptions before proposing changes.'
    const reflectPrefix = new ModeRegistry().getMode('reflect')!.systemPromptPrefix
    const currentSystemPrompt = `Think carefully and thoroughly before answering.\n\n${customPrefix}\n\nBase prompt`

    const nextSystemPrompt = applyModeSystemPrompt({
      currentSystemPrompt,
      previousModePrefix: customPrefix,
      nextModePrefix: reflectPrefix,
    })

    expect(nextSystemPrompt).toContain('Think carefully and thoroughly before answering.')
    expect(nextSystemPrompt).toContain(reflectPrefix)
    expect(nextSystemPrompt).toContain('Base prompt')
    expect(nextSystemPrompt).not.toContain(customPrefix)
    expect(nextSystemPrompt.match(/You are in reflect mode\./g)?.length).toBe(1)
  })

  it('keeps architect mode description aligned with its system prompt intent', () => {
    const registry = new ModeRegistry()
    const architect = registry.getMode('architect')!
    const summary = describeModeChanges(architect)

    expect(summary).toContain('no code changes')
    expect(summary).toContain('plan')
    expect(architect.systemPromptPrefix).toContain('Do NOT modify files')
    expect(architect.systemPromptPrefix).toContain('planning')
  })

  it('builds picker descriptions that preserve the workflow summary and current marker', () => {
    const registry = new ModeRegistry()
    const debug = registry.getMode('debug')!
    const codeReview = registry.getMode('code-review')!

    expect(buildModePickerDescription(debug, true)).toContain('reproduce')
    expect(buildModePickerDescription(debug, true)).toContain('current')
    expect(buildModePickerDescription(codeReview, false)).toContain('no code changes')
  })

  it('builds picker descriptions that include preset policy defaults', () => {
    const registry = new ModeRegistry()
    const architect = registry.getMode('architect')!
    const preset = getWorkflowPresetForMode('architect')!

    const description = buildModePickerDescriptionWithPreset(architect, preset, true)
    expect(description).toContain('no code changes')
    expect(description).toContain('effort=max')
    expect(description).toContain('permissions=plan')
    expect(description).toContain('current')
  })

  it('exposes workflow presets from a single registry', () => {
    const presets = listWorkflowPresets()
    expect(presets.map((preset) => preset.commandName)).toEqual(expect.arrayContaining([
      'reflect',
      'review',
      'debug',
      'architect',
    ]))
    expect(getWorkflowPreset('review')).toMatchObject({
      commandName: 'review',
      modeId: 'code-review',
    })
    expect(getWorkflowPreset('architect')).toMatchObject({
      commandName: 'architect',
      modeId: 'architect',
    })
  })

  it('keeps workflow presets bound to existing modes', () => {
    const registry = new ModeRegistry()
    for (const preset of listWorkflowPresets()) {
      expect(registry.getMode(preset.modeId)).toBeDefined()
      expect(registry.switchTo(preset.modeId)).toBe(true)
    }
  })

  it('keeps reflect as the only preset with forceReflect semantics', () => {
    const forceReflectPresets = listWorkflowPresets().filter((preset) => preset.forceReflect)
    expect(forceReflectPresets).toHaveLength(1)
    expect(forceReflectPresets[0]?.commandName).toBe('reflect')
  })

  it('exposes structured workflow policy for built-in presets', () => {
    const review = getWorkflowPreset('review')!
    const debug = getWorkflowPreset('debug')!
    const architect = getWorkflowPreset('architect')!

    expect(review.defaultPermissionMode).toBe('plan')
    expect(review.defaultEffort).toBe('high')
    expect(debug.defaultPermissionMode).toBe('auto')
    expect(debug.defaultEffort).toBe('high')
    expect(architect.defaultPermissionMode).toBe('plan')
    expect(architect.defaultEffort).toBe('max')
    expect(review.modelPolicy).toBe('inherit-current')
    expect(review.toolPolicy).toBe('review-only')
    expect(review.outputStyle).toBe('review-findings')
    expect(architect.toolPolicy).toBe('planning-only')
    expect(architect.outputStyle).toBe('architecture-plan')
    expect(describeWorkflowPresetPolicy(architect)).toContain('mode=architect')
    expect(describeWorkflowPresetPolicy(architect)).toContain('effort=max')
    expect(describeWorkflowPresetPolicy(architect)).toContain('permissions=plan')
    expect(describeWorkflowPresetPolicy(architect)).toContain('tools=planning-only tools')
    expect(describeWorkflowPresetPolicy(architect)).toContain('output=architecture plan')
    expect(describeWorkflowPresetDefaults(architect)).toContain('effort=max')
    expect(describeWorkflowPresetDefaults(architect)).toContain('permissions=plan')
    expect(describeWorkflowPresetDefaults(architect)).toContain('tools=planning-only tools')
    expect(describeWorkflowPresetDefaults(architect)).toContain('output=architecture plan')
    expect(getWorkflowPresetForMode('architect')?.commandName).toBe('architect')
    expect(getWorkflowPresetForMode('code-review')?.commandName).toBe('review')
  })

  it('applies workflow preset policy by replacing only declared defaults', () => {
    const architect = getWorkflowPreset('architect')!
    const review = getWorkflowPreset('review')!

    expect(applyWorkflowPresetPolicy(
      { effort: 'medium', permissionMode: 'yolo' },
      architect,
    )).toEqual({ effort: 'max', permissionMode: 'plan' })

    expect(applyWorkflowPresetPolicy(
      { effort: 'low', permissionMode: 'auto' },
      review,
    )).toEqual({ effort: 'high', permissionMode: 'plan' })

    expect(applyWorkflowPresetPolicy(
      { effort: 'medium', permissionMode: 'auto' },
      undefined,
    )).toEqual({ effort: 'medium', permissionMode: 'auto' })
  })

  it('builds startup system prompts from the same preset contract used at runtime bootstrap', () => {
    const registry = new ModeRegistry()
    const architect = registry.getMode('architect')!
    const preset = getWorkflowPreset('architect')!

    const prompt = buildStartupSystemPrompt('Base prompt', {
      effort: 'max',
      mode: architect,
      preset,
    })

    expect(prompt).toContain('Use deep analysis. Consider all edge cases. Think step by step.')
    expect(prompt).toContain(architect.systemPromptPrefix)
    expect(prompt).toContain('Tool policy: stay inside planning-only tools.')
    expect(prompt).toContain('Output style: use sections Constraints, Architecture, Tradeoffs, Plan, Risks')
    expect(prompt).toContain('Base prompt')
  })

  it('builds composite mode prompt blocks that include preset output contract', () => {
    const registry = new ModeRegistry()
    const review = registry.getMode('code-review')!
    const preset = getWorkflowPreset('review')!

    const block = buildModeSystemPromptBlock(review, preset)
    expect(block).toContain(review.systemPromptPrefix)
    expect(block).toContain('Tool policy: stay inside read-only review tools.')
    expect(block).toContain('Output style: lead with findings ordered by severity')
  })

  it('filters tool definitions to the active mode whitelist, including extra tools', () => {
    const registry = new ModeRegistry()
    const review = registry.getMode('code-review')!
    const toolDefs = filterToolDefinitionsForMode([
      ...(TOOL_DEFINITIONS as Array<Record<string, unknown>>),
      { type: 'function', function: { name: 'custom_search' } },
    ], review)

    const toolNames = toolDefs
      .map((tool) => (tool.function as { name?: string } | undefined)?.name)
      .filter((name): name is string => Boolean(name))

    expect(toolNames).toContain('read_file')
    expect(toolNames).toContain('git_diff')
    expect(toolNames).not.toContain('edit_file')
    expect(toolNames).not.toContain('run_command')
    expect(toolNames).not.toContain('custom_search')
  })
})
