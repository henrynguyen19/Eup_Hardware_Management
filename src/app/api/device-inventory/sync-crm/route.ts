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
import { isAdminUser, hasSubPagePerm } from '@/lib/auth-helpers'
import { callCrmSoap } from '@/lib/crm-utils'

export const runtime     = 'nodejs'
export const maxDuration = 60

const HISTORY_START = '2023-01'   // YYYY-MM

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
  // Ưu tiên Device_Date (ngày nhập kho/đăng ký trong CRM) vì đây là ngày thực tế thiết bị được nhập
  // Device_TransferTime chỉ là ngày của từng giao dịch cụ thể, có thể khác tháng nhập
  const raw = r.Device_Date || r.Device_TransferTime
  if (!raw?.trim()) return null
  const d = new Date(raw.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

async function callGetDeviceMaintenance(
  sessionId: string, identity: string,
  startDate: string, endDate: string,
): Promise<CRMDevice[]> {
  console.log('[device-inventory/sync] GetDeviceMaintenance:', startDate, '→', endDate)
  const records = await callCrmSoap<CRMDevice>(
    'GetDeviceMaintenance',
    { StartDate: startDate, EndDate: endDate, WH_ID: null, Usable: null, Device_Code: null, QP_ProductKind: null },
    sessionId, identity,
    50_000
  )
  console.log('[device-inventory/sync] count:', records.length)
  return records
}

/**
 * Gọi GetDeviceMaintenance theo chunks tuần để tránh giới hạn records CRM.
 * Mỗi tháng chia thành 4-5 chunks 7 ngày, gộp lại rồi dedupe theo device_id.
 */
async function callGetDeviceMaintenanceChunked(
  sessionId: string, identity: string,
  monthStart: string, monthEnd: string,
): Promise<CRMDevice[]> {
  // Parse YYYY-MM-DD HH:MM:SS
  const start = new Date(monthStart.replace(' ', 'T'))
  const end   = new Date(monthEnd.replace(' ', 'T'))
  const CHUNK_DAYS = 7

  const chunks: { s: string; e: string }[] = []
  const cur = new Date(start)
  while (cur <= end) {
    const chunkStart = new Date(cur)
    const chunkEnd   = new Date(cur)
    chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS - 1)
    if (chunkEnd > end) chunkEnd.setTime(end.getTime())

    const fmt = (d: Date, isEnd: boolean) => {
      const y  = d.getFullYear()
      const mo = pad(d.getMonth() + 1)
      const dy = pad(d.getDate())
      return isEnd ? `${y}-${mo}-${dy} 23:59:59` : `${y}-${mo}-${dy} 00:00:00`
    }
    chunks.push({ s: fmt(chunkStart, false), e: fmt(chunkEnd, true) })
    cur.setDate(cur.getDate() + CHUNK_DAYS)
  }

  console.log(`[device-inventory/sync] Chunked: ${chunks.length} chunks for ${monthStart.slice(0,7)}`)

  // Gọi lần lượt (không song song để tránh quá tải CRM)
  const allRecords: CRMDevice[] = []
  for (const chunk of chunks) {
    try {
      const recs = await callGetDeviceMaintenance(sessionId, identity, chunk.s, chunk.e)
      allRecords.push(...recs)
    } catch (e) {
      console.error(`[device-inventory/sync] chunk ${chunk.s} lỗi:`, e)
    }
  }

  // Dedupe theo device_id (giữ record đầu tiên — order từ CRM)
  const seen = new Set<number>()
  return allRecords.filter(r => {
    if (seen.has(r.Device_ID)) return false
    seen.add(r.Device_ID)
    return true
  })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const db = sb()

    // Kiểm tra quyền
    const [_adm_di, _hp_di] = await Promise.all([
      isAdminUser(user.id),
      hasSubPagePerm(user.id, 'sua_chua_main', 'can_create'),
    ])
    if (!_adm_di && !_hp_di) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as { fromDate?: string; forceFrom?: string }

    // forceFrom: xóa sync_log của tất cả tháng >= forceFrom để sync lại
    if (body.forceFrom) {
      const forceYM = body.forceFrom.substring(0, 7)
      const allMonths0 = allMonthsToNow()
      const monthsToClear = allMonths0.filter(m => m >= forceYM)
      if (monthsToClear.length > 0) {
        await db.from('device_inventory_sync_log').delete().in('month', monthsToClear)
        console.log(`[device-inventory/sync] forceFrom=${forceYM}: cleared ${monthsToClear.length} months from sync_log`)
      }
      // Xóa cache stats
      await db.from('device_inventory_stats_cache').delete().eq('id', 'singleton')
    }

    // Lấy danh sách tháng đã sync thành công
    const { data: syncedRows } = await db
      .from('device_inventory_sync_log')
      .select('month')
    const syncedSet = new Set((syncedRows ?? []).map(r => r.month as string))

    const allMonths = allMonthsToNow()
    const totalMonths  = allMonths.length
    const syncedMonths = allMonths.filter(m => syncedSet.has(m)).length

    // Tìm tháng cần sync: ưu tiên fromDate (force 1 tháng), nếu không → tháng đầu tiên chưa sync
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

    // Gọi CRM — chia theo tuần để tránh giới hạn records CRM
    let records: CRMDevice[]
    try {
      records = await callGetDeviceMaintenanceChunked(sessionId, identity, start, end)
    } catch (e) {
      return NextResponse.json({ error: `Lỗi CRM tháng ${monthLabel}: ${String(e)}` }, { status: 500 })
    }

    console.log(`[device-inventory/sync] ${monthLabel}: ${records.length} records (chunked)`)

    let upserted = 0
    const errors: string[] = []

    if (records.length > 0) {
      // records đã được deduped theo device_id (giữ FIRST occurrence) trong callGetDeviceMaintenanceChunked
      const rows = records.map(r => ({
        device_id:       r.Device_ID,
        device_code:     (r.Device_Code || '').trim() || null,
        product_name:    getProductName(r),
        vendor_name:     r.Device_VendorName || null,
        imported_date:   getImportedDate(r),    // Device_Date = ngày nhập kho thực tế
        source_stock:    r.Device_SourceStockName || null,
        dest_stock:      r.Device_DestStockName || null,
        transfer_action: r.Device_TransferActionName || null,
        firmware_ver:    r.Device_FirewareVer || null,
        hardware_memo:   r.Device_HardwareMemo || null,
        memo:            r.Device_Memo || null,
        // crm_raw bị bỏ để giảm payload (48MB+ với tháng lớn → timeout)
        synced_at:       new Date().toISOString(),
      }))
      console.log(`[device-inventory/sync] ${monthLabel}: ${records.length} records`)

      // ignoreDuplicates: false — cho phép UPDATE các row đã tồn tại
      // Cần thiết để sửa imported_date sai từ lần sync cũ (khi dùng Device_TransferTime thay vì Device_Date)
      // An toàn vì imported_date luôn = Device_Date (ổn định), không bị thay đổi khi sync lại nhiều lần
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
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
      // Xóa cache stats để lần load tiếp sẽ tính lại từ dữ liệu mới
      await db.from('device_inventory_stats_cache').delete().eq('id', 'singleton')
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
    missing,
    log: syncedRows ?? [],
  })
}
