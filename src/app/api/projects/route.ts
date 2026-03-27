import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth/session"
import { getServiceSupabase } from "@/lib/supabase/admin"
import type { FlowosProject } from "@/lib/projects/types"

function rowToProject(row: Record<string, unknown>): FlowosProject {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    instructions: String(row.instructions ?? ""),
    context: String(row.context ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }
}

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from("flowos_projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json((data ?? []).map((r) => rowToProject(r as Record<string, unknown>)))
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 160) : ""
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 })
    }

    const instructions =
      typeof body.instructions === "string" ? body.instructions.slice(0, 24_000) : ""
    const context = typeof body.context === "string" ? body.context.slice(0, 48_000) : ""

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from("flowos_projects")
      .insert({
        user_id: user.id,
        name,
        instructions,
        context,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 })
    }

    return NextResponse.json(rowToProject(data as Record<string, unknown>))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
