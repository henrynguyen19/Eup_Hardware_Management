/**
 * GET /api/repair-tracking/weekly-summary/export
 * Xuất báo cáo tuần sửa chữa ra file Excel (2 sheet: Summary + Detail)
 *
 * Query params: from=YYYY-MM-DD, to=YYYY-MM-DD
 */
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function pct(n: number, total: number) {
  if (!total) return 0
  return Math.round((n / total) * 100)
}

function normalizeProduct(name: string): string {
  const n = (name ?? '').trim()
  if (/go.?168|go-168|go168/i.test(n))       return 'GO'
  if (/c-?43|streamax.*c43|c43/i.test(n))    return 'C43'
  if (/vn88.*4g[h]|4gh/i.test(n))            return '4GH'
  if (/dvr|mdvr|h5.*dvr/i.test(n))           return 'DVR88'
  if (/camera|cam(?!era)/i.test(n))           return 'Camera'
  if (/\bh5\b/i.test(n))                     return 'H5'
  if (/bewin|bw/i.test(n))                   return 'Bewin'
  if (/gotrack|gotrack.*s4|s400/i.test(n))   return 'Gotrack'
  if (/fuel|sensor/i.test(n))                return 'FuelSensor'
  if (/vn88.*4g|4g.*vn88/i.test(n))          return 'VN88 4G'
  if (/vn88/i.test(n))                       return 'VN88'
  return n || 'Khác'
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso as string)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

const DEST_LABEL: Record<string, string> = {
  old_device: 'Trả lại sử dụng',
  scrap:      'Báo phế',
  supplier:   'Gửi NCC (Bảo hành)',
}
const FINISH_LABEL: Record<string, string> = {
  sua_xong:        'Sửa chữa xong',
  khong_loi_bt:    'Không lỗi (bình thường)',
  loai_bo:         'Loại bỏ',
  loai_bo_bo_mach: 'Loại bỏ (thay bo mạch)',
  send_supplier:   'Gửi nhà cung cấp',
}

function outcomeLabel(destination: string | null, finishReason: string | null): string {
  if (destination === 'supplier') return 'Gửi bảo hành'
  if (destination === 'scrap')    return 'Báo phế'
  if (destination === 'old_device') {
    return finishReason === 'khong_loi_bt' ? 'Không lỗi' : 'Đã sửa xong'
  }
  return 'Không xác định'
}

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const sp = req.nextUrl.searchParams
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now); monday.setDate(now.getDate() + mondayOffset)
  const defaultFrom = monday.toISOString().split('T')[0]
  const defaultTo   = now.toISOString().split('T')[0]

  const from = sp.get('from') || defaultFrom
  const to   = sp.get('to')   || defaultTo

  // Lấy dữ liệu chi tiết
  const { data, error } = await sb()
    .from('repair_items')
    .select('imei, product_name, destination, finish_reason, completed_at, completer_name, notes, repair_warehouse')
    .eq('status', 'da_sua_xong')
    .gte('completed_at', `${from}T00:00:00`)
    .lte('completed_at', `${to}T23:59:59`)
    .order('completed_at', { ascending: true })

  if (error) return new Response(error.message, { status: 500 })
  const rows = data ?? []

  // ── Sheet 1: Summary by product ────────────────────────────────────────────
  let repaired = 0, warranty = 0, noFault = 0, broken = 0
  const byProductMap = new Map<string, { delivered: number; repaired: number; warranty: number; noFault: number; broken: number }>()
  function getEntry(p: string) {
    if (!byProductMap.has(p)) byProductMap.set(p, { delivered: 0, repaired: 0, warranty: 0, noFault: 0, broken: 0 })
    return byProductMap.get(p)!
  }
  for (const r of rows) {
    const product = normalizeProduct(r.product_name ?? '')
    const entry   = getEntry(product)
    entry.delivered++
    const dest = r.destination ?? ''
    const reason = r.finish_reason ?? ''
    if (dest === 'supplier')    { warranty++;  entry.warranty++ }
    else if (dest === 'scrap')  { broken++;    entry.broken++   }
    else if (dest === 'old_device' && reason === 'khong_loi_bt') { noFault++;  entry.noFault++  }
    else                        { repaired++;  entry.repaired++ }
  }
  const total = rows.length

  const summaryRows = Array.from(byProductMap.entries())
    .map(([product, c]) => ({ 'Loại thiết bị': product, 'Hoàn thành': c.delivered, 'Đã sửa xong': c.repaired || '', 'Gửi bảo hành': c.warranty || '', 'Không lỗi': c.noFault || '', 'Báo phế': c.broken || '' }))
    .sort((a, b) => (b['Hoàn thành'] as number) - (a['Hoàn thành'] as number))

  // Total row
  summaryRows.push({ 'Loại thiết bị': 'Tổng cộng', 'Hoàn thành': total, 'Đã sửa xong': repaired, 'Gửi bảo hành': warranty, 'Không lỗi': noFault, 'Báo phế': broken })

  // Header info rows (outcome summary)
  const headerRows = [
    { 'Loại thiết bị': `Báo cáo sửa chữa từ ${fmtDate(from+'T00:00:00')} đến ${fmtDate(to+'T00:00:00')}`, 'Hoàn thành': '', 'Đã sửa xong': '', 'Gửi bảo hành': '', 'Không lỗi': '', 'Báo phế': '' },
    { 'Loại thiết bị': `Tổng hoàn thành: ${total}   Đã sửa: ${repaired} (${pct(repaired,total)}%)   Bảo hành: ${warranty} (${pct(warranty,total)}%)   Không lỗi: ${noFault} (${pct(noFault,total)}%)   Báo phế: ${broken} (${pct(broken,total)}%)`, 'Hoàn thành': '', 'Đã sửa xong': '', 'Gửi bảo hành': '', 'Không lỗi': '', 'Báo phế': '' },
    { 'Loại thiết bị': '', 'Hoàn thành': '', 'Đã sửa xong': '', 'Gửi bảo hành': '', 'Không lỗi': '', 'Báo phế': '' },
  ]

  const ws1 = XLSX.utils.json_to_sheet([...headerRows, ...summaryRows])
  ws1['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }]

  // ── Sheet 2: Detail list ────────────────────────────────────────────────────
  const detailRows = rows.map((r, i) => ({
    'STT':             i + 1,
    'IMEI':            r.imei ?? '',
    'Loại thiết bị':   normalizeProduct(r.product_name ?? ''),
    'Tên gốc':         r.product_name ?? '',
    'Kết quả':         outcomeLabel(r.destination, r.finish_reason),
    'Kết quả xử lý':   DEST_LABEL[r.destination ?? ''] ?? '',
    'Lý do':           FINISH_LABEL[r.finish_reason ?? ''] ?? '',
    'Ngày hoàn thành': fmtDate(r.completed_at),
    'Người hoàn thành': r.completer_name ?? '',
    'Kho sửa chữa':    r.repair_warehouse ?? '',
    'Ghi chú / Hashtag': r.notes ?? '',
  }))

  const ws2 = XLSX.utils.json_to_sheet(detailRows)
  ws2['!cols'] = [
    { wch: 5 }, { wch: 20 }, { wch: 14 }, { wch: 24 }, { wch: 16 },
    { wch: 20 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 35 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, 'Tổng hợp theo thiết bị')
  XLSX.utils.book_append_sheet(wb, ws2, 'Chi tiết')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `bao-cao-sua-chua-${from}-${to}.xlsx`

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
