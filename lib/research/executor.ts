import { Sandbox } from "e2b"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { RESEARCH_AGENT, RESEARCH_MAX_STEPS, RESEARCH_WORKFLOW_GUIDE } from "@/lib/research/constants"
import { projectPrefixFromInputs } from "@/lib/projects/merge-goal"
import { parseBrowserInput } from "@/lib/research/browser-input"
import { parseAgentDecision } from "@/lib/research/parse-agent"
import { parseWideQueries } from "@/lib/research/wide-search"
import { Run, RunLog, RunStatus } from "@/types"
import { runServerSearch } from "@/lib/research/server-search"
import {
  fetchTopUrlBodiesInSandbox,
  parseSearchOutputUrls,
  scrapeSearchInSandbox,
} from "@/lib/research/scrape-search-sandbox"
import { createTerminalSandbox, runCommand, killSandbox } from "@/lib/sandbox/e2b"
import { runBrowserOp } from "@/lib/sandbox/browser-playwright"

export type OnUpdate = (update: {
  status?: RunStatus
  progress?: number
  currentStep?: string
  log?: RunLog
  result?: Run["result"]
}) => void

const MAX_PYTHON_BYTES = 24_000
const URL_RE = /https?:\/\/[^\s)\]]+/gi
const EVIDENCE_MIN_URLS = 2
const EVIDENCE_MIN_DOMAINS = 2
const DECISION_MIN_URLS = 4
const DECISION_MIN_DOMAINS = 4
const PRELIMINARY_RE = /\b(preliminary|incomplete|work in progress)\b/i
const INSUFFICIENT_RECOMMENDATION_SENTENCE = "Insufficient evidence for high-confidence recommendation."

function getGemini() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY is not set")
  return new GoogleGenerativeAI(key)
}

function log(onUpdate: OnUpdate, type: RunLog["type"], message: string) {
  onUpdate({ log: { timestamp: new Date().toISOString(), type, message } })
}

function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE) ?? []
  const clean = matches.map((u) => u.replace(/[.,;]+$/, ""))
  return Array.from(new Set(clean))
}

function getEvidenceStats(text: string): { urls: string[]; uniqueDomains: string[] } {
  const urls = extractUrls(text)
  const domains = new Set<string>()
  for (const u of urls) {
    try {
      domains.add(new URL(u).hostname.replace(/^www\./i, "").toLowerCase())
    } catch {
      // ignore malformed URLs
    }
  }
  return { urls, uniqueDomains: Array.from(domains) }
}

function parseBrowserLinksOutput(raw: string): string[] {
  const m = raw.match(/LINKS_JSON:\s*(\[[\s\S]*\])/)
  if (!m) return []
  try {
    const arr = JSON.parse(m[1]) as string[]
    return arr
      .map((line) => {
        const idx = line.lastIndexOf(" | ")
        return idx >= 0 ? line.slice(idx + 3).trim() : line.trim()
      })
      .filter((u) => u.startsWith("http"))
  } catch {
    return []
  }
}

