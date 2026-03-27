import Link from "next/link"

export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fafaf8",
        color: "#111",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "20px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #e5e5e2",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: "#111",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
            }}
          >
            ⚡
          </div>
          <span
            style={{
              fontFamily: "'Georgia', serif",
              fontWeight: 700,
              fontSize: 20,
            }}
          >
            flowos
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link
            href="/login"
            style={{
              fontSize: 14,
              color: "#555",
              textDecoration: "none",
              padding: "8px 14px",
            }}
          >
            Sign in
          </Link>
          <Link
            href="/chat"
            style={{
              fontSize: 14,
              color: "#fff",
              background: "#111",
              textDecoration: "none",
              padding: "8px 16px",
              borderRadius: 8,
            }}
          >
            Open app
          </Link>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          maxWidth: 720,
          margin: "0 auto",
          padding: "64px 28px 80px",
        }}
      >
        <p
          style={{
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#888",
            marginBottom: 16,
          }}
        >
          Research OS
        </p>
        <h1
          style={{
            fontFamily: "'Georgia', serif",
            fontWeight: 400,
            fontSize: "clamp(2rem, 5vw, 2.75rem)",
            lineHeight: 1.15,
            marginBottom: 20,
            letterSpacing: -0.5,
          }}
        >
          Persistent projects, parallel research, and a browser in the loop.
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "#444",
            lineHeight: 1.65,
            marginBottom: 28,
          }}
        >
          FlowOS pairs Jarvis (planning and chat) with a research agent that can search widely, run Python, and
          drive Chromium with optional vision on screenshots.{" "}
          <strong style={{ fontWeight: 600, color: "#222" }}>Projects</strong> keep master instructions and reference
          knowledge injected into every reply and every run—similar to how Manus scopes work to a workspace.
        </p>
        <ul
          style={{
            margin: "0 0 32px",
            paddingLeft: 20,
            color: "#555",
            lineHeight: 1.8,
            fontSize: 15,
          }}
        >
          <li>Define a project once; Jarvis and the sandbox respect it automatically.</li>
          <li>Export-oriented reports (Markdown / HTML) from completed runs.</li>
          <li>Sign in to use your own credits and saved sessions.</li>
        </ul>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link
            href="/login"
            style={{
              display: "inline-block",
              fontSize: 15,
              color: "#fff",
              background: "#111",
              textDecoration: "none",
              padding: "12px 22px",
              borderRadius: 10,
            }}
          >
            Get started
          </Link>
          <Link
            href="/chat"
            style={{
              display: "inline-block",
              fontSize: 15,
              color: "#333",
              border: "1px solid #d8d8d4",
              textDecoration: "none",
              padding: "12px 22px",
              borderRadius: 10,
              background: "#fff",
            }}
          >
            Try the app
          </Link>
        </div>
      </main>

      <footer
        style={{
          padding: "20px 28px",
          borderTop: "1px solid #e5e5e2",
          fontSize: 12,
          color: "#999",
        }}
      >
        FlowOS — experimental research interface. Configure Supabase and Gemini to run end-to-end.
      </footer>
    </div>
  )
}
