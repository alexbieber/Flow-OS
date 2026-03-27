"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"
import { SESSIONS_REFRESH_EVENT } from "@/lib/constants/demo-user"

interface Session {
  sessionId: string
  title: string
  createdAt: string
}

interface FlowosProjectRow {
  id: string
  name: string
  instructions: string
  context: string
  createdAt: string
  updatedAt: string
}

interface UserProfile {
  email: string
  name: string
  avatarLetter: string
  credits: number
  maxCredits: number
  nextRefill: string | null
}

function SidebarWithNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSession = searchParams.get("session") ?? "default"
  const projectParam = searchParams.get("project")
  const [sessions, setSessions] = useState<Session[]>([])
  const [projects, setProjects] = useState<FlowosProjectRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  )

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (!authUser) return

      setUserId(authUser.id)

      const email = authUser.email ?? ""
      const fullName =
        (authUser.user_metadata?.full_name as string | undefined) ??
        (authUser.user_metadata?.name as string | undefined) ??
        email.split("@")[0] ??
        "User"
      const firstName = fullName.split(" ")[0] ?? "User"

      const creditsRes = await fetch("/api/credits")
      const creditsData = creditsRes.ok
        ? ((await creditsRes.json()) as {
            credits: number
            maxCredits?: number
            nextRefill?: string | null
          })
        : { credits: 0, maxCredits: 10, nextRefill: null as string | null }

      setUser({
        email,
        name: firstName,
        avatarLetter: firstName[0]?.toUpperCase() ?? "U",
        credits: creditsData.credits ?? 0,
        maxCredits: creditsData.maxCredits ?? 10,
        nextRefill: creditsData.nextRefill ?? null,
      })
    }
    void loadUser()
  }, [supabase])

  useEffect(() => {
    if (!showUserMenu || !userId) return
    void (async () => {
      const cr = await fetch("/api/credits")
      if (cr.ok) {
        const j = (await cr.json()) as {
          credits: number
          maxCredits?: number
          nextRefill?: string | null
        }
        setUser((p) =>
          p
            ? {
                ...p,
                credits: j.credits,
                maxCredits: j.maxCredits ?? p.maxCredits,
                nextRefill: j.nextRefill ?? null,
              }
            : p
        )
      }
    })()
  }, [showUserMenu, userId])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const chatHref = useCallback(
    (sessionId: string) => {
      const p = new URLSearchParams()
      p.set("session", sessionId)
      if (projectParam) p.set("project", projectParam)
      return `/chat?${p.toString()}`
    },
    [projectParam]
  )

  const loadProjects = useCallback(() => {
    if (!userId) {
      setProjects([])
      return
    }
    void fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        setProjects(Array.isArray(data) ? (data as FlowosProjectRow[]) : [])
      })
      .catch(() => setProjects([]))
  }, [userId])

  const loadSessions = useCallback(() => {
    if (!userId) {
      setSessions([])
      return
    }
    void fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: unknown) => {
        setSessions(Array.isArray(data) ? (data as Session[]) : [])
      })
      .catch(() => setSessions([]))
  }, [userId])

  useEffect(() => {
    queueMicrotask(() => loadSessions())
  }, [pathname, searchParams, loadSessions])

  useEffect(() => {
    queueMicrotask(() => loadProjects())
  }, [pathname, userId, loadProjects])

  useEffect(() => {
    const onRefresh = () => loadSessions()
    window.addEventListener(SESSIONS_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(SESSIONS_REFRESH_EVENT, onRefresh)
  }, [loadSessions])

  const handleNewTask = () => {
    router.push(chatHref(crypto.randomUUID()))
  }

  const maxCredits = user?.maxCredits ?? 10
  const creditPct =
    maxCredits > 0
      ? Math.min(100, ((user?.credits ?? 0) / maxCredits) * 100)
      : 0

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
            onClick={() => {
              router.push(
                projectParam ?
                  `/chat?project=${encodeURIComponent(projectParam)}`
                : "/chat",
              )
            }}
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
            { path: "/projects", icon: "◇", label: "Projects" },
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

        <div style={{ padding: "4px 12px 10px", borderBottom: "1px solid #ecece8" }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 6, padding: "0 4px",
          }}>
            <span style={{ fontSize: 12, color: "#999" }}>Workspace</span>
            <button
              type="button"
              onClick={() => router.push("/projects")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                color: "#4285f4",
                padding: 0,
              }}
            >
              Manage
            </button>
          </div>
          {projectParam && (
            <div
              style={{
                fontSize: 12,
                color: "#555",
                padding: "6px 8px",
                borderRadius: 8,
                background: "rgba(66,133,244,0.08)",
                marginBottom: 6,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={
                projects.find((p) => p.id === projectParam)?.name ?? "Project"
              }
            >
              ◇{" "}
              {projects.find((p) => p.id === projectParam)?.name ?? "Project"}
            </div>
          )}
          {!projectParam && (
            <div style={{ fontSize: 11, color: "#bbb", padding: "2px 4px 6px" }}>
              Open <strong style={{ fontWeight: 500, color: "#888" }}>Projects</strong> and
              use “Open in chat” to attach instructions to Jarvis and runs.
            </div>
          )}
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
                onClick={() => router.push(chatHref(session.sessionId))}
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

        <div style={{ position: "relative" }}>
          {showUserMenu && (
            <div style={{
              position: "absolute",
              bottom: "100%",
              left: 12,
              right: 12,
              background: "#fff",
              border: "1px solid #e5e5e2",
              borderRadius: 10,
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              overflow: "hidden",
              marginBottom: 6,
              zIndex: 50,
            }}>
              <div style={{
                padding: "12px 14px",
                borderBottom: "1px solid #f0f0ee",
              }}>
                <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>Credits remaining</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    flex: 1, height: 5, background: "#f0f0ee", borderRadius: 99,
                  }}>
                    <div style={{
                      width: `${creditPct}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #667eea, #764ba2)",
                      borderRadius: 99,
                      transition: "width 0.4s",
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>
                    {user?.credits ?? 0}/{user?.maxCredits ?? 10}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>
                  {user?.nextRefill
                    ? `Refills ${new Date(user.nextRefill).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Resets every 6 hours"}
                </div>
              </div>

              <div style={{
                padding: "10px 14px",
                borderBottom: "1px solid #f0f0ee",
              }}>
                <div style={{ fontSize: 11, color: "#999" }}>Signed in as</div>
                <div style={{
                  fontSize: 12, color: "#333", marginTop: 2,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {user?.email}
                </div>
              </div>

              <button
                type="button"
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "none", border: "none",
                  cursor: "pointer", textAlign: "left",
                  fontSize: 13, color: "#555",
                  display: "flex", alignItems: "center", gap: 8,
                  borderBottom: "1px solid #f0f0ee",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#fafaf8" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none" }}
              >
                <span>✦</span> Upgrade to Pro
              </button>

              <button
                type="button"
                onClick={() => void handleLogout()}
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "none", border: "none",
                  cursor: "pointer", textAlign: "left",
                  fontSize: 13, color: "#e53e3e",
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#fff5f5" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none" }}
              >
                <span>→</span> Sign out
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowUserMenu((v) => !v)}
            style={{
              width: "100%",
              padding: "12px 16px",
              display: "flex", alignItems: "center",
              justifyContent: "space-between",
              background: showUserMenu ? "rgba(0,0,0,0.03)" : "none",
              border: "none",
              borderTop: "1px solid #e5e5e2",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.03)" }}
            onMouseLeave={(e) => { if (!showUserMenu) e.currentTarget.style.background = "none" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: "linear-gradient(135deg, #667eea, #764ba2)",
                display: "flex", alignItems: "center",
                justifyContent: "center", color: "#fff",
                fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>
                {user?.avatarLetter ?? "?"}
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 12, color: "#333", fontWeight: 500 }}>
                  {user?.name ?? "Loading…"}
                </div>
                <div style={{ fontSize: 11, color: "#999" }}>
                  Free · {user?.credits ?? 0} credits
                </div>
              </div>
            </div>
            <span style={{
              fontSize: 12, color: "#bbb",
              transform: showUserMenu ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              display: "inline-block",
            }}>▲</span>
          </button>
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
