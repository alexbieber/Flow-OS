import type { SupabaseClient } from "@supabase/supabase-js"
import { formatProjectBlock } from "@/lib/projects/format"

export async function loadProjectForUser(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<{ name: string; instructions: string; context: string } | null> {
  const { data } = await supabase
    .from("flowos_projects")
    .select("name, instructions, context")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!data) return null
  return {
    name: String(data.name ?? ""),
    instructions: String(data.instructions ?? ""),
    context: String(data.context ?? ""),
  }
}

export async function loadProjectBlockForUser(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<string | null> {
  const p = await loadProjectForUser(supabase, userId, projectId)
  if (!p) return null
  return formatProjectBlock(p)
}
