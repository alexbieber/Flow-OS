import { NextRequest, NextResponse } from "next/server"
import { getBrainById } from "@/lib/brains/registry"
import { executeBrain } from "@/lib/brains/executor"
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

export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const { brainId, inputs, userId } = await req.json()

    if (!brainId || !userId) {
      return NextResponse.json({ error: "brainId and userId required" }, { status: 400 })
    }

    const brain = getBrainById(brainId)
    if (!brain) {
      return NextResponse.json({ error: "Brain not found" }, { status: 404 })
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

    const deducted = await deductCredit(userId)
    if (!deducted) {
      return NextResponse.json(
        {
          error: "No credits left.",
          credits: credits ?? 0,
          nextRefill: nextRefill?.toISOString(),
        },
        { status: 429 }
      )
    }

    // Create run record
    const runId = uuidv4()
    const run: Run = {
      id: runId,
      userId,
      brainId,
      brainName: brain.name,
      brainIcon: brain.icon,
      status: "queued",
      progress: 0,
      totalSteps: brain.steps.length,
      currentStep: "Queued...",
      logs: [],
      inputs: inputs ?? {},
      startedAt: new Date().toISOString(),
    }

    const { error } = await supabase.from("runs").insert(insertRunPayload(run))
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Execute in background — don't await
    executeInBackground(run, brain, userId)

    return NextResponse.json({ runId, status: "queued" })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const supabase = getServiceSupabase()
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")
  const runId = searchParams.get("runId")

  if (runId) {
    const { data } = await supabase
      .from("runs")
      .select("*")
      .eq("id", runId)
      .single()
    if (!data) return NextResponse.json(null, { status: 404 })
    return NextResponse.json(rowToRun(data as Record<string, unknown>))
  }

  if (userId) {
    const { data } = await supabase
      .from("runs")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(20)
    return NextResponse.json((data ?? []).map((r) => rowToRun(r as Record<string, unknown>)))
  }

  return NextResponse.json({ error: "userId required" }, { status: 400 })
}

async function executeInBackground(run: Run, brain: Parameters<typeof executeBrain>[1], userId: string) {
  const supabase = getServiceSupabase()
  try {
    await executeBrain(run, brain, userId, async (update) => {
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
