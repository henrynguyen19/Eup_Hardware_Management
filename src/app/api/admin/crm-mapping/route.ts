import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { isAdminUser } from '@/lib/auth-helpers'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

async function requireAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, db: null, error: 'Unauthorized' }
  const db = adminClient()
  const _isAdmin_cm = await isAdminUser(user.id)
  if (!_isAdmin_cm) return { user, db, error: 'Forbidden' }
  return { user, db, error: null }
}

// ── Lookup CRM Staff info by Staff_ID ────────────────────────────────────────
async function crmLookupStaff(staffId: number): Promise<{
  Staff_ID: number
  Staff_Name: string
  Staff_NickName: string
  Staff_Account: string
  Staff_Email: string
  Staff_OName: string
} | null> {
  const url       = process.env.CRM_SOAP_URL
  const sessionId = process.env.CRM_SESSION_ID

  const identity  = process.env.CRM_SESSION_OWNER_ID
  if (!url || !sessionId || !identity) return null

  const form = new URLSearchParams()
  form.append('MethodName', 'GetStaffInfo')
  form.append('Param', JSON.stringify({ Staff_ID: staffId }))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY', identity)

  try {
    const _hdrs: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (process.env.PROXY_SECRET) _hdrs['x-proxy-secret'] = process.env.PROXY_SECRET
    const resp = await fetch(url, {
      method: 'POST',
      headers: _hdrs,
      body: form.toString(),
      signal: AbortSignal.timeout(10_000),
    })
    const text = await resp.text()
    const json = JSON.parse(text)
    if (!json.status || !json.result?.length) return null
    return json.result[0]
  } catch {
    return null
  }
}

// ── GET /api/admin/crm-mapping ───────────────────────────────────────────────
// Returns all current mappings (with user email)
export async function GET() {
  const { db, error } = await requireAdmin()
  if (error || !db) return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })

  const { data: mappings } = await db.from('user_crm_mapping').select('*').order('crm_staff_id')
  const { data: authData } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })

  const emailMap: Record<string, string> = Object.fromEntries(
    (authData?.users ?? []).map(u => [u.id, u.email ?? ''])
  )

  const result = (mappings ?? []).map(m => ({
    ...m,
    email: emailMap[m.user_id] ?? '',
  }))

  return NextResponse.json({ mappings: result })
}

// ── POST /api/admin/crm-mapping ──────────────────────────────────────────────
// Body: { user_id, crm_staff_id?, crm_account?, crm_password? }
export async function POST(req: NextRequest) {
  const { db, error } = await requireAdmin()
  if (error || !db) return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })

  const body = await req.json() as {
    user_id: string
    crm_staff_id?: number | null
    crm_account?:  string | null
    crm_password?: string | null
  }
  const { user_id, crm_staff_id, crm_account, crm_password } = body
  if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
  if (!crm_staff_id && !crm_account) return NextResponse.json({ error: 'Cần ít nhất crm_staff_id hoặc crm_account' }, { status: 400 })

  // Lookup CRM to get staff info (only if staff_id provided)
  const crmStaff = crm_staff_id ? await crmLookupStaff(crm_staff_id) : null

  const row: Record<string, unknown> = {
    user_id,
    updated_at: new Date().toISOString(),
  }
  if (crm_staff_id)                        row.crm_staff_id   = crm_staff_id
  if (crmStaff?.Staff_Name)               row.crm_staff_name = crmStaff.Staff_Name
  if (crmStaff?.Staff_NickName)           row.crm_nick_name  = crmStaff.Staff_NickName
  // crm_account: prefer explicit input over CRM lookup
  if (crm_account  != null)               row.crm_account    = crm_account  || null
  else if (crmStaff?.Staff_Account)       row.crm_account    = crmStaff.Staff_Account
  if (crm_password != null)               row.crm_password   = crm_password || null

  const { error: upsertErr } = await db
    .from('user_crm_mapping')
    .upsert(row, { onConflict: 'user_id' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, staff: crmStaff ?? { crm_account: row.crm_account } })
}

// ── DELETE /api/admin/crm-mapping?user_id=xxx ────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { db, error } = await requireAdmin()
  if (error || !db) return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })

  const userId = new URL(req.url).searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

  await db.from('user_crm_mapping').delete().eq('user_id', userId)
  return NextResponse.json({ ok: true })
}