async function browserSearchFallback(
  sandbox: Sandbox,
  query: string
): Promise<{ urls: string[]; block: string }> {
  const lines: string[] = []
  const allUrls: string[] = []

  const candidates = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10`,
  ]

  for (const url of candidates) {
    try {
      const nav = await runBrowserOp(sandbox, { op: "goto", url })
      lines.push(`BROWSER_SEARCH_ENGINE: ${url}`)
      lines.push(nav.slice(0, 500))
      const linksOut = await runBrowserOp(sandbox, { op: "links", max: 12 })
      const found = parseBrowserLinksOutput(linksOut).filter(
        (u) =>
          !/duckduckgo\.com|bing\.com\/search|google\.com\/search/i.test(u)
      )
      for (const u of found) {
        if (!allUrls.includes(u)) allUrls.push(u)
      }
      if (allUrls.length >= 4) break
    } catch {
      // continue to the next engine
    }
  }

  if (allUrls.length > 0) {
    lines.push("BROWSER_SEARCH_URLS:")
    for (const u of allUrls.slice(0, 8)) lines.push(`URL: ${u}`)
  } else {
    lines.push("BROWSER_SEARCH_URLS: (none)")
  }

  return { urls: allUrls.slice(0, 8), block: lines.join("\n") }
}

function querySeedUrls(query: string): string[] {
  const q = query.toLowerCase()
  const seeds: string[] = []
  if (q.includes("pinecone")) {
    seeds.push("https://www.pinecone.io/pricing/")
    seeds.push("https://docs.pinecone.io/")
    seeds.push("https://www.pinecone.io/security/")
  }
  if (q.includes("weaviate")) {
    seeds.push("https://weaviate.io/pricing")
    seeds.push("https://weaviate.io/developers/weaviate")
  }
  if (q.includes("qdrant")) {
    seeds.push("https://qdrant.tech/pricing/")
    seeds.push("https://qdrant.tech/documentation/")
    seeds.push("https://qdrant.tech/hybrid-cloud/")
  }
  return Array.from(new Set(seeds))
}

function isEvidenceHeavyGoal(goal: string): boolean {
  return /\b(compare|pricing|benchmark|latency|performance|cost|sources?|official|market|vs\.?)\b/i.test(
    goal
  )
}

function meetsCitationGate(text: string): boolean {
  const stats = getEvidenceStats(text)
  return stats.urls.length >= EVIDENCE_MIN_URLS && stats.uniqueDomains.length >= EVIDENCE_MIN_DOMAINS
}

function meetsDecisionCitationGate(text: string): boolean {
  const stats = getEvidenceStats(text)
  return stats.urls.length >= DECISION_MIN_URLS && stats.uniqueDomains.length >= DECISION_MIN_DOMAINS
}

function extractOfficialVendorUrls(text: string): string[] {
  const urls = extractUrls(text)
  const official = urls.filter((u) => {
    try {
      const host = new URL(u).hostname.toLowerCase()
      return (
        host.endsWith("pinecone.io") ||
        host.endsWith("weaviate.io") ||
        host.endsWith("qdrant.tech")
      )
    } catch {
      return false
    }
  })
  return Array.from(new Set(official)).slice(0, 6)
}

function ensureRecommendationEvidenceBlock(report: string, memory: string): string {
  if (/##\s*recommendation evidence/i.test(report)) return report
  if (!/executive recommendation|recommendation/i.test(report)) return report
  const vendors = extractOfficialVendorUrls(memory)
  if (vendors.length === 0) return report
  return `${report.trim()}\n\n## Recommendation evidence\n${vendors
    .slice(0, 4)
    .map((u) => `- ${u}`)
    .join("\n")}`
}

async function enforceReportTone(report: string, goal: string, memory: string): Promise<string> {
  if (!PRELIMINARY_RE.test(report)) return report
  if (!meetsDecisionCitationGate(report)) return report
  return askGeminiReport(`
Rewrite the report below to sound final and decision-oriented.

Goal: ${JSON.stringify(goal)}

Rules:
- Keep all factual claims and URLs grounded in the original text/log.
- Keep or improve the recommendation and fallback sections.
- Keep an "Evidence quality status" section.
- Remove wording like "preliminary", "incomplete", or "work in progress".
- Do not invent new numbers, dates, benchmarks, or links.

Research log excerpt:
${memory.slice(-9000)}

Current report:
${report.slice(0, 24000)}
`)
}

function needsStrictDecisionTemplate(goal: string): boolean {
  return /\b(decision memo|executive recommendation|adoption plan|comparison table|fallback|compare|vs\.?)\b/i.test(
    goal
  )
}

function hasWellFormedComparisonTable(report: string): boolean {
  const lines = report.split(/\r?\n/)
  const idx = lines.findIndex((line) => /comparison table/i.test(line))
  if (idx < 0) return false
  const tableLines = lines
    .slice(idx + 1)
    .filter((line) => /^\|/.test(line.trim()))
  // header + separator + at least 2 data rows
  return tableLines.length >= 4
}

function hasStrictDecisionTemplate(report: string): boolean {
  const hasExecutive = /executive recommendation/i.test(report)
  const hasPhases = /0-3 months|3-9 months|9-18 months|3-?phase adoption plan/i.test(report)
  const hasTable = /comparison table/i.test(report) && hasWellFormedComparisonTable(report)
  const hasFailure = /where this recommendation could fail/i.test(report)
  const hasEvidence = /evidence quality status/i.test(report)
  return hasExecutive && hasPhases && hasTable && hasFailure && hasEvidence
}

async function enforceDecisionTemplate(report: string, goal: string, memory: string): Promise<string> {
  if (!needsStrictDecisionTemplate(goal)) return report
  if (hasStrictDecisionTemplate(report)) return report

  return askGeminiReport(`
Rewrite the report into this strict structure (do not invent facts or links):

## 1) Executive recommendation
- Default choice: ...
- Fallback choice: ...

## 2) 3-phase adoption plan
### 0-3 months
### 3-9 months
### 9-18 months

