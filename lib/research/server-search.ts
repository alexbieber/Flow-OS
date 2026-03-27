/**
 * Optional SERP providers (keys stay on the server — never passed into E2B).
 * Tries in order: SerpAPI → Brave → Google Programmable Search.
 */

const REQUEST_MS = 16_000
const MAX_ORGANIC = 8

export type ServerSearchResult = {
  /** Tagged lines for the agent log */
  serpBlock: string
  urls: string[]
  /** Which provider produced results */
  source: "serpapi" | "brave" | "google_cse"
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    const t = u.trim()
    if (!t.startsWith("http")) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= MAX_ORGANIC) break
  }
  return out
}

async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
  attempts = 2
): Promise<unknown | null> {
  let lastErr: unknown
  for (let i = 0; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_MS),
      })
      if (res.ok) return await res.json()
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)))
        continue
      }
      return null
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 300 * (i + 1)))
    }
  }
  void lastErr
  return null
}

function formatOrganic(
  rows: { title: string; snippet: string; url: string }[],
  source: ServerSearchResult["source"]
): ServerSearchResult | null {
  if (rows.length === 0) return null
  const lines: string[] = [`ENGINE: ${source} (api)`]
  const urls: string[] = []
  for (const r of rows) {
    lines.push(`[${source}]`)
    lines.push(`TITLE: ${r.title}`)
    if (r.snippet) lines.push(`SNIPPET: ${r.snippet.slice(0, 300)}`)
    lines.push(`URL: ${r.url}`)
    urls.push(r.url)
    lines.push("---")
  }
  lines.push("SEARCH_RESULTS:")
  lines.push(rows.map((r) => `${r.title} | ${r.url}`).join("\n"))
  return {
    serpBlock: lines.join("\n"),
    urls: uniqueUrls(urls),
    source,
  }
}

export async function runServerSearch(query: string): Promise<ServerSearchResult | null> {
  const q = query.trim()
  if (!q) return null

  const serpKey = process.env.SERPAPI_API_KEY?.trim()
  if (serpKey) {
    const u = new URL("https://serpapi.com/search.json")
    u.searchParams.set("engine", "google")
    u.searchParams.set("google_domain", "google.com")
    u.searchParams.set("num", String(MAX_ORGANIC))
    u.searchParams.set("q", q)
    u.searchParams.set("api_key", serpKey)
    const j = (await fetchJsonWithRetry(u.toString(), { method: "GET" })) as {
      organic_results?: Array<{ title?: string; link?: string; snippet?: string }>
      error?: string
    } | null
    if (j && !j.error && Array.isArray(j.organic_results)) {
      const rows = j.organic_results
        .slice(0, MAX_ORGANIC)
        .map((o) => ({
          title: String(o.title ?? "").trim(),
          snippet: String(o.snippet ?? "").trim(),
          url: String(o.link ?? "").trim(),
        }))
        .filter((o) => o.title && o.url.startsWith("http"))
      const fmt = formatOrganic(rows, "serpapi")
      if (fmt) return fmt
    }
  }

  const brave = process.env.BRAVE_SEARCH_API_KEY?.trim()
  if (brave) {
    const u = new URL("https://api.search.brave.com/res/v1/web/search")
    u.searchParams.set("q", q)
    u.searchParams.set("count", String(MAX_ORGANIC))
    const j = (await fetchJsonWithRetry(u.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": brave,
      },
    })) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> }
    } | null
    const results = j?.web?.results
    if (Array.isArray(results) && results.length > 0) {
      const rows = results
        .slice(0, MAX_ORGANIC)
        .map((o) => ({
          title: String(o.title ?? "").trim(),
          snippet: String(o.description ?? "").trim(),
          url: String(o.url ?? "").trim(),
        }))
        .filter((o) => o.title && o.url.startsWith("http"))
      const fmt = formatOrganic(rows, "brave")
      if (fmt) return fmt
    }
  }

  const cseKey = process.env.GOOGLE_CSE_API_KEY?.trim()
  const cx = process.env.GOOGLE_CSE_CX?.trim()
  if (cseKey && cx) {
    const u = new URL("https://www.googleapis.com/customsearch/v1")
    u.searchParams.set("key", cseKey)
    u.searchParams.set("cx", cx)
    u.searchParams.set("q", q)
    u.searchParams.set("num", String(Math.min(10, MAX_ORGANIC)))
    const j = (await fetchJsonWithRetry(u.toString(), { method: "GET" })) as {
      items?: Array<{ title?: string; link?: string; snippet?: string }>
    } | null
    const items = j?.items
    if (Array.isArray(items) && items.length > 0) {
      const rows = items.map((o) => ({
        title: String(o.title ?? "").trim(),
        snippet: String(o.snippet ?? "").trim(),
        url: String(o.link ?? "").trim(),
      })).filter((o) => o.title && o.url.startsWith("http"))
      const fmt = formatOrganic(rows, "google_cse")
      if (fmt) return fmt
    }
  }

  return null
}

/** True if any API-backed provider is configured. */
export function hasServerSearchProvider(): boolean {
  return Boolean(
    process.env.SERPAPI_API_KEY?.trim() ||
      process.env.BRAVE_SEARCH_API_KEY?.trim() ||
      (process.env.GOOGLE_CSE_API_KEY?.trim() && process.env.GOOGLE_CSE_CX?.trim())
  )
}
