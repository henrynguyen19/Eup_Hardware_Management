/**
 * GET /api/crm/debug?staff=Kane
 *
 * Trả về toàn bộ dữ liệu thô từ CRM cho 1 staff (không filter, không giới hạn số lượng).
 * Dùng để debug — so sánh ticket gốc vs bị loại bỏ khi sync.
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

const KNOWN_STAFF       = ['Kane', 'Stefan', 'Shiro', 'Irene', 'Blue']
const KNOWN_STAFF_LOWER = KNOWN_STAFF.map(n => n.toLowerCase())

function extractHandlerFromMemo(memo: string): string | null {
  if (!memo) return null
  const lower = memo.toLowerCase()
  // Ưu tiên: Tên + ngày (Kane 12/6) hoặc ngày + tên (12/6 Kane)
  for (let i = 0; i < KNOWN_STAFF_LOWER.length; i++) {
    const n   = KNOWN_STAFF_LOWER[i]
    const re1 = new RegExp(`\\b${n}\\s+\\d{1,2}/\\d{1,2}`, 'i')
    const re2 = new RegExp(`\\d{1,2}/\\d{1,2}\\s+${n}\\b`, 'i')
    if (re1.test(lower) || re2.test(lower)) return KNOWN_STAFF[i]
  }
  // #report Kane / #sp Kane
  const reportMatch = lower.match(/#(?:report|sp)\s+(\w+)/)
  if (reportMatch) {
    const found = KNOWN_STAFF_LOWER.indexOf(reportMatch[1].toLowerCase())
    if (found !== -1) return KNOWN_STAFF[found]
  }
  // Tên đứng một mình
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
  // Auth — admin only
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
  const filter = sp.get('staff')   // bắt buộc: chỉ load 1 staff mỗi lần
  const url    = process.env.CRM_SOAP_URL
  if (!url)    return NextResponse.json({ error: 'Thiếu CRM_SOAP_URL' }, { status: 500 })
  if (!filter) return NextResponse.json({ error: 'Thiếu ?staff=Name' }, { status: 400 })

  // Load session mapping
  const { data: allMappings } = await db
    .from('user_crm_mapping')
    .select('user_id, crm_staff_id')
  const staffIdToUserId = new Map<number, string>()
  for (const m of (allMappings ?? [])) {
    if (m.crm_staff_id) staffIdToUserId.set(m.crm_staff_id, m.user_id)
  }

  const staff = FULL_STAFF.find(s => s.name.toLowerCase() === filter.toLowerCase())
  if (!staff) return NextResponse.json({ error: `Không tìm thấy staff: ${filter}` }, { status: 400 })

  const userId = staffIdToUserId.get(staff.id)
  if (!userId)  return NextResponse.json({ error: `Không có user mapping cho staff_id=${staff.id}` }, { status: 400 })

  // Lấy session
  const { sessionId, identity } = await getCRMSessionForUser(userId)

  // Gọi CRM — toàn bộ dữ liệu (không date filter)
  const form = new URLSearchParams()
  form.append('MethodName', 'GetCustServiceByStaff')
  form.append('Param', JSON.stringify({ NotRead: '0', Staff_ID: String(staff.id) }))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY', identity)

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    form.toString(),
    signal:  AbortSignal.timeout(30_000),
  })
  if (!resp.ok) return NextResponse.json({ error: `CRM HTTP ${resp.status}` }, { status: 502 })

  const rawText = await resp.text()
  if (!rawText || rawText.trim() === '') {
    return NextResponse.json({
      error: `CRM trả về body rỗng cho ${staff.name} (session có thể đã hết hạn). Thử Force Re-login rồi load lại.`,
      hint:  'Vào panel Session ở đầu trang → Force Re-login → load lại.',
    }, { status: 502 })
  }

  let json: CRMResponse
  try {
    json = JSON.parse(rawText) as CRMResponse
  } catch {
    return NextResponse.json({
      error:   `CRM trả về response không hợp lệ (không parse được JSON) cho ${staff.name}.`,
      rawText: rawText.substring(0, 500),   // 500 ký tự đầu để debug
    }, { status: 502 })
  }

  if (!json.status) return NextResponse.json({
    error:   json.error || `CRM status=0 cho ${staff.name} (session expired hoặc sai credentials).`,
    rawText: rawText.substring(0, 200),
  }, { status: 502 })

  const tickets: CRMTicket[] = json.result ?? []

  // Phân loại từng ticket
  const accepted: object[] = []
  const rejected: object[] = []

  for (const t of tickets) {
    const handler = extractHandlerFromMemo(t.CS_Memo ?? '')
    const base = {
      cs_id:       t.CS_ID,
      cs_date:     t.CS_Date,
      update_time: t.CS_UpdateTime,
      cust_name:   t.Cust_Name,
      cust_id:     t.Cust_ID,
      direction:   t.CS_IO,
      ticket_type: t.CC_Name,
      contact:     t.CM_Name,
      zone:        t.Cust_SaleManAssistant_Zone,
      handler,
      memo:        t.CS_Memo ?? '',
    }
    if (handler) {
      accepted.push(base)
    } else {
      rejected.push({
        ...base,
        reject_reason: !t.CS_Memo
          ? 'CS_Memo trống'
          : 'CS_Memo không mention Kane/Stefan/Shiro/Irene/Blue',
      })
    }
  }

  return NextResponse.json({
    ok:            true,
    staffName:     staff.name,
    staffId:       staff.id,
    totalRaw:      tickets.length,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    accepted,
    rejected,
  })
}
