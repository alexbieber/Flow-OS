"use client"

import { useState } from "react"
import { Brain } from "@/types"
import { BRAINS, BRAIN_CATEGORIES } from "@/lib/brains/registry"
import { DEMO_USER_ID } from "@/lib/constants/demo-user"

function BrainCard({ brain, onRun }: { brain: Brain; onRun: (b: Brain) => void }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e5e2",
        borderRadius: 12,
        padding: "18px",
        cursor: "pointer",
        transition: "all 0.15s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#ccc"
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#e5e5e2"
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      {brain.trending && (
        <div style={{
          position: "absolute", top: 0, right: 0,
          background: "#fff7ed",
          color: "#ea580c", fontSize: 10, fontWeight: 600,
          padding: "3px 10px", borderRadius: "0 12px 0 8px",
          border: "1px solid #fed7aa",
        }}>🔥 Trending</div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: "#f5f5f3", flexShrink: 0,
          display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 22,
          border: "1px solid #e5e5e2",
        }}>{brain.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>{brain.name}</span>
            {brain.verified && <span style={{ color: "#4285f4", fontSize: 12 }}>✓</span>}
          </div>
          <div style={{ fontSize: 11, color: "#999" }}>
            {brain.author} · ⏱ {brain.estimatedTime}
          </div>
        </div>
      </div>

      <p style={{
        fontSize: 13, color: "#666", lineHeight: 1.6,
        marginBottom: 14,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        {brain.description}
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {brain.tags.slice(0, 3).map((t) => (
          <span key={t} style={{
            background: "#f5f5f3", color: "#777",
            fontSize: 11, padding: "2px 8px", borderRadius: 6,
            border: "1px solid #e5e5e2",
          }}>#{t}</span>
        ))}
      </div>

      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 11, color: "#999" }}>
          <span style={{ color: "#f59e0b" }}>★</span> {brain.rating}
          <span style={{ margin: "0 6px", color: "#ddd" }}>·</span>
          {brain.installs.toLocaleString()} runs
        </div>
        <button
          type="button"
          onClick={() => onRun(brain)}
          style={{
            background: "#111", border: "none",
            color: "#fff", fontSize: 12, fontWeight: 600,
            padding: "6px 16px", borderRadius: 8,
            cursor: "pointer", transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#333" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#111" }}
        >
          ▶ Run
        </button>
      </div>
    </div>
  )
}

function RunModal({
  brain,
  onClose,
  onLaunch,
}: {
  brain: Brain
  onClose: () => void
  onLaunch: (inputs: Record<string, string>) => Promise<void>
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [launching, setLaunching] = useState(false)

  const handleLaunch = async () => {
    setLaunching(true)
    try {
      await onLaunch(inputs)
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center",
        justifyContent: "center", zIndex: 1000, padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 20,
          border: "1px solid #e5e5e2",
          padding: 32, maxWidth: 500, width: "100%",
          maxHeight: "88vh", overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        <div style={{
          display: "flex", justifyContent: "space-between",
          marginBottom: 20,
        }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{
              width: 50, height: 50, borderRadius: 14,
              background: "#f5f5f3", border: "1px solid #e5e5e2",
              display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 26,
            }}>{brain.icon}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, color: "#111" }}>{brain.name}</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                ⭐ {brain.rating} · {brain.installs.toLocaleString()} runs · ⏱ {brain.estimatedTime}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            background: "#f5f5f3", border: "1px solid #e5e5e2",
            borderRadius: 8, width: 32, height: 32,
            cursor: "pointer", color: "#888", fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        <p style={{ fontSize: 13, color: "#666", lineHeight: 1.7, marginBottom: 24 }}>
          {brain.description}
        </p>

        {brain.inputs.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: "#999", letterSpacing: 1, marginBottom: 14, textTransform: "uppercase" }}>
              Configure Inputs
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {brain.inputs.map((inp) => (
                <div key={inp.key}>
                  <label style={{
                    fontSize: 12, color: "#555", display: "block",
                    marginBottom: 6, fontWeight: 500,
                  }}>
                    {inp.label}
                    {inp.required && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
                  </label>
                  {inp.type === "textarea" ? (
                    <textarea
                      rows={3}
                      value={inputs[inp.key] ?? ""}
                      onChange={(e) => setInputs({ ...inputs, [inp.key]: e.target.value })}
                      placeholder={inp.placeholder}
                      style={{
                        width: "100%", background: "#fafaf8",
                        border: "1px solid #e0e0de", borderRadius: 8,
                        padding: "10px 12px", color: "#333",
                        fontSize: 13, outline: "none",
                        boxSizing: "border-box", resize: "vertical",
                        fontFamily: "'Inter', sans-serif",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "#4285f4" }}
                      onBlur={(e) => { e.target.style.borderColor = "#e0e0de" }}
                    />
                  ) : (
                    <input
                      type={inp.type === "password" ? "password" : "text"}
                      value={inputs[inp.key] ?? ""}
                      onChange={(e) => setInputs({ ...inputs, [inp.key]: e.target.value })}
                      placeholder={inp.placeholder}
                      style={{
                        width: "100%", background: "#fafaf8",
                        border: "1px solid #e0e0de", borderRadius: 8,
                        padding: "10px 12px", color: "#333",
                        fontSize: 13, outline: "none",
                        boxSizing: "border-box",
                        fontFamily: "'Inter', sans-serif",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "#4285f4" }}
                      onBlur={(e) => { e.target.style.borderColor = "#e0e0de" }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{
          background: "#fafaf8", border: "1px solid #e5e5e2",
          borderRadius: 10, padding: "12px 16px", marginBottom: 24,
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
          fontSize: 12,
        }}>
          {[
            ["Environment", "E2B Cloud"],
            ["AI Model", "Gemini 2.0 Flash"],
            ["Est. Time", brain.estimatedTime],
            ["Cost", "Free (E2B credit)"],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ color: "#aaa", marginBottom: 2 }}>{k}</div>
              <div style={{ color: "#555", fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void handleLaunch()}
          disabled={launching}
          style={{
            width: "100%", background: launching ? "#e0e0de" : "#111",
            border: "none", borderRadius: 12, padding: "13px",
            fontSize: 15, fontWeight: 600, color: "#fff",
            cursor: launching ? "not-allowed" : "pointer",
            transition: "background 0.2s",
          }}
        >
          {launching ? "⚡ Launching..." : "▶ Run Brain"}
        </button>
      </div>
    </div>
  )
}

export default function MarketplacePage() {
  const [category, setCategory] = useState("All")
  const [search, setSearch] = useState("")
  const [selectedBrain, setSelectedBrain] = useState<Brain | null>(null)
  const [launched, setLaunched] = useState(false)

  const filtered = BRAINS.filter((b) => {
    const matchCat = category === "All" || b.category === category
    const q = search.toLowerCase()
    const matchSearch =
      !search ||
      b.name.toLowerCase().includes(q) ||
      b.description.toLowerCase().includes(q) ||
      b.tags.some((t) => t.toLowerCase().includes(q))
    return matchCat && matchSearch
  })

  const handleLaunch = async (inputs: Record<string, string>) => {
    if (!selectedBrain) return
    const res = await fetch("/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brainId: selectedBrain.id, inputs, userId: DEMO_USER_ID }),
    })
    const data = (await res.json()) as { runId?: string; error?: string }
    if (!res.ok) {
      alert(data.error ?? "Failed to start run")
      return
    }
    setSelectedBrain(null)
    setLaunched(true)
    setTimeout(() => setLaunched(false), 4000)
  }

  return (
    <div style={{
      flex: 1, overflow: "auto", padding: 28,
      background: "#fafaf8",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 16,
      }}>
        <div>
          <h1 style={{
            fontFamily: "'Georgia', serif",
            fontWeight: 400, fontSize: 28,
            color: "#111", margin: 0, letterSpacing: -0.3,
          }}>Brain Marketplace</h1>
          <p style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
            {BRAINS.length} brains · runs in E2B cloud · powered by Gemini 2.0
          </p>
        </div>

        <div style={{
          background: "#fff", border: "1px solid #e0e0de",
          borderRadius: 10, padding: "8px 14px",
          display: "flex", alignItems: "center", gap: 8, width: 240,
        }}>
          <span style={{ color: "#bbb" }}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brains..."
            style={{
              background: "none", border: "none",
              outline: "none", color: "#333",
              fontSize: 13, width: "100%",
              fontFamily: "'Inter', sans-serif",
            }}
          />
        </div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12, marginBottom: 28,
      }}>
        {[
          ["⚡", "2.1M+", "Total Runs"],
          ["🧠", `${BRAINS.length}`, "Brains"],
          ["☁️", "E2B", "Cloud Infra"],
          ["✓", "Free", "To Start"],
        ].map(([ic, v, l]) => (
          <div key={l} style={{
            background: "#fff", border: "1px solid #e5e5e2",
            borderRadius: 12, padding: "14px 16px",
          }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>{ic}</div>
            <div style={{ fontWeight: 700, fontSize: 22, color: "#111" }}>{v}</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {BRAIN_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            style={{
              background: category === c ? "#111" : "#fff",
              border: `1px solid ${category === c ? "#111" : "#e0e0de"}`,
              color: category === c ? "#fff" : "#555",
              borderRadius: 20, padding: "6px 16px",
              fontSize: 12, cursor: "pointer",
              fontWeight: category === c ? 600 : 400,
              transition: "all 0.15s",
            }}
          >{c}</button>
        ))}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 14,
      }}>
        {filtered.map((brain) => (
          <BrainCard key={brain.id} brain={brain} onRun={setSelectedBrain} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{
          textAlign: "center", padding: "60px 0",
          color: "#bbb", fontSize: 14,
        }}>No brains found for "{search}"</div>
      )}

      {launched && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: "#fff", border: "1px solid #bbf7d0",
          borderRadius: 12, padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)", zIndex: 100,
        }}>
          <span style={{ color: "#16a34a", fontSize: 18 }}>✓</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#111" }}>Brain launched!</div>
            <div style={{ fontSize: 11, color: "#888" }}>Check My Runs for live updates</div>
          </div>
        </div>
      )}

      {selectedBrain && (
        <RunModal
          brain={selectedBrain}
          onClose={() => setSelectedBrain(null)}
          onLaunch={handleLaunch}
        />
      )}
    </div>
  )
}
