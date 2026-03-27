import { CREDITS_PER_REFILL } from "@/lib/constants/credits"
import { getServiceSupabase } from "@/lib/supabase/admin"

const REFILL_HOURS = 6

export { CREDITS_PER_REFILL }

export async function getCredits(userId: string): Promise<{
  credits: number
  nextRefill: Date | null
  canRun: boolean
}> {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from("user_credits")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (error || !data) {
    await supabase.from("user_credits").insert({
      user_id: userId,
      credits: CREDITS_PER_REFILL,
      last_refill: new Date().toISOString(),
      total_runs: 0,
    })
    return { credits: CREDITS_PER_REFILL, nextRefill: null, canRun: true }
  }

  const lastRefill = new Date(String(data.last_refill))
  const now = new Date()
  const hoursSinceRefill =
    (now.getTime() - lastRefill.getTime()) / (1000 * 60 * 60)

  if (hoursSinceRefill >= REFILL_HOURS && data.credits < CREDITS_PER_REFILL) {
    await supabase
      .from("user_credits")
      .update({
        credits: CREDITS_PER_REFILL,
        last_refill: now.toISOString(),
      })
      .eq("user_id", userId)

    return { credits: CREDITS_PER_REFILL, nextRefill: null, canRun: true }
  }

  const nextRefill =
    data.credits === 0
      ? new Date(lastRefill.getTime() + REFILL_HOURS * 60 * 60 * 1000)
      : null

  return {
    credits: Number(data.credits),
    nextRefill,
    canRun: Number(data.credits) > 0,
  }
}

export async function deductCredit(userId: string): Promise<boolean> {
  const supabase = getServiceSupabase()

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await supabase
      .from("user_credits")
      .select("credits, total_runs")
      .eq("user_id", userId)
      .single()

    if (!data || Number(data.credits) <= 0) return false

    const currentCredits = Number(data.credits)
    const totalRuns = Number(data.total_runs ?? 0)

    const { data: updatedRows, error } = await supabase
      .from("user_credits")
      .update({
        credits: currentCredits - 1,
        total_runs: totalRuns + 1,
      })
      .eq("user_id", userId)
      .eq("credits", currentCredits)
      .eq("total_runs", totalRuns)
      .select("user_id")

    if (!error && updatedRows && updatedRows.length > 0) {
      return true
    }
  }

  return false
}