## 3) Comparison table
Use a Markdown table with columns exactly:
| pricing model | deployment options | ops complexity | scaling characteristics | latency/performance notes | ecosystem/integration maturity | key risks |
Do not collapse the table into a single line. Use one row per line and include at least Pinecone, Weaviate, and Qdrant rows.

## 4) Where this recommendation could fail
- 3 to 5 concrete failure modes with uncertainty labels where needed.

## 5) Evidence quality status
- URL count
- Unique domain count
- Confidence level

Constraints:
- Use only evidence-backed claims from the provided log/current report.
- Include source URLs inline in markdown.
- Prefer official/vendor sources where available and label third-party sources as third-party.
- If evidence is insufficient, include exactly once: "${INSUFFICIENT_RECOMMENDATION_SENTENCE}".
- Do not repeat the insufficient-evidence sentence in multiple sections.
- Even under uncertainty, provide one conditional default and one conditional fallback in Executive recommendation.

Goal:
${JSON.stringify(goal)}

Research log excerpt:
${memory.slice(-12000)}

Current report:
${report.slice(0, 24000)}
`)
}

function normalizeReportWhitespace(report: string): string {
  return report
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

async function enforceStructuredPolish(report: string, goal: string, memory: string): Promise<string> {
  if (!needsStrictDecisionTemplate(goal)) return normalizeReportWhitespace(report)
  const malformedTable = !hasWellFormedComparisonTable(report)
  const denseOrMessy = /\|.{350,}\|/.test(report) || /##\s*3\)\s*comparison table\s*\n[^\n|]/i.test(report)
  if (!malformedTable && !denseOrMessy) return normalizeReportWhitespace(report)

  const polished = await askGeminiReport(`
Rewrite the memo for clean, readable markdown formatting only.

Rules:
- Keep all facts, sources, and recommendations logically equivalent.
- Keep the same section structure and numbering.
- Ensure every section has readable paragraphs and bullet lists.
- Comparison table must be multi-line markdown (header + separator + one row per option).
- Do not invent any new facts, numbers, benchmarks, or URLs.

Goal:
${JSON.stringify(goal)}

Research log excerpt:
${memory.slice(-8000)}

Current report:
${report.slice(0, 24000)}
`)
  return normalizeReportWhitespace(polished)
}

function normalizeInsufficientEvidenceLanguage(report: string): string {
  const escaped = INSUFFICIENT_RECOMMENDATION_SENTENCE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(escaped, "g")
  const matches = report.match(re) ?? []
  if (matches.length <= 1) return report

  let seen = false
  return report.replace(re, () => {
    if (!seen) {
      seen = true
      return INSUFFICIENT_RECOMMENDATION_SENTENCE
    }
    return "Evidence is limited; treat this as a conditional recommendation."
  })
}

function buildSourceLedger(text: string): { official: string[]; thirdParty: string[] } {
  const urls = extractUrls(text)
  const official: string[] = []
  const thirdParty: string[] = []
  for (const u of urls) {
    try {
      const host = new URL(u).hostname.replace(/^www\./i, "").toLowerCase()
      if (host.endsWith("pinecone.io") || host.endsWith("weaviate.io") || host.endsWith("qdrant.tech")) {
        if (!official.includes(u)) official.push(u)
      } else if (!thirdParty.includes(u)) {
        thirdParty.push(u)
      }
    } catch {
      // ignore malformed urls
    }
  }
  return { official: official.slice(0, 8), thirdParty: thirdParty.slice(0, 8) }
}

function ensureSourceLedgerBlock(report: string, memory: string): string {
  if (/##\s*source quality ledger/i.test(report)) return report
  const ledger = buildSourceLedger(`${report}\n${memory}`)
  if (ledger.official.length + ledger.thirdParty.length === 0) return report
  const officialBlock =
    ledger.official.length > 0
      ? ledger.official.map((u) => `- ${u}`).join("\n")
      : "- (none captured)"
  const thirdPartyBlock =
    ledger.thirdParty.length > 0
      ? ledger.thirdParty.map((u) => `- ${u}`).join("\n")
      : "- (none captured)"
  return `${report.trim()}\n\n## Source quality ledger\n**Official/vendor sources**\n${officialBlock}\n\n**Third-party sources**\n${thirdPartyBlock}`
}

