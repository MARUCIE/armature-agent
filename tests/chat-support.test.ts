import { describe, it, expect, afterEach } from 'vitest'
import { resolve } from 'node:path'
import { rememberWorkspaceCwd, resolveWorkspaceCwd } from '../src/commands/chat-support.js'
import { createTempProject } from './helpers/temp-project.js'
import { withEnv } from './helpers/env-snapshot.js'

const originalCwd = process.cwd()

afterEach(() => {
  process.chdir(originalCwd)
})

describe('workspace cwd resolution', () => {
  it('uses explicit cwd before ambient process cwd', () => {
    const project = createTempProject({ 'package.json': '{}' })
    try {
      expect(resolveWorkspaceCwd(project.dir)).toBe(resolve(project.dir))
    } finally {
      project.cleanup()
    }
  })

  it('falls back from non-workspace launches to the last remembered workspace', async () => {
    const home = createTempProject({})
    const launcherDir = createTempProject({})
    const project = createTempProject({ 'package.json': '{}' })
    try {
      await withEnv({ HOME: home.dir }, () => {
        rememberWorkspaceCwd(project.dir)
        process.chdir(launcherDir.dir)
        expect(resolveWorkspaceCwd()).toBe(resolve(project.dir))
      })
    } finally {
      home.cleanup()
      launcherDir.cleanup()
      project.cleanup()
    }
  })

  it('keeps an ambient workspace cwd when launched inside a project', async () => {
    const home = createTempProject({})
    const project = createTempProject({ 'package.json': '{}' })
    const otherProject = createTempProject({ 'package.json': '{}' })
    try {
      await withEnv({ HOME: home.dir }, () => {
        rememberWorkspaceCwd(otherProject.dir)
        process.chdir(project.dir)
        expect(resolveWorkspaceCwd()).toBe(resolve(process.cwd()))
      })
    } finally {
      home.cleanup()
      project.cleanup()
      otherProject.cleanup()
    }
  })
})
