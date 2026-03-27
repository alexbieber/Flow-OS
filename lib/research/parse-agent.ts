export interface AgentDecision {
  tool: string
  input: string
  reasoning?: string
}

const TOOLS = new Set([
  "search",
  "wide_search",
  "fetch",
  "browser",
  "execute",
  "think",
  "remember",
  "done",
])

export function parseAgentDecision(raw: string): AgentDecision | null {
  const clean = raw.replace(/```json|```/g, "").trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(clean)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const o = parsed as Record<string, unknown>
  const tool = o.tool
  const input = o.input
  if (typeof tool !== "string" || !TOOLS.has(tool)) return null
  if (typeof input !== "string") return null
  const reasoning = o.reasoning
  return {
    tool,
    input,
    ...(typeof reasoning === "string" ? { reasoning: reasoning.slice(0, 500) } : {}),
  }
}
