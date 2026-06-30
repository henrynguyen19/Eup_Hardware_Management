/**
 * POST /api/repair-tracking/sync-crm
 * Đồng bộ dữ liệu sửa chữa từ CRM vào bảng repair_items.
 * Body: { startTime: "YYYY-MM-DD HH:mm:ss", endTime: "...", staffName?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser, crmLoginRaw, getCRMCredentials } from '@/lib/crm-session'

export const runtime     = 'nodejs'
export const maxDuration = 60

const CRM_URL = 'https://slt.ctms.vn/Eup_Java_CRM_SOAP/CRMEup_Servlet_SOAP'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── CRM field types ───────────────────────────────────────────
interface RepairRecord {
  Repair_ID:             number
  Device_ID:             number
  Device_Code:           string
  Unicode:               string
  ProductName:           string
  Repair_Description:    string
  RepairMan:             string
  RepairFinishMan:       string
  Repair_FinishReasonID: string
  Repair_Status:         number
  Repair_Status_String:  string
  Repair_InDate:         string   // ngày gửi vào kho sửa
  Repair_OutDate:        string   // ngày hoàn thành
  Repair_InsertDate:     string   // ngày tạo record (nhận về kho tổng)
  WareHouseName:         string
}

// ── Map CRM → our enums ───────────────────────────────────────
function mapStatus(r: RepairRecord): 'cho_gui' | 'da_gui' | 'da_sua_xong' {
  if (r.Repair_OutDate && r.Repair_OutDate.trim()) return 'da_sua_xong'
  if (r.Repair_InDate  && r.Repair_InDate.trim())  return 'da_gui'
  return 'cho_gui'
}

function mapFinishReason(r: RepairRecord): string | null {
  if (!r.Repair_OutDate?.trim()) return null
  const id  = String(r.Repair_FinishReasonID || '').trim()
  const str = (r.Repair_Status_String || '').toLowerCase()

  // Map by FinishReasonID first (nếu biết), else by string
  if (id === '1' || str.includes('sửa xong') || str.includes('sua xong'))           return 'sua_xong'
  if (id === '2' || (str.includes('bình thường') || str.includes('binh thuong')))   return 'khong_loi_bt'
  if (id === '4' || str.includes('bo mạch') || str.includes('bo mach'))             return 'loai_bo_bo_mach'
  if (id === '3' || str.includes('loại bỏ') || str.includes('loai bo'))             return 'loai_bo'
  if (id === '5' || str.includes('supplier') || str.includes('hãng'))               return 'send_supplier'
  // fallback
  if (r.Repair_OutDate?.trim()) return 'sua_xong'
  return null
}

function mapDestination(reason: string | null): string | null {
  if (!reason) return null
  if (reason === 'sua_xong' || reason === 'khong_loi_bt') return 'old_device'
  if (reason === 'loai_bo'  || reason === 'loai_bo_bo_mach') return 'scrap'
  if (reason === 'send_supplier') return 'supplier'
  return null
}

function parseDate(s: string | null): string | null {
  if (!s?.trim()) return null
  // CRM format: "YYYY-MM-DD HH:mm:ss" hoặc "YYYY-MM-DDTHH:mm:ss"
  const d = new Date(s.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function mapRecord(r: RepairRecord) {
  const status       = mapStatus(r)
  const finish_reason = mapFinishReason(r)
  const destination  = mapDestination(finish_reason)
  const imei         = (r.Unicode || r.Device_Code || '').trim()

  return {
    crm_repair_id:   r.Repair_ID,
    imei:            imei || `CRM-${r.Device_ID}`,
    product_name:    (r.ProductName || 'Unknown').trim(),
    notes:           r.Repair_Description?.trim() || null,
    status,
    repair_warehouse: (r.WareHouseName || null),
    finish_reason:   finish_reason as string | null,
    destination:     destination as string | null,
    // Timestamps
    received_at:     parseDate(r.Repair_InsertDate) ?? new Date().toISOString(),
    sent_at:         parseDate(r.Repair_InDate),
    completed_at:    parseDate(r.Repair_OutDate),
    // Người thực hiện (name only — không có user_id từ CRM)
    sender_name:     r.RepairMan?.trim()       || null,
    completer_name:  r.RepairFinishMan?.trim() || null,
  }
}

// ── Gọi CRM SOAP ─────────────────────────────────────────────
async function callGetDeviceRepair(
  sessionId: string,
  identity:  string,
  startTime: string,
  endTime:   string,
): Promise<RepairRecord[]> {
  const form = new URLSearchParams()
  form.append('MethodName', 'GetDeviceRepair')
  form.append('Param', JSON.stringify({
    StartTime:   startTime,
    EndTime:     endTime,
    searchType:  '0',
    Device_Code: null,
  }))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY',   identity)

  const resp = await fetch(CRM_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    form.toString(),
    signal:  AbortSignal.timeout(55_000),
  })
  if (!resp.ok) throw new Error(`CRM HTTP ${resp.status}`)
  const raw = await resp.text()
  if (!raw?.trim()) throw new Error('CRM trả về body rỗng')
  const json = JSON.parse(raw)
  if (!json.status) throw new Error(json.error || 'CRM status=0')
  return json.result ?? []
}

// ── POST handler ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const db = sb()
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  if (!perms.includes('repair_tracking:write') && !perms.includes('admin:users')) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    startTime?: string
    endTime?:   string
    staffName?: string
  }

  // Default: 30 ngày gần nhất
  const now   = new Date()
  const ago30 = new Date(now.getTime() - 30 * 86400000)
  const pad   = (n: number) => String(n).padStart(2, '0')
  const fmt   = (d: Date)   =>
    `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} 00:00:00`

  const startTime = body.startTime || fmt(ago30)
  const endTime   = body.endTime   || fmt(now).replace('00:00:00', '23:59:59')

  // Lấy CRM session
  let sessionId: string, identity: string
  try {
    if (body.staffName && perms.includes('admin:users')) {
      const { data: mapping } = await db
        .from('user_crm_mapping')
        .select('crm_account, crm_password, crm_staff_id')
        .ilike('crm_nick_name', body.staffName)
        .single()
      if (!mapping?.crm_account) throw new Error(`Không tìm thấy mapping cho ${body.staffName}`)
      const login = await crmLoginRaw(mapping.crm_account, mapping.crm_password)
      if (!login.ok || !login.detectedSessionId) throw new Error(`Login CRM thất bại`)
      sessionId = login.detectedSessionId
      identity  = login.detectedIdentity ?? String(mapping.crm_staff_id)
    } else {
      const session = await getCRMSessionForUser(user.id)
      sessionId = session.sessionId
      identity  = session.identity
    }
  } catch (e) {
    return NextResponse.json({ error: `Lỗi CRM session: ${String(e)}` }, { status: 400 })
  }

  // Gọi CRM
  let records: RepairRecord[]
  try {
    records = await callGetDeviceRepair(sessionId, identity, startTime, endTime)
  } catch (e) {
    return NextResponse.json({ error: `Lỗi CRM: ${String(e)}` }, { status: 500 })
  }

  if (records.length === 0) {
    return NextResponse.json({ ok: true, total: 0, upserted: 0, message: 'Không có dữ liệu trong khoảng thời gian này' })
  }

  // Map + upsert theo crm_repair_id
  const rows = records.map(mapRecord)

  let upserted = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50)
    const { error } = await db
      .from('repair_items')
      .upsert(batch, { onConflict: 'crm_repair_id', ignoreDuplicates: false })
    if (error) errors.push(error.message)
    else upserted += batch.length
  }

  return NextResponse.json({
    ok:        errors.length === 0,
    total:     records.length,
    upserted,
    startTime,
    endTime,
    errors:    errors.length > 0 ? errors : undefined,
  })
}
