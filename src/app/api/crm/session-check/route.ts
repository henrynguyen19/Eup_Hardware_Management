/**
 * GET  /api/crm/session-check          — test session hiện tại của từng staff
 * POST /api/crm/session-check          — force re-login (xóa cache + login mới)
 *
 * Admin only. Dùng để debug khi sync bị timeout liên tục.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { crmLoginRaw } from '@/lib/crm-session'

const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function checkAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = adminClient()
  const { data } = await db.from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = data?.permissions ?? []
  return perms.includes('admin:users') ? user : null
}

function maskAccount(account: string): string {
  if (!account) return '—'
  if (account.length <= 4) return '***'
  return account.slice(0, 2) + '***' + account.slice(-2)
}

/**
 * GET: kiểm tra mapping credentials + session cache của từng staff.
 * Trả về crm_account (masked) và session ID riêng biệt của mỗi người
 * để xác nhận mỗi staff dùng đúng tài khoản CRM của họ.
 */
export async function GET() {
  const user = await checkAdmin()
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const db = adminClient()

  // Lấy cả crm_account để verify mỗi người có tài khoản riêng
  const { data: mappings } = await db
    .from('user_crm_mapping')
    .select('crm_staff_id, crm_nick_name, crm_staff_name, crm_account, user_id')

  const { data: sessions } = await db
    .from('crm_session_cache')
    .select('staff_id, session_id, expires_at, updated_at')

  const sessionMap = new Map(sessions?.map(s => [s.staff_id, s]) ?? [])
  const now = new Date()

  const result = (mappings ?? []).map(m => {
    const sess        = sessionMap.get(m.crm_staff_id)
    const name        = m.crm_staff_name ?? m.crm_nick_name
    const accountMask = maskAccount(m.crm_account ?? '')

    if (!sess) return {
      staffId:     m.crm_staff_id,
      name,
      crmAccount:  accountMask,   // masked — mỗi người có account riêng
      identity:    String(m.crm_staff_id),
      status:      'no_cache',
      isExpired:   true,
    }

    const expiresAt  = new Date(sess.expires_at)
    const expiredAgo = now.getTime() - expiresAt.getTime()
    return {
      staffId:    m.crm_staff_id,
      name,
      crmAccount: accountMask,
      identity:   String(m.crm_staff_id),
      sessionId:  sess.session_id.substring(0, 16) + '...',  // preview 16 ký tự đầu
      expiresAt:  sess.expires_at,
      updatedAt:  sess.updated_at,
      status:     expiredAgo > 0
        ? `expired ${Math.round(expiredAgo / 60000)}m ago`
        : `valid (${Math.round(-expiredAgo / 60000)}m left)`,
      isExpired:  expiredAgo > 0,
    }
  })

  return NextResponse.json({ ok: true, now: now.toISOString(), sessions: result })
}

/** POST: force re-login cho tất cả staff — xóa cache cũ + login lại ngay */
export async function POST(req: NextRequest) {
  const user = await checkAdmin()
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const db  = adminClient()
  const url = process.env.CRM_SOAP_URL
  if (!url) return NextResponse.json({ error: 'Thiếu CRM_SOAP_URL' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as { staffId?: number }

  const { data: mappings } = await db
    .from('user_crm_mapping')
    .select('crm_staff_id, crm_nick_name, crm_staff_name, crm_account, crm_password')

  const targets = body.staffId
    ? (mappings ?? []).filter(m => m.crm_staff_id === body.staffId)
    : (mappings ?? [])

  const results = await Promise.allSettled(targets.map(async m => {
    const staffId = m.crm_staff_id
    const name    = m.crm_staff_name ?? m.crm_nick_name ?? String(staffId)

    // Xóa cache DB cũ trước
    await db.from('crm_session_cache').delete().eq('staff_id', staffId)

    // Login mới — đo thời gian
    const t0  = Date.now()
    const res = await crmLoginRaw(m.crm_account, m.crm_password)
    const ms  = Date.now() - t0

    if (!res.ok || !res.detectedSessionId) {
      return { name, staffId, ok: false, ms, error: res.error ?? 'No SESSION_ID in response' }
    }

    // IDENTITY: lấy từ login response, fallback = crm_staff_id string
    const identity  = res.detectedIdentity ?? String(staffId)
    const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000)

    await db.from('crm_session_cache').upsert({
      staff_id:   staffId,
      session_id: res.detectedSessionId,
      identity,                           // lưu identity thực từ CRM
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })

    return {
      name, staffId, ok: true, ms,
      sessionPreview:  res.detectedSessionId.substring(0, 16) + '...',
      identity,        // hiển thị để verify
    }
  }))

  const output = results.map(r =>
    r.status === 'rejected'
      ? { ok: false, error: String(r.reason) }
      : r.value
  )

  return NextResponse.json({ ok: true, reloginResults: output })
}
