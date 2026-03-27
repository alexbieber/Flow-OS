export default function VaultPage() {
  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: 28,
        background: "#fafaf8",
      }}
    >
      <h1
        style={{
          fontFamily: "'Georgia', serif",
          fontWeight: 400,
          fontSize: 28,
          color: "#111",
          margin: 0,
          letterSpacing: -0.3,
        }}
      >
        Library
      </h1>
      <p style={{ color: "#666", fontSize: 14, marginTop: 8, maxWidth: 560 }}>
        Saved reports and reusable assets will live here. The route exists now, so the sidebar no
        longer sends users to a dead end while this section is being built out.
      </p>
    </div>
  )
}
