/** Prefix goal with project constraints (Manus Projects–style). */
export function projectPrefixFromInputs(inputs: Record<string, string>): string {
  const parts: string[] = []
  if (inputs.project_name?.trim()) {
    parts.push(`Project: ${inputs.project_name.trim()}`)
  }
  if (inputs.project_instructions?.trim()) {
    parts.push(
      `Master instructions (follow for every step and the final report):\n${inputs.project_instructions.trim()}`
    )
  }
  if (inputs.project_context?.trim()) {
    parts.push(`Reference knowledge:\n${inputs.project_context.trim()}`)
  }
  return parts.join("\n\n")
}
