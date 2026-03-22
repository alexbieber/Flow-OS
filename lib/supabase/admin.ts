import { createClient, SupabaseClient } from "@supabase/supabase-js"

let _client: SupabaseClient | null = null

/** Service-role client; created on first use so builds work with placeholder env. */
export function getServiceSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key || !/^https?:\/\//i.test(url)) {
      throw new Error(
        "Supabase: set NEXT_PUBLIC_SUPABASE_URL (https://…) and SUPABASE_SERVICE_ROLE_KEY in .env.local"
      )
    }
    _client = createClient(url, key)
  }
  return _client
}
