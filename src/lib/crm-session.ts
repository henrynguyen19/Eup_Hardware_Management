import { createClient } from '@supabase/supabase-js'

const adminDB = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ── In-memory cache: staffId -> { sessionId, identity, expiresAt } ──────────
const memCache = new Map<number, { sessionId: string; identity: string; expiresAt: number }>()

// ── Credentials ──────────────────────────────────────────────────────────────
export async function getCRMCredentials(userId: string): Promise<{
  crm_staff_id:   number
  crm_nick_name:  string | null
  crm_staff_name: string | null
  crm_account:    string
  crm_password:   string
} | null> {
  const { data } = await adminDB()
    .from('user_crm_mapping')
    .select('crm_staff_id, crm_account, crm_password, crm_nick_name, crm_staff_name')
    .eq('user_id', userId)
    .single()
  if (!data?.crm_account || !data?.crm_password) return null
  return data as {
    crm_staff_id: number; crm_account: string; crm_password: string
    crm_nick_name: string | null; crm_staff_name: string | null
  }
}

// ── Helper: tìm SESSION_ID trong login response ───────────────────────────────
function extractSessionId(json: Record<string, unknown>): string | null {
  const SESSION_KEYS = ['SESSION_ID', 'session_id', 'sessionId', 'token', 'Token', 'access_token']
  for (const k of SESSION_KEYS) {
    if (typeof json[k] === 'string' && (json[k] as string).length > 8) return json[k] as string
  }
  if (Array.isArray(json.result) && json.result[0]) {
    const r = json.result[0] as Record<string, unknown>
    for (const k of SESSION_KEYS) {
      if (typeof r[k] === 'string' && (r[k] as string).length > 8) return r[k] as string
    }
  }
  return null
}

// ── Helper: tìm IDENTITY trong login response ─────────────────────────────────
// CRM thường trả về IDENTITY riêng — đây là giá trị phải dùng
// khi gọi các API sau đó, KHÔNG phải staff_id hay account.
function extractIdentity(json: Record<string, unknown>): string | null {
  const IDENTITY_KEYS = ['IDENTITY', 'identity', 'Staff_ID', 'StaffID', 'staff_id', 'user_id', 'UserID']
  for (const k of IDENTITY_KEYS) {
    const v = json[k]
    if (typeof v === 'string' && v.length > 0) return v
    if (typeof v === 'number') return String(v)
  }
  if (Array.isArray(json.result) && json.result[0]) {
    const r = json.result[0] as Record<string, unknown>
    for (const k of IDENTITY_KEYS) {
      const v = r[k]
      if (typeof v === 'string' && v.length > 0) return v
      if (typeof v === 'number') return String(v)
    }
  }
  return null
}

// ── Raw login — trả về cả SESSION_ID và IDENTITY từ CRM ─────────────────────
export async function crmLoginRaw(account?: string, password?: string): Promise<{
  ok:                boolean
  rawResponse:       Record<string, unknown>
  detectedSessionId: string | null
  detectedIdentity:  string | null
  error?:            string
}> {
  const url = process.env.CRM_SOAP_URL
  const acc = account ?? process.env.CRM_ACCOUNT
  const pwd = password ?? process.env.CRM_PASSWORD

  if (!url || !acc || !pwd) {
    return { ok: false, rawResponse: {}, detectedSessionId: null, detectedIdentity: null, error: 'Thieu CRM_SOAP_URL hoac credentials' }
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
    if (!text || text.trim() === '') {
      return { ok: false, rawResponse: {}, detectedSessionId: null, detectedIdentity: null, error: 'CRM trả về body rỗng khi login' }
    }
    const json = JSON.parse(text) as Record<string, unknown>
    const detectedSessionId = extractSessionId(json)
    const detectedIdentity  = extractIdentity(json)

    console.log(
      '[crm-session] Login response keys:', Object.keys(json),
      '| SESSION_ID:', !!detectedSessionId,
      '| IDENTITY:', detectedIdentity ?? '(none)',
    )
    return { ok: !!json.status, rawResponse: json, detectedSessionId, detectedIdentity }
  } catch (err) {
    return { ok: false, rawResponse: {}, detectedSessionId: null, detectedIdentity: null, error: String(err) }
  }
}

