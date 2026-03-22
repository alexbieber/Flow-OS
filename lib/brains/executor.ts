import { GoogleGenerativeAI } from "@google/generative-ai"
import { Sandbox } from "@e2b/desktop"
import { createDesktopSandbox, killSandbox, runCommand } from "@/lib/sandbox/e2b"
import { resolveInputs } from "@/lib/vault"
import { getServiceSupabase } from "@/lib/supabase/admin"
import { Brain, Run, RunLog, RunStatus } from "@/types"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

export type OnUpdate = (update: {
  status?: RunStatus
  progress?: number
  currentStep?: string
  log?: RunLog
  result?: Run["result"]
}) => void

function log(onUpdate: OnUpdate, type: RunLog["type"], message: string) {
  onUpdate({ log: { timestamp: new Date().toISOString(), type, message } })
}

interface AgentDecision {
  tool: string
  input: string
  reasoning?: string
}

// ── Tool implementations ──────────────────────────────────────────────────

async function askGemini(prompt: string): Promise<string> {
  const result = await model.generateContent(prompt)
  return result.response.text().slice(0, 2000)
}

async function toolSearch(sandbox: Sandbox, query: string): Promise<string> {
  try {
    const encoded = encodeURIComponent(query)
    const output = await runCommand(
      sandbox,
      `curl -s -L --max-time 12 -A "Mozilla/5.0" "https://ddg.gg/?q=${encoded}&format=json" 2>/dev/null || curl -s -L --max-time 12 -A "Mozilla/5.0" "https://html.duckduckgo.com/html/?q=${encoded}" 2>/dev/null | sed 's/<[^>]*>//g' | grep -v '^[[:space:]]*$' | head -50`,
      15000
    )
    if (output && output.length > 100) {
      return output.slice(0, 2000)
    }
    return await askGemini(
      `Provide detailed factual information about: "${query}". Include specific statistics, names, and recent data.`
    )
  } catch {
    return await askGemini(`Provide detailed factual information about: "${query}"`)
  }
}

async function toolFetch(sandbox: Sandbox, url: string): Promise<string> {
  try {
    const output = await runCommand(
      sandbox,
      `curl -s -L --max-time 12 -A "Mozilla/5.0" "${url}" 2>/dev/null | sed 's/<[^>]*>//g' | sed 's/&nbsp;/ /g' | grep -v '^[[:space:]]*$' | head -80`,
      15000
    )
    if (output && output.length > 100) {
      return output.slice(0, 2500)
    }
    return await askGemini(`What is the content and key information at this URL: ${url}?`)
  } catch {
    return await askGemini(`What information is available at: ${url}?`)
  }
}

async function toolThink(context: string, question: string): Promise<string> {
  return await askGemini(`
Based on this research:
${context.slice(0, 3000)}

Answer this question with specific analysis:
${question}
`)
}

// ── The Agent Loop ────────────────────────────────────────────────────────

