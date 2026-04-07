import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null = null

export function getBrowserSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon || !/^https?:\/\//i.test(url)) {
      throw new Error(
        "Supabase: set NEXT_PUBLIC_SUPABASE_URL (https://...) and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
      )
    }
    client = createBrowserClient(url, anon)
  }
  return client
}
