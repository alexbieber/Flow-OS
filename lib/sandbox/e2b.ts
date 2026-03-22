import { Sandbox } from "@e2b/desktop"

export async function createDesktopSandbox(): Promise<{
  sandbox: Sandbox
  streamUrl: string
}> {
  const sandbox = await Sandbox.create({
    apiKey: process.env.E2B_API_KEY!,
    timeoutMs: 3600000,
    resolution: [1280, 720],
  })

  await sandbox.launch("google-chrome")
  await sandbox.wait(4000)

  await sandbox.stream.start({
    requireAuth: true,
  })

  const authKey = sandbox.stream.getAuthKey()
  const streamUrl = sandbox.stream.getUrl({ authKey, viewOnly: true })

  return { sandbox, streamUrl }
}

/** Open a URL in the desktop default browser (Chrome). */
export async function navigateTo(sandbox: Sandbox, url: string) {
  await sandbox.open(url)
  await sandbox.wait(3000)
}

export async function runCommand(
  sandbox: Sandbox,
  cmd: string,
  timeoutMs = 30000
): Promise<string> {
  try {
    const result = await sandbox.commands.run(cmd, { timeoutMs })
    return result.stdout + result.stderr
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
    await sandbox.stream.stop()
  } catch {
    /* stream may not be running */
  }
  try {
    await sandbox.kill()
  } catch {
    /* already dead */
  }
}
