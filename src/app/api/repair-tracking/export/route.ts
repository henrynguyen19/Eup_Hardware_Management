/**
 * GET /api/repair-tracking/export
 * Xuất lịch sử sửa chữa ra file Excel.
 *
 * Query params:
 *   destination=supplier|scrap|old_device  (có thể truyền nhiều: destination=supplier&destination=scrap)
 *                                           mặc định không lọc (lấy tất cả)
 *   warranty_scrap=true  → xuất 2 sheet: "Gửi NCC (Bảo hành)" + "Báo phế"
 *   imei=...   product=...   status=...    stale=true   minDays=N
 */
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import * as XLSX from 'xlsx'

export const runtime     = 'nodejs'
export const maxDuration = 60

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const STATUS_LABEL: Record<string, string> = {
  cho_gui: 'Chờ gửi sửa', da_gui: 'Đã gửi sửa', da_sua_xong: 'Đã sửa xong',
}
const FINISH_LABEL: Record<string, string> = {
  sua_xong: 'Sửa chữa xong', khong_loi_bt: 'Không lỗi (bình thường)',
  loai_bo: 'Loại bỏ', loai_bo_bo_mach: 'Loại bỏ (thay bo mạch)',
  send_supplier: 'Gửi nhà cung cấp',
}
const DEST_LABEL: Record<string, string> = {
  old_device: 'Trả lại sử dụng', scrap: 'Báo phế', supplier: 'Gửi NCC (Bảo hành)',
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso as string)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function fmtAge(days: number | null) {
  if (days === null || days < 0) return 'Không rõ'
  if (days < 30)   return `${days} ngày`
  if (days < 365)  return `${(days / 30).toFixed(1)} tháng`
  return `${(days / 365).toFixed(1)} năm`
}

/** Fetch tất cả records có phân trang */
async function fetchAll(
  filterDestinations: string[],
  filterImei: string | null,
  filterProduct: string | null,
  filterStatus: string | null,
  filterStale: boolean,
  filterMinDays: number,
) {
  const PAGE = 1000
  const items: Record<string, unknown>[] = []
  for (let page = 0; ; page++) {
    let q = sb()
      .from('repair_items')
      .select('id, imei, product_name, status, notes, repair_warehouse, finish_reason, destination, received_at, sent_at, completed_at, receiver_name, sender_name, completer_name, crm_repair_id')
      .order('imei',        { ascending: true })
      .order('received_at', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)

    if (filterDestinations.length > 0) q = q.in('destination', filterDestinations)
    if (filterImei)    q = q.ilike('imei', `%${filterImei}%`)
    if (filterProduct) q = q.ilike('product_name', `%${filterProduct}%`)
    if (filterStatus)  q = q.eq('status', filterStatus)
    if (filterStale)   q = q.in('status', ['cho_gui', 'da_gui'])

    const { data, error } = await q
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    items.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE) break
  }

  // Post-filter stale / minDays
  if (filterStale) {
    const cutoffMs = Date.now() - 7 * 86400000
    return items.filter(item => {
      const refDate = item.status === 'da_gui' ? item.sent_at : item.received_at
      return refDate && new Date(refDate as string).getTime() < cutoffMs
    })
  }
  if (filterMinDays > 0) {
    const cutoffMs = Date.now() - filterMinDays * 86400000
    return items.filter(item => {
      const refDate = item.status === 'da_gui' ? item.sent_at : item.received_at
      return refDate && new Date(refDate as string).getTime() < cutoffMs
    })
  }
  return items
}

/** Fetch device_inventory cho danh sách IMEIs → map imei → imported_date */
async function fetchDeviceAges(imeis: string[]): Promise<Map<string, string | null>> {
  const PAGE = 1000
  const result = new Map<string, string | null>()
  const uniqueImeis = [...new Set(imeis)]
  for (let i = 0; i < uniqueImeis.length; i += PAGE) {
    const batch = uniqueImeis.slice(i, i + PAGE)
    const { data } = await sb()
      .from('device_inventory')
      .select('device_code, imported_date')
      .in('device_code', batch)
    for (const row of data ?? []) {
      result.set(row.device_code as string, row.imported_date as string | null)
    }
  }
  return result
}

function computeAgeDays(importedDate: string | null, receivedAt: string | null | undefined): number | null {
  if (!importedDate || !receivedAt) return null
  const d1 = new Date(importedDate)
  const d2 = new Date(receivedAt as string)
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null
  const days = Math.round((d2.getTime() - d1.getTime()) / 86400000)
  return days < 0 ? null : days  // âm = CRM đăng ký muộn → ẩn
}

