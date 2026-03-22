import { NextRequest, NextResponse } from "next/server"
import { getBrainById, getBrainsByCategory, searchBrains, BRAINS } from "@/lib/brains/registry"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get("category")
  const query = searchParams.get("q")
  const id = searchParams.get("id")

  if (id) {
    const brain = getBrainById(id)
    if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 })
    return NextResponse.json(brain)
  }

  if (query) {
    return NextResponse.json(searchBrains(query))
  }

  if (category) {
    return NextResponse.json(getBrainsByCategory(category))
  }

  return NextResponse.json(BRAINS)
}
