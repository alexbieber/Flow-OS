"use client"

import {
  Suspense,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { JarvisMessage, Brain, Run, RunLog } from "@/types"
import { DEMO_USER_ID, SESSIONS_REFRESH_EVENT } from "@/lib/constants/demo-user"
import { v4 as uuidv4 } from "uuid"

// ── Types ────────────────────────────────────────────────────────────────────

interface ExecutionStep {
  id: string
  icon: string
  label: string
  status: "pending" | "running" | "done"
  subSteps?: string[]
  expanded?: boolean
}

interface TaskMessage extends JarvisMessage {
  executionSteps?: ExecutionStep[]
  executionDone?: boolean
  result?: string
  followUps?: string[]
}

function runResultText(run: Run): string | undefined {
  if (run.status !== "completed") return undefined
  const raw = run.result?.data?.output ?? run.result?.summary ?? ""
  return String(raw)
    .replace(/^```[\w]*\n?/gm, "")
    .replace(/^```$/gm, "")
    .trim()
}

// ── Markdown ────────────────────────────────────────────────────────────────

function MarkdownResult({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const html = content
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^\- (.+)$/gm, "<li class='ul-li'>$1</li>")
      .replace(/^\d+\. (.+)$/gm, "<li class='ol-li'>$1</li>")
      .replace(/\n\n/g, "</p><p>")
    ref.current.innerHTML = `<p>${html}</p>`
  }, [content])
  return (
    <>
      <style>{`
        .md-result { font-size:13px; line-height:1.85; color:#333; font-family:'Georgia',serif; }
        .md-result h1,.md-result h2,.md-result h3 { font-weight:700; color:#111; margin:14px 0 6px; }
        .md-result h1 { font-size:17px; border-bottom:1px solid #f0f0ee; padding-bottom:6px; }
        .md-result h2 { font-size:15px; }
        .md-result h3 { font-size:13px; color:#333; }
        .md-result strong { color:#111; font-weight:700; }
        .md-result p { margin:6px 0; color:#444; }
        .md-result li.ul-li { padding:3px 0 3px 14px; position:relative; color:#444; list-style:none; }
        .md-result li.ul-li::before { content:'•'; position:absolute; left:2px; color:#999; }
        .md-result li.ol-li { padding:3px 0; color:#444; }
      `}</style>
      <div ref={ref} className="md-result" />
    </>
  )
}

// ── Step tracker ─────────────────────────────────────────────────────────────

