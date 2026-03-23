import { Sandbox } from "e2b"

export async function createTerminalSandbox(): Promise<Sandbox> {
  const sandbox = await Sandbox.create({
    apiKey: process.env.E2B_API_KEY!,
    timeoutMs: 300000,
  })
  await sandbox.commands.run(
    "pip install requests beautifulsoup4 lxml --quiet --break-system-packages",
    { timeoutMs: 60000 }
  )
  return sandbox
}

export async function runCommand(
  sandbox: Sandbox,
  cmd: string,
  timeoutMs = 60000
): Promise<string> {
  try {
    const result = await sandbox.commands.run(cmd, { timeoutMs })
    return (result.stdout ?? "") + (result.stderr ?? "")
  } catch (e: unknown) {
    if (e && typeof e === "object" && "stdout" in e && "stderr" in e) {
      const r = e as { stdout: string; stderr: string }
      return r.stdout + r.stderr
    }
    throw e
  }
}

export async function killSandbox(sandbox: Sandbox) {
  try {
    await sandbox.kill()
  } catch {
    /* ignore */
  }
}
