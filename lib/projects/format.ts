/** Build a single block for Jarvis / agent prompts (server-side only). */
export function formatProjectBlock(p: {
  name: string
  instructions: string
  context: string
}): string {
  const lines: string[] = [`Active project: ${p.name.trim() || "Untitled"}`]
  if (p.instructions.trim()) {
    lines.push(`Master instructions (apply to every reply and research run):\n${p.instructions.trim()}`)
  }
  if (p.context.trim()) {
    lines.push(`Reference knowledge / files summary:\n${p.context.trim()}`)
  }
  return lines.join("\n\n")
}
