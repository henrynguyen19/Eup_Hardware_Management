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
      identity:  data.identity ?? '',   // cột identity có thể chưa có → fallback ''
      expiresAt: new Date(data.expires_at),
    }
  } catch { return null }
}

async function saveSession(staffId: number, sessionId: string, identity: string, expiresAt: Date) {
  try {
    await adminDB().from('crm_session_cache').upsert({
      staff_id:   staffId,
      session_id: sessionId,
      identity,                          // lưu đúng identity từ login response
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('[crm-session] Khong luu duoc cache:', e)
  }
}

// ── Lấy session + identity cho 1 staff (dùng credentials riêng của họ) ───────
export async function getCRMSessionByStaff(
  staffId:  number,
  account:  string,
  password: string,
  fallbackIdentity: string,   // fallback khi CRM không trả về IDENTITY (= crm_staff_id.toString())
): Promise<{ sessionId: string; identity: string }> {
  const now = Date.now()

  // 1. Kiểm tra in-memory cache trước
  const mem = memCache.get(staffId)
  if (mem && mem.expiresAt > now + 60_000) {
    return { sessionId: mem.sessionId, identity: mem.identity }
  }

  // 2. Kiểm tra DB cache
  const cached = await loadCachedSession(staffId)
  if (cached && cached.expiresAt.getTime() > now + 60_000) {
    const identity = cached.identity || fallbackIdentity
    memCache.set(staffId, { sessionId: cached.sessionId, identity, expiresAt: cached.expiresAt.getTime() })
    return { sessionId: cached.sessionId, identity }
  }

  // 3. Login mới bằng tài khoản của staff này
  console.log(`[crm-session] staffId=${staffId} account=${account} — đang login CRM...`)
  const { ok, detectedSessionId, detectedIdentity, error } = await crmLoginRaw(account, password)

  if (ok && detectedSessionId) {
    // IDENTITY: dùng giá trị từ login response, fallback là crm_staff_id string
    const identity  = detectedIdentity ?? fallbackIdentity
    const expiresAt = new Date(now + 23 * 60 * 60 * 1000)

    console.log(`[crm-session] staffId=${staffId} — login OK. SESSION_ID=${detectedSessionId.substring(0,12)}... IDENTITY=${identity}`)
    memCache.set(staffId, { sessionId: detectedSessionId, identity, expiresAt: expiresAt.getTime() })
    await saveSession(staffId, detectedSessionId, identity, expiresAt)

    return { sessionId: detectedSessionId, identity }
  }

  throw new Error(
    `Không lấy được CRM session cho staffId=${staffId} (account=${account}): ${error ?? 'SESSION_ID không tìm thấy trong response'}`
  )
}

// ── Public: lấy session theo user_id (dùng trong API routes) ─────────────────
export async function getCRMSessionForUser(userId: string): Promise<{
  sessionId:    string
  crm_staff_id: number
  identity:     string
}> {
  const creds = await getCRMCredentials(userId)
  if (!creds) throw new Error('User chưa có CRM credentials. Vào Admin → CRM Mapping để cấu hình.')

  const { sessionId, identity } = await getCRMSessionByStaff(
    creds.crm_staff_id,
    creds.crm_account,
    creds.crm_password,
    String(creds.crm_staff_id),   // fallback identity nếu CRM không trả về
  )

  return { sessionId, crm_staff_id: creds.crm_staff_id, identity }
}

// ── Xóa cache (khi cần force re-login) ───────────────────────────────────────
export function invalidateCRMSession(staffId: number) {
  memCache.delete(staffId)
}
