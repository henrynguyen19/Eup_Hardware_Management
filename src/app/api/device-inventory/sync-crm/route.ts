/**
 * POST /api/device-inventory/sync-crm
 * Sync danh sách thiết bị từ CRM vào bảng device_inventory.
 * Dùng device_inventory_sync_log để track tháng nào đã xong.
 * Mỗi request xử lý 1 tháng, tự động tìm tháng chưa sync.
 *
 * Body: { fromDate?: "YYYY-MM" }  -- force sync tháng cụ thể
 * Response: { synced, month, nextFromDate, done, totalMonths, syncedMonths }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser } from '@/lib/crm-session'

export const runtime     = 'nodejs'
export const maxDuration = 60

const CRM_URL       = 'https://slt.ctms.vn/Eup_Java_CRM_SOAP/CRMEup_Servlet_SOAP'
const HISTORY_START = '2024-01'   // YYYY-MM

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── CRM Response type ────────────────────────────────────────
interface CRMDevice {
  Device_ID:               number
  Device_Code:             string
  Device_Date:             string
  Device_TransferTime:     string
  Device_Type:             number
  Device_TypeName?:        string
  Device_ProductName?:     string
  Device_ProductKindName?: string
  QP_ProductKindName?:     string
  Device_VendorName?:      string
  Device_SourceStockName:  string
  Device_DestStockName:    string
  Device_TransferActionName: string
  Device_TransferManName:  string
  Device_FirewareVer?:     string
  Device_HardwareMemo?:    string
  Device_Memo?:            string
  [key: string]: unknown
}

function pad(n: number) { return String(n).padStart(2, '0') }

function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    start: `${y}-${pad(m)}-01 00:00:00`,
    end:   `${y}-${pad(m)}-${pad(lastDay)} 23:59:59`,
  }
}

/** Sinh list tất cả YYYY-MM từ HISTORY_START đến tháng hiện tại */
function allMonthsToNow(): string[] {
  const months: string[] = []
  const [sy, sm] = HISTORY_START.split('-').map(Number)
  const now = new Date()
  let y = sy, m = sm
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    months.push(`${y}-${pad(m)}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return months
}

function getProductName(r: CRMDevice): string {
  return (
    r.Device_TypeName        ||
    r.Device_ProductKindName ||
    r.QP_ProductKindName     ||
    r.Device_ProductName     ||
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
  sessionId: string, identity: string,
  startDate: string, endDate: string,
): Promise<CRMDevice[]> {
  const form = new URLSearchParams()
  form.append('MethodName', 'GetDeviceMaintenance')
  form.append('Param', JSON.stringify({
    StartDate: startDate, EndDate: endDate,
    WH_ID: null, Usable: null, Device_Code: null, QP_ProductKind: null,
  }))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY',   identity)

  console.log('[device-inventory/sync] GetDeviceMaintenance:', startDate, '→', endDate)
  const resp = await fetch(CRM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(50_000),
  })
  if (!resp.ok) throw new Error(`CRM HTTP ${resp.status}`)
  const raw = await resp.text()
  if (!raw?.trim()) throw new Error('CRM trả về body rỗng')
  const json = JSON.parse(raw)
  console.log('[device-inventory/sync] status:', json.status, 'count:', Array.isArray(json.result) ? json.result.length : 'N/A')
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

    // Lấy danh sách tháng đã sync thành công
    const { data: syncedRows } = await db
      .from('device_inventory_sync_log')
      .select('month')
    const syncedSet = new Set((syncedRows ?? []).map(r => r.month as string))

    const allMonths = allMonthsToNow()
    const totalMonths  = allMonths.length
    const syncedMonths = allMonths.filter(m => syncedSet.has(m)).length

    // Tìm tháng cần sync: ưu tiên fromDate (force), nếu không → tháng đầu tiên chưa sync
    let targetMonth: string
    if (body.fromDate) {
      // fromDate có thể là YYYY-MM hoặc YYYY-MM-DD
      targetMonth = body.fromDate.substring(0, 7)
    } else {
      const unsyncedMonth = allMonths.find(m => !syncedSet.has(m))
      if (!unsyncedMonth) {
        return NextResponse.json({
          ok: true, done: true,
          message: 'Tất cả tháng đã được sync hoàn thành',
          totalMonths, syncedMonths,
        })
      }
      targetMonth = unsyncedMonth
    }

    const { start, end } = monthBounds(targetMonth)
    const [ty, tm] = targetMonth.split('-').map(Number)
    const monthLabel = `${pad(tm)}/${ty}`

    // Lấy CRM session
    const session = await getCRMSessionForUser(user.id)
    const { sessionId, identity } = session

    // Gọi CRM
    let records: CRMDevice[]
    try {
      records = await callGetDeviceMaintenance(sessionId, identity, start, end)
    } catch (e) {
      return NextResponse.json({ error: `Lỗi CRM tháng ${monthLabel}: ${String(e)}` }, { status: 500 })
    }

    console.log(`[device-inventory/sync] ${monthLabel}: ${records.length} records`)

    let upserted = 0
    const errors: string[] = []

    if (records.length > 0) {
      // Dedupe theo device_id (giữ record cuối cùng nếu trùng)
      const rowMap = new Map<number, Record<string, unknown>>()
      for (const r of records) {
        rowMap.set(r.Device_ID, {
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
        })
      }
      const rows = Array.from(rowMap.values())
      console.log(`[device-inventory/sync] ${monthLabel}: ${records.length} raw → ${rows.length} sau dedupe`)

      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200)
        const { error } = await db
          .from('device_inventory')
          .upsert(batch, { onConflict: 'device_id', ignoreDuplicates: false })
        if (error) errors.push(error.message)
        else upserted += batch.length
      }
    }

    // Ghi vào sync_log nếu không có lỗi
    const hasError = errors.length > 0
    if (!hasError) {
      await db.from('device_inventory_sync_log').upsert({
        month:        targetMonth,
        record_count: upserted,
        has_error:    false,
        synced_at:    new Date().toISOString(),
      }, { onConflict: 'month' })
      syncedSet.add(targetMonth)
    }

    // Tìm tháng chưa sync tiếp theo
    const nextMonth    = allMonths.find(m => !syncedSet.has(m) && m > targetMonth) ?? null
    const done         = !nextMonth
    const newSynced    = allMonths.filter(m => syncedSet.has(m)).length

    return NextResponse.json({
      ok:           !hasError,
      month:        monthLabel,
      total:        records.length,
      upserted,
      errors:       hasError ? errors.slice(0, 3) : undefined,
      nextFromDate: done ? null : nextMonth,
      done,
      totalMonths,
      syncedMonths: newSynced,
    })

  } catch (err) {
    console.error('[device-inventory/sync] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// GET: trả về trạng thái sync (tháng nào xong, tháng nào chưa)
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = sb()
  const { data: syncedRows } = await db
    .from('device_inventory_sync_log')
    .select('month, record_count, synced_at')
    .order('month', { ascending: true })

  const syncedSet = new Set((syncedRows ?? []).map(r => r.month as string))
  const allMonths = allMonthsToNow()
  const missing   = allMonths.filter(m => !syncedSet.has(m))

  return NextResponse.json({
    totalMonths:  allMonths.length,
    syncedMonths: syncedSet.size,
    missingMonths: missing,
    log: syncedRows ?? [],
  })
}
