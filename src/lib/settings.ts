import { createClient } from '@supabase/supabase-js'
import { AppSettings, DEFAULT_SETTINGS } from '@/types/equipment'

export async function getSettings(): Promise<AppSettings> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')

    if (!data?.length) return DEFAULT_SETTINGS

    const settings: AppSettings = { ...DEFAULT_SETTINGS }
    for (const row of data) {
      if (row.key === 'categories'    && Array.isArray(row.value)) settings.categories    = row.value
      if (row.key === 'statuses'      && Array.isArray(row.value)) settings.statuses      = row.value
      if (row.key === 'documentTypes' && Array.isArray(row.value)) settings.documentTypes = row.value
    }
    return settings
  } catch {
    return DEFAULT_SETTINGS
  }
}
