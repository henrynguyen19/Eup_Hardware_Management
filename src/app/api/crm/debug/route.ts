/**
 * GET /api/crm/debug?staff=Kane&limit=50
 *
 * Trả về dữ liệu thô từ CRM để debug:
 * - Danh sách ticket raw (không filter)
 * - Breakdown: bao nhiêu có handler / không có handler
 * - Sample CS_Memo của từng ticket
 *
 * Chỉ admin mới dùng được.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { getCRMSessionForUser } from '@/lib/crm-session'

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

interface CRMTicket {
  CS_ID: number; CS_Date: string; CS_IO: string; CS_Context: string; CS_Memo: string
  CC_Name: string; CM_Name: string; Cust_ID: number; Cust_Name: string
  CS_UpdateTime: string; Cust_SaleManAssistant_Zone: string
}
interface CRMResponse { status: number; error: string; result: CRMTicket[] }

const FULL_STAFF = [
  { id: 9141, name: 'Kane'   },
  { id: 9090, name: 'Stefan' },
  { id: 9146, name: 'Shiro'  },
  { id: 9168, name: 'Irene'  },
  { id: 9268, name: 'Blue'   },
]

export async function GET(req: NextRequest) {
  // Auth check — admin only
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  if (!perms.includes('admin:users'))
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const sp     = req.nextUrl.searchParams
  const filter = sp.get('staff')   // lọc 1 staff cụ thể, vd: ?staff=Kane
  const limit  = Math.min(500, parseInt(sp.get('limit') ?? '100'))
  const url    = process.env.CRM_SOAP_URL
  if (!url) return NextResponse.json({ error: 'Thiếu CRM_SOAP_URL' }, { status: 500 })

  // Load session mapping
  const { data: allMappings } = await db
    .from('user_crm_mapping')
    .select('user_id, crm_staff_id')

  const staffIdToUserId = new Map<number, string>()
  for (const m of (allMappings ?? [])) {
    if (m.crm_staff_id) staffIdToUserId.set(m.crm_staff_id, m.user_id)
  }

  const staffList = filter
    ? FULL_STAFF.filter(s => s.name.toLowerCase() === filter.toLowerCase())
    : FULL_STAFF

  if (staffList.length === 0)
    return NextResponse.json({ error: `Không tìm thấy staff: ${filter}` }, { status: 400 })

  // Fetch raw từ CRM
  const results = await Promise.allSettled(staffList.map(async s => {
    const userId = staffIdToUserId.get(s.id)
    if (!userId) throw new Error(`Không có user mapping cho staff_id=${s.id}`)

    const { sessionId, identity } = await getCRMSessionForUser(userId)

    const form = new URLSearchParams()
    form.append('MethodName', 'GetCustServiceByStaff')
    form.append('Param', JSON.stringify({ NotRead: '0', Staff_ID: String(s.id) }))
    form.append('SESSION_ID', sessionId)
    form.append('IDENTITY', identity)

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(30_000),
    })
    const json: CRMResponse = JSON.parse(await resp.text())
    if (!json.status) throw new Error(json.error || 'CRM status=0')
    return { staffName: s.name, staffId: s.id, tickets: json.result ?? [] }
  }))

  const output = []

  for (const r of results) {
    if (r.status === 'rejected') {
      output.push({ staffName: '?', error: String(r.reason), tickets: [], summary: {} })
      continue
    }

    const { staffName, staffId, tickets } = r.value

    // Phân tích handler
    let withHandler = 0
    let noHandler   = 0
    const handlerBreakdown: Record<string, number> = {}

    const sample = tickets.slice(0, limit).map(t => {
      const h = extractHandlerFromMemo(t.CS_Memo ?? '')
      if (h) { withHandler++; handlerBreakdown[h] = (handlerBreakdown[h] ?? 0) + 1 }
      else   { noHandler++ }
      return {
        cs_id:      t.CS_ID,
        cs_date:    t.CS_Date,
        cust_name:  t.Cust_Name,
        cust_id:    t.Cust_ID,
        direction:  t.CS_IO,
        handler:    h,           // null = CS_Memo không mention tên ai → sẽ bị reject
        memo_short: (t.CS_Memo ?? '').substring(0, 200),
        zone:       t.Cust_SaleManAssistant_Zone,
      }
    })

    // Count toàn bộ cho summary (không chỉ sample)
    let totalWith = 0, totalNo = 0
    for (const t of tickets) {
      if (extractHandlerFromMemo(t.CS_Memo ?? '')) totalWith++
      else totalNo++
    }

    output.push({
      staffName,
      staffId,
      totalRaw:    tickets.length,
      withHandler: totalWith,
      noHandler:   totalNo,
      handlerBreakdown,
      sample,      // giới hạn `limit` bản ghi
    })
  }

  return NextResponse.json({
    ok:   true,
    note: 'noHandler = ticket fetch từ account này nhưng CS_Memo không mention tên ai → trước đây bị REJECT, nay dùng tên account làm fallback',
    data: output,
  })
}
