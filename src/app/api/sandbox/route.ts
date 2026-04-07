import { after, NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth/session"
import { loadProjectForUser } from "@/lib/projects/load-server"
import { RESEARCH_AGENT, RESEARCH_MAX_STEPS } from "@/lib/research/constants"
import { executeResearchRun } from "@/lib/research/executor"
import { getCredits, deductCredit } from "@/lib/supabase/credits"
import { getServiceSupabase } from "@/lib/supabase/admin"
import { Run, RunLog } from "@/types"
import { v4 as uuidv4 } from "uuid"

function insertRunPayload(run: Run) {
  return {
    id: run.id,
    user_id: run.userId,
    brain_id: run.brainId,
    brain_name: run.brainName,
    brain_icon: run.brainIcon,
    status: run.status,
    progress: run.progress,
    total_steps: run.totalSteps,
    current_step: run.currentStep,
    logs: run.logs,
    inputs: run.inputs,
    started_at: run.startedAt,
  }
}

function rowToRun(row: Record<string, unknown>): Run {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    brainId: String(row.brain_id),
    brainName: String(row.brain_name),
    brainIcon: String(row.brain_icon),
    status: row.status as Run["status"],
    progress: Number(row.progress ?? 0),
    totalSteps: Number(row.total_steps ?? 0),
    currentStep: String(row.current_step ?? ""),
    logs: (row.logs as RunLog[]) ?? [],
    inputs: (row.inputs as Record<string, string>) ?? {},
    result: row.result as Run["result"] | undefined,
    sandboxId: row.sandbox_id != null ? String(row.sandbox_id) : undefined,
    streamUrl: row.stream_url != null ? String(row.stream_url) : undefined,
    startedAt: String(row.started_at),
    completedAt: row.completed_at != null ? String(row.completed_at) : undefined,
    estimatedEta: row.estimated_eta != null ? String(row.estimated_eta) : undefined,
  }
}

function normalizeInputs(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = typeof v === "string" ? v : String(v)
  }
  return out
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    const body = await req.json()
    const inputs = normalizeInputs(body.inputs)
    const rawProjectId = body.projectId

    if (typeof rawProjectId === "string" && rawProjectId.length > 0) {
      const proj = await loadProjectForUser(supabase, user.id, rawProjectId)
      if (proj) {
        inputs.project_name = proj.name
        inputs.project_instructions = proj.instructions
        inputs.project_context = proj.context
      }
    }

    const goal =
      inputs.user_goal?.trim() ||
      inputs.query?.trim() ||
      inputs.goal?.trim()

    if (!goal) {
      return NextResponse.json(
        { error: "Provide inputs with user_goal, query, or goal" },
        { status: 400 }
      )
    }

    if (!inputs.user_goal?.trim()) inputs.user_goal = goal
    if (!inputs.query?.trim()) inputs.query = goal

    const userId = user.id

    if (!process.env.GEMINI_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "Research is unavailable: GEMINI_API_KEY is not configured." },
        { status: 503 }
      )
    }

    const { canRun, credits, nextRefill } = await getCredits(userId)

    if (!canRun) {
      const timeLeft = nextRefill
        ? Math.ceil((nextRefill.getTime() - Date.now()) / (1000 * 60))
        : 360

      return NextResponse.json(
        {
          error: `No credits left. Refills in ${timeLeft} minutes.`,
          credits: 0,
          nextRefill: nextRefill?.toISOString(),
        },
        { status: 429 }
      )
    }

    const runId = uuidv4()
    const run: Run = {
      id: runId,
      userId,
      brainId: RESEARCH_AGENT.id,
      brainName: RESEARCH_AGENT.name,
      brainIcon: RESEARCH_AGENT.icon,
      status: "queued",
      progress: 0,
      totalSteps: RESEARCH_MAX_STEPS,
      currentStep: "Queued...",
      logs: [],
      inputs,
      startedAt: new Date().toISOString(),
    }

    const { error } = await supabase.from("runs").insert(insertRunPayload(run))
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const deducted = await deductCredit(userId)
    if (!deducted) {
      await supabase.from("runs").delete().eq("id", runId).eq("user_id", userId)
      return NextResponse.json(
        {
          error: "No credits left.",
          credits: credits ?? 0,
          nextRefill: nextRefill?.toISOString(),
        },
        { status: 429 }
      )
    }

    after(async () => {
      await executeInBackground(run, userId)
    })

    return NextResponse.json({ runId, status: "queued" })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    const { searchParams } = new URL(req.url)
    const runId = searchParams.get("runId")

    if (runId) {
      const { data, error } = await supabase
        .from("runs")
        .select("*")
        .eq("id", runId)
        .maybeSingle()
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!data) return NextResponse.json(null, { status: 404 })
      const row = data as Record<string, unknown>
      if (String(row.user_id) !== user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
      return NextResponse.json(rowToRun(row))
    }

    const { data, error } = await supabase
      .from("runs")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(20)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json((data ?? []).map((r) => rowToRun(r as Record<string, unknown>)))
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function executeInBackground(run: Run, userId: string) {
  const supabase = getServiceSupabase()
  try {
    await executeResearchRun(run, userId, async (update) => {
      const patch: Record<string, unknown> = {}

      if (update.status) patch.status = update.status
      if (update.progress !== undefined) patch.progress = update.progress
      if (update.currentStep) patch.current_step = update.currentStep
      if (update.result) patch.result = update.result

      if (update.log) {
        const { data } = await supabase
          .from("runs")
          .select("logs")
          .eq("id", run.id)
          .single()

        const existingLogs: RunLog[] = (data?.logs as RunLog[]) ?? []
        patch.logs = [...existingLogs, update.log]
      }

      if (update.status === "completed" || update.status === "failed") {
        patch.completed_at = new Date().toISOString()
      }

      await supabase.from("runs").update(patch).eq("id", run.id)
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    await supabase
      .from("runs")
      .update({
        status: "failed",
        result: { success: false, summary: message },
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
  }
}