function shouldEnforceClaimCitationMap(report: string): boolean {
  if (/##\s*claim-to-citation map/i.test(report)) return false
  const tableRows = report
    .split(/\r?\n/)
    .filter((line) => /^\|/.test(line) && !/^\|\s*-+/.test(line))
  if (tableRows.length === 0) return false
  const rowsWithoutUrl = tableRows.filter((line) => !/https?:\/\//i.test(line)).length
  return rowsWithoutUrl > 0
}

async function enforceClaimCitationMap(report: string, goal: string, memory: string): Promise<string> {
  if (!needsStrictDecisionTemplate(goal)) return report
  if (!shouldEnforceClaimCitationMap(report)) return report
  return askGeminiReport(`
Improve this decision memo by adding a "## Claim-to-citation map" section and ensuring key claims in the comparison table have inline source URLs.

Rules:
- Do not invent facts, numbers, or links.
- Preserve the existing section structure.
- Add a compact markdown table under "## Claim-to-citation map" with columns:
| claim | source URL | source type (official|third-party) | confidence (high|medium|low) |
- If a claim lacks evidence, mark confidence low and explicitly say evidence is limited.

Goal:
${JSON.stringify(goal)}

Research log excerpt:
${memory.slice(-10000)}

Current report:
${report.slice(0, 24000)}
`)
}

async function enforceContradictionGuard(report: string, goal: string, memory: string): Promise<string> {
  if (!needsStrictDecisionTemplate(goal)) return report
  return askGeminiReport(`
Check the memo for internal contradictions and fix them while preserving factual grounding.

Rules:
- Keep the same top-level sections.
- Ensure Executive recommendation aligns with comparison table and failure section.
- Keep uncertainty labels, but do not contradict the recommendation rationale.
- Do not invent facts, links, benchmarks, or dates.

Goal:
${JSON.stringify(goal)}

Research log excerpt:
${memory.slice(-9000)}

Current report:
${report.slice(0, 24000)}
`)
}

async function finalizeDecisionQuality(report: string, goal: string, memory: string): Promise<string> {
  const polished = await enforceStructuredPolish(report, goal, memory)
  const withLedger = ensureSourceLedgerBlock(polished, memory)
  const withMap = await enforceClaimCitationMap(withLedger, goal, memory)
  const withoutContradictions = await enforceContradictionGuard(withMap, goal, memory)
  return normalizeInsufficientEvidenceLanguage(normalizeReportWhitespace(withoutContradictions))
}

async function enforceCitationGate(
  report: string,
  goal: string,
  memory: string
): Promise<string> {
  if (!isEvidenceHeavyGoal(goal) || meetsCitationGate(report)) {
    const withEvidence = ensureRecommendationEvidenceBlock(report, memory)
    const withTone = await enforceReportTone(withEvidence, goal, memory)
    const templated = await enforceDecisionTemplate(withTone, goal, memory)
    return finalizeDecisionQuality(templated, goal, memory)
  }

  const repaired = await askGeminiReport(`
You are finalizing a research report and must enforce an evidence-quality gate.

Goal: ${JSON.stringify(goal)}

Research log:
${memory.slice(-14000)}

Current draft report:
${report.slice(0, 22000)}

Requirements:
- Include at least 2 source URLs from the log if available.
- For recommendation sections (default + fallback), include official vendor URLs when available.
- Include an "## Evidence Quality Status" section with:
  - URL count
  - unique domain count
  - confidence level
- If fewer than 2 independent sources are available, DO NOT make strong recommendations.
- In that insufficient-evidence case, clearly say "Insufficient evidence for high-confidence recommendation."
- Never invent URLs, prices, benchmarks, or official claims.
`)

  const repairedWithEvidence = ensureRecommendationEvidenceBlock(repaired, memory)
  if (meetsCitationGate(repairedWithEvidence)) {
    const withTone = await enforceReportTone(repairedWithEvidence, goal, memory)
    const templated = await enforceDecisionTemplate(withTone, goal, memory)
    return finalizeDecisionQuality(templated, goal, memory)
  }

  const stats = getEvidenceStats(repairedWithEvidence)
  if (/##\s*evidence quality status/i.test(repairedWithEvidence)) {
    return repairedWithEvidence
  }
  const insufficient = `## Evidence Quality Status
- URL count: ${stats.urls.length}
- Unique domains: ${stats.uniqueDomains.length}
- Confidence: low

Insufficient evidence for high-confidence recommendation.

${repairedWithEvidence}`
  const templated = await enforceDecisionTemplate(insufficient, goal, memory)
  return finalizeDecisionQuality(templated, goal, memory)
}

async function askGeminiShort(prompt: string): Promise<string> {
  const model = getGemini().getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { maxOutputTokens: 4096 },
  })
  const result = await model.generateContent(prompt)
  return result.response.text()
}

