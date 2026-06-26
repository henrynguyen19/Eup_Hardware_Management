import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { getCRMSessionForUser, getCRMCredentials, invalidateCRMSession, crmLoginRaw } from '@/lib/crm-session'
import { extractHandlerFromMemo, parseSpeedTag, parseCRMTime } from '@/lib/crm-utils'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

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
    signal: AbortSignal.timeout(50_000),   // 50s — đủ cho CRM phản hồi
  })
  if (!resp.ok) throw new Error(`CRM HTTP ${resp.status}`)
  const rawText = await resp.text()
  if (!rawText || rawText.trim() === '') throw new Error('CRM trả về body rỗng')
  let json: CRMResponse
  try { json = JSON.parse(rawText) } catch { throw new Error(`CRM response không parse được: ${rawText.substring(0, 100)}`) }
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
    mode?: 'full' | 'self' | 'one'
    staffName?: string   // dùng khi mode='one'
    fromDate?: string
    toDate?: string
  }
  const mode = body.mode ?? 'self'

  // Full/one mode chỉ dành cho admin
  if ((mode === 'full' || mode === 'one') && !isAdmin)
    return NextResponse.json({ error: 'Chỉ admin mới dùng được' }, { status: 403 })

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
    staffToFetch = FULL_STAFF
  } else if (mode === 'one') {
    // Sync đúng 1 nhân viên theo tên
    const target = FULL_STAFF.find(s => s.name.toLowerCase() === (body.staffName ?? '').toLowerCase())
    if (!target) return NextResponse.json({ error: `Không tìm thấy staff: ${body.staffName}` }, { status: 400 })
    staffToFetch = [target]
  } else {
    // Self sync: chỉ user đang đăng nhập
    if (!user) return NextResponse.json({ error: 'user required for self sync' }, { status: 400 })
    const creds = await getCRMCredentials(user.id)
    if (!creds) return NextResponse.json({ error: 'Chưa cấu hình CRM credentials' }, { status: 400 })
    myNickName = creds.crm_nick_name ?? null
    staffToFetch = [{ id: creds.crm_staff_id, name: myNickName ?? 'Self' }]
  }

  const db = adminClient()

  // ── Load credentials map: crm_staff_id -> { crm_account, crm_password, user_id } ──
  // Lấy cả crm_account + crm_password để login fresh (giống debug route)
  const { data: allMappings } = await db
    .from('user_crm_mapping')
    .select('user_id, crm_staff_id, crm_nick_name, crm_account, crm_password')

  type MappingRow = { user_id: string; crm_staff_id: number; crm_nick_name: string | null; crm_account: string | null; crm_password: string | null }
  const credMap = new Map<number, MappingRow>()
  for (const m of ((allMappings ?? []) as MappingRow[])) {
    if (m.crm_staff_id) credMap.set(m.crm_staff_id, m)
  }

  // Self mode: lấy session từ user đang đăng nhập (đã login)
  let selfSession: { sessionId: string; crm_staff_id: number; identity: string } | null = null
  if (mode === 'self' && user) {
    try { selfSession = await getCRMSessionForUser(user.id) }
    catch (err) { return NextResponse.json({ error: String(err) }, { status: 400 }) }
  }

  // ── Fetch từ CRM tuần tự (tránh login đồng thời gây conflict session) ──
  // mode 'one'/'full': login fresh bằng credentials riêng — giống debug route
  // mode 'self': dùng session đã có của user
  const fetchResults: PromiseSettledResult<{ name: string; tickets: CRMTicket[]; error?: string }>[] = []

  for (const s of staffToFetch) {
    try {
      let sessionId: string
      let identity: string

      if (mode === 'self' && selfSession) {
        // Self: dùng session sẵn có của user đang đăng nhập
        sessionId = selfSession.sessionId
        identity  = selfSession.identity
      } else {
        // One/Full: login fresh bằng crm_account + crm_password của chính staff đó
        // (giống debug route — không dùng cached session vì có thể stale/sai)
        const cred = credMap.get(s.id)
        if (!cred?.crm_account || !cred?.crm_password) {
          throw new Error(`Không tìm thấy crm_account/crm_password cho ${s.name} (id=${s.id})`)
        }
        console.log(`[sync] Login CRM cho ${s.name} (account=${cred.crm_account})`)
        const loginRes = await crmLoginRaw(cred.crm_account, cred.crm_password)
        if (!loginRes.ok || !loginRes.detectedSessionId) {
          throw new Error(`Login CRM thất bại cho ${s.name}: ${loginRes.error ?? 'No SESSION_ID'}`)
        }
        sessionId = loginRes.detectedSessionId
        identity  = loginRes.detectedIdentity ?? String(s.id)
        console.log(`[sync] ${s.name} login OK — SESSION=${sessionId.substring(0, 16)}... IDENTITY=${identity}`)
      }

      const tickets = await callCRMSoap(s.id, sessionId, identity, url)
      console.log(`[sync] ${s.name}(${s.id}): ${tickets.length} tickets`)
      fetchResults.push({ status: 'fulfilled', value: { name: s.name, tickets } })
    } catch (err) {
      const msg = String(err)
      console.error(`[sync] FAILED ${s.name}(${s.id}):`, msg)
      fetchResults.push({ status: 'fulfilled', value: { name: s.name, tickets: [] as CRMTicket[], error: msg } })
    }
  }

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
  // backfillRows: chỉ cập nhật customer_id/zone — PHẢI tách riêng để tránh
  // Supabase upsert normalize NULL vào staff_name (NOT NULL constraint)
  const backfillRows: { sheet_row_key: string; customer_id: string | null; zone: string | null }[] = []

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
            backfillRows.push({
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

  // ── Upsert full rows (có staff_name) ──
  let saved = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await db.from('ho_tro_tickets').upsert(batch, { onConflict: 'sheet_row_key' })
    if (error) return NextResponse.json({ error: error.message, saved }, { status: 500 })
    saved += batch.length
  }

  // ── Upsert backfill rows TÁCH RIÊNG (chỉ customer_id + zone) ──
  // Không được mix với full rows vì Supabase sẽ set staff_name = NULL
  for (let i = 0; i < backfillRows.length; i += 500) {
    const batch = backfillRows.slice(i, i + 500)
    const { error } = await db.from('ho_tro_tickets').upsert(batch, { onConflict: 'sheet_row_key' })
    if (error) console.error('[sync] Backfill upsert error:', error.message)
    else saved += batch.length
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