import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone()
  const nextPath = `${req.nextUrl.pathname}${req.nextUrl.search}`
  url.pathname = "/login"
  url.search = ""
  if (nextPath && nextPath !== "/") {
    url.searchParams.set("next", nextPath)
  } else {
    url.searchParams.delete("next")
  }
  return NextResponse.redirect(url)
}

export async function proxy(req: NextRequest) {
  let supabaseResponse = NextResponse.next({ request: req })

  const path = req.nextUrl.pathname
  if (
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/auth/callback") ||
    path.startsWith("/api")
  ) {
    return supabaseResponse
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return redirectToLogin(req)
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request: req })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirectToLogin(req)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
