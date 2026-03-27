export type RunStatus =
  | "queued"
  | "starting"
  | "running"
  | "paused"
  | "completed"
  | "failed"

export interface RunLog {
  timestamp: string
  type: "system" | "action" | "ai" | "success" | "error" | "warning"
  message: string
}

/** brain_* fields mirror DB columns (`brain_id` etc.); used for the built-in research agent. */
export interface Run {
  id: string
  userId: string
  brainId: string
  brainName: string
  brainIcon: string
  status: RunStatus
  progress: number
  totalSteps: number
  currentStep: string
  logs: RunLog[]
  inputs: Record<string, string>
  result?: RunResult
  sandboxId?: string
  /** E2B Desktop noVNC stream URL (read-only viewer) */
  streamUrl?: string
  startedAt: string
  completedAt?: string
  estimatedEta?: string
}

export interface RunResult {
  success: boolean
  summary: string
  data?: Record<string, unknown>
  exportUrl?: string
}

export interface VaultItem {
  key: string
  label: string
  value: string
  encrypted: boolean
}

export interface UserVault {
  userId: string
  items: VaultItem[]
}

export interface JarvisMessage {
  id: string
  role: "user" | "jarvis"
  content: string
  timestamp: string
  runId?: string
}
