import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { crmLoginRaw, getCRMCredentials, getCRMSessionForUser } from '@/lib/crm-session'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// GET /api/crm/test?staffId=2894&method=GetCustServiceByStaff&preview=10
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  if (!perms.includes('admin:users')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const sp       = new URL(req.url).searchParams
  const staffId  = sp.get('staffId') ?? ''
  const method   = sp.get('method')  ?? 'GetCustServiceByStaff'
  const preview  = Math.min(50, parseInt(sp.get('preview') ?? '5'))

  if (!staffId) {
    return NextResponse.json({ error: 'Thiếu staffId param' }, { status: 400 })
  }

  const url = process.env.CRM_SOAP_URL
  if (!url) return NextResponse.json({ error: 'Thiếu CRM_SOAP_URL' }, { status: 500 })

  // Dùng session của admin đang login
  let sessionId: string, identity: string
  try {
    const s = await getCRMSessionForUser(user.id)
    sessionId = s.sessionId
    identity  = s.identity
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }

  const form = new URLSearchParams()
  form.append('MethodName', method)
  form.append('Param', JSON.stringify({ NotRead: '0', Staff_ID: staffId }))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY', identity)

  let rawText = ''
  let fetchMs = 0
  try {
    const t0 = Date.now()
    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    form.toString(),
      signal:  AbortSignal.timeout(30_000),
    })
    fetchMs = Date.now() - t0
    rawText = await resp.text()
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  let parsed: { status: number; error: string; result: Record<string, unknown>[] }
  try {
    parsed = JSON.parse(rawText)
  } catch {
    // Trả về raw text nếu không parse được
    return NextResponse.json({
      staffId, method,
      parseError: 'Response không phải JSON',
      rawPreview: rawText.slice(0, 500),
    })
  }

  const result = parsed.result ?? []
  const total  = result.length

  // Phân tích CS_Memo để đếm theo nhân viên
  const KNOWN = ['Kane', 'Stefan', 'Shiro', 'Irene', 'Blue']
  const byStaff: Record<string, number> = { Unknown: 0 }
  for (const n of KNOWN) byStaff[n] = 0

  for (const t of result) {
    const memo = ((t.CS_Memo ?? '') as string).toLowerCase()
    let found = false
    for (const n of KNOWN) {
      if (new RegExp(`\\b${n.toLowerCase()}\\b`).test(memo)) {
        byStaff[n]++
        found = true
        break
      }
    }
    if (!found) byStaff['Unknown']++
  }

  // Date range
  const dates = result.map(t => t.CS_Date as string).filter(Boolean).sort()
  const dateFrom = dates[0] ?? null
  const dateTo   = dates[dates.length - 1] ?? null

  // Lấy các field có trong record đầu tiên
  const fields = result[0] ? Object.keys(result[0]) : []

  return NextResponse.json({
    staffId,
    method,
    fetchMs,
    crmStatus: parsed.status,
    crmError:  parsed.error || null,
    total,
    dateRange: { from: dateFrom, to: dateTo },
    byStaffInMemo: byStaff,
    fields,
    preview: result.slice(0, preview),
  })
}

// POST /api/crm/test  → test Login, xem raw response để biết session field
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: permData } = await db.from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  if (!perms.includes('admin:users')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  // ── Debug info ──
  const debug: Record<string, unknown> = {
    user_id: user.id,
    has_soap_url: !!process.env.CRM_SOAP_URL,
    soap_url_preview: process.env.CRM_SOAP_URL?.slice(0, 40) ?? null,
    has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    crm_creds: null as Record<string, unknown> | null,
    creds_error: null as string | null,
  }

  try {
    const creds = await getCRMCredentials(user.id)
    debug.crm_creds = {
      crm_staff_id:   creds?.crm_staff_id,
      crm_nick_name:  creds?.crm_nick_name,
      crm_staff_name: creds?.crm_staff_name,
      has_account:    !!creds?.crm_account,
      has_password:   !!creds?.crm_password,
    }
    if (!creds?.crm_account) throw new Error('Không tìm thấy credentials trong DB')
    const result = await crmLoginRaw(creds.crm_account, creds.crm_password)
    return NextResponse.json({ ...result, debug })
  } catch (err) {
    debug.creds_error = String(err)
    return NextResponse.json({ error: String(err), debug }, { status: 400 })
  }
}
