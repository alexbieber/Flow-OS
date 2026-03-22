"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Run, RunLog } from "@/types"
import { marked } from "marked"
import { DEMO_USER_ID } from "@/lib/constants/demo-user"

const statusColor = (s: string) =>
  ({ running: "#16a34a", completed: "#4285f4", failed: "#ef4444", queued: "#999", starting: "#7c3aed", paused: "#999" }[s] ?? "#999")

const statusLabel = (s: string) =>
  ({ running: "● Running", completed: "✓ Done", failed: "✕ Failed", queued: "◌ Queued", starting: "◈ Starting", paused: "⏸ Paused" }[s] ?? s)

const LOG_COLORS: Record<RunLog["type"], string> = {
  system: "#aaa",
  action: "#4285f4",
  ai: "#7c3aed",
  success: "#16a34a",
  error: "#ef4444",
  warning: "#f59e0b",
}

function MarkdownBody({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    marked.setOptions({ breaks: true })
    let cancelled = false
    void (async () => {
      const out = await marked.parse(content)
      const html = typeof out === "string" ? out : String(out)
      if (!cancelled && ref.current) ref.current.innerHTML = html
    })()
    return () => { cancelled = true }
  }, [content])

  return (
    <>
      <style>{`
        .md-light { font-family: 'Georgia', serif; font-size: 14px; line-height: 1.85; color: #333; }
        .md-light h1 { font-size: 20px; font-weight: 700; margin: 20px 0 8px; color: #111; border-bottom: 1px solid #f0f0ee; padding-bottom: 8px; }
        .md-light h2 { font-size: 16px; font-weight: 700; margin: 18px 0 6px; color: #111; }
        .md-light h3 { font-size: 14px; font-weight: 700; margin: 14px 0 4px; color: #333; }
        .md-light strong { color: #111; font-weight: 700; }
        .md-light ul { padding-left: 20px; margin: 8px 0; }
        .md-light ul li { padding: 3px 0; color: #444; }
        .md-light ol { padding-left: 20px; margin: 8px 0; }
        .md-light ol li { padding: 4px 0; color: #444; }
        .md-light p { margin: 8px 0; color: #555; }
        .md-light blockquote { border-left: 3px solid #e0e0de; margin: 12px 0; padding: 8px 14px; background: #fafaf8; color: #666; }
        .md-light code { background: #f5f5f3; color: #d63384; padding: 1px 6px; border-radius: 4px; font-size: 12px; font-family: monospace; }
        .md-light pre { background: #f5f5f3; border: 1px solid #e5e5e2; border-radius: 8px; padding: 14px; overflow-x: auto; margin: 10px 0; }
        .md-light a { color: #4285f4; text-decoration: none; border-bottom: 1px solid #4285f433; }
        .md-light hr { border: none; border-top: 1px solid #e5e5e2; margin: 20px 0; }
        .md-light table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
        .md-light th { background: #f5f5f3; padding: 8px 12px; text-align: left; font-weight: 600; border: 1px solid #e5e5e2; }
        .md-light td { padding: 8px 12px; border: 1px solid #e5e5e2; color: #555; }
        .md-light tr:hover td { background: #fafaf8; }
      `}</style>
      <div ref={ref} className="md-light" />
    </>
  )
}

