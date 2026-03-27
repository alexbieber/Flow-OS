/** Parse wide-search tool input: JSON array or queries separated by `|||`. */
export function parseWideQueries(raw: string): string[] {
  const t = raw.trim()
  if (!t) return []
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as unknown
      if (Array.isArray(arr)) {
        return arr
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((s) => s.trim())
          .slice(0, 4)
      }
    } catch {
      /* fall through */
    }
  }
  return t
    .split(/\s*\|\|\|\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .slice(0, 4)
}
