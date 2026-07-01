/**
 * POST /api/device-inventory/sync-crm
 * Sync danh sách thiết bị từ CRM vào bảng device_inventory.
 * Tháng qua tháng, bắt đầu từ 2024-01-01 (hoặc từ tháng mới nhất trong DB).
 * Mỗi request xử lý 1 tháng để tránh timeout Vercel (60s).
 *
 * Body: { fromDate?: "YYYY-MM-DD" }  -- nếu để trống → tự tính từ DB
 * Response: { synced, month, nextFromDate, done }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser } from '@/lib/crm-session'

export const runtime     = 'nodejs'
export const maxDuration = 60

const CRM_URL = 'https://slt.ctms.vn/Eup_Java_CRM_SOAP/CRMEup_Servlet_SOAP'
const HISTORY_START = '2024-01-01'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── CRM Response type ────────────────────────────────────────
interface CRMDevice {
  Device_ID:              number
  Device_Code:            string
  Device_Date:            string   // ngày tạo record / nhập kho
  Device_TransferTime:    string   // ngày chuyển kho
  Device_Type:            number
  Device_TypeName?:       string
  Device_ProductName?:    string
  Device_ProductKindName?: string
  QP_ProductKindName?:    string
  Device_VendorName?:     string
  Device_VendorID?:       number
  Device_SourceStockName: string
  Device_DestStockName:   string
  Device_TransferActionName: string
  Device_TransferManName: string
  Device_FirewareVer?:    string
  Device_HardwareMemo?:   string
  Device_Memo?:           string
  [key: string]: unknown
}

function pad(n: number) { return String(n).padStart(2, '0') }

function monthBounds(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate()
  return {
    start: `${year}-${pad(month)}-01 00:00:00`,
    end:   `${year}-${pad(month)}-${pad(lastDay)} 23:59:59`,
  }
}

function getProductName(r: CRMDevice): string {
  return (
    r.Device_TypeName ||
    r.Device_ProductKindName ||
    r.QP_ProductKindName ||
    r.Device_ProductName ||
    `Type-${r.Device_Type}`
  )
}

function getImportedDate(r: CRMDevice): string | null {
  const raw = r.Device_TransferTime || r.Device_Date
  if (!raw?.trim()) return null
  const d = new Date(raw.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

async function callGetDeviceMaintenance(
  sessionId: string,
  identity:  string,
  startDate: string,
  endDate:   string,
): Promise<CRMDevice[]> {
  const form = new URLSearchParams()
  form.append('MethodName', 'GetDeviceMaintenance')
  form.append('Param', JSON.stringify({
    StartDate:      startDate,
    EndDate:        endDate,
    WH_ID:          null,
    Usable:         null,
    Device_Code:    null,
    QP_ProductKind: null,
  }))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY',   identity)

  console.log('[device-inventory/sync] GetDeviceMaintenance:', startDate, '→', endDate)

  const resp = await fetch(CRM_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    form.toString(),
    signal:  AbortSignal.timeout(50_000),
  })
  if (!resp.ok) throw new Error(`CRM HTTP ${resp.status}`)
  const raw = await resp.text()
  if (!raw?.trim()) throw new Error('CRM trả về body rỗng')
  const json = JSON.parse(raw)
  console.log('[device-inventory/sync] CRM status:', json.status, 'count:', Array.isArray(json.result) ? json.result.length : 'N/A')
  if (!json.status) throw new Error(json.error || 'CRM status=0')
  return json.result ?? []
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const db = sb()

    // Kiểm tra quyền
    const { data: permData } = await db
      .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
    const perms: string[] = permData?.permissions ?? []
    if (!perms.includes('repair_tracking:write') && !perms.includes('admin:users')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as { fromDate?: string }

    // Tính tháng cần load
    let fromDate = body.fromDate

    if (!fromDate) {
      // Tìm tháng mới nhất trong DB
      const { data: latest } = await db
        .from('device_inventory')
        .select('imported_date')
        .order('imported_date', { ascending: false })
        .limit(1)
        .single()

      if (latest?.imported_date) {
        // Lùi lại 1 tháng để sync lại tháng cuối (tránh bỏ sót)
        const d = new Date(latest.imported_date)
        d.setMonth(d.getMonth() - 1)
        fromDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
      } else {
        fromDate = HISTORY_START
      }
    }

    const [fy, fm] = fromDate.split('-').map(Number)
    const now = new Date()

    // Kiểm tra đã sync hết chưa
    if (fy > now.getFullYear() || (fy === now.getFullYear() && fm > now.getMonth() + 1)) {
      return NextResponse.json({ ok: true, done: true, message: 'Đã sync hết dữ liệu đến tháng hiện tại' })
    }

    const { start, end } = monthBounds(fy, fm)
    const monthLabel = `${String(fm).padStart(2,'0')}/${fy}`

    // Lấy CRM session
    const session = await getCRMSessionForUser(user.id)
    const { sessionId, identity } = session

    // Gọi CRM
    let records: CRMDevice[]
    try {
      records = await callGetDeviceMaintenance(sessionId, identity, start, end)
    } catch (e) {
      return NextResponse.json({ error: `Lỗi CRM: ${String(e)}` }, { status: 500 })
    }

    console.log(`[device-inventory/sync] ${monthLabel}: ${records.length} records từ CRM`)

    // Map + upsert
    let upserted = 0
    const errors: string[] = []

    if (records.length > 0) {
      const rows = records.map(r => ({
        device_id:       r.Device_ID,
        device_code:     (r.Device_Code || '').trim() || null,
        product_name:    getProductName(r),
        vendor_name:     r.Device_VendorName || null,
        imported_date:   getImportedDate(r),
        source_stock:    r.Device_SourceStockName || null,
        dest_stock:      r.Device_DestStockName || null,
        transfer_action: r.Device_TransferActionName || null,
        firmware_ver:    r.Device_FirewareVer || null,
        hardware_memo:   r.Device_HardwareMemo || null,
        memo:            r.Device_Memo || null,
        crm_raw:         r,
        synced_at:       new Date().toISOString(),
      }))

      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200)
        const { error } = await db
          .from('device_inventory')
          .upsert(batch, { onConflict: 'device_id', ignoreDuplicates: false })
        if (error) errors.push(error.message)
        else upserted += batch.length
      }
    }

    // Tính nextFromDate (tháng tiếp theo)
    const nextMonth = new Date(fy, fm, 1)  // fm là 1-indexed, new Date(y, m, 1) = tháng m+1
    const isDone = nextMonth > now

    const nextFromDate = isDone ? null
      : `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-01`

    return NextResponse.json({
      ok:           errors.length === 0,
      month:        monthLabel,
      total:        records.length,
      upserted,
      errors:       errors.length > 0 ? errors.slice(0, 3) : undefined,
      nextFromDate,
      done:         isDone,
    })

  } catch (err) {
    console.error('[device-inventory/sync] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
