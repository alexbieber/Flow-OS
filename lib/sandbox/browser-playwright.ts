import type { Sandbox } from "e2b"
import { analyzeScreenshotWithGemini } from "@/lib/ai/vision-screenshot"
import { runCommand } from "@/lib/sandbox/e2b"

export type BrowserOp =
  | { op: "goto"; url: string }
  | { op: "text"; selector?: string }
  | { op: "title" }
  | { op: "links"; max?: number }
  | { op: "screenshot"; fullPage?: boolean; analyze?: string }

/** Idempotent per sandbox via marker file. */
export async function ensurePlaywrightInstalled(sandbox: Sandbox): Promise<void> {
  const check = await runCommand(
    sandbox,
    "test -f /tmp/flowos_pw_ready && echo ready",
    8000
  )
  if (check.includes("ready")) return

  await runCommand(
    sandbox,
    "pip install playwright --quiet --break-system-packages",
    180000
  )
  await runCommand(sandbox, "playwright install chromium", 360000)
  await runCommand(
    sandbox,
    "playwright install-deps chromium 2>/dev/null || true",
    180000
  )
  await runCommand(sandbox, "touch /tmp/flowos_pw_ready", 5000)
}

/** Run one browser operation; uses a persistent Chromium profile under /tmp for cookie/session continuity. */
export async function runBrowserOp(sandbox: Sandbox, op: BrowserOp): Promise<string> {
  await ensurePlaywrightInstalled(sandbox)

  const payloadForSandbox: Record<string, unknown> = { op: op.op }
  if (op.op === "goto") payloadForSandbox.url = op.url
  if (op.op === "text" && op.selector) payloadForSandbox.selector = op.selector
  if (op.op === "links" && op.max != null) payloadForSandbox.max = op.max
  if (op.op === "screenshot") {
    payloadForSandbox.fullPage = op.fullPage === true
  }

  const payload = JSON.stringify(payloadForSandbox)
  const b64 = Buffer.from(payload, "utf8").toString("base64")

  const script = `python3 - << 'FLOWOS_BROWSER'
import base64, json, os, sys

USER_DATA = "/tmp/flowos_chrome_profile"
os.makedirs(USER_DATA, exist_ok=True)

raw = base64.b64decode(${JSON.stringify(b64)}).decode("utf-8")
req = json.loads(raw)
op = req.get("op")

def fail(msg):
    print("BROWSER_ERROR:", msg)
    sys.exit(0)

if op not in ("goto", "text", "title", "links", "screenshot"):
    fail("unknown op; use goto|text|title|links|screenshot")

try:
    from playwright.sync_api import sync_playwright
except ImportError as e:
    fail("playwright import failed: " + str(e))

def url_ok(u):
    return isinstance(u, str) and u.startswith(("http://", "https://")) and len(u) < 3000

with sync_playwright() as p:
    try:
        context = p.chromium.launch_persistent_context(
            USER_DATA,
            headless=True,
            viewport={"width": 1365, "height": 900},
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-first-run",
            ],
            ignore_https_errors=True,
        )
    except Exception as e:
        fail("launch failed: " + str(e))

    try:
        page = context.pages[0] if context.pages else context.new_page()

        if op == "goto":
            url = req.get("url", "")
            if not url_ok(url):
                fail("goto requires https?:// URL")
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            try:
                page.wait_for_load_state("networkidle", timeout=12000)
            except Exception:
                pass
            t = page.title() or ""
            print("TITLE:", t[:500])
            print("URL:", page.url[:500])

        elif op == "text":
            sel = req.get("selector") or "body"
            if not isinstance(sel, str) or not sel.strip():
                sel = "body"
            try:
                txt = page.locator(sel).first.inner_text(timeout=20000)
            except Exception as e:
                fail("selector failed: " + str(e))
            print("TEXT:")
            print(txt[:12000])

        elif op == "title":
            print("TITLE:", (page.title() or "")[:500])
            print("URL:", page.url[:500])

        elif op == "links":
            n = max(1, min(int(req.get("max") or 20), 40))
            js = f"(els) => {{ const maxn = {n}; const out = []; for (const a of els) {{ if (out.length >= maxn) break; const href = a.href || ''; if (!href.startsWith('http')) continue; const t = (a.innerText || '').trim().slice(0, 120); out.push(t + ' | ' + href); }} return out; }}"
            try:
                hrefs = page.eval_on_selector_all("a[href]", js)
            except Exception as e:
                fail("links failed: " + str(e))
            print("LINKS_JSON:", json.dumps(hrefs, ensure_ascii=False))

        elif op == "screenshot":
            full = bool(req.get("fullPage"))
            try:
                data = page.screenshot(
                    full_page=full,
                    type="jpeg",
                    quality=72,
                    timeout=60000,
                )
            except Exception as e:
                fail("screenshot failed: " + str(e))
            b64 = base64.b64encode(data).decode("ascii")
            print("TITLE:", (page.title() or "")[:300])
            print("URL:", page.url[:500])
            print("FLOWOS_SCREENSHOT_JPEG_B64_START")
            print(b64)
            print("FLOWOS_SCREENSHOT_JPEG_B64_END")

    finally:
        try:
            context.close()
        except Exception:
            pass
FLOWOS_BROWSER`

  const cmdOut = await runCommand(sandbox, script, 120000)

  if (op.op !== "screenshot") return cmdOut

  const block =
    /FLOWOS_SCREENSHOT_JPEG_B64_START\r?\n([\s\S]+)\r?\nFLOWOS_SCREENSHOT_JPEG_B64_END/
  const m = cmdOut.match(block)
  if (!m) return cmdOut

  const rawB64 = m[1].replace(/\s/g, "")
  const header = cmdOut.replace(m[0], "").trimEnd()

  let vision: string
  if (op.analyze?.trim()) {
    try {
      vision = await analyzeScreenshotWithGemini(rawB64, op.analyze.trim())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      vision = `Vision call failed: ${msg}`
    }
  } else {
    vision =
      "Screenshot captured in-session. Re-run browser with {\"op\":\"screenshot\",\"analyze\":\"Your question about the UI\"} to get a Gemini vision description."
  }

  return `${header}\n\n--- Vision ---\n${vision}`
}
