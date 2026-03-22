import { GoogleGenerativeAI } from "@google/generative-ai"
import { AIScreenAnalysis } from "@/types"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

export async function analyseScreen(
  screenshotBase64: string,
  instruction: string,
  context: string
): Promise<AIScreenAnalysis> {
  const prompt = `
You are an AI browser automation agent called FlowOS.
You are looking at a screenshot of a browser.

Current task: ${instruction}
Context: ${context}

Analyse the screenshot and decide the SINGLE next action to take.
Respond ONLY in this exact JSON format with no extra text:
{
  "observation": "what you see on screen",
  "action": "click | type | scroll | wait | done | failed",
  "selector": "css selector or null",
  "value": "text to type or null",
  "confidence": 0.0 to 1.0,
  "reasoning": "why this action"
}
`

  const imagePart = {
    inlineData: {
      data: screenshotBase64,
      mimeType: "image/png" as const,
    },
  }

  const result = await model.generateContent([prompt, imagePart])
  const text = result.response.text()

  try {
    const clean = text.replace(/```json|```/g, "").trim()
    return JSON.parse(clean) as AIScreenAnalysis
  } catch {
    return {
      observation: "Could not parse screen",
      action: "failed",
      confidence: 0,
      reasoning: "JSON parse error: " + text,
    }
  }
}

export async function understandIntent(
  userMessage: string,
  availableBrains: { id: string; name: string; description: string }[]
): Promise<{ brainId: string | null; inputs: Record<string, string>; reply: string }> {
  const prompt = `
You are Jarvis, a helpful AI assistant for FlowOS — a platform that automates tasks on the internet.

User said: "${userMessage}"

Available brains (skills):
${availableBrains.map(b => `- ${b.id}: ${b.name} — ${b.description}`).join("\n")}

Decide:
1. Which brain matches what the user wants (or null if none match)
2. Any input values you can extract from their message
3. A friendly, concise reply to the user

Respond ONLY in this exact JSON format:
{
  "brainId": "brain_id or null",
  "inputs": { "key": "value" },
  "reply": "your friendly response to the user"
}
`

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  try {
    const clean = text.replace(/```json|```/g, "").trim()
    return JSON.parse(clean)
  } catch {
    return {
      brainId: null,
      inputs: {},
      reply: "I understood your request but couldn't match it to a skill. Could you be more specific?",
    }
  }
}

export async function generateRunSummary(
  brainName: string,
  logs: { type: string; message: string }[]
): Promise<string> {
  const prompt = `
You are Jarvis. A "${brainName}" automation just completed.

Logs:
${logs.map(l => `[${l.type}] ${l.message}`).join("\n")}

Write a short, friendly 2-sentence summary of what was accomplished.
Be specific with numbers if logs mention them.
`

  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}
