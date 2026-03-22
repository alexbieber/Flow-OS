import { NextRequest, NextResponse } from "next/server"
import { getServiceSupabase } from "@/lib/supabase/admin"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 })
  }

  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from("jarvis_messages")
    .select("session_id, content, created_at")
    .eq("user_id", userId)
    .eq("role", "user")
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json([])

  const seen = new Set<string>()
  const sessions = data
    .map((row) => {
      const sessionId = row.session_id ?? "default"
      return { ...row, session_id: sessionId }
    })
    .filter((row) => {
      if (seen.has(row.session_id)) return false
      seen.add(row.session_id)
      return true
    })
    .map((row) => {
      const t = row.content ?? ""
      return {
        sessionId: row.session_id,
        title: t.length > 50 ? `${t.slice(0, 50)}...` : t,
        createdAt: row.created_at,
      }
    })

  return NextResponse.json(sessions)
}
