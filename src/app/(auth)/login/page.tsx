"use client"

import { useState } from "react"
import { createBrowserClient } from "@supabase/ssr"

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  const signInWithGoogle = async () => {
    setLoading(true)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (oauthError) setError(oauthError.message)
    setLoading(false)
  }

  const signInWithEmail = async () => {
    if (!email.trim()) return
    setLoading(true)
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (otpError) {
      setError(otpError.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#fafaf8",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        background: "#fff",
        border: "1px solid #e5e5e2",
        borderRadius: 20,
        padding: "40px 36px",
        maxWidth: 420,
        width: "100%",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 36, height: 36,
            background: "#111", borderRadius: 10,
            display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 18,
          }}>⚡</div>
          <span style={{
            fontFamily: "'Georgia', serif",
            fontWeight: 700, fontSize: 22, color: "#111",
          }}>flowos</span>
        </div>

        <h1 style={{
          fontFamily: "'Georgia', serif",
          fontSize: 26, fontWeight: 400,
          color: "#111", marginBottom: 8,
        }}>
          Welcome to FlowOS
        </h1>
        <p style={{ color: "#999", fontSize: 14, marginBottom: 8 }}>
          Your autonomous AI research agent
        </p>
        <div style={{
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          color: "#16a34a",
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <span>🎁</span>
          <span>Free — 10 runs every 6 hours</span>
        </div>

        {error && (
          <div style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            color: "#dc2626",
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {sent ? (
          <div style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 12,
            padding: 20,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
            <div style={{ fontWeight: 600, color: "#111", marginBottom: 6 }}>
              Check your email
            </div>
            <div style={{ color: "#666", fontSize: 13 }}>
              Magic link sent to {email}
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              disabled={loading}
              style={{
                width: "100%",
                background: "#fff",
                border: "1px solid #e0e0de",
                borderRadius: 12,
                padding: "12px",
                fontSize: 15,
                fontWeight: 500,
                cursor: "pointer",
                color: "#333",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                marginBottom: 16,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#fafaf8" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#fff" }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" />
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.76-2.7.76-2.07 0-3.82-1.4-4.45-3.28H1.86v2.07A8 8 0 0 0 8.98 17z" />
                <path fill="#FBBC05" d="M4.53 10.53c-.16-.48-.25-.99-.25-1.53s.09-1.05.25-1.53V5.4H1.86A8 8 0 0 0 .98 9c0 1.29.31 2.51.88 3.6l2.67-2.07z" />
                <path fill="#EA4335" d="M8.98 3.58c1.16 0 2.2.4 3.02 1.19l2.26-2.26A8 8 0 0 0 8.98 1a8 8 0 0 0-7.12 4.4l2.67 2.07c.63-1.88 2.38-3.28 4.45-3.28v.39z" />
              </svg>
              Continue with Google
            </button>

            <div style={{
              display: "flex", alignItems: "center",
              gap: 12, marginBottom: 16,
            }}>
              <div style={{ flex: 1, height: 1, background: "#e5e5e2" }} />
              <span style={{ color: "#bbb", fontSize: 12 }}>or</span>
              <div style={{ flex: 1, height: 1, background: "#e5e5e2" }} />
            </div>

            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void signInWithEmail()}
              placeholder="your@email.com"
              type="email"
              style={{
                width: "100%",
                background: "#fafaf8",
                border: "1px solid #e0e0de",
                borderRadius: 10,
                padding: "11px 14px",
                fontSize: 14,
                color: "#333",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 10,
              }}
              onFocus={(e) => { e.target.style.borderColor = "#111" }}
              onBlur={(e) => { e.target.style.borderColor = "#e0e0de" }}
            />
            <button
              type="button"
              onClick={() => void signInWithEmail()}
              disabled={!email.trim() || loading}
              style={{
                width: "100%",
                background: email.trim() ? "#111" : "#e0e0de",
                border: "none",
                borderRadius: 10,
                padding: "12px",
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                cursor: email.trim() ? "pointer" : "not-allowed",
                transition: "background 0.2s",
              }}
            >
              {loading ? "Sending..." : "Continue with Email"}
            </button>
          </>
        )}

        <p style={{
          color: "#bbb",
          fontSize: 11,
          textAlign: "center",
          marginTop: 20,
          lineHeight: 1.6,
        }}>
          By continuing you agree to our Terms of Service
        </p>
      </div>
    </div>
  )
}
