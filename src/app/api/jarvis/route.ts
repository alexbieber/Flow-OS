import { NextRequest, NextResponse } from "next/server"
import { completeJarvisTurn, type JarvisHistoryTurn } from "@/lib/ai/jarvis-turn"
import { getAuthenticatedUser } from "@/lib/auth/session"
import { loadProjectBlockForUser } from "@/lib/projects/load-server"
import { getServiceSupabase } from "@/lib/supabase/admin"
import { v4 as uuidv4 } from "uuid"

const MAX_MESSAGE_CHARS = 48_000
const ALLOWED_PUT_ROLES = new Set(["jarvis", "user", "system"])
const HISTORY_LIMIT = 10

async function loadRecentHistory(
  userId: string,
  sessionId: string
): Promise<JarvisHistoryTurn[]> {
  const supabase = getServiceSupabase()
  let query = supabase
    .from("jarvis_messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT)

  if (sessionId === "default") {
    query = query.or("session_id.eq.default,session_id.is.null")
  } else {
    query = query.eq("session_id", sessionId)
  }

  const { data } = await query
  if (!Array.isArray(data)) return []

  return data
    .slice()
    .reverse()
    .map((row) => ({
      role:
        row.role === "user" || row.role === "system" || row.role === "jarvis"
          ? row.role
          : "jarvis",
      content: String(row.content ?? "").slice(0, 1200),
    }))
    .filter((m) => m.content.trim().length > 0)
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    const body = await req.json()
    const { message, sessionId: rawSessionId, projectId: rawProjectId } = body

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message required" }, { status: 400 })
    }

    const trimmed = message.slice(0, MAX_MESSAGE_CHARS)
    if (!trimmed.trim()) {
      return NextResponse.json({ error: "message required" }, { status: 400 })
    }

    const sessionId = typeof rawSessionId === "string" && rawSessionId.length > 0
      ? rawSessionId
      : "default"

    const userId = user.id

    const historyBefore = await loadRecentHistory(userId, sessionId)

    const { error: userInsertError } = await supabase.from("jarvis_messages").insert({
      id: uuidv4(),
      user_id: userId,
      session_id: sessionId,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    })
    if (userInsertError) {
      return NextResponse.json({ error: userInsertError.message }, { status: 500 })
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "AI is not configured" }, { status: 503 })
    }

    let projectBlock: string | undefined
    if (typeof rawProjectId === "string" && rawProjectId.length > 0) {
      const block = await loadProjectBlockForUser(supabase, userId, rawProjectId)
      if (block) projectBlock = block
    }

    const turn = await completeJarvisTurn(trimmed, {
      projectBlock,
      recentHistory: [...historyBefore, { role: "user", content: trimmed }],
    })

    const jarvisMsgId = uuidv4()
    const jarvisTs = new Date().toISOString()

    const { error: assistantInsertError } = await supabase.from("jarvis_messages").insert({
      id: jarvisMsgId,
      user_id: userId,
      session_id: sessionId,
      role: "jarvis",
      content: turn.reply,
      created_at: jarvisTs,
    })
    if (assistantInsertError) {
      return NextResponse.json({ error: assistantInsertError.message }, { status: 500 })
    }

    return NextResponse.json({
      id: jarvisMsgId,
      role: "jarvis",
      content: turn.reply,
      timestamp: jarvisTs,
      shouldRunAgent: turn.shouldRunAgent,
      researchGoal: turn.researchGoal,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getServiceSupabase()
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("sessionId")

  let query = supabase
    .from("jarvis_messages")
    .select("*")
    .eq("user_id", user.id)
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
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    const { sessionId: rawSessionId, role, content, runId } = await req.json()

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "content required" }, { status: 400 })
    }

    const sessionId = typeof rawSessionId === "string" && rawSessionId.length > 0
      ? rawSessionId
      : "default"

    const resolvedRole =
      typeof role === "string" && ALLOWED_PUT_ROLES.has(role) ? role : "jarvis"

    const { error: insertError } = await supabase.from("jarvis_messages").insert({
      id: uuidv4(),
      user_id: user.id,
      session_id: sessionId,
      role: resolvedRole,
      content: content.slice(0, MAX_MESSAGE_CHARS),
      run_id: runId ?? null,
      created_at: new Date().toISOString(),
    })
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getServiceSupabase()
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("sessionId")

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 })
  }

  const del = sessionId === "default"
    ? supabase
        .from("jarvis_messages")
        .delete()
        .eq("user_id", user.id)
        .or("session_id.eq.default,session_id.is.null")
    : supabase
        .from("jarvis_messages")
        .delete()
        .eq("user_id", user.id)
        .eq("session_id", sessionId)

  const { error } = await del

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