export async function runAgentLoop(
  goal: string,
  sandbox: Sandbox,
  onUpdate: OnUpdate,
  maxSteps = 12
): Promise<string> {
  let memory = `GOAL: ${goal}\n\nRESEARCH LOG:\n`
  let stepCount = 0
  const memories: Record<string, string> = {}

  log(onUpdate, "system", `Agent starting: "${goal.slice(0, 80)}..."`)

  while (stepCount < maxSteps) {
    stepCount++
    const progress = Math.round((stepCount / maxSteps) * 85)
    onUpdate({ progress, currentStep: `Agent thinking... (step ${stepCount}/${maxSteps})` })

    const decisionPrompt = `You are an autonomous research agent called Jarvis.

GOAL: ${goal}

RESEARCH SO FAR:
${memory.slice(-4000)}

STORED FACTS:
${Object.entries(memories).map(([k, v]) => `${k}: ${v}`).join("\n") || "None yet"}

AVAILABLE TOOLS:
- search(query) → Search Google for information
- fetch(url) → Read a specific webpage
- think(question) → Analyse collected data to answer a question
- remember(key, value) → Store an important fact for later
- done(report) → Write final comprehensive report and finish

RULES:
- Use search and fetch to gather real data before concluding
- Use think to analyse patterns in what you've gathered
- Use remember to store key facts
- Use done only when you have enough data for a comprehensive report
- done report must be detailed Markdown with sections and specific data
- Never make up data — only use what you've actually found
- After 8 steps, always use done

Decide your next action. Respond ONLY with valid JSON:
{
  "tool": "search|fetch|think|remember|done",
  "input": "the query, URL, question, key=value, or full markdown report",
  "reasoning": "why this action moves toward the goal"
}`

    let decision: AgentDecision
    try {
      const response = await model.generateContent(decisionPrompt)
      const text = response.response.text()
      const clean = text.replace(/```json|```/g, "").trim()
      decision = JSON.parse(clean) as AgentDecision
    } catch {
      log(onUpdate, "warning", "Decision parse error, retrying...")
      continue
    }

    log(onUpdate, "ai", `Reasoning: ${decision.reasoning?.slice(0, 100) ?? ""}`)

    let result = ""

    if (decision.tool === "search") {
      log(onUpdate, "action", `Searching: "${decision.input}"`)
      onUpdate({ currentStep: `Searching: ${decision.input}` })
      result = await toolSearch(sandbox, decision.input)
      log(onUpdate, "action", `Found: ${result.slice(0, 100)}...`)
      memory += `\n[Step ${stepCount}] SEARCH: "${decision.input}"\nResult: ${result.slice(0, 800)}\n`
    } else if (decision.tool === "fetch") {
      log(onUpdate, "action", `Reading: ${decision.input}`)
      onUpdate({ currentStep: `Reading: ${decision.input.slice(0, 60)}` })
      result = await toolFetch(sandbox, decision.input)
      log(onUpdate, "action", `Read ${result.length} chars`)
      memory += `\n[Step ${stepCount}] FETCH: ${decision.input}\nContent: ${result.slice(0, 800)}\n`
    } else if (decision.tool === "think") {
      log(onUpdate, "ai", `Analysing: "${decision.input}"`)
      onUpdate({ currentStep: `Analysing: ${decision.input}` })
      result = await toolThink(memory, decision.input)
      log(onUpdate, "ai", `Analysis: ${result.slice(0, 100)}...`)
      memory += `\n[Step ${stepCount}] THINK: "${decision.input}"\nConclusion: ${result.slice(0, 500)}\n`
    } else if (decision.tool === "remember") {
      const parts = decision.input.split("=")
      const key = parts[0]?.trim()
      const value = parts.slice(1).join("=").trim()
      if (key && value) {
        memories[key] = value
        log(onUpdate, "action", `Remembered: ${key} = ${value.slice(0, 80)}`)
      }
      memory += `\n[Step ${stepCount}] REMEMBERED: ${decision.input}\n`
    } else if (decision.tool === "done") {
      log(onUpdate, "success", "Agent completing task...")
      onUpdate({ currentStep: "Writing final report...", progress: 95 })

      let report = decision.input
        .replace(/^```[\w]*\n?/gm, "")
        .replace(/^```$/gm, "")
        .trim()

      if (report.length < 500) {
        const expandPrompt = `Based on this research:\n${memory.slice(-3000)}\n\nWrite a comprehensive, detailed Markdown report for the goal: "${goal}"\n\nInclude specific data, numbers, and actionable insights. Use proper Markdown headers.`
        const expanded = await model.generateContent(expandPrompt)
        report = expanded.response.text()
      }

      return report
    }
  }

  log(onUpdate, "system", "Max steps reached, generating report...")
  const finalPrompt = `Based on all this research:\n${memory.slice(-4000)}\n\nWrite a comprehensive Markdown report for: "${goal}"\n\nUse all the data collected. Be specific and detailed.`
  const final = await model.generateContent(finalPrompt)
  return final.response.text()
}

// ── Main entry point ──────────────────────────────────────────────────────

export async function executeBrain(
  run: Run,
  brain: Brain,
  userId: string,
  onUpdate: OnUpdate
): Promise<void> {
  let sandbox: Sandbox | null = null

  try {
    onUpdate({ status: "starting", currentStep: "Spinning up cloud environment..." })
    log(onUpdate, "system", "Creating E2B Desktop sandbox...")

    const { sandbox: desktop, streamUrl } = await createDesktopSandbox()
    sandbox = desktop

    // TEMPORARY: probe sandbox CLI — remove after Playwright approach is decided
    const testResult = await runCommand(
      sandbox,
      "which playwright || which npx || node --version",
      10000
    )
    log(onUpdate, "system", `Environment: ${testResult}`)

    log(onUpdate, "system", `Desktop ready. Stream: ${streamUrl.slice(0, 60)}…`)

    const supabase = getServiceSupabase()
    await supabase.from("runs").update({ stream_url: streamUrl }).eq("id", run.id)

    log(onUpdate, "system", "Environment ready.")
    onUpdate({ status: "running", progress: 5 })

    const vaultKeys: Record<string, string> = {}
    brain.inputs.forEach((inp) => {
      if (inp.vaultKey) vaultKeys[inp.key] = inp.vaultKey
    })
    const resolvedInputs = await resolveInputs(userId, run.inputs, vaultKeys)

    const inputSummary = Object.entries(resolvedInputs)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")

    const goal =
      run.inputs["user_goal"]?.trim() ||
      run.inputs["query"]?.trim() ||
      `${brain.description}${inputSummary ? `. Specifically: ${inputSummary}` : ""}`

    const report = await runAgentLoop(goal, sandbox, onUpdate)

    log(onUpdate, "success", `✓ ${brain.name} completed!`)
    onUpdate({
      status: "completed",
      progress: 100,
      currentStep: "Done",
      result: {
        success: true,
        summary: `${brain.name} completed successfully.`,
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