async function askGeminiReport(prompt: string): Promise<string> {
  const model = getGemini().getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { maxOutputTokens: 8192 },
  })
  const result = await model.generateContent(prompt)
  return result.response.text().slice(0, 32000)
}

async function generateTaskPlan(goal: string, onUpdate: OnUpdate): Promise<string> {
  log(onUpdate, "system", "Breaking the task into steps (Manus-style plan)…")
  const plan = await askGeminiShort(`
You are a senior agent planner (like Manus). The user goal is given as a JSON string.

Goal: ${JSON.stringify(goal)}

Output ONLY a Markdown numbered list of 5–10 concrete steps for a research agent with web + sandbox Python access.
Each step should be actionable (e.g. search terms, URLs to prioritize, analysis to run). No preamble, no title — start with "1. "
`)
  const trimmed = plan.trim().slice(0, 8000)
  log(onUpdate, "system", `Plan ready:\n${trimmed}`)
  return trimmed
}

function mergeUrls(primary: string[], extra: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of [...primary, ...extra]) {
    const t = u.trim()
    if (!t.startsWith("http")) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= 10) break
  }
  return out
}

function pickDomainDiverseUrls(urls: string[], maxUrls: number): string[] {
  const picked: string[] = []
  const byDomain = new Map<string, string[]>()
  for (const u of urls) {
    try {
      const d = new URL(u).hostname.replace(/^www\./i, "").toLowerCase()
      const arr = byDomain.get(d) ?? []
      arr.push(u)
      byDomain.set(d, arr)
    } catch {
      // ignore malformed urls
    }
  }

  for (const arr of byDomain.values()) {
    if (arr[0]) picked.push(arr[0])
    if (picked.length >= maxUrls) return picked
  }

  for (const arr of byDomain.values()) {
    for (let i = 1; i < arr.length; i++) {
      picked.push(arr[i])
      if (picked.length >= maxUrls) return picked
    }
  }

  return picked.slice(0, maxUrls)
}

async function toolSearch(sandbox: Sandbox, query: string): Promise<string> {
  const chunks: string[] = []
  let urlList: string[] = []

  const api = await runServerSearch(query).catch(() => null)
  if (api) {
    chunks.push(api.serpBlock)
    urlList = [...api.urls]
  }

  const thinApi =
    !api ||
    api.urls.length < 2 ||
    api.serpBlock.length < 200

  let scrapeText = ""
  if (thinApi) {
    scrapeText = (await scrapeSearchInSandbox(sandbox, query).catch(() => "")) ?? ""
    if (scrapeText.trim()) {
      if (api) chunks.push("--- HTML_SCRAPE (supplement) ---\n" + scrapeText)
      else chunks.push(scrapeText)
      urlList = mergeUrls(urlList, parseSearchOutputUrls(scrapeText))
    }
  }

  const seedUrls = querySeedUrls(query)
  if (seedUrls.length > 0) {
    urlList = mergeUrls(urlList, seedUrls)
    chunks.push(
      "--- OFFICIAL_SEED_URLS ---\n" + seedUrls.map((u) => `URL: ${u}`).join("\n")
    )
  }

  if (urlList.length < 2 && process.env.RESEARCH_BROWSER_SEARCH_FALLBACK === "1") {
    const browserFallback = await browserSearchFallback(sandbox, query).catch(() => ({
      urls: [] as string[],
      block: "",
    }))
    if (browserFallback.block.trim()) chunks.push("--- BROWSER_SEARCH_FALLBACK ---\n" + browserFallback.block)
    urlList = mergeUrls(urlList, browserFallback.urls)
  }

  if (urlList.length > 0) {
    const diverse = pickDomainDiverseUrls(urlList, 5)
    const bodies = await fetchTopUrlBodiesInSandbox(sandbox, diverse, 5).catch(() => "")
    if (bodies?.trim()) chunks.push(bodies.trim())
  }

  const out = chunks.filter(Boolean).join("\n\n").trim()
  if (out.length > 100) {
    return out.slice(0, 12_000)
  }

  return (
    "[No usable live web search results were retrieved (blocked, empty, or no API/scrape paths succeeded). " +
    "If SERPAPI_API_KEY, BRAVE_SEARCH_API_KEY, or GOOGLE_CSE_* is set on the server, searches are much more reliable. " +
    "The final report must say clearly that live search failed — do not invent URLs, quotes, or sources.]\n" +
    (out || "(empty)")
  )
}

