import { createClient } from '@supabase/supabase-js'

const adminDB = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// In-memory cache: staffId -> { sessionId, expiresAt }
const memCache = new Map<number, { sessionId: string; expiresAt: number }>()

export async function getCRMCredentials(userId: string): Promise<{
  crm_staff_id: number
  crm_account:  string
  crm_password: string
} | null> {
  const { data } = await adminDB()
    .from('user_crm_mapping')
    .select('crm_staff_id, crm_account, crm_password')
    .eq('user_id', userId)
    .single()
  if (!data?.crm_account || !data?.crm_password) return null
  return data as { crm_staff_id: number; crm_account: string; crm_password: string }
}

export async function crmLoginRaw(account?: string, password?: string): Promise<{
  ok:                boolean
  rawResponse:       Record<string, unknown>
  detectedSessionId: string | null
  error?:            string
}> {
  const url = process.env.CRM_SOAP_URL
  const acc = account ?? process.env.CRM_ACCOUNT
  const pwd = password ?? process.env.CRM_PASSWORD

  if (!url || !acc || !pwd) {
    return { ok: false, rawResponse: {}, detectedSessionId: null, error: 'Thieu CRM_SOAP_URL hoac credentials' }
  }

  const form = new URLSearchParams()
  form.append('MethodName', 'Login')
  form.append('Param', JSON.stringify({ Account: acc, PassWord: pwd }))

  try {
    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    form.toString(),
      signal:  AbortSignal.timeout(15_000),
    })
    const text = await resp.text()
    const json = JSON.parse(text) as Record<string, unknown>
    const detected = extractSession(json)
    console.log('[crm-session] Login keys:', Object.keys(json), '| SESSION_ID found:', !!detected)
    return { ok: !!json.status, rawResponse: json, detectedSessionId: detected }
  } catch (err) {
    return { ok: false, rawResponse: {}, detectedSessionId: null, error: String(err) }
  }
}

function extractSession(json: Record<string, unknown>): string | null {
  for (const k of ['SESSION_ID', 'session_id', 'sessionId', 'token', 'Token', 'access_token']) {
    if (typeof json[k] === 'string' && (json[k] as string).length > 20) return json[k] as string
  }
  if (Array.isArray(json.result) && json.result[0]) {
    const r = json.result[0] as Record<string, unknown>
    for (const k of ['SESSION_ID', 'session_id', 'sessionId', 'token', 'Token', 'access_token']) {
      if (typeof r[k] === 'string' && (r[k] as string).length > 20) return r[k] as string
    }
  }
  return null
}

async function loadCachedSession(staffId: number): Promise<{ sessionId: string; expiresAt: Date } | null> {
  try {
    const { data } = await adminDB()
      .from('crm_session_cache')
      .select('session_id, expires_at')
      .eq('staff_id', staffId)
      .single()
    if (!data) return null
    return { sessionId: data.session_id, expiresAt: new Date(data.expires_at) }
  } catch { return null }
}

async function saveSession(staffId: number, sessionId: string, expiresAt: Date) {
  try {
    await adminDB().from('crm_session_cache').upsert({
      staff_id:   staffId,
      session_id: sessionId,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('[crm-session] Khong luu duoc cache:', e)
  }
}

export async function getCRMSessionForUser(userId: string): Promise<{
  sessionId:    string
  crm_staff_id: number
  identity:     string
}> {
  const creds = await getCRMCredentials(userId)
  if (!creds) throw new Error('User chua co CRM credentials. Vao Admin -> CRM Mapping de cau hinh.')
  const sessionId = await getCRMSessionByStaff(creds.crm_staff_id, creds.crm_account, creds.crm_password)
  return { sessionId, crm_staff_id: creds.crm_staff_id, identity: String(creds.crm_staff_id) }
}

export async function getCRMSessionByStaff(staffId: number, account: string, password: string): Promise<string> {
  const now = Date.now()

  const mem = memCache.get(staffId)
  if (mem && mem.expiresAt > now + 60_000) return mem.sessionId

  const cached = await loadCachedSession(staffId)
  if (cached && cached.expiresAt.getTime() > now + 60_000) {
    memCache.set(staffId, { sessionId: cached.sessionId, expiresAt: cached.expiresAt.getTime() })
    return cached.sessionId
  }

  console.log(`[crm-session] staffId=${staffId} (${account}) -- dang login CRM...`)
  const { ok, detectedSessionId, error } = await crmLoginRaw(account, password)

  if (ok && detectedSessionId) {
    const expiresAt = new Date(now + 23 * 60 * 60 * 1000)
    memCache.set(staffId, { sessionId: detectedSessionId, expiresAt: expiresAt.getTime() })
    await saveSession(staffId, detectedSessionId, expiresAt)
    return detectedSessionId
  }

  throw new Error(
    `Khong lay duoc CRM session cho staffId=${staffId}: ${error ?? 'SESSION_ID khong tim thay trong response'}`
  )
}

export function invalidateCRMSession(staffId: number) {
  memCache.delete(staffId)
}
