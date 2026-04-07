import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

function resolveRedirectPath(requestUrl: URL) {
  const rawNext = requestUrl.searchParams.get("next")
  if (!rawNext || !rawNext.startsWith("/")) return "/chat"
  if (rawNext.startsWith("//")) return "/"
  return rawNext
}

// Session cookies are applied to this redirect response so proxy sees the session.
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const origin = requestUrl.origin
  const redirectPath = resolveRedirectPath(requestUrl)

  if (!code) {
    return NextResponse.redirect(`${origin}/login${redirectPath !== "/" ? `?next=${encodeURIComponent(redirectPath)}` : ""}`)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const response = NextResponse.redirect(`${origin}${redirectPath}`)

  const supabase = createServerClient(
    url,
    anon,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login${redirectPath !== "/" ? `?next=${encodeURIComponent(redirectPath)}` : ""}`)
  }

  return response
}
