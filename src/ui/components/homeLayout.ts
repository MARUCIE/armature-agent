export interface HomeLayout {
  split: boolean
  frameWidth: number
  primaryWidth: number
  leftColumnWidth: number
  rightColumnWidth: number
  gap: number
  offset: number
}

const SPLIT_THRESHOLD = 124
const STACK_MAX_WIDTH = 92
const SPLIT_MAX_WIDTH = 136

export function getHomeLayout(cols: number): HomeLayout {
  const split = cols >= SPLIT_THRESHOLD
  const maxWidth = split ? SPLIT_MAX_WIDTH : STACK_MAX_WIDTH
  const availableWidth = Math.max(1, cols - 4)
  const frameWidth = Math.min(availableWidth, maxWidth)
  const gap = split ? 2 : 0
  const availableColumns = frameWidth - gap
  const leftColumnWidth = split ? Math.floor(availableColumns / 2) : frameWidth
  const rightColumnWidth = split ? availableColumns - leftColumnWidth : frameWidth
  const offset = Math.max(0, Math.floor((cols - frameWidth) / 2))

  return {
    split,
    frameWidth,
    primaryWidth: frameWidth,
    leftColumnWidth,
    rightColumnWidth,
    gap,
    offset,
  }
}
