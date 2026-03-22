"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { DEMO_USER_ID, SESSIONS_REFRESH_EVENT } from "@/lib/constants/demo-user"

interface Session {
  sessionId: string
  title: string
  createdAt: string
}

function SidebarWithNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSession = searchParams.get("session") ?? "default"
  const [sessions, setSessions] = useState<Session[]>([])

  const loadSessions = useCallback(() => {
    void fetch(`/api/sessions?userId=${encodeURIComponent(DEMO_USER_ID)}`)
      .then((r) => r.json())
      .then((data: unknown) => {
        setSessions(Array.isArray(data) ? (data as Session[]) : [])
      })
      .catch(() => setSessions([]))
  }, [])

  useEffect(() => {
    loadSessions()
  }, [pathname, searchParams, loadSessions])

  useEffect(() => {
    const onRefresh = () => loadSessions()
    window.addEventListener(SESSIONS_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(SESSIONS_REFRESH_EVENT, onRefresh)
  }, [loadSessions])

  const handleNewTask = () => {
    router.push(`/chat?session=${crypto.randomUUID()}`)
  }

  return (
    <>
      <div style={{
        width: 260,
        background: "#f5f5f3",
        borderRight: "1px solid #e5e5e2",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        flexShrink: 0,
      }}>
        <div style={{
          padding: "18px 20px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <button
            type="button"
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: "none", border: "none", padding: 0 }}
            onClick={() => router.push("/chat")}
          >
            <div style={{
              width: 28, height: 28, background: "#111",
              borderRadius: 8, display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: 14,
            }}>⚡</div>
            <span style={{
              fontFamily: "'Georgia', serif",
              fontWeight: 700, fontSize: 18, color: "#111",
            }}>flowos</span>
          </button>
          <button type="button" style={{
            background: "none", border: "none",
            cursor: "pointer", color: "#aaa", fontSize: 18, padding: 4,
          }}>⊟</button>
        </div>

        <div style={{ padding: "4px 12px 8px" }}>
          <button
            type="button"
            onClick={handleNewTask}
            style={{
              width: "100%",
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 8,
              background: "rgba(0,0,0,0.04)",
              border: "none", cursor: "pointer",
              fontSize: 14, color: "#333",
              fontFamily: "'Inter', sans-serif",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.08)" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.04)" }}
          >
            <span style={{ fontSize: 15 }}>✏️</span> New task
          </button>
        </div>

        <div style={{ padding: "0 12px 8px" }}>
          {[
            { path: "/marketplace", icon: "⊙", label: "Brains" },
            { path: "/runs", icon: "◎", label: "My Runs" },
            { path: "/vault", icon: "⊟", label: "Library" },
          ].map((item) => {
            const active = pathname.startsWith(item.path)
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => router.push(item.path)}
                style={{
                  width: "100%",
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 8,
                  background: active ? "rgba(0,0,0,0.07)" : "none",
                  border: "none", cursor: "pointer",
                  fontSize: 14, color: active ? "#111" : "#555",
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: active ? 500 : 400,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.04)" }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "none" }}
              >
                <span style={{ fontSize: 15, width: 18, textAlign: "center" }}>{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </div>

        <div style={{ padding: "8px 12px 4px", flex: 1, overflow: "auto" }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 6, padding: "0 4px",
          }}>
            <span style={{ fontSize: 12, color: "#999" }}>All tasks</span>
            <span style={{ fontSize: 14, color: "#bbb" }}>≡</span>
          </div>

          {sessions.length === 0 && (
            <div style={{
              padding: "20px 10px", textAlign: "center",
              fontSize: 12, color: "#ccc",
            }}>
              No tasks yet.
              <br />
              Click &quot;New task&quot; to start.
            </div>
          )}

          {sessions.map((session) => {
            const isActive = pathname.startsWith("/chat") && currentSession === session.sessionId
            return (
              <button
                key={session.sessionId}
                type="button"
                onClick={() => router.push(`/chat?session=${encodeURIComponent(session.sessionId)}`)}
                style={{
                  width: "100%",
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "7px 10px", borderRadius: 8,
                  background: isActive ? "rgba(0,0,0,0.07)" : "none",
                  border: "none", cursor: "pointer", textAlign: "left",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(0,0,0,0.04)" }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "none" }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: "#e8e8e6", flexShrink: 0,
                  display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 12,
                }}>💬</span>
                <span style={{
                  fontSize: 13, color: "#444", flex: 1,
                  overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {session.title || "(empty)"}
                </span>
              </button>
            )
          })}
        </div>

        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid #e5e5e2",
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "linear-gradient(135deg, #667eea, #764ba2)",
              display: "flex", alignItems: "center",
              justifyContent: "center", color: "#fff",
              fontSize: 12, fontWeight: 700,
            }}>A</div>
            <div>
              <div style={{ fontSize: 12, color: "#333", fontWeight: 500 }}>Ambar</div>
              <div style={{ fontSize: 11, color: "#999" }}>Free · $100 E2B</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["⚙", "⊞"].map((ic) => (
              <button key={ic} type="button" style={{
                background: "none", border: "none",
                cursor: "pointer", color: "#bbb", fontSize: 16, padding: 4,
              }}>{ic}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
        {children}
      </div>
    </>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex",
      height: "100vh",
      overflow: "hidden",
      background: "#fafaf8",
      fontFamily: "'Inter', sans-serif",
    }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <Suspense fallback={(
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div style={{
            width: 260,
            background: "#f5f5f3",
            borderRight: "1px solid #e5e5e2",
            flexShrink: 0,
          }}
          />
          <div style={{ flex: 1, background: "#fafaf8" }} />
        </div>
      )}
      >
        <SidebarWithNav>{children}</SidebarWithNav>
      </Suspense>
    </div>
  )
}
