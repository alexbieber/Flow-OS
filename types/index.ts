export type BrainCategory =
  | "Research & Intelligence"
  | "Business & Finance"
  | "Jobs & Career"
  | "Social Media"
  | "Travel"
  | "Finance"
  | "Healthcare"
  | "Legal"
  | "Education"

export type StepAction =
  | "navigate"
  | "click"
  | "type"
  | "wait"
  | "scroll"
  | "loop"
  | "ai_handle"
  | "extract"
  | "notify"
  | "fill_from_vault"

export interface BrainStep {
  id: string
  action: StepAction
  selector?: string
  value?: string
  url?: string
  instruction?: string
  max?: number
  steps?: BrainStep[]
  timeout?: number
}

export interface BrainInput {
  key: string
  label: string
  placeholder: string
  type: "text" | "url" | "number" | "password" | "textarea"
  required: boolean
  vaultKey?: string
}

export interface Brain {
  id: string
  name: string
  description: string
  author: string
  category: BrainCategory
  icon: string
  version: string
  verified: boolean
  trending: boolean
  featured: boolean
  installs: number
  rating: number
  reviews: number
  estimatedTime: string
  tags: string[]
  inputs: BrainInput[]
  steps: BrainStep[]
  createdAt: string
  updatedAt: string
}

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
  data?: Record<string, any>
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
  brainSuggestion?: Brain
}

export interface AIScreenAnalysis {
  observation: string
  action: string
  selector?: string
  value?: string
  confidence: number
  reasoning: string
}
