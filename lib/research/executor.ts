import { Sandbox } from "e2b"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { RESEARCH_AGENT, RESEARCH_MAX_STEPS, RESEARCH_WORKFLOW_GUIDE } from "@/lib/research/constants"
import { projectPrefixFromInputs } from "@/lib/projects/merge-goal"
import { parseBrowserInput } from "@/lib/research/browser-input"
import { parseAgentDecision } from "@/lib/research/parse-agent"
import { parseWideQueries } from "@/lib/research/wide-search"
import { Run, RunLog, RunStatus } from "@/types"
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

function getGemini() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY is not set")
  return new GoogleGenerativeAI(key)
}

function log(onUpdate: OnUpdate, type: RunLog["type"], message: string) {
  onUpdate({ log: { timestamp: new Date().toISOString(), type, message } })
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

async function toolSearch(sandbox: Sandbox, query: string): Promise<string> {
  const result = await runCommand(
    sandbox,
    `python3 - << 'PYEOF'
import requests
from bs4 import BeautifulSoup
import urllib.parse
import re

query = ${JSON.stringify(query)}
headers = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml",
}

try:
    url = "https://www.google.com/search?q=" + urllib.parse.quote(query) + "&num=8&hl=en"
    r = requests.get(url, headers=headers, timeout=15)
    soup = BeautifulSoup(r.text, "html.parser")

    results = []
    urls = []

    for g in soup.select("div.g")[:6]:
        title = g.find("h3")
        if not title:
            continue
        snippet_el = g.select_one(".VwiC3b, .IsZvec")
        snippet = snippet_el.get_text(strip=True)[:200] if snippet_el else ""
        link = g.find("a", href=True)
        href = link["href"] if link else ""
        if href.startswith("/url?q="):
            href = href[7:].split("&")[0]
        results.append(f"TITLE: {title.get_text(strip=True)}")
        if snippet:
            results.append(f"SNIPPET: {snippet}")
        if href.startswith("http") and "google" not in href:
            results.append(f"URL: {href}")
            urls.append(href)
        results.append("---")

    print("SEARCH_RESULTS:")
    print("\\n".join(results[:40]))

    for url in urls[:2]:
        try:
            print(f"\\nREADING: {url}")
            pr = requests.get(url, headers=headers, timeout=10)
            psoup = BeautifulSoup(pr.text, "html.parser")
            for tag in psoup(["script","style","nav","footer","header","aside"]):
                tag.decompose()
            main = psoup.find("main") or psoup.find("article") or psoup.find("body")
            if main:
                text = re.sub(r"\\s+", " ", main.get_text(separator=" ", strip=True))
                print(f"CONTENT: {text[:1500]}")
        except Exception as e:
            print(f"Could not read {url}: {e}")

except Exception as e:
    print(f"Search error: {e}")
PYEOF`,
    45000
  )

  const out = (result ?? "").trim()
  if (out.length > 100) {
    return out.slice(0, 4000)
  }

  return (
    "[No usable live web search results were retrieved (blocked, empty, or page layout changed). " +
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
      chunks[i] = `### Angle ${i + 1}: ${q.slice(0, 120)}\n${r.slice(0, 3500)}`
    }),
  )
  return chunks.filter(Boolean).join("\n\n---\n\n").slice(0, 14000)
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
- Use fetch for static HTML; use browser when the site needs JavaScript or you need a real session.
- Use execute for light data work (counts, parsing, simple math) — not for secrets.
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
`)
      }

      return report
    }
  }

  return askGeminiReport(`
The agent stopped before a formal "done" tool. Using only this log — if search failed, say so first:

${memory.slice(-12000)}

Write a Markdown report for: ${JSON.stringify(goal)}
No invented URLs or quotes. Flag uncertainty clearly.
`)
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
