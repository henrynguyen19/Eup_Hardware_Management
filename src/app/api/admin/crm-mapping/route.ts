import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

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
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  if (!perms.includes('admin:users')) return { user, db, error: 'Forbidden' }
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
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
// Body: { user_id, crm_staff_id }  → lookup CRM then upsert mapping
export async function POST(req: NextRequest) {
  const { db, error } = await requireAdmin()
  if (error || !db) return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })

  const body = await req.json() as { user_id: string; crm_staff_id: number }
  const { user_id, crm_staff_id } = body
  if (!user_id || !crm_staff_id) return NextResponse.json({ error: 'Missing user_id or crm_staff_id' }, { status: 400 })

  // Lookup CRM to get staff info
  const crmStaff = await crmLookupStaff(crm_staff_id)

  const row = {
    user_id,
    crm_staff_id,
    crm_staff_name: crmStaff?.Staff_Name  ?? null,
    crm_nick_name:  crmStaff?.Staff_NickName ?? null,
    crm_account:    crmStaff?.Staff_Account  ?? null,
    updated_at:     new Date().toISOString(),
  }

  const { error: upsertErr } = await db
    .from('user_crm_mapping')
    .upsert(row, { onConflict: 'user_id' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, staff: crmStaff ?? { Staff_ID: crm_staff_id } })
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
