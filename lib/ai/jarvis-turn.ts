import { GoogleGenerativeAI } from "@google/generative-ai"

export interface JarvisTurn {
  shouldRunAgent: boolean
  reply: string
  /** Clear research objective when shouldRunAgent is true */
  researchGoal: string
}

export interface JarvisHistoryTurn {
  role: "user" | "jarvis" | "system"
  content: string
}

const PLACEHOLDER_REPLY_RE =
  /\[insert\b|\bplaceholder\b|lorem ipsum|the report you just received summarized/i

function sanitizeReply(reply: string, fallback: string): string {
  const cleaned = reply.trim().replace(/\s+/g, " ")
  if (!cleaned) return fallback
  if (PLACEHOLDER_REPLY_RE.test(cleaned)) return fallback
  return cleaned.slice(0, 2000)
}

function fallbackTurn(fallbackReply: string): JarvisTurn {
  const fallback =
    "I can help, but my previous response was low-confidence. Ask me again in one clear sentence and I will answer directly."
  const t = sanitizeReply(fallbackReply, fallback)
  return {
    shouldRunAgent: false,
    reply: t || fallback,
    researchGoal: "",
  }
}

function coerceTurn(parsed: unknown, rawText: string, userMessage: string): JarvisTurn {
  if (!parsed || typeof parsed !== "object") {
    return fallbackTurn(rawText)
  }
  const o = parsed as Record<string, unknown>
  const shouldRunAgent = o.shouldRunAgent === true

  let reply =
    typeof o.reply === "string" && o.reply.trim()
      ? o.reply.trim()
      : shouldRunAgent
        ? "On it — starting web research now."
        : rawText.slice(0, 500).trim() || "Okay."
  reply = sanitizeReply(reply, shouldRunAgent ? "On it — starting web research now." : "I can help with that.")

  let researchGoal =
    typeof o.researchGoal === "string" && o.researchGoal.trim()
      ? o.researchGoal.trim().slice(0, 8000)
      : ""

  if (shouldRunAgent && !researchGoal) {
    researchGoal = userMessage.trim().slice(0, 8000) || reply.slice(0, 500)
  }

  return { shouldRunAgent, reply, researchGoal: shouldRunAgent ? researchGoal : "" }
}

export async function completeJarvisTurn(
  userMessage: string,
  options?: { projectBlock?: string; recentHistory?: JarvisHistoryTurn[] }
): Promise<JarvisTurn> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY is not set")

  const genAI = new GoogleGenerativeAI(key)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { maxOutputTokens: 1024 },
  })

  const projectSection =
    options?.projectBlock?.trim() ?
      `\n\n---\nActive workspace project (always respect):\n${options.projectBlock.trim()}\n---\n`
    : ""

  const historySection =
    options?.recentHistory && options.recentHistory.length > 0
      ? `\n\nRecent conversation (oldest to newest):\n${options.recentHistory
          .map((m) => `- ${m.role}: ${m.content.trim().replace(/\s+/g, " ").slice(0, 600)}`)
          .join("\n")}\n`
      : ""

  const text = await model.generateContent(`
You are Jarvis, an AI research assistant. The user's message is provided as a JSON string below (verbatim).
${projectSection}
${historySection}
User message: ${JSON.stringify(userMessage)}

Decide in one pass:
1) If they want real web research, comparisons, data gathering, multi-source reports, or sandbox code-assisted analysis (Manus-style “deliver work”) → shouldRunAgent true.
2) If it is chit-chat, thanks, meta questions, or needs no web run → shouldRunAgent false.

If shouldRunAgent is true: reply must be 1–2 short sentences acknowledging you will research; researchGoal must be a clear, standalone objective (what to find out), not a reply to the user.
If shouldRunAgent is false: answer directly from available context. NEVER use placeholders like "[insert topic]" or template text.

Respond ONLY with JSON:
{
  "shouldRunAgent": true,
  "reply": "short acknowledgment",
  "researchGoal": "what to research on the web"
}

or

{
  "shouldRunAgent": false,
  "reply": "conversational answer",
  "researchGoal": ""
}
`)

  const raw = text.response.text()
  const clean = raw.replace(/```json|```/g, "").trim()

  try {
    return coerceTurn(JSON.parse(clean), raw, userMessage)
  } catch {
    return fallbackTurn(raw)
  }
}
