/**
 * GET /api/crm/debug?staff=Kane
 *
 * Load toàn bộ ticket raw từ CRM cho 1 staff cụ thể.
 * Credentials (account, password, staff_id) lấy trực tiếp từ user_crm_mapping theo crm_staff_id —
 * KHÔNG đi qua user session của người đang login.
 *
 * Flow đúng:
 *   1. Tìm crm_account + crm_password + crm_staff_id của staff đó trong DB
 *   2. Login CRM bằng credentials đó → lấy SESSION_ID + IDENTITY
 *   3. Gọi GetCustServiceByStaff với đúng SESSION_ID + IDENTITY
 *
 * Chỉ admin mới dùng được.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { crmLoginRaw } from '@/lib/crm-session'
import { extractHandlerFromMemo } from '@/lib/crm-utils'

export const runtime     = 'nodejs'
export const maxDuration = 60

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

const FULL_STAFF = [
  { id: 9141, name: 'Kane'   },
  { id: 9090, name: 'Stefan' },
  { id: 9146, name: 'Shiro'  },
  { id: 9168, name: 'Irene'  },
  { id: 9268, name: 'Blue'   },
]

interface CRMTicket {
  CS_ID: number; CS_Date: string; CS_IO: string; CS_Context: string; CS_Memo: string
  CC_Name: string; CM_Name: string; Cust_ID: number; Cust_Name: string
  CS_UpdateTime: string; Cust_SaleManAssistant_Zone: string
}
interface CRMResponse { status: number; error: string; result: CRMTicket[] }

// ── GET handler ───────────────────────────────────────────────────────────────
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
  const filter = sp.get('staff')
  const url    = process.env.CRM_SOAP_URL
  if (!url)    return NextResponse.json({ error: 'Thiếu CRM_SOAP_URL' }, { status: 500 })
  if (!filter) return NextResponse.json({ error: 'Thiếu ?staff=Name' }, { status: 400 })

  const staff = FULL_STAFF.find(s => s.name.toLowerCase() === filter.toLowerCase())
  if (!staff) return NextResponse.json({ error: `Không tìm thấy staff: ${filter}` }, { status: 400 })

  // ── Bước 1: Lấy credentials của ĐÚNG staff từ DB theo crm_staff_id ──────────
  // KHÔNG dùng session của người đang đăng nhập — phải lấy account/password của staff đó
  const { data: mapping, error: mapErr } = await db
    .from('user_crm_mapping')
    .select('crm_staff_id, crm_account, crm_password, crm_nick_name, crm_staff_name')
    .eq('crm_staff_id', staff.id)
    .single()

  if (mapErr || !mapping) {
    return NextResponse.json({
      error: `Không tìm thấy mapping cho ${staff.name} (crm_staff_id=${staff.id}). Kiểm tra bảng user_crm_mapping.`,
    }, { status: 400 })
  }
  if (!mapping.crm_account || !mapping.crm_password) {
    return NextResponse.json({
      error: `${staff.name} chưa có crm_account hoặc crm_password trong DB.`,
    }, { status: 400 })
  }

  // ── Bước 2: Login CRM bằng credentials của chính staff đó ───────────────────
  console.log(`[crm/debug] Đang login CRM cho ${staff.name} (account=${mapping.crm_account}, staff_id=${staff.id})`)

  const loginRes = await crmLoginRaw(mapping.crm_account, mapping.crm_password)
  if (!loginRes.ok || !loginRes.detectedSessionId) {
    return NextResponse.json({
      error:      `Login CRM thất bại cho ${staff.name}: ${loginRes.error ?? 'Không có SESSION_ID trong response'}`,
      rawResponse: loginRes.rawResponse,
    }, { status: 502 })
  }

  const sessionId = loginRes.detectedSessionId
  // IDENTITY từ login response; fallback = crm_staff_id string
  const identity  = loginRes.detectedIdentity ?? String(staff.id)

  // Log toàn bộ login response để debug (ẩn password)
  console.log(`[crm/debug] ${staff.name} login OK`)
  console.log(`[crm/debug] Login rawResponse keys:`, Object.keys(loginRes.rawResponse))
  console.log(`[crm/debug] SESSION_ID (16 ký tự đầu): ${sessionId.substring(0, 16)}...`)
  console.log(`[crm/debug] IDENTITY từ response: ${identity}`)
  console.log(`[crm/debug] rawResponse (không nhạy cảm):`, JSON.stringify({
    ...loginRes.rawResponse,
    SESSION_ID: loginRes.rawResponse.SESSION_ID ? '<hidden>' : undefined,
  }).substring(0, 500))

  // ── Bước 3: Gọi GetCustServiceByStaff ────────────────────────────────────────
  // GetCustServiceByStaff chỉ nhận NotRead + Staff_ID — không có date filter
  const soapParam = { NotRead: '0', Staff_ID: String(staff.id) }

  console.log(`[crm/debug] Gọi GetCustServiceByStaff với:`, {
    MethodName: 'GetCustServiceByStaff',
    Param:      JSON.stringify(soapParam),
    SESSION_ID: sessionId.substring(0, 16) + '...',
    IDENTITY:   identity,
  })

  const form = new URLSearchParams()
  form.append('MethodName', 'GetCustServiceByStaff')
  form.append('Param', JSON.stringify(soapParam))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY', identity)

  let rawText: string
  const t0 = Date.now()
  try {
    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    form.toString(),
      signal:  AbortSignal.timeout(55_000),
    })
    const elapsed = Date.now() - t0
    console.log(`[crm/debug] CRM responded in ${elapsed}ms — HTTP ${resp.status}`)
    if (!resp.ok) {
      return NextResponse.json({ error: `CRM HTTP ${resp.status} cho ${staff.name}` }, { status: 502 })
    }
    rawText = await resp.text()
    console.log(`[crm/debug] rawText length: ${rawText.length} — preview: ${rawText.substring(0, 200)}`)
  } catch (fetchErr) {
    const elapsed = Date.now() - t0
    const msg = String(fetchErr)
    const isTimeout = msg.includes('TimeoutError') || msg.includes('timeout') || msg.includes('aborted')
    console.error(`[crm/debug] Fetch failed after ${elapsed}ms:`, msg)
    return NextResponse.json({
      error: isTimeout
        ? `CRM không phản hồi sau ${elapsed}ms cho ${staff.name}. Có thể do SOAP params sai hoặc server quá tải.`
        : `Lỗi kết nối CRM cho ${staff.name}: ${msg}`,
      // Trả về thông số đã gửi để debug
      soapRequest: {
        MethodName: 'GetCustServiceByStaff',
        Param:      JSON.stringify(soapParam),
        IDENTITY:   identity,
        SESSION_ID: sessionId.substring(0, 16) + '...',
      },
    }, { status: 502 })
  }

  if (!rawText || rawText.trim() === '') {
    return NextResponse.json({
      error: `CRM trả về body rỗng cho ${staff.name}.`,
      soapRequest: {
        MethodName: 'GetCustServiceByStaff',
        Param:      JSON.stringify(soapParam),
        IDENTITY:   identity,
      },
    }, { status: 502 })
  }

  let json: CRMResponse
  try {
    json = JSON.parse(rawText) as CRMResponse
  } catch {
    return NextResponse.json({
      error:       `CRM trả về dữ liệu không parse được cho ${staff.name}.`,
      rawText:     rawText.substring(0, 500),
      soapRequest: { MethodName: 'GetCustServiceByStaff', Param: JSON.stringify(soapParam), IDENTITY: identity },
    }, { status: 502 })
  }

  if (!json.status) {
    return NextResponse.json({
      error:       json.error || `CRM status=0 cho ${staff.name}.`,
      rawText:     rawText.substring(0, 500),
      soapRequest: { MethodName: 'GetCustServiceByStaff', Param: JSON.stringify(soapParam), IDENTITY: identity },
    }, { status: 502 })
  }

  const tickets: CRMTicket[] = json.result ?? []

  // ── Bước 4: Phân loại accepted / rejected ────────────────────────────────────
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
    crmAccount:    mapping.crm_account,  // để verify đúng account được dùng
    identity,                             // IDENTITY từ login response
    totalRaw:      tickets.length,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    accepted,
    rejected,
  })
}
