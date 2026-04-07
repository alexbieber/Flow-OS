"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { FlowosProject } from "@/lib/projects/types"

async function readApiError(res: Response, fallback: string) {
  try {
    const raw = (await res.json()) as { error?: unknown }
    return typeof raw.error === "string" ? raw.error : fallback
  } catch {
    return fallback
  }
}

export default function ProjectsPage() {
  const router = useRouter()
  const [list, setList] = useState<FlowosProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [instructions, setInstructions] = useState("")
  const [context, setContext] = useState("")
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editInstructions, setEditInstructions] = useState("")
  const [editContext, setEditContext] = useState("")

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/projects")
      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/login?next=${encodeURIComponent("/projects")}`)
          return
        }
        setError(await readApiError(res, "Could not load projects."))
        setList([])
        return
      }
      const data = (await res.json()) as FlowosProject[]
      setList(Array.isArray(data) ? data : [])
    } catch {
      setError("Could not load projects.")
      setList([])
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const createProject = async () => {
    const n = name.trim()
    if (!n || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, instructions, context }),
      })
      if (!res.ok) {
        setError(await readApiError(res, "Create failed"))
        return
      }
      setName("")
      setInstructions("")
      setContext("")
      await load()
    } catch {
      setError("Create failed")
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (p: FlowosProject) => {
    setEditingId(p.id)
    setEditName(p.name)
    setEditInstructions(p.instructions)
    setEditContext(p.context)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = async () => {
    if (!editingId) return
    const n = editName.trim()
    if (!n) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          instructions: editInstructions,
          context: editContext,
        }),
      })
      if (!res.ok) {
        setError(await readApiError(res, "Save failed"))
        return
      }
      setEditingId(null)
      await load()
    } catch {
      setError("Save failed")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm("Delete this project? Chat links using it will lose context.")) return
    setError(null)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        setError(await readApiError(res, "Delete failed"))
        return
      }
      if (editingId === id) setEditingId(null)
      await load()
    } catch {
      setError("Delete failed")
    }
  }

  const openInChat = (id: string) => {
    router.push(`/chat?project=${encodeURIComponent(id)}`)
  }

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: "28px 32px",
        maxWidth: 880,
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontFamily: "'Georgia', serif",
          fontWeight: 400,
          fontSize: 28,
          marginBottom: 8,
          color: "#111",
        }}
      >
        Projects
      </h1>
      <p style={{ fontSize: 14, color: "#666", marginBottom: 28, lineHeight: 1.6 }}>
        Master instructions and reference knowledge are injected into Jarvis and into every research run while this
        project is selected in chat (<code style={{ fontSize: 12, background: "#f0f0ee", padding: "1px 6px", borderRadius: 4 }}>?project=…</code>).
      </p>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "#fff5f5",
            border: "1px solid #feb2b2",
            borderRadius: 8,
            color: "#c53030",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <section
        style={{
          background: "#fff",
          border: "1px solid #e5e5e2",
          borderRadius: 12,
          padding: 20,
          marginBottom: 28,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: "#222" }}>
          New project
        </h2>
        <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6 }}>Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Q1 competitive research"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #e0e0de",
            fontSize: 14,
            marginBottom: 14,
            fontFamily: "'Inter', sans-serif",
          }}
        />
        <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6 }}>
          Master instructions
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Tone, format, must-follow rules for every answer and report…"
          rows={4}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #e0e0de",
            fontSize: 14,
            marginBottom: 14,
            resize: "vertical",
            fontFamily: "'Inter', sans-serif",
          }}
        />
        <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6 }}>
          Reference knowledge
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Paste facts, links, or notes the agent should treat as ground truth…"
          rows={5}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #e0e0de",
            fontSize: 14,
            marginBottom: 16,
            resize: "vertical",
            fontFamily: "'Inter', sans-serif",
          }}
        />
        <button
          type="button"
          disabled={saving || !name.trim()}
          onClick={() => void createProject()}
          style={{
            background: saving || !name.trim() ? "#ccc" : "#111",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: 8,
            cursor: saving || !name.trim() ? "not-allowed" : "pointer",
            fontSize: 14,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 500,
          }}
        >
          Create project
        </button>
      </section>

      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "#222" }}>
        Your projects
      </h2>
      {loading ? (
        <p style={{ color: "#999", fontSize: 14 }}>Loading…</p>
      ) : list.length === 0 ? (
        <p style={{ color: "#999", fontSize: 14 }}>No projects yet. Create one above.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {list.map((p) => (
            <li
              key={p.id}
              style={{
                background: "#fff",
                border: "1px solid #e5e5e2",
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
              }}
            >
              {editingId === p.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #e0e0de",
                      fontSize: 14,
                      marginBottom: 10,
                      fontFamily: "'Inter', sans-serif",
                    }}
                  />
                  <textarea
                    value={editInstructions}
                    onChange={(e) => setEditInstructions(e.target.value)}
                    rows={3}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #e0e0de",
                      fontSize: 13,
                      marginBottom: 8,
                      fontFamily: "'Inter', sans-serif",
                    }}
                  />
                  <textarea
                    value={editContext}
                    onChange={(e) => setEditContext(e.target.value)}
                    rows={4}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #e0e0de",
                      fontSize: 13,
                      marginBottom: 12,
                      fontFamily: "'Inter', sans-serif",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveEdit()}
                      style={{
                        background: "#111",
                        color: "#fff",
                        border: "none",
                        padding: "8px 16px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      style={{
                        background: "none",
                        border: "1px solid #e0e0de",
                        padding: "8px 16px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 16, color: "#111" }}>{p.name}</div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => openInChat(p.id)}
                        style={{
                          background: "rgba(66,133,244,0.1)",
                          border: "1px solid rgba(66,133,244,0.35)",
                          color: "#1a56c4",
                          padding: "6px 12px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        Open in chat
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        style={{
                          background: "none",
                          border: "1px solid #e0e0de",
                          padding: "6px 12px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(p.id)}
                        style={{
                          background: "none",
                          border: "1px solid #feb2b2",
                          color: "#c53030",
                          padding: "6px 12px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {p.instructions ? (
                    <p style={{ fontSize: 13, color: "#555", whiteSpace: "pre-wrap", marginBottom: 8 }}>
                      {p.instructions.length > 220 ? `${p.instructions.slice(0, 220)}…` : p.instructions}
                    </p>
                  ) : null}
                  <div style={{ fontSize: 11, color: "#aaa" }}>
                    Updated {new Date(p.updatedAt).toLocaleString()}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
