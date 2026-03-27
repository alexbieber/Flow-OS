/** Stored on runs.brain_* columns for DB compatibility (no separate “brains” product). */
export const RESEARCH_AGENT = {
  id: "research",
  name: "Web research",
  icon: "🔬",
} as const

export const RESEARCH_MAX_STEPS = 14

/** Manus-style workflow: plan → wide research → browse → code → synthesize → deliverables. */
export const RESEARCH_WORKFLOW_GUIDE = `
- Follow the APPROVED PLAN when present; adapt if web results contradict it.
- Use wide_search when you need several angles at once (pass 2–4 queries separated by ||| OR a JSON string array).
- Use search for a single focused query when one angle is enough.
- Use fetch for quick HTML text; use browser for real Chromium rendering (JS sites, login flows after first visit share /tmp/flowos_chrome_profile).
- browser ops (JSON or bare URL): {"op":"goto","url":"https://..."} then {"op":"text"} or {"op":"links","max":20} or {"op":"title"} on the same page — always goto before text/links on a new URL.
- {"op":"screenshot","fullPage":false,"analyze":"What should I click next?"} — JPEG capture + Gemini vision (omit analyze to only get a hint string).
- Use execute for Python parsing/math — print() to stdout; stdlib + requests + bs4.
- Use think to synthesize only from the log.
- If live web failed, say so in the final report — never invent URLs or quotes.
`.trim()
