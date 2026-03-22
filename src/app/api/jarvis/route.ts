import { NextRequest, NextResponse } from "next/server"
import { understandIntent } from "@/lib/ai/gemini"
import { getBrainSummaries, getBrainById } from "@/lib/brains/registry"
import { getServiceSupabase } from "@/lib/supabase/admin"
import { JarvisMessage } from "@/types"
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

    const userMsgId = uuidv4()
    const userTs = new Date().toISOString()

    await supabase.from("jarvis_messages").insert({
      id: userMsgId,
      user_id: userId,
      session_id: sessionId,
      role: "user",
      content: message,
      created_at: userTs,
    })

    const brainSummaries = getBrainSummaries()
    const intent = await understandIntent(message, brainSummaries)

    let replyContent = intent.reply
    let brainSuggestion: JarvisMessage["brainSuggestion"] = undefined

    if (intent.brainId) {
      const brain = getBrainById(intent.brainId)
      if (brain) {
        brainSuggestion = brain
        replyContent = intent.reply
      }
    }

    const jarvisMsgId = uuidv4()
    const jarvisTs = new Date().toISOString()

    const jarvisMsg: JarvisMessage = {
      id: jarvisMsgId,
      role: "jarvis",
      content: replyContent,
      timestamp: jarvisTs,
      brainSuggestion,
    }

    await supabase.from("jarvis_messages").insert({
      id: jarvisMsg.id,
      user_id: userId,
      session_id: sessionId,
      role: jarvisMsg.role,
      content: jarvisMsg.content,
      brain_suggestion: brainSuggestion ?? null,
      created_at: jarvisTs,
    })

    return NextResponse.json(jarvisMsg)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
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
