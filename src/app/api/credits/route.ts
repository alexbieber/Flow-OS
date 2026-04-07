import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth/session"
import { CREDITS_PER_REFILL, getCredits } from "@/lib/supabase/credits"

export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const creditState = await getCredits(user.id)

    return NextResponse.json({
      credits: creditState.credits,
      nextRefill: creditState.nextRefill?.toISOString() ?? null,
      canRun: creditState.canRun,
      maxCredits: CREDITS_PER_REFILL,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
