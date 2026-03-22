import { getServiceSupabase } from "@/lib/supabase/admin"

export async function getVaultItem(
  userId: string,
  key: string
): Promise<string | null> {
  const supabase = getServiceSupabase()
  const { data } = await supabase
    .from("vault")
    .select("value")
    .eq("user_id", userId)
    .eq("key", key)
    .single()

  return data?.value ?? null
}

export async function setVaultItem(
  userId: string,
  key: string,
  value: string,
  label: string
): Promise<void> {
  const supabase = getServiceSupabase()
  await supabase.from("vault").upsert({
    user_id: userId,
    key,
    value,
    label,
    updated_at: new Date().toISOString(),
  })
}

export async function getAllVaultItems(userId: string) {
  const supabase = getServiceSupabase()
  const { data } = await supabase
    .from("vault")
    .select("key, label, value")
    .eq("user_id", userId)
  return data ?? []
}

export async function resolveInputs(
  userId: string,
  inputs: Record<string, string>,
  vaultKeys: Record<string, string>
): Promise<Record<string, string>> {
  const resolved = { ...inputs }

  for (const [inputKey, vaultKey] of Object.entries(vaultKeys)) {
    if (!resolved[inputKey] && vaultKey) {
      const val = await getVaultItem(userId, vaultKey)
      if (val) resolved[inputKey] = val
    }
  }

  return resolved
}
