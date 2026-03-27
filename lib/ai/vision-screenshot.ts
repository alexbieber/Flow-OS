import { GoogleGenerativeAI } from "@google/generative-ai"

const MAX_B64_CHARS = 3_500_000

/**
 * Describe a screenshot for the agent loop (viewport JPEG base64, no data-URL prefix).
 */
export async function analyzeScreenshotWithGemini(
  imageBase64: string,
  userQuestion: string
): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY is not set")

  const trimmed = imageBase64.replace(/\s/g, "")
  if (trimmed.length > MAX_B64_CHARS) {
    return "Screenshot is too large for the vision model after this run; try a shorter page or omit fullPage."
  }

  const genAI = new GoogleGenerativeAI(key)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { maxOutputTokens: 2048 },
  })

  const instruction = `You help an autonomous browser agent (Playwright). From this screenshot, answer the question below.
Be specific: visible buttons, links, headings, forms, errors, modals, cookie banners, empty states, and approximate layout.
If text is unreadable, say so. Do not invent UI that is not visible.

Question: ${userQuestion.slice(0, 4000)}`

  const result = await model.generateContent([
    { text: instruction },
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: trimmed,
      },
    },
  ])

  return result.response.text().trim().slice(0, 8000)
}
