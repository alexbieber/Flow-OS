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

function parseProjectPayload(body: unknown) {
  const input = body as Record<string, unknown>
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 160) : ""
  const instructions =
    typeof input.instructions === "string" ? input.instructions.slice(0, 24_000) : ""
  const context = typeof input.context === "string" ? input.context.slice(0, 48_000) : ""
  return { name, instructions, context }
}

export async function GET() {
  try {
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { name, instructions, context } = parseProjectPayload(body)
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 })
    }

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
