import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { getCRMSessionForUser, getCRMCredentials, invalidateCRMSession } from '@/lib/crm-session'

type SpeedTag = 'fast' | 'normal' | 'low' | 'hen' | 'mai_bao_lai'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

const KNOWN_STAFF       = ['Kane', 'Stefan', 'Shiro', 'Irene', 'Blue']
const KNOWN_STAFF_LOWER = KNOWN_STAFF.map(n => n.toLowerCase())

function extractHandlerFromMemo(memo: string): string | null {
  if (!memo) return null
  const lower = memo.toLowerCase()
  for (let i = 0; i < KNOWN_STAFF_LOWER.length; i++) {
    const n   = KNOWN_STAFF_LOWER[i]
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
  if (/#f\b/.test(s))                                    tag = 'fast'
  else if (/#n\b/.test(s))                               tag = 'normal'
  else if (/#l\b/.test(s))                               tag = 'low'
  else if (/hẽn/i.test(s) || /#hen\b/i.test(s))         tag = 'hen'
  else if (/mai báo lại/i.test(s) || /#mbl\b/i.test(s)) tag = 'mai_bao_lai'
  if (/#update\b/i.test(s) && (tag === 'hen' || tag === 'mai_bao_lai')) tag = null
  return tag
}

function parseCRMTime(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const d = new Date(raw.replace(' ', 'T'))
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

async function callCRMSoap(staffId: number, sessionId: string, identity: string, url: string): Promise<CRMTicket[]> {
  const form = new URLSearchParams()
  form.append('MethodName', 'GetCustServiceByStaff')
  form.append('Param', JSON.stringify({ NotRead: '0', Staff_ID: String(staffId) }))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY', identity)
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(20_000),
  })
  if (!resp.ok) throw new Error(`CRM HTTP ${resp.status}`)
  const json: CRMResponse = JSON.parse(await resp.text())
  if (!json.status) throw new Error(json.error || 'CRM returned status=0')
  return json.result ?? []
}

export const runtime     = 'nodejs'
export const maxDuration = 120   // 2 phút — đủ cho full sync 5 staff

// ── POST /api/crm/sync ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Cho phép internal call từ cron job (xác thực bằng x-cron-secret header)
  const cronSecret = process.env.CRON_SECRET
  const internalCall = cronSecret && req.headers.get('x-cron-secret') === cronSecret

  let isAdmin = false
  let user: { id: string } | null = null

  if (!internalCall) {
    const supabase = createSupabaseServerClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    user = authUser

    const db2 = adminClient()
    const { data: permData } = await db2
      .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
    const perms: string[] = permData?.permissions ?? []
    if (!perms.includes('admin:users') && !perms.includes('ho_tro:write'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    isAdmin = perms.includes('admin:users')
  } else {
    isAdmin = true // cron luôn chạy với quyền admin (full sync)
  }

  const url = process.env.CRM_SOAP_URL
  if (!url) return NextResponse.json({ error: 'Thiếu CRM_SOAP_URL' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as {
    mode?: 'full' | 'self'
    fromDate?: string
    toDate?: string
  }
  const mode = body.mode ?? 'self'

  // Full mode chỉ dành cho admin
  if (mode === 'full' && !isAdmin)
    return NextResponse.json({ error: 'Full sync chỉ dành cho admin' }, { status: 403 })

  // ── Xác định danh sách staff cần fetch ──
  const FULL_STAFF = [
    { id: 9141, name: 'Kane'   },
    { id: 9090, name: 'Stefan' },
    { id: 9146, name: 'Shiro'  },
    { id: 9168, name: 'Irene'  },
    { id: 9268, name: 'Blue'   },
  ]

  let staffToFetch: { id: number; name: string }[]
  let myNickName: string | null = null

  if (mode === 'full') {
    // Full sync: tất cả nhân viên (cron hoặc admin)
    staffToFetch = FULL_STAFF
  } else {
    // Self sync: chỉ user đang đăng nhập
    if (!user) return NextResponse.json({ error: 'user required for self sync' }, { status: 400 })
    const creds = await getCRMCredentials(user.id)
    if (!creds) return NextResponse.json({ error: 'Chưa cấu hình CRM credentials' }, { status: 400 })
    myNickName = creds.crm_nick_name ?? null
    staffToFetch = [{ id: creds.crm_staff_id, name: myNickName ?? 'Self' }]
  }

  const db = adminClient()

  // ── Build session map: crm_staff_id -> { sessionId, identity } ──
  // Load ALL mappings từ DB một lần, lookup bằng crm_staff_id (chính xác hơn crm_nick_name)
  const { data: allMappings } = await db
    .from('user_crm_mapping')
    .select('user_id, crm_staff_id, crm_nick_name')

  const staffIdToUserId = new Map<number, string>()
  for (const m of (allMappings ?? [])) {
    if (m.crm_staff_id) staffIdToUserId.set(m.crm_staff_id, m.user_id)
  }

  // Với self mode, chắc chắn có session từ user đang đăng nhập
  let selfSession: { sessionId: string; crm_staff_id: number; identity: string } | null = null
  if (mode === 'self' && user) {
    try { selfSession = await getCRMSessionForUser(user.id) }
    catch (err) { return NextResponse.json({ error: String(err) }, { status: 400 }) }
  }

  // ── Fetch từ CRM song song, mỗi staff dùng session riêng ──
  const fetchResults = await Promise.allSettled(
    staffToFetch.map(async s => {
      try {
        let sessionId: string
        let identity: string

        if (selfSession && mode === 'self') {
          // Self mode: dùng session của chính user đang đăng nhập
          sessionId = selfSession.sessionId
          identity  = selfSession.identity
        } else {
          // Full mode: tìm session của staff này bằng crm_staff_id (chắc chắn hơn crm_nick_name)
          const userId = staffIdToUserId.get(s.id)
          if (!userId) throw new Error(`Không tìm thấy user_crm_mapping cho staff_id=${s.id}`)
          const sess = await getCRMSessionForUser(userId)
          sessionId = sess.sessionId
          identity  = sess.identity
        }

        const tickets = await callCRMSoap(s.id, sessionId, identity, url)
        console.log(`[sync] ${s.name}(${s.id}): ${tickets.length} tickets`)
        return { name: s.name, tickets }
      } catch (err) {
        const msg = String(err)
        console.error(`[sync] FAILED ${s.name}(${s.id}):`, msg)
        return { name: s.name, tickets: [] as CRMTicket[], error: msg }
      }
    })
  )

  // ── Merge & dedup by CS_ID ──
  const ticketMap = new Map<number, CRMTicket>()
  const fetchErrors: Record<string, string> = {}
  const perStaffRaw: Record<string, number> = {}
  let totalFetched = 0

  for (const r of fetchResults) {
    if (r.status === 'rejected') continue
    const { name, tickets, error } = r.value as { name: string; tickets: CRMTicket[]; error?: string }
    if (error) { fetchErrors[name] = error; continue }
    totalFetched += tickets.length
    perStaffRaw[name] = tickets.length
    for (const t of tickets) {
      const existing = ticketMap.get(t.CS_ID)
      if (!existing) {
        ticketMap.set(t.CS_ID, t)
      } else {
        const existT = parseCRMTime(existing.CS_UpdateTime)
        const newT   = parseCRMTime(t.CS_UpdateTime)
        if (newT && (!existT || newT > existT)) ticketMap.set(t.CS_ID, t)
      }
    }
  }

  let allTickets = Array.from(ticketMap.values())

  // Lọc date range
  if (body.fromDate) allTickets = allTickets.filter(t => t.CS_Date >= body.fromDate!)
  if (body.toDate)   allTickets = allTickets.filter(t => t.CS_Date <= body.toDate!)

  // ── Fetch existing từ DB ──
  const keys = allTickets.map(t => `crm:${t.CS_ID}`)
  type ExistingRow = { sheet_row_key: string; cs_update_time: string | null; has_unread_update: boolean; customer_id: string | null; zone: string | null }
  const existingMap = new Map<string, ExistingRow>()
  for (let i = 0; i < keys.length; i += 500) {
    const { data } = await db
      .from('ho_tro_tickets')
      .select('sheet_row_key, cs_update_time, has_unread_update, customer_id, zone')
      .in('sheet_row_key', keys.slice(i, i + 500))
    for (const row of (data ?? [])) existingMap.set(row.sheet_row_key, row as ExistingRow)
  }

  // ── Build rows cần upsert ──
  let newCount = 0, updatedCount = 0, skippedCount = 0, rejectedCount = 0
  const rows = []

  for (const t of allTickets) {
    const key           = `crm:${t.CS_ID}`
    const crmUpdateTime = parseCRMTime(t.CS_UpdateTime)
    const existing      = existingMap.get(key)

    if (existing) {
      // ── Record đã có trong DB ──
      if (existing.cs_update_time && crmUpdateTime) {
        const dbMs  = new Date(existing.cs_update_time).getTime()
        const crmMs = new Date(crmUpdateTime).getTime()
        if (crmMs <= dbMs) {
          // Không đổi — nhưng backfill customer_id/zone nếu đang null
          if (!existing.customer_id || !existing.zone) {
            rows.push({
              sheet_row_key: key,
              customer_id:   t.Cust_ID ? String(t.Cust_ID) : null,
              zone:          t.Cust_SaleManAssistant_Zone || null,
            })
          } else {
            skippedCount++
          }
          continue
        }
      }
      // CS_UpdateTime mới hơn → update + flag unread
      updatedCount++
      rows.push({
        sheet_row_key:    key,
        staff_name:       extractHandlerFromMemo(t.CS_Memo ?? '') ?? 'Unknown',
        ticket_date:      t.CS_Date,
        company:          t.Cust_Name  || null,
        contact:          t.CM_Name    || null,
        ticket_type:      t.CC_Name    || null,
        direction:        t.CS_IO      || null,
        content:          t.CS_Context || null,
        reply:            t.CS_Memo    || null,
        speed_tag:        parseSpeedTag(t.CS_Memo ?? ''),
        code:             String(t.CS_ID),
        zone:             t.Cust_SaleManAssistant_Zone || null,
        customer_id:      t.Cust_ID ? String(t.Cust_ID) : null,
        created_by:       user?.id ?? 'cron',
        cs_update_time:   crmUpdateTime,
        has_unread_update: true,
      })
    } else {
      // ── Record mới ──
      const handler = extractHandlerFromMemo(t.CS_Memo ?? '')

      if (mode === 'self') {
        // Chỉ thêm nếu CS_Memo có hashtag đúng tên mình
        if (!handler || handler.toLowerCase() !== (myNickName ?? '').toLowerCase()) {
          rejectedCount++
          continue
        }
      } else {
        // full mode: thêm nếu CS_Memo có hashtag của bất kỳ 1 trong 5 người
        if (!handler) {
          rejectedCount++
          continue
        }
      }

      newCount++
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
        zone:             t.Cust_SaleManAssistant_Zone || null,
        customer_id:      t.Cust_ID ? String(t.Cust_ID) : null,
        created_by:       user?.id ?? 'cron',
        cs_update_time:   crmUpdateTime,
        has_unread_update: false, // record mới không cần thông báo
      })
    }
  }

  // ── Upsert ──
  let saved = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await db.from('ho_tro_tickets').upsert(batch, { onConflict: 'sheet_row_key' })
    if (error) return NextResponse.json({ error: error.message, saved }, { status: 500 })
    saved += batch.length
  }

  return NextResponse.json({
    ok:               true,
    mode,
    myNickName,
    totalFetched,
    perStaffRaw,
    uniqueAfterMerge: allTickets.length,
    newCount,
    updatedCount,
    skippedCount,
    rejectedCount,
    saved,
    fetchErrors:      Object.keys(fetchErrors).length ? fetchErrors : undefined,
  })
}