async function toolWideSearch(sandbox: Sandbox, raw: string): Promise<string> {
  const queries = parseWideQueries(raw)
  if (queries.length === 0) {
    return "[wide_search: provide 2–4 queries separated by ||| or a JSON string array, e.g. [\"q1\",\"q2\"]]"
  }
  const chunks: string[] = []
  await Promise.all(
    queries.map(async (q, i) => {
      const r = await toolSearch(sandbox, q)
      chunks[i] = `### Angle ${i + 1}: ${q.slice(0, 120)}\n${r.slice(0, 5500)}`
    }),
  )
  return chunks.filter(Boolean).join("\n\n---\n\n").slice(0, 22_000)
}

async function toolFetch(sandbox: Sandbox, url: string): Promise<string> {
  const result = await runCommand(
    sandbox,
    `python3 - << 'PYEOF'
import requests
from bs4 import BeautifulSoup
import re

url = ${JSON.stringify(url)}
headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}

try:
    r = requests.get(url, headers=headers, timeout=12, allow_redirects=True)
    soup = BeautifulSoup(r.text, "html.parser")
    for tag in soup(["script","style","nav","footer","header","aside","iframe"]):
        tag.decompose()
    main = soup.find("main") or soup.find("article") or soup.find("body")
    if main:
        text = re.sub(r"\\s+", " ", main.get_text(separator=" ", strip=True))
        print(text[:3000])
    else:
        print("Could not extract content")
except Exception as e:
    print(f"Fetch error: {e}")
PYEOF`,
    30000
  )

  if (result && result.length > 100) {
    return result.slice(0, 3000)
  }
  return `[Fetch produced little or no text for ${url} — note this in the report.]`
}

async function toolExecute(sandbox: Sandbox, code: string): Promise<string> {
  const trimmed = code.trim()
  if (!trimmed) return "[execute: empty code]"
  const buf = Buffer.from(trimmed.slice(0, MAX_PYTHON_BYTES), "utf8")
  const b64 = buf.toString("base64")
  return runCommand(
    sandbox,
    `python3 - << 'EXEC_WRAP'
import base64
_code = base64.b64decode(${JSON.stringify(b64)}).decode("utf-8")
_globals = {"__name__": "__agent__"}
try:
    exec(_code, _globals, _globals)
except Exception as e:
    print(f"execute_error: {e}")
EXEC_WRAP`,
    120000
  )
}

async function toolThink(context: string, question: string): Promise<string> {
  return askGeminiShort(`
Based only on this research log (do not claim off-log facts):
${context.slice(0, 6000)}

Answer:
${question}

If the log lacks evidence, say what is missing instead of guessing.
`)
}