function StepTracker({
  steps,
  onToggle,
}: {
  steps: ExecutionStep[]
  onToggle: (id: string) => void
}) {
  return (
    <div style={{ marginTop: 8 }}>
      {steps.map((step) => (
        <div key={step.id}>
          <button
            type="button"
            onClick={() => onToggle(step.id)}
            style={{
              width: "100%",
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 0", background: "none", border: "none",
              cursor: "pointer", textAlign: "left",
            }}
          >
            <span style={{ width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {step.status === "done" ? (
                <span style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: "#e8f5e9", border: "1.5px solid #34a853",
                  display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 10, color: "#34a853",
                }}>✓</span>
              ) : step.status === "running" ? (
                <span style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: "2px solid #4285f4",
                  borderTopColor: "transparent",
                  display: "block",
                  animation: "spin 0.8s linear infinite",
                }} />
              ) : (
                <span style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: "1.5px solid #ddd", display: "block",
                }} />
              )}
            </span>

            <span style={{
              fontSize: 14, color: step.status === "pending" ? "#bbb" : "#111",
              fontWeight: 500, flex: 1,
              fontFamily: "'Inter', sans-serif",
            }}>
              {step.label}
            </span>

            {step.subSteps && step.subSteps.length > 0 && (
              <span style={{ color: "#bbb", fontSize: 13 }}>
                {step.expanded ? "∧" : "∨"}
              </span>
            )}
          </button>

          {step.expanded && step.subSteps && (
            <div style={{ paddingLeft: 30, paddingBottom: 6 }}>
              {step.subSteps.map((sub, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start",
                  gap: 8, marginBottom: 6, padding: "4px 0",
                }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 5,
                    background: "#f0f0ee", border: "1px solid #e5e5e2",
                    display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 11, flexShrink: 0,
                  }}>
                    {sub.startsWith("Search") ? "🔍" :
                     sub.startsWith("Read") ? "📄" :
                     sub.startsWith("Extract") ? "📋" :
                     sub.startsWith("Exec") ? ">_" : "◈"}
                  </span>
                  <span style={{
                    fontSize: 12, color: "#666",
                    fontFamily: "'Inter', sans-serif",
                    lineHeight: 1.5,
                  }}>{sub}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Computer panel ───────────────────────────────────────────────────────────

function ComputerPanel({
  run,
  steps,
  onClose,
}: {
  run: Run | null
  steps: ExecutionStep[]
  onClose: () => void
}) {
  const [activeView, setActiveView] = useState<"browser" | "terminal" | "search">("browser")
  const currentStep = steps.find((s) => s.status === "running") ?? steps[steps.length - 1]

  useEffect(() => {
    if (!currentStep) return
    const label = currentStep.label.toLowerCase()
    if (label.includes("search")) setActiveView("search")
    else if (label.includes("exec") || label.includes("command") || label.includes("extract")) setActiveView("terminal")
    else setActiveView("browser")
  }, [currentStep?.id, currentStep?.label])

  const completedSteps = steps.filter((s) => s.status === "done").length
  const progress = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0

  const lastNav = run?.logs
    ?.filter((l) => l.type === "action" && l.message.includes("Navigating"))
    .pop()?.message
  const urlDisplay = lastNav?.replace(/^Navigating Chrome to:\s*/i, "").trim() ?? "about:blank"

  return (
    <div style={{
      width: 500, flexShrink: 0,
      background: "#fff",
      borderLeft: "1px solid #e5e5e2",
      display: "flex", flexDirection: "column",
      height: "100vh",
    }}>
      <div style={{
        padding: "13px 16px",
        borderBottom: "1px solid #e5e5e2",
        display: "flex", alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontWeight: 600, fontSize: 14, color: "#111",
          fontFamily: "'Inter', sans-serif",
        }}>FlowOS&apos;s Computer</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" style={{
            background: "none", border: "none",
            cursor: "pointer", color: "#bbb", fontSize: 18, padding: 4,
          }}>⊟</button>
          <button type="button" style={{
            background: "none", border: "none",
            cursor: "pointer", color: "#bbb", fontSize: 18, padding: 4,
          }}>⊞</button>
          <button type="button" onClick={onClose} style={{
            background: "none", border: "none",
            cursor: "pointer", color: "#bbb", fontSize: 18, padding: 4,
          }}>✕</button>
        </div>
      </div>

      <div style={{
        padding: "8px 16px",
        borderBottom: "1px solid #f0f0ee",
        display: "flex", alignItems: "center", gap: 8,
        background: "#fafaf8",
      }}>
        <span style={{ fontSize: 13 }}>
          {activeView === "terminal" ? "⌨" : activeView === "search" ? "🔍" : "🌐"}
        </span>
        <span style={{
          fontSize: 12, color: "#666",
          fontFamily: "'Inter', sans-serif",
        }}>
          FlowOS is using {activeView === "terminal" ? "Terminal" : activeView === "search" ? "Search" : "Browser"}
        </span>
        <span style={{
          fontSize: 11, color: "#999", flex: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          · {currentStep?.label ?? "Starting..."}
        </span>
      </div>

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {activeView === "terminal" ? (
          <div style={{
            background: "#1a1a1a", height: "100%",
            padding: 16, overflow: "auto",
            fontFamily: "ui-monospace, monospace",
          }}>
            <div style={{ color: "#888", fontSize: 11, marginBottom: 8 }}>research_session</div>
            <div style={{ color: "#4af", fontSize: 12 }}>ubuntu@sandbox:~$</div>
            <div style={{ color: "#fff", fontSize: 12, marginTop: 4, lineHeight: 1.8 }}>
              {run?.logs?.filter((l) => l.type === "action").slice(-3).map((l, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  <span style={{ color: "#888" }}>{l.message}</span>
                </div>
              )) ?? (
                <span style={{ color: "#888" }}>Initialising sandbox...</span>
              )}
            </div>
            <div style={{ color: "#4af", fontSize: 12, marginTop: 8 }}>
              ubuntu@sandbox:~$ <span style={{ animation: "blink 1s step-end infinite" }}>▌</span>
            </div>
          </div>
        ) : activeView === "search" ? (
          <div style={{ background: "#fff", height: "100%", overflow: "auto", padding: 16 }}>
            <div style={{
              textAlign: "center", color: "#999",
              fontFamily: "'Inter', sans-serif",
              fontSize: 13, marginBottom: 16,
            }}>Search</div>
            {[
              { title: "Latest results for your query", snippet: "FlowOS is searching and analysing relevant sources in real time to compile accurate results for your request..." },
              { title: "Processing search results", snippet: "Extracting key data points, filtering by relevance, and synthesising information from multiple authoritative sources..." },
              { title: "Building your report", snippet: "Organising findings into a structured format with citations and actionable insights..." },
            ].map((r, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: "50%",
                    background: "#e8f0fe", fontSize: 9,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>🌐</span>
                  <span style={{
                    fontSize: 13, color: "#1a0dab",
                    fontWeight: 500, fontFamily: "'Inter', sans-serif",
                  }}>{r.title}</span>
                </div>
                <p style={{
                  fontSize: 12, color: "#666",
                  lineHeight: 1.5, marginLeft: 24,
                  fontFamily: "'Inter', sans-serif",
                }}>{r.snippet}</p>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{
              background: "#f5f5f3", padding: "8px 12px",
              borderBottom: "1px solid #e0e0de",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ display: "flex", gap: 4 }}>
                {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                  <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
                ))}
              </div>
              <div style={{
                flex: 1, background: "#fff", border: "1px solid #e0e0de",
                borderRadius: 6, padding: "4px 10px",
                fontSize: 11, color: "#666",
                fontFamily: "'Inter', sans-serif",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {urlDisplay}
              </div>
            </div>

            <div style={{
              flex: 1, background: "#f0f0ee",
              display: "flex", alignItems: "center",
              justifyContent: "center", overflow: "hidden",
              position: "relative",
            }}>
              {run?.streamUrl && ["running", "starting", "queued"].includes(run.status) ? (
                <iframe
                  src={run.streamUrl}
                  title="E2B Desktop stream"
                  style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                  allow="fullscreen"
                />
              ) : run?.status === "running" || run?.status === "starting" || run?.status === "queued" ? (
                <div style={{ textAlign: "center", padding: 24 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    border: "3px solid #4285f4",
                    borderTopColor: "transparent",
                    animation: "spin 0.8s linear infinite",
                    margin: "0 auto 16px",
                  }} />
                  <div style={{
                    fontSize: 13, color: "#666",
                    fontFamily: "'Inter', sans-serif",
                  }}>
                    {currentStep?.label ?? "Loading..."}
                  </div>
                </div>
              ) : (
                <div style={{
                  background: "#1a3a5c", width: "100%", height: "100%",
                  display: "flex", alignItems: "center",
                  justifyContent: "center", color: "#fff",
                  textAlign: "center", padding: 24,
                }}>
                  <div>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Task Complete</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
                      Results available in chat
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{
        padding: "10px 16px",
        borderTop: "1px solid #f0f0ee",
        background: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <button type="button" style={{ background: "none", border: "none", cursor: "pointer", color: "#bbb", fontSize: 16 }}>⏮</button>
          <button type="button" style={{ background: "none", border: "none", cursor: "pointer", color: "#bbb", fontSize: 16 }}>⏭</button>
          <div style={{
            flex: 1, height: 4, background: "#f0f0ee",
            borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", width: `${progress}%`,
              background: "#4285f4", borderRadius: 2,
              transition: "width 0.5s ease",
            }} />
          </div>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: run?.status === "completed" ? "#34a853" : "#4285f4",
            display: "inline-block",
            animation: run?.status !== "completed" ? "pulse 1.4s ease-in-out infinite" : "none",
          }} />
          <span style={{
            fontSize: 12, color: "#333", fontWeight: 500,
            fontFamily: "'Inter', sans-serif",
          }}>
            {run?.status === "completed" ? "done" : "live"}
          </span>
        </div>

        {currentStep && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#f5f5f3", borderRadius: 8, padding: "8px 12px",
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: run?.status === "completed" ? "#34a853" : "#4285f4",
              flexShrink: 0,
              animation: run?.status !== "completed" ? "pulse 1.4s ease-in-out infinite" : "none",
            }} />
            <span style={{
              fontSize: 12, color: "#333", flex: 1,
              overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "'Inter', sans-serif",
            }}>
              {currentStep.label}
            </span>
            <span style={{ fontSize: 11, color: "#bbb", fontFamily: "'Inter', sans-serif" }}>
              {completedSteps}/{steps.length}
            </span>
            <button type="button" style={{ background: "none", border: "none", cursor: "pointer", color: "#bbb", fontSize: 14 }}>∧</button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onStepToggle,
  onFollowUp,
  onLaunchBrain,
  launchingBrain,
}: {
  msg: TaskMessage
  onStepToggle: (msgId: string, stepId: string) => void
  onFollowUp: (text: string) => void
  onLaunchBrain: (brain: Brain, userGoal?: string) => void
  launchingBrain: string | null
}) {
  const router = useRouter()
  const [rating, setRating] = useState(0)

  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <div style={{
          background: "#fff", border: "1px solid #e5e5e2",
          borderRadius: "18px 18px 4px 18px",
          padding: "12px 18px", maxWidth: "75%",
          fontSize: 14, color: "#111", lineHeight: 1.6,
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          fontFamily: "'Inter', sans-serif",
        }}>
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: "flex", alignItems: "center",
        gap: 8, marginBottom: 10,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: "#111", display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: 12,
        }}>⚡</div>
        <span style={{
          fontWeight: 600, fontSize: 13, color: "#111",
          fontFamily: "'Inter', sans-serif",
        }}>flowos</span>
        <span style={{
          background: "#f0f0ee", color: "#666",
          padding: "1px 6px", borderRadius: 4, fontSize: 10,
          fontFamily: "'Inter', sans-serif",
        }}>Jarvis</span>
        <span style={{
          color: "#bbb", fontSize: 11,
          fontFamily: "'Inter', sans-serif",
        }}>
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <p style={{
        fontSize: 14, color: "#333", lineHeight: 1.7,
        marginBottom: msg.executionSteps ? 12 : 0,
        fontFamily: "'Inter', sans-serif",
        whiteSpace: "pre-wrap",
      }}>
        {msg.content}
      </p>

      {msg.executionSteps && msg.executionSteps.length > 0 && (
        <StepTracker
          steps={msg.executionSteps}
          onToggle={(stepId) => onStepToggle(msg.id, stepId)}
        />
      )}

      {msg.executionSteps &&
        !msg.executionDone &&
        msg.executionSteps.some((s) => s.status === "running") && (
        <div style={{
          display: "flex", alignItems: "center",
          gap: 8, marginTop: 8,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: "#4285f4", display: "block",
            animation: "pulse 1.4s ease-in-out infinite",
          }} />
          <span style={{
            fontSize: 13, color: "#888",
            fontFamily: "'Inter', sans-serif",
          }}>Thinking</span>
        </div>
      )}

      {msg.brainSuggestion && !msg.executionSteps && (
        <div style={{
          background: "#fff", border: "1px solid #e5e5e2",
          borderRadius: 12, overflow: "hidden",
          boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
          marginTop: 12,
        }}>
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid #f0f0ee",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>{msg.brainSuggestion.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{
                fontWeight: 600, fontSize: 14, color: "#111",
                fontFamily: "'Inter', sans-serif",
              }}>
                {msg.brainSuggestion.name}
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>
                ⏱ {msg.brainSuggestion.estimatedTime}
                {" · "}⭐ {msg.brainSuggestion.rating}
                {" · "}{msg.brainSuggestion.installs.toLocaleString()} runs
              </div>
            </div>
            <span style={{ fontSize: 11, color: "#bbb" }}>···</span>
          </div>
          <div style={{ padding: "12px 16px 14px" }}>
            <p style={{
              fontSize: 13, color: "#666",
              lineHeight: 1.6, marginBottom: 12,
              fontFamily: "'Inter', sans-serif",
            }}>
              {msg.brainSuggestion.description}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void onLaunchBrain(msg.brainSuggestion!)}
                disabled={launchingBrain !== null}
                style={{
                  flex: 1, background: launchingBrain ? "#f0f0ee" : "#111",
                  border: "none", borderRadius: 8,
                  color: launchingBrain ? "#888" : "#fff",
                  padding: "9px", fontSize: 13,
                  fontWeight: 600, cursor: launchingBrain ? "not-allowed" : "pointer",
                  fontFamily: "'Inter', sans-serif",
                  transition: "all 0.2s",
                }}
              >
                {launchingBrain === msg.brainSuggestion.id
                  ? "⚡ Launching..."
                  : "▶ Run this Brain"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/marketplace")}
                style={{
                  background: "#f5f5f3", border: "1px solid #e0e0de",
                  borderRadius: 8, padding: "9px 16px",
                  fontSize: 13, color: "#555", cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                View →
              </button>
            </div>
          </div>
        </div>
      )}

      {msg.result && (
        <div style={{
          background: "#fff", border: "1px solid #e5e5e2",
          borderRadius: 12, overflow: "hidden",
          boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
          marginTop: 12,
        }}>
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid #f0f0ee",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>📄</span>
            <span style={{
              fontWeight: 500, fontSize: 13,
              color: "#111", flex: 1,
              overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "'Inter', sans-serif",
            }}>
              Results — {new Date(msg.timestamp).toLocaleDateString()}
            </span>
            <button type="button" style={{
              background: "none", border: "none",
              cursor: "pointer", color: "#bbb", fontSize: 16,
            }}>···</button>
          </div>

          <div style={{ padding: "14px 16px", maxHeight: 340, overflow: "auto" }}>
            <MarkdownResult content={msg.result} />
          </div>

          <div style={{
            padding: "8px 16px",
            borderTop: "1px solid #f0f0ee",
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            background: "#fafaf8",
          }}>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(msg.result!)}
              style={{
                background: "none", border: "none",
                cursor: "pointer", color: "#999",
                fontSize: 12, display: "flex",
                alignItems: "center", gap: 4,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              📋 Copy
            </button>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([msg.result!], { type: "text/plain" })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = "results.txt"
                a.click()
                URL.revokeObjectURL(url)
              }}
              style={{
                background: "none", border: "none",
                cursor: "pointer", color: "#999",
                fontSize: 12, fontFamily: "'Inter', sans-serif",
              }}
            >
              ⬇ Download
            </button>
          </div>
        </div>
      )}

      {msg.executionDone && (
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", marginTop: 16,
        }}>
          <span style={{
            color: "#34a853", fontSize: 13,
            fontWeight: 500, fontFamily: "'Inter', sans-serif",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            ✓ Task completed
          </span>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#f5f5f3", padding: "6px 14px",
            borderRadius: 20, border: "1px solid #e5e5e2",
          }}>
            <span style={{
              fontSize: 12, color: "#888",
              fontFamily: "'Inter', sans-serif",
            }}>
              How was this result?
            </span>
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} type="button" onClick={() => setRating(s)} style={{
                background: "none", border: "none",
                cursor: "pointer", fontSize: 14, padding: 0,
                color: s <= rating ? "#f59e0b" : "#ddd",
                transition: "color 0.15s",
              }}>★</button>
            ))}
          </div>
        </div>
      )}

      {msg.followUps && msg.followUps.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{
            fontSize: 12, color: "#999", marginBottom: 8,
            fontFamily: "'Inter', sans-serif",
          }}>
            Suggested follow-ups
          </p>
          {msg.followUps.map((fu, i) => (
            <button
              key={i}
              type="button"
              onClick={() => void onFollowUp(fu)}
              style={{
                width: "100%",
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 10,
                background: "#fff", border: "1px solid #e5e5e2",
                cursor: "pointer", marginBottom: 6,
                textAlign: "left", transition: "all 0.15s",
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
              <span style={{ fontSize: 14, flexShrink: 0 }}>
                {i === 0 ? "📄" : i === 1 ? "🎞️" : "🏛️"}
              </span>
              <span style={{
                fontSize: 13, color: "#333", flex: 1,
                fontFamily: "'Inter', sans-serif",
              }}>{fu}</span>
              <span style={{ color: "#bbb", fontSize: 14 }}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Build execution steps from run logs ───────────────────────────────────────

function buildStepsFromRun(run: Run): ExecutionStep[] {
  const steps: ExecutionStep[] = []
  const logs = run.logs ?? []

  if (logs.some((l) => l.type === "system" && /ready|sandbox|Desktop/i.test(l.message))) {
    steps.push({
      id: "setup",
      icon: "⚙",
      label: "Setting up cloud sandbox",
      status: "done",
    })
  }

  const navigateLogs = logs.filter(
    (l) =>
      l.type === "action" &&
      (l.message.includes("Navigating") || l.message.includes("Chrome")),
  )
  const aiLogs = logs.filter((l) => l.type === "ai")

  const active = run.status === "running" || run.status === "starting" || run.status === "queued"

  if (navigateLogs.length > 0) {
    steps.push({
      id: "research",
      icon: "🔍",
      label: "Researching across sources",
      status:
        run.status === "completed" || run.status === "failed"
          ? "done"
          : active
            ? "running"
            : "pending",
      subSteps: navigateLogs.slice(0, 4).map((l) => l.message.slice(0, 72)),
      expanded: false,
    })
  }

  if (aiLogs.length > 0 || run.status === "running") {
    steps.push({
      id: "analyse",
      icon: "🧠",
      label: "Analysing and synthesising findings",
      status:
        run.status === "completed" || run.status === "failed"
          ? "done"
          : run.status === "running" && aiLogs.length > 0
            ? "running"
            : "pending",
      subSteps: aiLogs.slice(0, 3).map((l) => l.message.slice(0, 72)),
      expanded: false,
    })
  }

  if (run.status === "completed") {
    steps.push({
      id: "compile",
      icon: "📄",
      label: "Compiling and delivering report",
      status: "done",
    })
  }

  if (steps.length === 0 && (run.status === "running" || run.status === "starting" || run.status === "queued")) {
    steps.push({
      id: "setup",
      icon: "⚙",
      label: "Setting up cloud sandbox",
      status: "running",
    })
  }

  return steps
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  return (
    <Suspense fallback={(
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#fafaf8", color: "#999", fontSize: 14,
      }}
      >
        Loading chat…
      </div>
    )}
    >
      <ChatPageInner />
    </Suspense>
  )
}

function ChatPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session") ?? "default"

  const [messages, setMessages] = useState<TaskMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [launchingBrain, setLaunchingBrain] = useState<string | null>(null)
  const [showComputer, setShowComputer] = useState(false)
  const [activeRun, setActiveRun] = useState<Run | null>(null)
  const [activeSteps, setActiveSteps] = useState<ExecutionStep[]>([])
  const [showTools, setShowTools] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMessages([])
    const load = async () => {
      try {
        const res = await fetch(
          `/api/jarvis?userId=${encodeURIComponent(DEMO_USER_ID)}&sessionId=${encodeURIComponent(sessionId)}`,
        )
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setMessages(
            data.map((row: Record<string, unknown>) => ({
              id: String(row.id),
              role: row.role as TaskMessage["role"],
              content: String(row.content ?? ""),
              timestamp: String(row.created_at ?? row.timestamp ?? new Date().toISOString()),
              runId: row.run_id != null ? String(row.run_id) : undefined,
              brainSuggestion: row.brain_suggestion as Brain | undefined,
            })),
          )
        } else {
          setMessages([])
        }
      } catch {
        setMessages([])
      }
    }
    void load()
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const pollRun = useCallback((runId: string, jarvisMsgId: string) => {
    const tick = async () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
      try {
        const res = await fetch(`/api/sandbox?runId=${encodeURIComponent(runId)}`)
        if (!res.ok) return
        const run = (await res.json()) as Run
        setActiveRun(run)

        const steps = buildStepsFromRun(run)
        setActiveSteps(steps)

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== jarvisMsgId) return m
            const merged: TaskMessage = {
              ...m,
              executionSteps: steps.map((s) => ({
                ...s,
                expanded: m.executionSteps?.find((es) => es.id === s.id)?.expanded ?? false,
              })),
              executionDone: run.status === "completed" || run.status === "failed",
              result:
                run.status === "completed" ? runResultText(run) : undefined,
              followUps:
                run.status === "completed"
                  ? [
                      "Summarise the key findings from this report in 3 bullet points.",
                      "Create a presentation script based on these results.",
                      "What are the next steps I should take based on this research?",
                    ]
                  : undefined,
            }
            if (run.status === "failed") {
              merged.content = `${m.content}\n\nThe run stopped with an error. You can try again from the brain card.`
            }
            return merged
          }),
        )

        if (
          run.status === "running" ||
          run.status === "starting" ||
          run.status === "queued"
        ) {
          pollTimerRef.current = setTimeout(() => void tick(), 2500)
        }
      } catch {
        /* ignore */
      }
    }
    void tick()
  }, [])

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [])

  const sendMessage = async (text?: string) => {
    const content = text ?? input.trim()
    if (!content || loading) return
    setInput("")
    setShowTools(false)

    const userMsg: TaskMessage = {
      id: uuidv4(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch("/api/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, userId: DEMO_USER_ID, sessionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Request failed")
      }
      setMessages((prev) => [...prev, data as TaskMessage])
      window.dispatchEvent(new Event(SESSIONS_REFRESH_EVENT))
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: "jarvis",
          content: "Something went wrong. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const launchBrain = async (brain: Brain, userGoal?: string) => {
    setLaunchingBrain(brain.id)
    setShowComputer(true)

    const lastUserMessage = messages
      .filter((m) => m.role === "user")
      .pop()?.content ?? ""

    const autoInputs: Record<string, string> = {}

    if (lastUserMessage || userGoal) {
      const text = userGoal ?? lastUserMessage
      const firstInput = brain.inputs[0]
      if (firstInput) {
        autoInputs[firstInput.key] = text
      }
      autoInputs.query = text
      autoInputs.user_goal = text
    }

    const execMsgId = uuidv4()
    const execMsg: TaskMessage = {
      id: execMsgId,
      role: "jarvis",
      content: `I will research: "${(userGoal ?? lastUserMessage).slice(0, 100)}${(userGoal ?? lastUserMessage).length > 100 ? "…" : ""}"`,
      timestamp: new Date().toISOString(),
      executionSteps: [
        { id: "setup", icon: "⚙", label: "Setting up cloud sandbox", status: "running" },
      ],
      executionDone: false,
    }
    setMessages((prev) => [...prev, execMsg])

    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brainId: brain.id,
          inputs: autoInputs,
          userId: DEMO_USER_ID,
        }),
      })
      const data = (await res.json()) as { runId?: string; error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "Launch failed")
      }
      const { runId } = data
      if (runId) {
        setTimeout(() => pollRun(runId, execMsgId), 800)
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === execMsgId
            ? {
                ...m,
                content: "Failed to launch. Please try again.",
                executionSteps: undefined,
                executionDone: true,
              }
            : m,
        ),
      )
    } finally {
      setLaunchingBrain(null)
    }
  }

  const handleStepToggle = (msgId: string, stepId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m
        return {
          ...m,
          executionSteps: m.executionSteps?.map((s) =>
            s.id === stepId ? { ...s, expanded: !s.expanded } : s,
          ),
        }
      }),
    )
    setActiveSteps((prev) =>
      prev.map((s) =>
        s.id === stepId ? { ...s, expanded: !s.expanded } : s,
      ),
    )
  }

  const handleClear = async () => {
    try {
      await fetch(
        `/api/jarvis?userId=${encodeURIComponent(DEMO_USER_ID)}&sessionId=${encodeURIComponent(sessionId)}`,
        { method: "DELETE" },
      )
    } catch {
      /* ignore */
    }
    setMessages([])
    setActiveRun(null)
    setActiveSteps([])
    setShowComputer(false)
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    window.dispatchEvent(new Event(SESSIONS_REFRESH_EVENT))
  }

  const isEmpty = messages.length === 0
  const hasRunning = messages.some((m) => m.executionSteps && !m.executionDone)

  return (
    <div style={{
      flex: 1, display: "flex",
      height: "100vh", overflow: "hidden",
      background: "#fafaf8",
    }}>
      <div style={{
        flex: 1, display: "flex",
        flexDirection: "column", overflow: "hidden", minWidth: 0,
      }}>
        <div style={{
          padding: "13px 24px",
          borderBottom: "1px solid #e5e5e2",
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          background: "#fafaf8", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 15, fontWeight: 500, color: "#111",
              fontFamily: "'Inter', sans-serif",
            }}>FlowOS</span>
            <span style={{
              background: "#f0f0ee", color: "#666",
              padding: "2px 8px", borderRadius: 4, fontSize: 11,
              fontFamily: "'Inter', sans-serif",
              cursor: "pointer",
            }}>Jarvis ⌄</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {hasRunning && (
              <button
                type="button"
                onClick={() => setShowComputer(!showComputer)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: showComputer ? "#e8f0fe" : "#f5f5f3",
                  border: `1px solid ${showComputer ? "#4285f4" : "#e0e0de"}`,
                  color: showComputer ? "#4285f4" : "#555",
                  padding: "6px 14px", borderRadius: 8,
                  cursor: "pointer", fontSize: 13,
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 500,
                }}
              >
                🖥 {showComputer ? "Hide Computer" : "Watch Live"}
              </button>
            )}
            {!isEmpty && (
              <button
                type="button"
                onClick={() => void handleClear()}
                style={{
                  background: "none", border: "1px solid #e0e0de",
                  color: "#999", padding: "6px 12px", borderRadius: 8,
                  cursor: "pointer", fontSize: 12,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                ✕ Clear
              </button>
            )}
            <button type="button" style={{
              background: "#111", border: "none",
              color: "#fff", padding: "6px 14px",
              borderRadius: 8, cursor: "pointer",
              fontSize: 13, fontFamily: "'Inter', sans-serif",
            }}>
              ✦ Upgrade
            </button>
            <button type="button" style={{
              background: "none", border: "1px solid #e0e0de",
              color: "#555", padding: "6px 14px", borderRadius: 8,
              cursor: "pointer",
              fontSize: 13, fontFamily: "'Inter', sans-serif",
            }}>
              ↗ Share
            </button>
            <button type="button" style={{
              background: "none", border: "none",
              cursor: "pointer", color: "#bbb", fontSize: 20,
            }}>···</button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {isEmpty ? (
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              minHeight: "100%", padding: "40px 24px",
            }}>
              <div style={{
                display: "flex", gap: 8, marginBottom: 28,
                alignItems: "center",
              }}>
                <span style={{
                  background: "#f0f0ee", color: "#888",
                  padding: "4px 12px", borderRadius: 20, fontSize: 12,
                  fontFamily: "'Inter', sans-serif",
                }}>Free plan</span>
                <button type="button" style={{
                  background: "none", border: "none",
                  color: "#4285f4", fontSize: 12,
                  cursor: "pointer", fontWeight: 600,
                  fontFamily: "'Inter', sans-serif",
                }}>Upgrade</button>
              </div>

              <h1 style={{
                fontFamily: "'Georgia', serif",
                fontSize: 40, fontWeight: 400,
                color: "#111", marginBottom: 32,
                textAlign: "center", letterSpacing: -0.5,
              }}>
                What can I do for you?
              </h1>

              <div style={{
                width: "100%", maxWidth: 660,
                background: "#fff", border: "1px solid #e0e0de",
                borderRadius: 16, padding: "16px 16px 12px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 20,
              }}>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void sendMessage()
                    }
                  }}
                  placeholder="What do you want FlowOS to do?"
                  rows={3}
                  style={{
                    width: "100%", border: "none", outline: "none",
                    resize: "none", fontSize: 15, color: "#333",
                    background: "transparent", lineHeight: 1.6,
                    boxSizing: "border-box", fontFamily: "'Inter', sans-serif",
                  }}
                />
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginTop: 8,
                }}>
                  <div style={{ display: "flex", gap: 6, position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => setShowTools(!showTools)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "#aaa", fontSize: 22, padding: 4,
                      }}
                    >+</button>
                    <button type="button" style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "#aaa", fontSize: 16, padding: 4,
                    }}>⚙</button>
                    {showTools && (
                      <div style={{
                        position: "absolute", bottom: "100%", left: 0,
                        background: "#fff", border: "1px solid #e0e0de",
                        borderRadius: 12, padding: 8,
                        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                        minWidth: 220, zIndex: 100,
                      }}>
                        {[
                          { icon: "🧠", label: "Browse Brains", action: () => router.push("/marketplace") },
                          { icon: "🎨", label: "Add from Figma" },
                          { icon: "☁️", label: "Add from Google Drive" },
                          { icon: "📎", label: "Add local file" },
                        ].map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => item.action?.()}
                            style={{
                              width: "100%", display: "flex", alignItems: "center", gap: 10,
                              padding: "8px 12px", borderRadius: 8, background: "none",
                              border: "none", cursor: "pointer", fontSize: 13, color: "#333",
                              textAlign: "left", fontFamily: "'Inter', sans-serif",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f5f3" }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "none" }}
                          >
                            <span>{item.icon}</span>
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button type="button" style={{
                      background: "none", border: "none",
                      cursor: "pointer", color: "#ccc", fontSize: 18,
                    }}>🎤</button>
                    <button
                      type="button"
                      onClick={() => void sendMessage()}
                      disabled={!input.trim() || loading}
                      style={{
                        width: 36, height: 36,
                        background: input.trim() ? "#111" : "#e0e0de",
                        border: "none", borderRadius: "50%",
                        cursor: input.trim() ? "pointer" : "not-allowed",
                        color: "#fff", fontSize: 18,
                        display: "flex", alignItems: "center",
                        justifyContent: "center", transition: "background 0.2s",
                      }}
                    >↑</button>
                  </div>
                </div>
              </div>

              <div style={{
                display: "flex", gap: 10,
                flexWrap: "wrap", justifyContent: "center", marginBottom: 16,
              }}>
                {[
                  { icon: "🚀", label: "Create pitch deck" },
                  { icon: "💡", label: "Find startup ideas" },
                  { icon: "📊", label: "Market research" },
                  { icon: "🎯", label: "Interview prep" },
                  { icon: "···", label: "More" },
                ].map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => a.label !== "···" && void sendMessage(a.label)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 18px", borderRadius: 20,
                      background: "#fff", border: "1px solid #e0e0de",
                      cursor: "pointer", fontSize: 13, color: "#444",
                      fontFamily: "'Inter', sans-serif",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f5f3" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fff" }}
                  >
                    <span>{a.icon}</span> {a.label}
                  </button>
                ))}
              </div>

              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 16px", borderRadius: 12,
                background: "#fff", border: "1px solid #e0e0de",
                fontSize: 13, color: "#888",
                fontFamily: "'Inter', sans-serif",
              }}>
                <span>⚙</span>
                <span>Connect your tools to FlowOS</span>
                {["M", "📅", "⎇"].map((ic, i) => (
                  <span key={i} style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: "#f0f0ee", fontSize: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{ic}</span>
                ))}
                <span style={{ color: "#ccc" }}>✕</span>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onStepToggle={handleStepToggle}
                  onFollowUp={sendMessage}
                  onLaunchBrain={launchBrain}
                  launchingBrain={launchingBrain}
                />
              ))}

              {loading && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 7,
                      background: "#111", display: "flex",
                      alignItems: "center", justifyContent: "center", fontSize: 12,
                    }}>⚡</div>
                    <span style={{
                      fontWeight: 600, fontSize: 13, color: "#111",
                      fontFamily: "'Inter', sans-serif",
                    }}>flowos</span>
                    <span style={{
                      background: "#f0f0ee", color: "#666",
                      padding: "1px 6px", borderRadius: 4, fontSize: 10,
                    }}>Jarvis</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: "#4285f4", display: "block",
                      animation: "pulse 1.4s ease-in-out infinite",
                    }} />
                    <span style={{
                      fontSize: 13, color: "#888",
                      fontFamily: "'Inter', sans-serif",
                    }}>Thinking</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {!isEmpty && activeSteps.length > 0 && activeRun && (
          <div style={{
            borderTop: "1px solid #e5e5e2",
            background: "#fff", flexShrink: 0,
            padding: "0 24px",
          }}>
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              {(() => {
                const lastStep = activeSteps[activeSteps.length - 1]
                return (
                  <div style={{
                    display: "flex", alignItems: "center",
                    gap: 12, padding: "12px 0",
                  }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 8,
                      background: "#f0f0ee", flexShrink: 0,
                      display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 18,
                      border: "1px solid #e5e5e2",
                    }}>
                      {activeRun.status === "completed" ? "📄" : (
                        <span style={{
                          width: 18, height: 18, borderRadius: "50%",
                          border: "2.5px solid #4285f4",
                          borderTopColor: "transparent",
                          animation: "spin 0.8s linear infinite",
                          display: "block",
                        }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <span style={{
                          color: activeRun.status === "completed" ? "#34a853" : "#4285f4",
                          fontSize: 12,
                        }}>✓</span>
                        <span style={{
                          fontSize: 13, color: "#333",
                          fontFamily: "'Inter', sans-serif",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{lastStep?.label}</span>
                      </div>
                      <span style={{
                        fontSize: 11, color: "#bbb",
                        fontFamily: "'Inter', sans-serif",
                      }}>
                        {activeRun.status === "completed" ? "Completed" : "Running..."}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 12, color: "#bbb",
                      fontFamily: "'Inter', sans-serif", flexShrink: 0,
                    }}>
                      {activeSteps.filter((s) => s.status === "done").length}/{activeSteps.length}
                    </span>
                    <button type="button" style={{
                      background: "none", border: "none",
                      cursor: "pointer", color: "#bbb", fontSize: 14,
                    }}>∧</button>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {!isEmpty && (
          <div style={{
            borderTop: "1px solid #e5e5e2",
            background: "#fafaf8",
            padding: "12px 24px", flexShrink: 0,
          }}>
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              <div style={{
                background: "#fff", border: "1px solid #e0e0de",
                borderRadius: 12, padding: "10px 14px",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void sendMessage()
                    }
                  }}
                  placeholder="Send message to Jarvis"
                  style={{
                    flex: 1, border: "none", outline: "none",
                    fontSize: 14, color: "#333", background: "transparent",
                    fontFamily: "'Inter', sans-serif",
                  }}
                />
                <button type="button" style={{
                  background: "none", border: "none",
                  cursor: "pointer", color: "#ccc", fontSize: 20,
                }}>+</button>
                <button type="button" style={{
                  background: "none", border: "none",
                  cursor: "pointer", color: "#ccc", fontSize: 16,
                }}>⚙</button>
                <button type="button" style={{
                  background: "none", border: "none",
                  cursor: "pointer", color: "#ccc", fontSize: 18,
                }}>🎤</button>
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={!input.trim() || loading}
                  style={{
                    width: 32, height: 32,
                    background: input.trim() ? "#111" : "#e0e0de",
                    border: "none", borderRadius: "50%",
                    cursor: input.trim() ? "pointer" : "not-allowed",
                    color: "#fff", fontSize: 16,
                    display: "flex", alignItems: "center",
                    justifyContent: "center", transition: "background 0.2s",
                  }}
                >↑</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showComputer && (
        <ComputerPanel
          run={activeRun}
          steps={activeSteps}
          onClose={() => setShowComputer(false)}
        />
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
