import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { understandIntent } from "@/lib/ai/gemini"
import { getBrainById, getBrainSummaries } from "@/lib/brains/registry"
import { getServiceSupabase } from "@/lib/supabase/admin"
import { v4 as uuidv4 } from "uuid"

export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const { message, userId, sessionId: rawSessionId } = await req.json()

    if (!message || !userId) {
      return NextResponse.json({ error: "message and userId required" }, { status: 400 })
    }

    const sessionId = typeof rawSessionId === "string" && rawSessionId.length > 0
      ? rawSessionId
      : "default"

    await supabase.from("jarvis_messages").insert({
      id: uuidv4(),
      user_id: userId,
      session_id: sessionId,
      role: "user",
      content: message,
      created_at: new Date().toISOString(),
    })

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

    const safe = String(message).replace(/\\/g, "\\\\").replace(/"/g, '\\"')

    const decision = await model.generateContent(`
You are Jarvis, an AI agent assistant like Manus.

User message: "${safe}"

Decide:
1. Is this an actionable research/analysis task that needs agent execution?
2. Or is it just conversation (hi, okay, thanks, what can you do, etc)?

Respond ONLY with JSON:
{
  "shouldRunAgent": true/false,
  "reply": "your response to user (1-2 sentences max)"
}

If shouldRunAgent is true: reply should be like "On it. I'll research [topic] now."
If shouldRunAgent is false: reply should answer conversationally.
`)

    const text = decision.response.text()
    const clean = text.replace(/```json|```/g, "").trim()
    let parsed: { shouldRunAgent: boolean; reply: string }

    try {
      parsed = JSON.parse(clean)
    } catch {
      parsed = { shouldRunAgent: false, reply: text.slice(0, 200) }
    }

    let brainId: string | null = null
    if (parsed.shouldRunAgent) {
      const intent = await understandIntent(message, getBrainSummaries())
      const candidate =
        intent.brainId && getBrainById(intent.brainId)
          ? intent.brainId
          : "market-research-report"
      brainId = getBrainById(candidate) ? candidate : "market-research-report"
    }

    const jarvisMsgId = uuidv4()
    const jarvisTs = new Date().toISOString()

    await supabase.from("jarvis_messages").insert({
      id: jarvisMsgId,
      user_id: userId,
      session_id: sessionId,
      role: "jarvis",
      content: parsed.reply,
      created_at: jarvisTs,
    })

    return NextResponse.json({
      id: jarvisMsgId,
      role: "jarvis",
      content: parsed.reply,
      timestamp: jarvisTs,
      shouldRunAgent: parsed.shouldRunAgent,
      brainId,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const supabase = getServiceSupabase()
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")
  const sessionId = searchParams.get("sessionId")

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 })
  }

  let query = supabase
    .from("jarvis_messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(100)

  if (sessionId) {
    if (sessionId === "default") {
      query = query.or("session_id.eq.default,session_id.is.null")
    } else {
      query = query.eq("session_id", sessionId)
    }
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const { userId, sessionId: rawSessionId, role, content, runId } = await req.json()

    if (!userId || !content) {
      return NextResponse.json({ error: "userId and content required" }, { status: 400 })
    }

    const sessionId = typeof rawSessionId === "string" && rawSessionId.length > 0
      ? rawSessionId
      : "default"

    await supabase.from("jarvis_messages").insert({
      id: uuidv4(),
      user_id: userId,
      session_id: sessionId,
      role: role ?? "jarvis",
      content,
      run_id: runId ?? null,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = getServiceSupabase()
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")
  const sessionId = searchParams.get("sessionId")

  if (!userId || !sessionId) {
    return NextResponse.json({ error: "userId and sessionId required" }, { status: 400 })
  }

  const del = sessionId === "default"
    ? supabase
        .from("jarvis_messages")
        .delete()
        .eq("user_id", userId)
        .or("session_id.eq.default,session_id.is.null")
    : supabase
        .from("jarvis_messages")
        .delete()
        .eq("user_id", userId)
        .eq("session_id", sessionId)

  const { error } = await del

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