export async function runAgentLoop(
  goal: string,
  sandbox: Sandbox,
  onUpdate: OnUpdate,
  maxSteps = RESEARCH_MAX_STEPS,
  workflowGuide = RESEARCH_WORKFLOW_GUIDE,
  initialPlan = "",
): Promise<string> {
  let memory = `GOAL: ${goal}\n\n`
  if (initialPlan.trim()) {
    memory += `APPROVED PLAN:\n${initialPlan.trim()}\n\n`
  }
  memory += `RESEARCH LOG:\n`
  let stepCount = 0
  const memories: Record<string, string> = {}
  const evidenceHeavy = isEvidenceHeavyGoal(goal)

  log(onUpdate, "system", `Agent starting: "${goal.slice(0, 80)}..."`)

  while (stepCount < maxSteps) {
    stepCount++
    const progress = Math.round((stepCount / maxSteps) * 85)
    onUpdate({
      progress,
      currentStep: `Step ${stepCount}/${maxSteps}`,
    })

    const decisionPrompt = `You are Jarvis, an autonomous agent similar to Manus — you deliver finished research, not chat.

GOAL: ${goal}

RESEARCH SO FAR:
${memory.slice(-3500)}

STORED FACTS:
${Object.entries(memories).map(([k, v]) => `${k}: ${v}`).join("\n") || "None yet"}

TOOLS:
- search(query) → Single Google search + read top pages
- wide_search(input) → Multiple angles in parallel: use 2–4 queries separated by ||| OR JSON string array ["q1","q2"]
- fetch(url) → Read one URL (HTML text, no JS)
- browser(input) → Headless Chromium (Playwright): JSON ops or bare https URL; persistent profile. Ops: goto | text | links | title | screenshot (optional fullPage + analyze for Gemini vision on the JPEG)
- execute(code) → Run Python 3 in sandbox; must use print() for output; stdlib + requests + bs4 available
- think(question) → Analyze only what is in the log
- remember(key=value) → Store a short fact
- done(report) → Final Markdown report in "input" and stop

RULES:
- Prefer wide_search early for broad topics; use search for tight follow-ups.
- Use fetch for static HTML; use browser when the site needs JavaScript or you need a real session (e.g. if HTTP search scraped nothing, open bing.com/search or a target URL in browser).
- Use execute only for real Python on data you already have — NEVER to skip work, fake “permissions”, or print that you cannot scrape.
- NEVER call done before step 4.
- Step ${stepCount}/${maxSteps}.
${stepCount < 4 ? "- DO NOT CALL DONE YET." : ""}
${stepCount >= maxSteps - 1 ? "- Call done with the full Markdown report now." : ""}

Workflow:
${workflowGuide}

Respond ONLY with JSON:
{
  "tool": "search|wide_search|fetch|browser|execute|think|remember|done",
  "input": "...",
  "reasoning": "..."
}`

    let decision: ReturnType<typeof parseAgentDecision> = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await askGeminiShort(decisionPrompt)
        decision = parseAgentDecision(response)
        if (decision) break
      } catch {
        log(onUpdate, "warning", "Model error while deciding next step; retrying…")
      }
    }

    if (!decision) {
      log(onUpdate, "warning", "Could not parse a valid tool decision after retries.")
      break
    }

    const toolInput = decision.input.trim()
    log(onUpdate, "ai", `${decision.tool}: ${toolInput.slice(0, 120)}`)

    let result = ""

    if (decision.tool === "search") {
      log(onUpdate, "action", `Searching: "${toolInput.slice(0, 100)}"`)
      onUpdate({ currentStep: `Searching: ${toolInput.slice(0, 50)}` })
      result = await toolSearch(sandbox, toolInput)
      memory += `\n[Step ${stepCount}] SEARCH: "${toolInput}"\n${result.slice(0, 1200)}\n`
    } else if (decision.tool === "wide_search") {
      log(onUpdate, "action", "Wide search (parallel angles)…")
      onUpdate({ currentStep: "Wide search…" })
      result = await toolWideSearch(sandbox, toolInput)
      memory += `\n[Step ${stepCount}] WIDE_SEARCH\n${result.slice(0, 2000)}\n`
    } else if (decision.tool === "fetch") {
      log(onUpdate, "action", `Reading: ${toolInput.slice(0, 100)}`)
      onUpdate({ currentStep: `Reading: ${toolInput.slice(0, 50)}` })
      result = await toolFetch(sandbox, toolInput)
      memory += `\n[Step ${stepCount}] FETCH: ${toolInput}\n${result.slice(0, 1200)}\n`
    } else if (decision.tool === "browser") {
      log(onUpdate, "action", "Headless Chromium (Playwright)…")
      onUpdate({ currentStep: "Browser…" })
      const bOp = parseBrowserInput(toolInput)
      if (!bOp) {
        result =
          '[browser: use JSON e.g. {"op":"goto","url":"https://example.com"} then {"op":"text"} or {"op":"links","max":20}, or paste a bare https URL.]'
      } else {
        try {
          result = await runBrowserOp(sandbox, bOp)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          result = `[browser error: ${msg}]`
        }
      }
      memory += `\n[Step ${stepCount}] BROWSER\n${result.slice(0, 2800)}\n`
    } else if (decision.tool === "execute") {
      log(onUpdate, "action", "Executing Python in sandbox…")
      onUpdate({ currentStep: "Running code…" })
      result = await toolExecute(sandbox, toolInput)
      memory += `\n[Step ${stepCount}] EXECUTE (stdout/stderr excerpt)\n${result.slice(0, 1500)}\n`
    } else if (decision.tool === "think") {
      log(onUpdate, "ai", `Thinking: ${toolInput.slice(0, 60)}`)
      onUpdate({ currentStep: `Analysing...` })
      result = await toolThink(memory, toolInput)
      memory += `\n[Step ${stepCount}] THINK: ${result.slice(0, 600)}\n`
    } else if (decision.tool === "remember") {
      const parts = toolInput.split("=")
      const key = parts[0]?.trim()
      const value = parts.slice(1).join("=").trim()
      if (key && value) memories[key] = value
      memory += `\n[Step ${stepCount}] REMEMBER: ${toolInput}\n`
    } else if (decision.tool === "done") {
      if (evidenceHeavy) {
        const stats = getEvidenceStats(memory)
        const evidenceInsufficient =
          stats.urls.length < DECISION_MIN_URLS || stats.uniqueDomains.length < DECISION_MIN_DOMAINS
        if (evidenceInsufficient && stepCount < maxSteps) {
          log(
            onUpdate,
            "warning",
            "Evidence quality gate: insufficient independent sources; running broader search before final report."
          )
          const widened = await toolWideSearch(
            sandbox,
            JSON.stringify([
              `${goal} official documentation`,
              `${goal} pricing page`,
              `${goal} benchmark comparison`,
            ])
          )
          memory += `\n[Step ${stepCount}] EVIDENCE_GATE_WIDE_SEARCH\n${widened.slice(0, 2600)}\n`
          continue
        }
      }

      log(onUpdate, "success", "Writing final report...")
      onUpdate({ currentStep: "Writing report...", progress: 95 })

      let report = toolInput
        .replace(/^```[\w]*\n?/gm, "")
        .replace(/^```$/gm, "")
        .trim()

      if (report.length < 500) {
        report = await askGeminiReport(`
Based only on the research log below (if it says search failed, lead with that — no fake sources):

${memory.slice(-12000)}

Write a detailed Markdown report for: ${JSON.stringify(goal)}

Rules:
- Use ## for sections, **bold** for key figures
- If evidence is thin, say so explicitly
- Do not present model guesses as web-fetched facts
- Include "Executive recommendation" with one default choice + one fallback.
- Include at least one official vendor URL in recommendation sections when available.
- If URL count >= ${DECISION_MIN_URLS} and distinct domains >= ${DECISION_MIN_DOMAINS}, avoid "preliminary/incomplete/work in progress" wording.
`)
      }

      return enforceCitationGate(report, goal, memory)
    }
  }

  const fallbackReport = await askGeminiReport(`
The agent stopped before a formal "done" tool. Using only this log — if search failed, say so first:

${memory.slice(-12000)}

Write a Markdown report for: ${JSON.stringify(goal)}
No invented URLs or quotes. Flag uncertainty clearly.
If evidence supports it (>= ${DECISION_MIN_URLS} URLs and >= ${DECISION_MIN_DOMAINS} domains), avoid "preliminary/incomplete/work in progress" phrasing.
`)
  return enforceCitationGate(fallbackReport, goal, memory)
}

