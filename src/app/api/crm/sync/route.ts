import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { getCRMSessionForUser, invalidateCRMSession } from '@/lib/crm-session'

type SpeedTag = 'fast' | 'normal' | 'low' | 'hen' | 'mai_bao_lai'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

const KNOWN_STAFF = ['Kane', 'Stefan', 'Shiro', 'Irene', 'Blue']
const KNOWN_STAFF_LOWER = KNOWN_STAFF.map(n => n.toLowerCase())

function extractHandlerFromMemo(memo: string): string | null {
  if (!memo) return null
  const lower = memo.toLowerCase()
  for (let i = 0; i < KNOWN_STAFF_LOWER.length; i++) {
    const n = KNOWN_STAFF_LOWER[i]
    const re1 = new RegExp(`\\b${n}\\s+\\d{1,2}/\\d{1,2}`, 'i')
    const re2 = new RegExp(`\\d{1,2}/\\d{1,2}\\s+${n}\\b`, 'i')
    if (re1.test(lower) || re2.test(lower)) return KNOWN_STAFF[i]
  }
  const reportMatch = lower.match(/#(?:report|sp)\s+(\w+)/)
  if (reportMatch) {
    const found = KNOWN_STAFF_LOWER.indexOf(reportMatch[1].toLowerCase())
    if (found !== -1) return KNOWN_STAFF[found]
  }
  for (let i = 0; i < KNOWN_STAFF_LOWER.length; i++) {
    if (new RegExp(`\\b${KNOWN_STAFF_LOWER[i]}\\b`, 'i').test(lower)) return KNOWN_STAFF[i]
  }
  return null
}

function parseSpeedTag(memo: string): SpeedTag | null {
  const s = (memo ?? '').toLowerCase()
  let tag: SpeedTag | null = null
  if (/#f\b/.test(s)) tag = 'fast'
  else if (/#n\b/.test(s)) tag = 'normal'
  else if (/#l\b/.test(s)) tag = 'low'
  else if (/hẽn/i.test(s) || /#hen\b/i.test(s)) tag = 'hen'
  else if (/mai báo lại/i.test(s) || /#mbl\b/i.test(s)) tag = 'mai_bao_lai'
  if (/#update\b/i.test(s) && (tag === 'hen' || tag === 'mai_bao_lai')) tag = null
  return tag
}

interface CRMTicket {
  CS_ID: number; CS_Date: string; CS_IO: string; CS_Context: string; CS_Memo: string
  CC_Kind: number; CC_Name: string; CM_Name: string; CS_CarNumber: string
  CS_RecordTime: string; CS_UpdateTime: string; CS_Task: string; CS_SPlace: string
  CS_Miles: string; CS_Attached: string; CS_HighlightStaffID: number
  CS_HighlightStaffName: string; Cust_ID: number; Cust_Name: string
}

interface CRMResponse { status: number; error: string; result: CRMTicket[] }

async function callCRMSoap(staffId: number, sessionId: string, identity: string): Promise<CRMTicket[]> {
  const url = process.env.CRM_SOAP_URL
  if (!url) throw new Error('Thieu CRM_SOAP_URL')
  const form = new URLSearchParams()
  form.append('MethodName', 'GetCustServiceByStaff')
  form.append('Param', JSON.stringify({ NotRead: '0', Staff_ID: String(staffId) }))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY', identity)
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(30_000),
  })
  if (!resp.ok) throw new Error(`CRM HTTP ${resp.status}`)
  const json: CRMResponse = JSON.parse(await resp.text())
  if (!json.status) throw new Error(json.error || 'CRM returned status=0')
  return json.result ?? []
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  if (!perms.includes('admin:users') && !perms.includes('ho_tro:write'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let crmSession: { sessionId: string; crm_staff_id: number; identity: string }
  try {
    crmSession = await getCRMSessionForUser(user.id)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as { fromDate?: string; toDate?: string }
  const { fromDate, toDate } = body

  let allTickets: CRMTicket[]
  try {
    allTickets = await callCRMSoap(crmSession.crm_staff_id, crmSession.sessionId, crmSession.identity)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('status=0') || msg.includes('401')) invalidateCRMSession(crmSession.crm_staff_id)
    return NextResponse.json({ error: `CRM fetch failed: ${msg}` }, { status: 502 })
  }

  let filtered = allTickets
  if (fromDate) filtered = filtered.filter(t => t.CS_Date >= fromDate)
  if (toDate)   filtered = filtered.filter(t => t.CS_Date <= toDate)

  const rows = filtered.map(t => ({
    sheet_row_key: `crm:${t.CS_ID}`,
    staff_name:    extractHandlerFromMemo(t.CS_Memo ?? '') ?? 'Unknown',
    ticket_date:   t.CS_Date,
    company:       t.Cust_Name  || null,
    contact:       t.CM_Name    || null,
    ticket_type:   t.CC_Name    || null,
    direction:     t.CS_IO      || null,
    content:       t.CS_Context || null,
    reply:         t.CS_Memo    || null,
    speed_tag:     parseSpeedTag(t.CS_Memo ?? ''),
    code:          String(t.CS_ID),
    created_by:    user.id,
  }))

  let saved = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await db.from('ho_tro_tickets').upsert(batch, { onConflict: 'sheet_row_key' })
    if (error) return NextResponse.json({ error: error.message, saved }, { status: 500 })
    saved += batch.length
  }

  return NextResponse.json({ ok: true, fetched: allTickets.length, filtered: filtered.length, saved })
}
