import { VisibilitySettings } from './visibility'

export type ToolType = 'select' | 'line' | 'vanishingLine' | 'loop' | null

export interface ToolContext {
  activeTool: ToolType
  allowedEntityTypes: Set<keyof VisibilitySettings> | null
}

export const SELECT_TOOL_CONTEXT: ToolContext = {
  activeTool: 'select',
  allowedEntityTypes: null
}

export const LINE_TOOL_CONTEXT: ToolContext = {
  activeTool: 'line',
  allowedEntityTypes: new Set(['worldPoints'])
}

export const VANISHING_LINE_TOOL_CONTEXT: ToolContext = {
  activeTool: 'vanishingLine',
  allowedEntityTypes: new Set([])
}

export const LOOP_TOOL_CONTEXT: ToolContext = {
  activeTool: 'loop',
  allowedEntityTypes: new Set(['worldPoints', 'lines'])
}
