import { Sandbox } from "e2b"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { Brain, Run, RunLog, RunStatus } from "@/types"
import { createTerminalSandbox, runCommand, killSandbox } from "@/lib/sandbox/e2b"

export type OnUpdate = (update: {
  status?: RunStatus
  progress?: number
  currentStep?: string
  log?: RunLog
  result?: Run["result"]
}) => void

interface AgentDecision {
  tool: string
  input: string
  reasoning?: string
}

function log(onUpdate: OnUpdate, type: RunLog["type"], message: string) {
  onUpdate({ log: { timestamp: new Date().toISOString(), type, message } })
}

async function askGemini(prompt: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { maxOutputTokens: 1500 },
  })
  const result = await model.generateContent(prompt)
  return result.response.text().slice(0, 2000)
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

  if (result && result.length > 100) {
    return result.slice(0, 4000)
  }

  return await askGemini(
    `Detailed current facts about: "${query}". Include specific numbers and company names.`
  )
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

  return await askGemini(`Key content from: ${url}`)
}

async function toolThink(context: string, question: string): Promise<string> {
  return await askGemini(`
Based on this research:
${context.slice(0, 3000)}

Answer this with specific analysis:
${question}
`)
}

export async function runAgentLoop(
  goal: string,
  sandbox: Sandbox,
  onUpdate: OnUpdate,
  maxSteps = 8
): Promise<string> {
  let memory = `GOAL: ${goal}\n\nRESEARCH LOG:\n`
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

    const decisionPrompt = `You are Jarvis, an autonomous AI research agent.

GOAL: ${goal}

RESEARCH SO FAR:
${memory.slice(-3000)}

STORED FACTS:
${Object.entries(memories).map(([k, v]) => `${k}: ${v}`).join("\n") || "None yet"}

TOOLS:
- search(query) → Search Google + read top pages
- fetch(url) → Read a specific webpage
- think(question) → Analyse collected data
- remember(key=value) → Store important fact
- done(report) → Write final report and finish

RULES:
- Use search at least 2 times before done
- Use fetch for important URLs found
- NEVER call done before step 4
- Current step: ${stepCount}/${maxSteps}
${stepCount < 4 ? "- DO NOT CALL DONE YET. Research more." : ""}
${stepCount >= 7 ? "- Call done now. Write comprehensive report." : ""}

Respond ONLY with valid JSON:
{
  "tool": "search|fetch|think|remember|done",
  "input": "...",
  "reasoning": "..."
}`

    let decision: AgentDecision
    try {
      const response = await askGemini(decisionPrompt)
      const clean = response.replace(/```json|```/g, "").trim()
      decision = JSON.parse(clean) as AgentDecision
    } catch {
      log(onUpdate, "warning", "Retrying decision...")
      continue
    }

    log(onUpdate, "ai", `${decision.tool}: ${decision.input.slice(0, 80)}`)

    let result = ""

    if (decision.tool === "search") {
      log(onUpdate, "action", `Searching: "${decision.input}"`)
      onUpdate({ currentStep: `Searching: ${decision.input.slice(0, 50)}` })
      result = await toolSearch(sandbox, decision.input)
      memory += `\n[Step ${stepCount}] SEARCH: "${decision.input}"\n${result.slice(0, 1000)}\n`
    } else if (decision.tool === "fetch") {
      log(onUpdate, "action", `Reading: ${decision.input}`)
      onUpdate({ currentStep: `Reading: ${decision.input.slice(0, 50)}` })
      result = await toolFetch(sandbox, decision.input)
      memory += `\n[Step ${stepCount}] FETCH: ${decision.input}\n${result.slice(0, 1000)}\n`
    } else if (decision.tool === "think") {
      log(onUpdate, "ai", `Thinking: ${decision.input.slice(0, 60)}`)
      onUpdate({ currentStep: `Analysing...` })
      result = await toolThink(memory, decision.input)
      memory += `\n[Step ${stepCount}] THINK: ${result.slice(0, 500)}\n`
    } else if (decision.tool === "remember") {
      const parts = decision.input.split("=")
      const key = parts[0]?.trim()
      const value = parts.slice(1).join("=").trim()
      if (key && value) memories[key] = value
      memory += `\n[Step ${stepCount}] REMEMBER: ${decision.input}\n`
    } else if (decision.tool === "done") {
      log(onUpdate, "success", "Writing final report...")
      onUpdate({ currentStep: "Writing report...", progress: 95 })

      let report = decision.input
        .replace(/^```[\w]*\n?/gm, "")
        .replace(/^```$/gm, "")
        .trim()

      if (report.length < 500) {
        report = await askGemini(`
Based on this research:
${memory.slice(-4000)}

Write a comprehensive, detailed Markdown report for: "${goal}"

Rules:
- Use ## for sections
- Use **bold** for key data
- Include specific numbers and names
- Be detailed and actionable
- Never say hypothetical or simulated
- Start directly with content
`)
      }

      return report
    }
  }

  return await askGemini(`
Based on:
${memory.slice(-4000)}

Write comprehensive Markdown report for: "${goal}"
Include specific data, numbers, names. Never say hypothetical.
`)
}

export async function executeBrain(
  run: Run,
  brain: Brain,
  _userId: string,
  onUpdate: OnUpdate
): Promise<void> {
  let sandbox: Sandbox | null = null

  try {
    onUpdate({ status: "starting", currentStep: "Starting sandbox..." })
    log(onUpdate, "system", "Creating terminal sandbox...")

    sandbox = await createTerminalSandbox()
    log(onUpdate, "system", "Sandbox ready. Starting agent...")
    onUpdate({ status: "running", progress: 5 })

    const goal =
      run.inputs["user_goal"]?.trim() ??
      run.inputs["query"]?.trim() ??
      brain.description

    const report = await runAgentLoop(goal, sandbox, onUpdate)

    log(onUpdate, "success", "✓ Done!")
    onUpdate({
      status: "completed",
      progress: 100,
      currentStep: "Done",
      result: {
        success: true,
        summary: "Research completed.",
        data: { output: report },
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