function ResultsModal({ run, onClose }: { run: Run; onClose: () => void }) {
  const output = run.result?.data?.output ?? run.result?.summary ?? ""
  const [copied, setCopied] = useState(false)
  const [rating, setRating] = useState(0)

  const cleanOutput = String(output)
    .replace(/^```[\w]*\n?/gm, "")
    .replace(/^```$/gm, "")
    .trim()

  const copyAll = () => {
    void navigator.clipboard.writeText(cleanOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadTxt = () => {
    const blob = new Blob([cleanOutput], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${run.brainName.replace(/\s+/g, "-").toLowerCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const SUGGESTED_FOLLOWUPS = [
    { icon: "📄", text: `Summarise the key findings from this ${run.brainName} report.` },
    { icon: "🎞️", text: "Create a presentation based on these results." },
    { icon: "📧", text: "Draft an email sharing these results with my team." },
  ]

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
          width: "100%", maxWidth: 820,
          maxHeight: "92vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid #f0f0ee",
          display: "flex", alignItems: "center",
          justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: "#f5f5f3", border: "1px solid #e5e5e2",
              display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 22,
            }}>{run.brainIcon}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, color: "#111" }}>
                {run.brainName}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                Completed · {new Date(run.startedAt).toLocaleString()}
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

        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{
            padding: "14px 24px",
            borderBottom: "1px solid #f0f0ee",
            display: "flex", alignItems: "center", gap: 10,
            background: "#fafaf8",
          }}>
            <span style={{ fontSize: 18 }}>📄</span>
            <span style={{ fontWeight: 500, fontSize: 14, color: "#111", flex: 1 }}>
              {run.brainName} — Full Results
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={copyAll}
                style={{
                  background: copied ? "#f0fdf4" : "#fff",
                  border: `1px solid ${copied ? "#bbf7d0" : "#e0e0de"}`,
                  color: copied ? "#16a34a" : "#555",
                  borderRadius: 8, padding: "5px 12px",
                  fontSize: 12, cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
              <button
                type="button"
                onClick={downloadTxt}
                style={{
                  background: "#fff", border: "1px solid #e0e0de",
                  color: "#555", borderRadius: 8,
                  padding: "5px 12px", fontSize: 12, cursor: "pointer",
                }}
              >
                ⬇ Download
              </button>
            </div>
          </div>

          <div style={{ padding: "24px 32px" }}>
            {cleanOutput ? (
              <MarkdownBody content={cleanOutput} />
            ) : (
              <div style={{
                textAlign: "center", padding: "40px 0",
                color: "#bbb", fontSize: 14,
              }}>
                No output data found for this run.
              </div>
            )}
          </div>
        </div>

        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid #f0f0ee",
          background: "#fafaf8", flexShrink: 0,
        }}>
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between", marginBottom: 14,
          }}>
            <span style={{
              color: "#16a34a", fontSize: 13, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              ✓ Task completed
            </span>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#fff", padding: "6px 14px",
              borderRadius: 20, border: "1px solid #e5e5e2",
            }}>
              <span style={{ fontSize: 12, color: "#888" }}>How was this result?</span>
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" onClick={() => setRating(s)} style={{
                  background: "none", border: "none",
                  cursor: "pointer", fontSize: 16,
                  color: s <= rating ? "#f59e0b" : "#ddd",
                  padding: 0, transition: "color 0.15s",
                }}>★</button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>Suggested follow-ups</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {SUGGESTED_FOLLOWUPS.map((s, i) => (
                <button key={i} type="button" style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 8,
                  background: "#fff", border: "1px solid #e5e5e2",
                  cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#fafaf8"
                    e.currentTarget.style.borderColor = "#ccc"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff"
                    e.currentTarget.style.borderColor = "#e5e5e2"
                  }}
                >
                  <span style={{ fontSize: 14 }}>{s.icon}</span>
                  <span style={{ fontSize: 12, color: "#444", flex: 1 }}>{s.text}</span>
                  <span style={{ color: "#bbb", fontSize: 14 }}>→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LiveStreamModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center",
        justifyContent: "center", zIndex: 1100, padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16,
          border: "1px solid #e5e5e2",
          width: "90vw", maxWidth: 1100,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{
          padding: "12px 18px",
          borderBottom: "1px solid #e5e5e2",
          display: "flex", justifyContent: "space-between",
          alignItems: "center", background: "#fafaf8",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#16a34a", display: "inline-block",
            }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>
              FlowOS&apos;s Computer
            </span>
            <span style={{ fontSize: 12, color: "#999" }}>· read-only · live</span>
          </div>
          <button type="button" onClick={onClose} style={{
            background: "#f5f5f3", border: "1px solid #e5e5e2",
            borderRadius: 8, padding: "5px 10px",
            cursor: "pointer", color: "#888", fontSize: 14,
          }}>✕</button>
        </div>
        <iframe
          src={url}
          title="FlowOS Computer stream"
          style={{ width: "100%", height: "70vh", border: "none", display: "block" }}
          allow="fullscreen"
        />
      </div>
    </div>
  )
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [selectedLog, setSelectedLog] = useState<string | null>(null)
  const [viewingResult, setViewingResult] = useState<Run | null>(null)
  const [liveStreamUrl, setLiveStreamUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/sandbox?userId=${DEMO_USER_ID}`)
      const data = await res.json()
      setRuns(Array.isArray(data) ? data : [])
    } catch {
      setRuns([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchRuns()
    const interval = setInterval(() => void fetchRuns(), 3000)
    return () => clearInterval(interval)
  }, [fetchRuns])

  const handleWatchLive = async (run: Run) => {
    if (run.streamUrl) {
      setLiveStreamUrl(run.streamUrl)
      return
    }
    const res = await fetch(`/api/sandbox?runId=${encodeURIComponent(run.id)}`)
    const data = (await res.json()) as { streamUrl?: string; stream_url?: string }
    const u = data.streamUrl ?? data.stream_url
    if (u) setLiveStreamUrl(u)
  }

  return (
    <div style={{
      flex: 1, overflow: "auto", padding: 28,
      background: "#fafaf8",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Georgia&display=swap" rel="stylesheet" />

      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: "'Georgia', serif",
          fontWeight: 400, fontSize: 28,
          color: "#111", margin: 0, letterSpacing: -0.3,
        }}>My Runs</h1>
        <p style={{ color: "#999", fontSize: 13, marginTop: 4 }}>
          Auto-refreshes every 3s · click a completed run to view results
        </p>
      </div>

      {loading && (
        <div style={{
          textAlign: "center", padding: "80px 0",
          color: "#bbb", fontSize: 14,
        }}>Loading...</div>
      )}

      {!loading && runs.length === 0 && (
        <div style={{
          textAlign: "center", padding: "100px 0",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>◎</div>
          <div style={{ fontSize: 16, color: "#555", marginBottom: 8, fontWeight: 500 }}>
            No runs yet
          </div>
          <div style={{ fontSize: 13, color: "#bbb" }}>
            Go to Brains and run one to get started
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {runs.map((run) => (
          <div
            key={run.id}
            style={{
              background: "#fff",
              border: `1px solid ${["running", "starting"].includes(run.status) ? "#bbf7d0" : "#e5e5e2"}`,
              borderRadius: 14,
              padding: "18px 22px",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)" }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none" }}
            onClick={() => setSelectedLog(selectedLog === run.id ? null : run.id)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "#f5f5f3", border: "1px solid #e5e5e2",
                display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 22, flexShrink: 0,
              }}>{run.brainIcon}</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: "flex", alignItems: "center",
                  gap: 10, marginBottom: 4,
                }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: "#111" }}>
                    {run.brainName}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: statusColor(run.status),
                    background: `${statusColor(run.status)}15`,
                    padding: "2px 8px", borderRadius: 5,
                  }}>
                    {statusLabel(run.status)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#bbb" }}>
                  {new Date(run.startedAt).toLocaleString()}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {["running", "starting"].includes(run.status) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void handleWatchLive(run) }}
                    style={{
                      background: "#f0fdf4", border: "1px solid #bbf7d0",
                      color: "#16a34a", borderRadius: 8,
                      padding: "6px 14px", fontSize: 12,
                      fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    ▶ Watch Live
                  </button>
                )}
                {run.status === "completed" && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setViewingResult(run) }}
                    style={{
                      background: "#eff6ff", border: "1px solid #bfdbfe",
                      color: "#4285f4", borderRadius: 8,
                      padding: "6px 14px", fontSize: 12,
                      fontWeight: 600, cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#dbeafe" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#eff6ff" }}
                  >
                    📄 View Results
                  </button>
                )}
                <div style={{
                  fontWeight: 700, fontSize: 20,
                  color: statusColor(run.status),
                  minWidth: 48, textAlign: "right",
                }}>
                  {run.progress}%
                </div>
              </div>
            </div>

            <div style={{
              marginTop: 14, height: 3,
              background: "#f0f0ee", borderRadius: 2, overflow: "hidden",
            }}>
              <div style={{
                height: "100%", width: `${run.progress}%`,
                background: run.status === "running"
                  ? "#16a34a"
                  : run.status === "completed" ? "#4285f4"
                    : statusColor(run.status),
                borderRadius: 2, transition: "width 0.8s ease",
              }} />
            </div>

            {run.logs && run.logs.length > 0 && (
              <div style={{
                marginTop: 8, fontSize: 12, color: "#bbb",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                ▸ {run.logs[run.logs.length - 1]?.message}
              </div>
            )}

            {selectedLog === run.id && run.logs && run.logs.length > 0 && (
              <div style={{
                marginTop: 12, background: "#fafaf8",
                border: "1px solid #e5e5e2", borderRadius: 8,
                padding: "12px 14px", maxHeight: 200, overflow: "auto",
              }}>
                {run.logs.map((log, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 10, marginBottom: 4,
                    fontSize: 12,
                  }}>
                    <span style={{ color: "#ccc", flexShrink: 0 }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span style={{ color: LOG_COLORS[log.type] ?? "#555" }}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {viewingResult && (
        <ResultsModal run={viewingResult} onClose={() => setViewingResult(null)} />
      )}
      {liveStreamUrl && (
        <LiveStreamModal url={liveStreamUrl} onClose={() => setLiveStreamUrl(null)} />
      )}
    </div>
  )
}
