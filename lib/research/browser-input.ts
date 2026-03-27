import type { BrowserOp } from "@/lib/sandbox/browser-playwright"

/** Parse agent `browser` tool input: JSON object or bare https URL (goto). */
export function parseBrowserInput(raw: string): BrowserOp | null {
  const t = raw.trim()
  if (!t) return null

  if (/^https?:\/\//i.test(t) && !t.includes("\n")) {
    return { op: "goto", url: t.slice(0, 3000) }
  }

  try {
    const o = JSON.parse(t) as Record<string, unknown>
    if (!o || typeof o !== "object") return null
    const op = o.op
    if (op === "goto" && typeof o.url === "string") {
      return { op: "goto", url: o.url.slice(0, 3000) }
    }
    if (op === "text") {
      return {
        op: "text",
        ...(typeof o.selector === "string" ? { selector: o.selector.slice(0, 500) } : {}),
      }
    }
    if (op === "title") return { op: "title" }
    if (op === "links") {
      const max = typeof o.max === "number" ? o.max : 20
      return { op: "links", max: Math.max(1, Math.min(40, Math.floor(max))) }
    }
    if (op === "screenshot") {
      return {
        op: "screenshot",
        ...(o.fullPage === true ? { fullPage: true } : {}),
        ...(typeof o.analyze === "string" && o.analyze.trim()
          ? { analyze: o.analyze.trim().slice(0, 4000) }
          : {}),
      }
    }
  } catch {
    return null
  }
  return null
}
