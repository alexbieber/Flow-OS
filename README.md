<p align="center">
  <strong>FlowOS</strong><br/>
  <sub>Autonomous research in the browser — Jarvis, sandboxed execution, real web data.</sub>
</p>

<p align="center">
  <a href="https://github.com/alexbieber/Flow-OS/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white" alt="Next.js" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>

---

**FlowOS** is an open-source AI workspace where **Jarvis** chats with you, decides when to run deep **web research**, and executes a sandboxed **research agent** inside **[E2B](https://e2b.dev)**. Results land in the chat as structured reports — with optional live desktop streaming when you use the desktop template.

If you want a **Manus-class loop** (search → open results → read pages → synthesize), the agent uses **Python + BeautifulSoup** over HTTP inside the sandbox — fast boots, no browser gymnastics for the default terminal path.

---

## Highlights

| Capability | Detail |
|------------|--------|
| **Jarvis** | Gemini-powered intent: chit-chat vs. kick off a research run |
| **Research agent** | Plan → wide parallel search → **fetch or Playwright Chromium** (JS sites, session profile, **screenshot + Gemini vision**) → Python in sandbox → synthesis |
| **Sandboxes** | E2B terminal (default) or custom desktop template + stream |
| **Persistence** | Supabase for runs, Jarvis messages, vault hooks |
| **Projects** | Saved instructions + reference context, injected into Jarvis and each research run (Manus-style workspace) |
| **UI** | Dashboard chat, runs history, HTML export for reports |

**Gemini usage:** Jarvis uses **one** `gemini-2.0-flash` call per chat turn (not tied to app credits). A **research run** charges **one credit** only after the run row is stored; it then uses Gemini for an upfront plan, about one decision call per agent step (with limited retries if JSON parsing fails), optional `think` / vision (`screenshot` + `analyze`), and sometimes a final report pass. Research **POST** returns **503** if `GEMINI_API_KEY` is missing so credits are not spent on a doomed run.

**Web search:** Each `search` / `wide_search` step calls hosted **SERP APIs first** when `SERPAPI_API_KEY`, `BRAVE_SEARCH_API_KEY`, or `GOOGLE_CSE_*` is set (keys never enter E2B), then **HTML scraping** (Google → Bing → DuckDuckGo) inside the sandbox if results are thin, then fetches up to **two** result pages for text. For production reliability on Vercel, configure at least one SERP provider.

---

## Architecture

```mermaid
flowchart LR
  subgraph client [Browser]
    Chat[Chat UI]
    Runs[Runs / Results]
  end
  subgraph next [Next.js]
    API_Jarvis["/api/jarvis"]
    API_Sandbox["/api/sandbox"]
  end
  subgraph cloud [External]
    Gemini[Google Gemini]
    E2B[E2B Sandboxes]
    SB[(Supabase)]
  end
  Chat --> API_Jarvis
  Chat --> API_Sandbox
  API_Jarvis --> Gemini
  API_Jarvis --> SB
  API_Sandbox --> E2B
  API_Sandbox --> SB
  E2B --> Gemini
```

---

## Quick start

**Requirements:** Node 20+, npm, accounts for [Supabase](https://supabase.com), [Google AI Studio](https://aistudio.google.com/) (Gemini), [E2B](https://e2b.dev).

```bash
git clone https://github.com/alexbieber/Flow-OS.git
cd Flow-OS
npm install
cp .env.example .env.local   # if you add one; otherwise create .env.local manually
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Create **`.env.local`** (never commit secrets):

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Google Generative AI (Jarvis + agent) |
| `SERPAPI_API_KEY` | *(Optional)* SerpAPI for reliable web search from the server |
| `BRAVE_SEARCH_API_KEY` | *(Optional)* [Brave Search API](https://brave.com/search/api/) |
| `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX` | *(Optional)* Google Programmable Search (JSON API) |
| `E2B_API_KEY` | E2B sandbox create / commands |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase (API routes) |

Apply SQL under `supabase/` in the Supabase SQL editor (schema + `flowos_projects.sql` for Projects).

---

## E2B template (optional desktop)

For **noVNC / Chrome** workflows, build the template from the repo root:

- Workflow: `.github/workflows/build-template.yml` (manual dispatch)
- Dockerfile: `e2b.Dockerfile`
- Set **`E2B_ACCESS_TOKEN`** (or **`E2B_API_KEY`**, depending on CLI version) in GitHub Actions secrets

Wire the built template ID in sandbox code when using the desktop SDK path.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |

---

## Project layout

```
src/app/           # App Router — dashboard, chat, API routes
lib/research/      # Research agent loop + prompts
lib/sandbox/       # E2B terminal (and related helpers)
lib/ai/            # Gemini helpers
supabase/          # SQL schema & migrations
```

---

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

**MIT** — see [LICENSE](LICENSE). Free for commercial and personal use; attribution appreciated.

---

<p align="center">
  Built with Next.js, React, Supabase, Gemini, and E2B.
</p>
