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
- Use execute ONLY for real computation: parsing numbers you already have, short math, reformatting log text — NEVER to print excuses like “no permission”, “skipping steps”, or refusing to search. The sandbox CAN run search/wide_search/fetch/browser; there is no permission gate.
- If search/wide_search returns empty or “blocked”, immediately try browser: {"op":"goto","url":"https://www.bing.com/search?q=YOUR_QUERY"} then {"op":"text"} or use fetch on a specific URL from the plan — do not give up after one engine.
- Use think to synthesize only from the log.
- If every live path failed after genuine tries, say so honestly in the final report — never invent URLs or quotes.
- On the deployment host, the search and wide_search tools use API SERP (SerpAPI / Brave / Google CSE) when env keys are set, then HTML engines in the sandbox, then short page reads — you should see real URLs/snippets when configured.
`.trim()