// ── DB cache ──────────────────────────────────────────────────────────────────
async function loadCachedSession(staffId: number): Promise<{
  sessionId: string; identity: string; expiresAt: Date
} | null> {
  try {
    const { data } = await adminDB()
      .from('crm_session_cache')
      .select('session_id, identity, expires_at')
      .eq('staff_id', staffId)
      .single()
    if (!data) return null
    return {
      sessionId: data.session_id,
      identity:  data.identity,
      expiresAt: new Date(data.expires_at),
    }
  } catch {
    return null
  }
}

async function saveCachedSession(staffId: number, sessionId: string, identity: string) {
  const expiresAt = new Date(Date.now() + 55 * 60 * 1000) // 55 min
  await adminDB()
    .from('crm_session_cache')
    .upsert({ staff_id: staffId, session_id: sessionId, identity, expires_at: expiresAt.toISOString() },
      { onConflict: 'staff_id' })
}

export async function getCRMSession(staff: { id: number; username: string; password: string; name: string }) {
  const cached = await loadCachedSession(staff.id)
  if (cached && cached.expiresAt > new Date()) {
    return { sessionId: cached.sessionId, identity: cached.identity, fromCache: true }
  }
  const login = await crmLoginRaw(staff.username, staff.password)
  if (!login.ok || !login.detectedSessionId) {
    throw new Error(`CRM login thất bại cho ${staff.name}: ${login.error}`)
  }
  await saveCachedSession(staff.id, login.detectedSessionId, login.detectedIdentity ?? '')
  return { sessionId: login.detectedSessionId, identity: login.detectedIdentity ?? '', fromCache: false }
}

// ── getCRMSessionForUser: resolve by Supabase user_id via crm_mapping ─────────
export async function getCRMSessionForUser(userId: string): Promise<{
  sessionId: string; identity: string; staffId: number; fromCache: boolean
}> {
  const creds = await getCRMCredentials(userId)
  if (!creds) throw new Error(`Không tìm thấy CRM credentials cho user ${userId}`)

  const staffId = creds.crm_staff_id

  // Check in-memory cache first
  const mem = memCache.get(staffId)
  if (mem && mem.expiresAt > Date.now()) {
    return { sessionId: mem.sessionId, identity: mem.identity, staffId, fromCache: true }
  }

  // Check DB cache
  const dbCache = await loadCachedSession(staffId)
  if (dbCache && dbCache.expiresAt > new Date()) {
    memCache.set(staffId, { sessionId: dbCache.sessionId, identity: dbCache.identity, expiresAt: dbCache.expiresAt.getTime() })
    return { sessionId: dbCache.sessionId, identity: dbCache.identity, staffId, fromCache: true }
  }

  // Fresh login
  const login = await crmLoginRaw(creds.crm_account, creds.crm_password)
  if (!login.ok || !login.detectedSessionId) {
    throw new Error(`CRM login thất bại cho user ${userId}: ${login.error}`)
  }

  const sessionId = login.detectedSessionId
  const identity  = login.detectedIdentity ?? String(staffId)
  const expiresAt = Date.now() + 55 * 60 * 1000

  memCache.set(staffId, { sessionId, identity, expiresAt })
  await saveCachedSession(staffId, sessionId, identity)

  return { sessionId, identity, staffId, fromCache: false }
}

// ── invalidateCRMSession: clear both caches for a user ───────────────────────
export async function invalidateCRMSession(userId: string): Promise<void> {
  const creds = await getCRMCredentials(userId)
  if (!creds) return
  const staffId = creds.crm_staff_id
  memCache.delete(staffId)
  await adminDB().from('crm_session_cache').delete().eq('staff_id', staffId)
}