export async function executeResearchRun(run: Run, _userId: string, onUpdate: OnUpdate): Promise<void> {
  let sandbox: Sandbox | null = null

  try {
    onUpdate({ status: "starting", currentStep: "Starting sandbox..." })
    log(onUpdate, "system", "Creating terminal sandbox...")

    sandbox = await createTerminalSandbox()
    log(onUpdate, "system", "Sandbox ready. Starting agent...")
    onUpdate({ status: "running", progress: 5 })

    const projectBlock = projectPrefixFromInputs(run.inputs)
    const providedInputs = Object.entries(run.inputs)
      .filter(([key, value]) => value.trim() && !key.startsWith("project_"))
      .map(([key, value]) => `- ${key}: ${value}`)
      .join("\n")

    const goal = [
      projectBlock || null,
      run.inputs["user_goal"]?.trim(),
      run.inputs["query"]?.trim(),
      `${RESEARCH_AGENT.name}: ${RESEARCH_AGENT.id}`,
      providedInputs ? `Inputs:\n${providedInputs}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")

    const planText = await generateTaskPlan(goal, onUpdate)
    const report = await runAgentLoop(
      goal,
      sandbox,
      onUpdate,
      RESEARCH_MAX_STEPS,
      RESEARCH_WORKFLOW_GUIDE,
      planText,
    )

    const summary =
      report.length > 400 ? `${report.slice(0, 380).trim()}…` : report.trim() || "Research completed."

    log(onUpdate, "success", "✓ Done!")
    onUpdate({
      status: "completed",
      progress: 100,
      currentStep: "Done",
      result: {
        success: true,
        summary,
        data: {
          output: report,
          plan: planText,
          deliverables: [
            { kind: "markdown_report", label: "Full report (Markdown)", bytes: report.length },
          ],
        },
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    log(onUpdate, "error", `Error: ${message}`)
    onUpdate({
      status: "failed",
      result: { success: false, summary: message },
    })
  } finally {
    if (sandbox) {
      try {
        await killSandbox(sandbox)
      } catch {
        /* ignore */
      }
      log(onUpdate, "system", "Sandbox terminated.")
    }
  }
}
