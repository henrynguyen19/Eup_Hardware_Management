import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

type SpeedTag = 'fast' | 'normal' | 'low' | 'hen' | 'mai_bao_lai'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ── Staff name extraction from CS_Memo ──────────────────────────────────────
const KNOWN_STAFF = ['Kane', 'Stefan', 'Shiro', 'Irene', 'Blue']
const KNOWN_STAFF_LOWER = KNOWN_STAFF.map(n => n.toLowerCase())

function extractHandlerFromMemo(memo: string): string | null {
  if (!memo) return null
  const lower = memo.toLowerCase()
  for (let i = 0; i < KNOWN_STAFF_LOWER.length; i++) {
    const n = KNOWN_STAFF_LOWER[i]
    // "Stefan 14/1" or "14/1 Stefan"
    const re1 = new RegExp(`\\b${n}\\s+\\d{1,2}/\\d{1,2}`, 'i')
    const re2 = new RegExp(`\\d{1,2}/\\d{1,2}\\s+${n}\\b`, 'i')
    if (re1.test(lower) || re2.test(lower)) return KNOWN_STAFF[i]
  }
  // "#report Stefan" or "#sp Kane"
  const reportMatch = lower.match(/#(?:report|sp)\s+(\w+)/)
  if (reportMatch) {
    const found = KNOWN_STAFF_LOWER.indexOf(reportMatch[1].toLowerCase())
    if (found !== -1) return KNOWN_STAFF[found]
  }
  // Fallback: bare staff name anywhere in memo
  for (let i = 0; i < KNOWN_STAFF_LOWER.length; i++) {
    if (new RegExp(`\\b${KNOWN_STAFF_LOWER[i]}\\b`, 'i').test(lower)) return KNOWN_STAFF[i]
  }
  return null
}

// ── Speed tag parsing from CS_Memo hashtags ─────────────────────────────────
function parseSpeedTag(memo: string): SpeedTag | null {
  const s = (memo ?? '').toLowerCase()
  let tag: SpeedTag | null = null
  if (/#f\b/.test(s))                                    tag = 'fast'
  else if (/#n\b/.test(s))                              tag = 'normal'
  else if (/#l\b/.test(s))                              tag = 'low'
  else if (/hẹn/i.test(s) || /#hen\b/i.test(s))        tag = 'hen'
  else if (/mai báo lại/i.test(s) || /#mbl\b/i.test(s)) tag = 'mai_bao_lai'
  // #update clears pending
  if (/#update\b/i.test(s) && (tag === 'hen' || tag === 'mai_bao_lai')) tag = null
  return tag
}

// ── CRM SOAP types ───────────────────────────────────────────────────────────
interface CRMTicket {
  CS_ID:               number
  CS_Date:             string   // "2026-01-13"
  CS_IO:               string   // "i" | "o"
  CS_Context:          string   // content / problem description
  CS_Memo:             string   // reply (contains hashtags + staff name)
  CC_Kind:             number
  CC_Name:             string   // ticket_type e.g. "Xử lý vấn đề"
  CM_Name:             string   // contact person
  CS_CarNumber:        string
  CS_RecordTime:       string   // "2026-01-13 08:42:18"
  CS_UpdateTime:       string
  CS_Task:             string
  CS_SPlace:           string
  CS_Miles:            string
  CS_Attached:         string
  CS_HighlightStaffID: number
  CS_HighlightStaffName: string
  Cust_ID:             number
  Cust_Name:           string   // company
}

interface CRMResponse {
  status: number
  error:  string
  result: CRMTicket[]
}

// ── Call CRM SOAP ────────────────────────────────────────────────────────────
async function callCRMSoap(): Promise<CRMTicket[]> {
  const url       = process.env.CRM_SOAP_URL
  const sessionId = process.env.CRM_SESSION_ID
  const identity  = process.env.CRM_IDENTITY
  const staffId   = process.env.CRM_STAFF_ID

  if (!url || !sessionId || !identity || !staffId) {
    throw new Error('Missing CRM env vars (CRM_SOAP_URL, CRM_SESSION_ID, CRM_IDENTITY, CRM_STAFF_ID)')
  }

  const form = new URLSearchParams()
  form.append('MethodName', 'GetCustServiceByStaff')
  form.append('Param', JSON.stringify({ NotRead: '0', Staff_ID: staffId }))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY', identity)

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    form.toString(),
    // 30s timeout
    signal: AbortSignal.timeout(30_000),
  })

  if (!resp.ok) throw new Error(`CRM HTTP ${resp.status}`)
  const text = await resp.text()
  const json: CRMResponse = JSON.parse(text)
  if (!json.status) throw new Error(json.error || 'CRM returned status=0')
  return json.result ?? []
}

// ── POST /api/crm/sync ───────────────────────────────────────────────────────
// Body: { fromDate?: "YYYY-MM-DD", toDate?: "YYYY-MM-DD" }
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  const hasAccess =
    perms.includes('admin:users') ||
    perms.includes('ho_tro:write')
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { fromDate?: string; toDate?: string }
  const { fromDate, toDate } = body

  // ── Fetch from CRM ──
  let allTickets: CRMTicket[]
  try {
    allTickets = await callCRMSoap()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[crm/sync] fetch error:', msg)
    return NextResponse.json({ error: `CRM fetch failed: ${msg}` }, { status: 502 })
  }

  // ── Filter by date ──
  let filtered = allTickets
  if (fromDate) filtered = filtered.filter(t => t.CS_Date >= fromDate)
  if (toDate)   filtered = filtered.filter(t => t.CS_Date <= toDate)

  // ── Map to DB rows ──
  const rows = filtered.map(t => {
    const staffName = extractHandlerFromMemo(t.CS_Memo ?? '')
    const speedTag  = parseSpeedTag(t.CS_Memo ?? '')
    return {
      sheet_row_key: `crm:${t.CS_ID}`,
      staff_name:    staffName ?? 'Unknown',
      ticket_date:   t.CS_Date,
      company:       t.Cust_Name  || null,
      contact:       t.CM_Name    || null,
      ticket_type:   t.CC_Name    || null,
      direction:     t.CS_IO      || null,
      content:       t.CS_Context || null,
      reply:         t.CS_Memo    || null,
      speed_tag:     speedTag,
      code:          String(t.CS_ID),
      created_by:    user.id,
    }
  })

  // ── Upsert in batches of 500 ──
  let saved = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await db.from('ho_tro_tickets')
      .upsert(batch, { onConflict: 'sheet_row_key' })
    if (error) {
      console.error('[crm/sync] upsert error (batch', i, '):', error.message)
      return NextResponse.json({ error: error.message, saved }, { status: 500 })
    }
    saved += batch.length
  }

  console.log(`[crm/sync] fetched=${allTickets.length} filtered=${filtered.length} saved=${saved}`)
  return NextResponse.json({
    ok:       true,
    fetched:  allTickets.length,
    filtered: filtered.length,
    saved,
  })
}
