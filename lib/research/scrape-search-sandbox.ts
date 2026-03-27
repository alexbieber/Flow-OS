import type { Sandbox } from "e2b"
import { runCommand } from "@/lib/sandbox/e2b"

/** Extract `URL:` lines from sandbox search stdout. */
export function parseSearchOutputUrls(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^URL:\s*(https?:\/\/\S+)/i)
    if (!m) continue
    out.push(m[1].replace(/[),\]>]+$/g, ""))
  }
  return [...new Set(out)]
}

/** HTML scraping inside E2B (no API keys). Falls back when server SERP is thin or unavailable. */
export async function scrapeSearchInSandbox(sandbox: Sandbox, query: string): Promise<string> {
  return runCommand(
    sandbox,
    `python3 - << 'PYEOF'
import requests
from bs4 import BeautifulSoup
import urllib.parse
import re
import time

query = ${JSON.stringify(query)}
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

results = []
urls = []

def add_block(title, snippet, href, source):
    if not title and not href:
        return
    results.append(f"[{source}]")
    if title:
        results.append(f"TITLE: {title}")
    if snippet:
        results.append(f"SNIPPET: {snippet[:280]}")
    if href and href.startswith("http") and "google.com" not in href:
        results.append(f"URL: {href}")
        if href not in urls:
            urls.append(href)
    results.append("---")

def parse_google(html):
    soup = BeautifulSoup(html, "html.parser")
    low = html.lower()
    if "unusual traffic" in low or "enable javascript" in low:
        return 0
    n = 0
    for g in soup.select("div.g")[:8]:
        h3 = g.find("h3")
        if not h3:
            continue
        title = h3.get_text(strip=True)
        snippet_el = g.select_one(".VwiC3b, .IsZvec, .MUxG3")
        snippet = snippet_el.get_text(strip=True) if snippet_el else ""
        link = g.find("a", href=True)
        href = (link.get("href") or "") if link else ""
        if href.startswith("/url?q="):
            href = urllib.parse.unquote(href[7:].split("&")[0])
        if title and href.startswith("http"):
            add_block(title, snippet, href, "google")
            n += 1
    return n

def parse_bing(html):
    soup = BeautifulSoup(html, "html.parser")
    n = 0
    for li in soup.select("li.b_algo")[:8]:
        h2 = li.find("h2")
        if not h2:
            continue
        a = h2.find("a", href=True)
        if not a:
            continue
        title = a.get_text(strip=True)
        href = a.get("href", "")
        snippet_el = li.select_one(".b_caption p, p")
        snippet = snippet_el.get_text(strip=True) if snippet_el else ""
        if title and href.startswith("http"):
            add_block(title, snippet, href, "bing")
            n += 1
    return n

def parse_ddg(html):
    soup = BeautifulSoup(html, "html.parser")
    n = 0
    for res in soup.select("div.web-result, div.result")[:10]:
        a = res.select_one("a.result__a, h2.result__title a, a[data-testid=result-title-a]")
        if not a:
            a = res.find("a", href=re.compile(r"^https?://"))
        if not a:
            continue
        title = a.get_text(strip=True)
        href = a.get("href", "")
        if href.startswith("//"):
            href = "https:" + href
        sn = res.select_one(".result__snippet, .snippet")
        snippet = sn.get_text(strip=True) if sn else ""
        if title and href.startswith("http"):
            add_block(title, snippet, href, "duckduckgo")
            n += 1
    return n

def run_engine(name, fn):
    for attempt in range(2):
        try:
            return fn()
        except Exception as e:
            if attempt == 0:
                time.sleep(0.35)
                continue
            print(f"{name}_error:", e)
    return 0

try:
    print("SCRAPE_ENGINE:", "google")
    def g():
        gurl = "https://www.google.com/search?q=" + urllib.parse.quote(query) + "&num=8&hl=en"
        gr = requests.get(gurl, headers=headers, timeout=20)
        return parse_google(gr.text)
    ng = run_engine("google", g)

    if ng < 2:
        print("SCRAPE_ENGINE:", "bing")
        def b():
            burl = "https://www.bing.com/search?q=" + urllib.parse.quote(query) + "&count=8"
            br = requests.get(burl, headers=headers, timeout=20)
            return parse_bing(br.text)
        run_engine("bing", b)

    if len(urls) < 2:
        print("SCRAPE_ENGINE:", "duckduckgo_html")
        def d():
            durl = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(query)
            dheaders = dict(headers)
            dheaders["Referer"] = "https://html.duckduckgo.com/"
            dr = requests.get(durl, headers=dheaders, timeout=20)
            return parse_ddg(dr.text)
        run_engine("ddg", d)

    print("SEARCH_RESULTS:")
    print("\\n".join(results[:60]) if results else "(no SERP rows parsed)")

except Exception as e:
    print(f"Scrape search error: {e}")
PYEOF`,
    60000
  )
}

/** Fetch main text from top URLs inside the sandbox (shared by API + scrape paths). */
export async function fetchTopUrlBodiesInSandbox(
  sandbox: Sandbox,
  urls: string[],
  maxUrls = 2,
  maxCharsEach = 1500
): Promise<string> {
  const uniq = [...new Set(urls.filter((u) => u.startsWith("http")))].slice(0, maxUrls)
  if (uniq.length === 0) return ""

  return runCommand(
    sandbox,
    `python3 - << 'PYEOF'
import requests
from bs4 import BeautifulSoup
import re
import json

urls = json.loads(${JSON.stringify(JSON.stringify(uniq))})
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
max_chars = ${maxCharsEach}

for url in urls:
    try:
        print(f"\\nREADING: {url}")
        pr = requests.get(url, headers=headers, timeout=14)
        psoup = BeautifulSoup(pr.text, "html.parser")
        for tag in psoup(["script","style","nav","footer","header","aside"]):
            tag.decompose()
        main = psoup.find("main") or psoup.find("article") or psoup.find("body")
        if main:
            text = re.sub(r"\\s+", " ", main.get_text(separator=" ", strip=True))
            print(f"CONTENT: {text[:max_chars]}")
    except Exception as e:
        print(f"Could not read {url}: {e}")
PYEOF`,
    45000
  )
}