/** Chuyển list items thành rows Excel */
function toRows(items: Record<string, unknown>[], ageMap: Map<string, string | null>) {
  return items.map((item, idx) => {
    const receivedAt  = item.received_at  as string | null
    const sentAt      = item.sent_at      as string | null
    const completedAt = item.completed_at as string | null
    const imei        = String(item.imei ?? '')

    const importedDate = ageMap.get(imei) ?? null
    const ageDays      = computeAgeDays(importedDate, receivedAt)
    const refDate      = item.status === 'da_gui' ? sentAt : receivedAt
    const daysStale    = refDate
      ? Math.floor((Date.now() - new Date(refDate).getTime()) / 86400000)
      : null

    return {
      'STT':                  idx + 1,
      'IMEI':                 imei,
      'Loại thiết bị':        item.product_name ?? '',
      'Trạng thái':           STATUS_LABEL[String(item.status ?? '')] ?? item.status ?? '',
      'Kết quả xử lý':        DEST_LABEL[String(item.destination ?? '')] ?? '',
      'Ngày nhập kho (CRM)':  fmtDate(importedDate),
      'Tuổi thiết bị':        fmtAge(ageDays),
      'Ngày nhận vào kho SC': fmtDate(receivedAt),
      'Ngày gửi sửa':         fmtDate(sentAt),
      'Ngày hoàn thành':      fmtDate(completedAt),
      'Số ngày chờ/sửa':      daysStale ?? '',
      'Kho sửa chữa':         item.repair_warehouse ?? '',
      'Lý do hoàn thành':     FINISH_LABEL[String(item.finish_reason ?? '')] ?? '',
      'Ghi chú':              item.notes ?? '',
      'Người nhận':           item.receiver_name ?? '',
      'Người gửi sửa':        item.sender_name ?? '',
      'Người hoàn thành':     item.completer_name ?? '',
      'CRM Repair ID':        item.crm_repair_id ?? '',
    }
  })
}

const COL_WIDTHS = [
  { wch: 5 },  // STT
  { wch: 20 }, // IMEI
  { wch: 24 }, // Loại thiết bị
  { wch: 16 }, // Trạng thái
  { wch: 20 }, // Kết quả xử lý
  { wch: 16 }, // Ngày nhập kho
  { wch: 14 }, // Tuổi thiết bị
  { wch: 18 }, // Ngày nhận vào kho SC
  { wch: 14 }, // Ngày gửi sửa
  { wch: 14 }, // Ngày hoàn thành
  { wch: 14 }, // Số ngày
  { wch: 22 }, // Kho sửa chữa
  { wch: 22 }, // Lý do
  { wch: 35 }, // Ghi chú
  { wch: 15 }, // Người nhận
  { wch: 15 }, // Người gửi
  { wch: 15 }, // Người hoàn thành
  { wch: 12 }, // CRM ID
]

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const sp = new URL(req.url).searchParams

  // warranty_scrap=true → 2-sheet report cho supplier + scrap
  const warrantyScrap = sp.get('warranty_scrap') === 'true'

  const destinations = sp.getAll('destination')   // có thể truyền nhiều lần
  const filterImei    = sp.get('imei')
  const filterProduct = sp.get('product')
  const filterStatus  = sp.get('status')
  const filterStale   = sp.get('stale') === 'true'
  const filterMinDays = parseInt(sp.get('minDays') ?? '0', 10) || 0

  const date = new Date().toISOString().split('T')[0]
  const wb   = XLSX.utils.book_new()

  if (warrantyScrap) {
    // ── 2-sheet: Gửi NCC + Báo phế ──────────────────────────────────────
    const filterProduct2 = sp.get('product') || null
    const [supplierItems, scrapItems] = await Promise.all([
      fetchAll(['supplier'], filterImei, filterProduct2, null, false, 0),
      fetchAll(['scrap'],    filterImei, filterProduct2, null, false, 0),
    ])

    // Thu thập tất cả IMEIs để join device_inventory 1 lần
    const allImeis = [
      ...supplierItems.map(r => String(r.imei ?? '')),
      ...scrapItems.map(r => String(r.imei ?? '')),
    ].filter(Boolean)
    const ageMap = await fetchDeviceAges(allImeis)

    // Sheet 1: Gửi NCC (Bảo hành)
    const ws1 = XLSX.utils.json_to_sheet(toRows(supplierItems, ageMap))
    ws1['!cols'] = COL_WIDTHS
    XLSX.utils.book_append_sheet(wb, ws1, 'Gửi NCC (Bảo hành)')

    // Sheet 2: Báo phế
    const ws2 = XLSX.utils.json_to_sheet(toRows(scrapItems, ageMap))
    ws2['!cols'] = COL_WIDTHS
    XLSX.utils.book_append_sheet(wb, ws2, 'Báo phế')

    const buf          = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const prodSlug     = filterProduct2
      ? '-' + filterProduct2.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
      : ''
    const exportFile   = `bao-hanh-bao-phe${prodSlug}-${date}.xlsx`
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${exportFile}"`,
      },
    })
  }

  // ── Single-sheet export (existing behavior + destination filter) ────────
  const filterDests = destinations.length > 0 ? destinations : []
  const items = await fetchAll(filterDests, filterImei, filterProduct, filterStatus, filterStale, filterMinDays)

  const allImeis = items.map(r => String(r.imei ?? '')).filter(Boolean)
  const ageMap   = await fetchDeviceAges(allImeis)
  const rows     = toRows(items, ageMap)

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = COL_WIDTHS

  let sheetName = 'Lịch sử sửa chữa'
  let filename  = `lich-su-sua-chua-${date}.xlsx`
  if (filterStale) { sheetName = 'Thiết bị chờ sửa trễ'; filename = `thiet-bi-cho-sua-tre-${date}.xlsx` }
  else if (filterDests.includes('supplier') && filterDests.length === 1) {
    sheetName = 'Gửi NCC (Bảo hành)'; filename = `gui-ncc-bao-hanh-${date}.xlsx`
  } else if (filterDests.includes('scrap') && filterDests.length === 1) {
    sheetName = 'Báo phế'; filename = `bao-phe-${date}.xlsx`
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
