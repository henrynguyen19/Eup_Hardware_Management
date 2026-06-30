/**
 * POST /api/sua-chua/crm-fetch
 * Gọi CRM SOAP GetDeviceRepair, trả về raw data + phân tích cơ bản.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser, crmLoginRaw, getCRMCredentials } from '@/lib/crm-session'
import { createClient } from '@supabase/supabase-js'

export const runtime     = 'nodejs'
export const maxDuration = 60

const CRM_URL = 'https://slt.ctms.vn/Eup_Java_CRM_SOAP/CRMEup_Servlet_SOAP'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export interface RepairRecord {
  Repair_ID:            number
  Device_ID:            number
  Device_Code:          string
  Unicode:              string
  ProductName:          string
  Repair_Description:   string
  RepairMan:            string
  RepairFinishMan:      string
  Repair_FinishReasonID: string
  Repair_Status:        number
  Repair_Status_String: string
  Repair_InDate:        string
  Repair_OutDate:       string
  Repair_InsertDate:    string
  WareHouseName:        string
}

interface CRMRepairResponse {
  status: number
  error:  string
  result: RepairRecord[]
}

async function callGetDeviceRepair(
  staffId: number,
  sessionId: string,
  identity: string,
  startTime: string,
  endTime: string,
  deviceCode: string | null = null
): Promise<RepairRecord[]> {
  const form = new URLSearchParams()
  form.append('MethodName', 'GetDeviceRepair')
  form.append('Param', JSON.stringify({
    StartTime:  startTime,
    EndTime:    endTime,
    searchType: '0',
    Device_Code: deviceCode,
  }))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY',   identity)

  const resp = await fetch(CRM_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    form.toString(),
    signal:  AbortSignal.timeout(50_000),
  })
  if (!resp.ok) throw new Error(`CRM HTTP ${resp.status}`)
  const raw = await resp.text()
  if (!raw?.trim()) throw new Error('CRM trả về body rỗng')
  let json: CRMRepairResponse
  try { json = JSON.parse(raw) }
  catch { throw new Error(`Không parse được response: ${raw.substring(0, 200)}`) }
  if (!json.status) throw new Error(json.error || 'CRM status=0')
  return json.result ?? []
}

// ── Phân tích dữ liệu ─────────────────────────────────────────────────────────
function analyzeRepairData(records: RepairRecord[]) {
  const byProduct:  Record<string, number> = {}
  const byStatus:   Record<string, number> = {}
  const byRepairMan: Record<string, number> = {}
  const byFinishMan: Record<string, number> = {}
  const byWarehouse: Record<string, number> = {}
  const descWords:  Record<string, number> = {}

  for (const r of records) {
    byProduct[r.ProductName || 'N/A']           = (byProduct[r.ProductName || 'N/A'] || 0) + 1
    byStatus[r.Repair_Status_String || 'N/A']   = (byStatus[r.Repair_Status_String || 'N/A'] || 0) + 1
    byRepairMan[r.RepairMan || 'N/A']           = (byRepairMan[r.RepairMan || 'N/A'] || 0) + 1
    byFinishMan[r.RepairFinishMan || 'N/A']     = (byFinishMan[r.RepairFinishMan || 'N/A'] || 0) + 1
    byWarehouse[r.WareHouseName || 'N/A']       = (byWarehouse[r.WareHouseName || 'N/A'] || 0) + 1

    // Phân tích các từ khóa mô tả lỗi
    const desc = (r.Repair_Description || '').toLowerCase()
    for (const word of desc.split(/[\s,;/]+/).filter(w => w.length > 2)) {
      descWords[word] = (descWords[word] || 0) + 1
    }
  }

  // Top 20 mô tả lỗi phổ biến
  const topDesc = Object.entries(descWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }))

  // Tính thời gian sửa trung bình (ngày)
  let totalDays = 0, countWithDates = 0
  for (const r of records) {
    if (r.Repair_InDate && r.Repair_OutDate) {
      const inD  = new Date(r.Repair_InDate.replace(' ', 'T'))
      const outD = new Date(r.Repair_OutDate.replace(' ', 'T'))
      if (!isNaN(inD.getTime()) && !isNaN(outD.getTime()) && outD > inD) {
        totalDays += (outD.getTime() - inD.getTime()) / 86400000
        countWithDates++
      }
    }
  }

  return {
    total:        records.length,
    byProduct:    sortDesc(byProduct),
    byStatus:     sortDesc(byStatus),
    byRepairMan:  sortDesc(byRepairMan),
    byFinishMan:  sortDesc(byFinishMan),
    byWarehouse:  sortDesc(byWarehouse),
    topDesc,
    avgRepairDays: countWithDates > 0 ? Math.round((totalDays / countWithDates) * 10) / 10 : null,
    fields:       records.length > 0 ? Object.keys(records[0]) : [],
  }
}

function sortDesc(obj: Record<string, number>) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: k, count: v }))
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const db = adminClient()
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  if (!perms.includes('admin:users') && !perms.includes('sua_chua:write')) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    startTime?:  string
    endTime?:    string
    deviceCode?: string | null
    staffName?:  string   // nếu muốn fetch theo staff cụ thể (admin)
    raw?:        boolean  // trả về toàn bộ records (không giới hạn)
  }

  // Mặc định: 30 ngày gần nhất
  const now   = new Date()
  const ago30 = new Date(now.getTime() - 30 * 86400000)
  const pad   = (n: number) => String(n).padStart(2, '0')
  const fmt   = (d: Date)   =>
    `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

  const startTime  = body.startTime  || fmt(ago30)
  const endTime    = body.endTime    || fmt(now)
  const deviceCode = body.deviceCode ?? null

  // Lấy session
  let sessionId: string
  let identity:  string

  try {
    if (body.staffName && perms.includes('admin:users')) {
      // Admin: login fresh theo staff
      const { data: mapping } = await db
        .from('user_crm_mapping')
        .select('crm_account, crm_password, crm_staff_id')
        .ilike('crm_nick_name', body.staffName)
        .single()
      if (!mapping?.crm_account) throw new Error(`Không tìm thấy mapping cho ${body.staffName}`)
      const login = await crmLoginRaw(mapping.crm_account, mapping.crm_password)
      if (!login.ok || !login.detectedSessionId) throw new Error(`Login CRM thất bại: ${login.error}`)
      sessionId = login.detectedSessionId
      identity  = login.detectedIdentity ?? String(mapping.crm_staff_id)
    } else {
      // Dùng session của user đang đăng nhập
      const session = await getCRMSessionForUser(user.id)
      sessionId = session.sessionId
      identity  = session.identity
    }
  } catch (e) {
    return NextResponse.json({ error: `Lỗi CRM session: ${String(e)}` }, { status: 400 })
  }

  // Lấy staffId (để truyền vào SOAP nếu cần)
  const creds = await getCRMCredentials(user.id)
  const staffId = creds?.crm_staff_id ?? 0

  try {
    const records = await callGetDeviceRepair(staffId, sessionId, identity, startTime, endTime, deviceCode)
    const analysis = analyzeRepairData(records)

    return NextResponse.json({
      ok:        true,
      startTime, endTime,
      analysis,
      // Trả về tối đa 50 records đầu để xem mẫu; raw=true thì trả hết
      sample:  body.raw ? records : records.slice(0, 50),
      total:   records.length,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
