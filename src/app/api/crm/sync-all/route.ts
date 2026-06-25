import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { getCRMSessionForUser } from '@/lib/crm-session'

const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const runtime    = 'nodejs'
export const maxDuration = 300

const FULL_STAFF = [
  { id: 9141, name: 'Kane'   },
  { id: 9090, name: 'Stefan' },
  { id: 9146, name: 'Shiro'  },
  { id: 9168, name: 'Irene'  },
  { id: 9268, name: 'Blue'   },
]

type SpeedTag = 'fast' | 'normal' | 'low' | 'hen' | 'mai_bao_lai'

function extractHandler(memo: string): string | null {
  const STAFF = ['Kane','Stefan','Shiro','Irene','Blue']
  const lower = (memo ?? '').toLowerCase()
  for (const n of STAFF) {
    if (new RegExp(`\\b${n}\\b`,'i').test(lower)) return n
  }
  return null
}

function parseSpeedTag(memo: string): SpeedTag | null {
  const s = (memo ?? '').toLowerCase()
  if (/#f\b/.test(s))                                    return 'fast'
  if (/#n\b/.test(s))                                    return 'normal'
  if (/#l\b/.test(s))                                    return 'low'
  if (/hẽn/i.test(s) || /#hen\b/i.test(s))              return 'hen'
  if (/mai báo lại/i.test(s) || /#mbl\b/i.test(s))      return 'mai_bao_lai'
  return null
}

function parseCRMTime(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const d = new Date(raw.replace(' ','T'))
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch { return null }
}

interface CRMTicket {
  CS_ID: number; CS_Date: string; CS_IO: string; CS_Context: string; CS_Memo: string
  CC_Kind: number; CC_Name: string; CM_Name: string; CS_CarNumber: string
  CS_RecordTime: string; CS_UpdateTime: string; CS_Task: string; CS_SPlace: string
  CS_Miles: string; CS_Attached: string; CS_HighlightStaffID: number
  CS_HighlightStaffName: string; Cust_ID: number; Cust_Name: string
  Cust_SaleManAssistant_Zone: string
}
interface CRMResponse { status: number; error: string; result: CRMTicket[] }

async function callCRM(
  staffId: number, sessionId: string, identity: string,
  url: string, fromDate: string, toDate: string
): Promise<CRMTicket[]> {
  const form = new URLSearchParams()
  form.append('MethodName', 'GetCustServiceByStaff')
  form.append('Param', JSON.stringify({
    NotRead:  '0',
    Staff_ID: String(staffId),
    FromDate: fromDate,
    ToDate:   toDate,
  }))
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
  if (!json.status) throw new Error(json.error || 'CRM status=0')
  return json.result ?? []
}

/**
 * POST /api/crm/sync-all
 * Fetch toàn bộ lịch sử CRM từ fromYear đến nay, lưu vào DB.
 * Body: { fromYear?: number }  (default: 2024)
 */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  if (!perms.includes('admin:users'))
    return NextResponse.json({ error: 'Chỉ admin mới dùng được sync-all' }, { status: 403 })

  const url = process.env.CRM_SOAP_URL
  if (!url) return NextResponse.json({ error: 'Thiếu CRM_SOAP_URL' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as { fromYear?: number }
  const fromYear = body.fromYear ?? 2024

  // Lấy session admin
  const session = await getCRMSessionForUser(user.id)

  // Lấy session map theo crm_staff_id
  const { data: allMappings } = await db
    .from('user_crm_mapping').select('user_id, crm_staff_id')
  const staffIdToUserId = new Map<number, string>()
  for (const m of (allMappings ?? [])) {
    if (m.crm_staff_id) staffIdToUserId.set(m.crm_staff_id, m.user_id)
  }

  // Tạo danh sách tháng cần fetch
  const now = new Date()
  const months: Array<{ from: string; to: string }> = []
  for (let y = fromYear; y <= now.getFullYear(); y++) {
    const mStart = y === fromYear ? 1 : 1
    const mEnd   = y === now.getFullYear() ? now.getMonth() + 1 : 12
    for (let m = mStart; m <= mEnd; m++) {
      const lastDay = new Date(y, m, 0).getDate()
      const mStr = String(m).padStart(2,'0')
      months.push({
        from: `${y}-${mStr}-01`,
        to:   `${y}-${mStr}-${String(lastDay).padStart(2,'0')}`,
      })
    }
  }

  let totalNew = 0, totalUpdated = 0, totalSkipped = 0
  const errors: string[] = []

  for (const { from, to } of months) {
    // Fetch all 5 staff for this month, song song
    const fetched = await Promise.allSettled(
      FULL_STAFF.map(async s => {
        try {
          const uid = staffIdToUserId.get(s.id)
          const sess = uid ? await getCRMSessionForUser(uid) : session
          const tickets = await callCRM(s.id, sess.sessionId, sess.identity, url, from, to)
          return { name: s.name, tickets }
        } catch (err) {
          errors.push(`${s.name} ${from}: ${String(err)}`)
          return { name: s.name, tickets: [] as CRMTicket[] }
        }
      })
    )

    // Merge by CS_ID
    const ticketMap = new Map<number, CRMTicket>()
    for (const r of fetched) {
      if (r.status === 'rejected') continue
      for (const t of r.value.tickets) {
        const ex = ticketMap.get(t.CS_ID)
        if (!ex) { ticketMap.set(t.CS_ID, t); continue }
        const exT = parseCRMTime(ex.CS_UpdateTime)
        const nT  = parseCRMTime(t.CS_UpdateTime)
        if (nT && (!exT || nT > exT)) ticketMap.set(t.CS_ID, t)
      }
    }
    if (ticketMap.size === 0) continue

    const allTickets = Array.from(ticketMap.values())
    const keys = allTickets.map(t => `crm:${t.CS_ID}`)

    // Fetch existing từ DB
    const existMap = new Map<string, { cs_update_time: string | null }>()
    for (let i = 0; i < keys.length; i += 500) {
      const { data } = await db.from('ho_tro_tickets')
        .select('sheet_row_key, cs_update_time')
        .in('sheet_row_key', keys.slice(i, i + 500))
      for (const row of (data ?? [])) existMap.set(row.sheet_row_key, row)
    }

    // Build upsert rows
    const rows = []
    for (const t of allTickets) {
      const key = `crm:${t.CS_ID}`
      const crmUpdateTime = parseCRMTime(t.CS_UpdateTime)
      const existing = existMap.get(key)
      const handler = extractHandler(t.CS_Memo ?? '')
      if (!handler) { totalSkipped++; continue }

      if (existing) {
        const dbMs  = existing.cs_update_time ? new Date(existing.cs_update_time).getTime() : 0
        const crmMs = crmUpdateTime ? new Date(crmUpdateTime).getTime() : 0
        if (crmMs <= dbMs) {
          // Luôn update customer_id và zone (backfill)
          rows.push({
            sheet_row_key: key,
            customer_id:   t.Cust_ID ? String(t.Cust_ID) : null,
            zone:          t.Cust_SaleManAssistant_Zone || null,
          })
          continue
        }
        totalUpdated++
      } else {
        totalNew++
      }

      rows.push({
        sheet_row_key:    key,
        staff_name:       handler,
        ticket_date:      t.CS_Date,
        company:          t.Cust_Name  || null,
        contact:          t.CM_Name    || null,
        ticket_type:      t.CC_Name    || null,
        direction:        t.CS_IO      || null,
        content:          t.CS_Context || null,
        reply:            t.CS_Memo    || null,
        speed_tag:        parseSpeedTag(t.CS_Memo ?? ''),
        code:             String(t.CS_ID),
        customer_id:      t.Cust_ID ? String(t.Cust_ID) : null,
        zone:             t.Cust_SaleManAssistant_Zone || null,
        created_by:       user.id,
        cs_update_time:   crmUpdateTime,
        has_unread_update: false,
      })
    }

    // Upsert
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('ho_tro_tickets')
        .upsert(rows.slice(i, i + 500), { onConflict: 'sheet_row_key' })
      if (error) errors.push(`upsert ${from}: ${error.message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    months: months.length,
    totalNew,
    totalUpdated,
    totalSkipped,
    errors: errors.length ? errors : undefined,
  })
}
