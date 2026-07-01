/**
 * GET /api/repair-tracking/export
 * Xuất toàn bộ lịch sử sửa chữa ra file Excel.
 * Mỗi dòng = 1 lần sửa; cùng IMEI → nhiều dòng theo thứ tự thời gian.
 */
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'
export const maxDuration = 60

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STATUS_LABEL: Record<string, string> = {
  cho_gui: 'Chờ gửi sửa', da_gui: 'Đã gửi sửa', da_sua_xong: 'Đã sửa xong',
}
const FINISH_LABEL: Record<string, string> = {
  sua_xong: 'Sửa chữa xong', khong_loi_bt: 'Không lỗi (bình thường)',
  loai_bo: 'Loại bỏ', loai_bo_bo_mach: 'Loại bỏ (thay bo mạch)',
  send_supplier: 'Send to Supplier',
}
const DEST_LABEL: Record<string, string> = {
  old_device: 'Old Device', scrap: 'Scrap', supplier: 'Supplier',
}

function fmtDate(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const sp = new URL(req.url).searchParams
  const filterImei    = sp.get('imei')
  const filterProduct = sp.get('product')
  const filterStatus  = sp.get('status')
  const filterStale   = sp.get('stale') === 'true'   // chỉ lấy cho_gui/da_gui quá 7 ngày
  const filterMinDays = parseInt(sp.get('minDays') ?? '0', 10) || 0

  // Lấy TẤT CẢ records — sắp xếp theo IMEI rồi received_at để lịch sử liên tục
  const PAGE = 1000
  const items: Record<string, unknown>[] = []
  for (let page = 0; ; page++) {
    let q = sb()
      .from('repair_items')
      .select('imei, product_name, status, notes, repair_warehouse, finish_reason, destination, received_at, sent_at, completed_at, receiver_name, sender_name, completer_name, crm_repair_id')
      .order('imei',        { ascending: true })
      .order('received_at', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (filterImei)    q = q.ilike('imei', `%${filterImei}%`)
    if (filterProduct) q = q.ilike('product_name', `%${filterProduct}%`)
    if (filterStatus)  q = q.eq('status', filterStatus)
    if (filterStale) {
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString()
      // cho_gui + da_gui quá 7 ngày — dùng OR condition qua filter
      q = q.in('status', ['cho_gui', 'da_gui'])
    }
    const { data, error } = await q
    if (error) return new Response(error.message, { status: 500 })
    if (!data || data.length === 0) break
    items.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE) break
  }

  // Đánh số thứ tự sửa chữa cho từng IMEI
  // Post-filter stale (Supabase không support OR trên 2 cột khác nhau dễ)
  let finalItems = items
  if (filterStale) {
    const cutoffMs = Date.now() - 7 * 86400000
    finalItems = items.filter(item => {
      const refDate = item.status === 'da_gui' ? item.sent_at : item.received_at
      if (!refDate) return false
      return new Date(refDate as string).getTime() < cutoffMs
    })
  }

  // Post-filter minDays (client-passed từ filter UI)
  if (filterMinDays > 0) {
    const cutoffMs = Date.now() - filterMinDays * 86400000
    finalItems = finalItems.filter(item => {
      const refDate = item.status === 'da_gui' ? item.sent_at : item.received_at
      if (!refDate) return false
      return new Date(refDate as string).getTime() < cutoffMs
    })
  }

  const rows = finalItems.map((item, idx) => {
    const receivedAt  = item.received_at as string | null
    const sentAt      = item.sent_at     as string | null
    const completedAt = item.completed_at as string | null
    const refDate     = item.status === 'da_gui' ? sentAt : receivedAt
    const daysStale   = refDate
      ? Math.floor((Date.now() - new Date(refDate).getTime()) / 86400000)
      : null
    return {
      'STT':                idx + 1,
      'IMEI':               item.imei,
      'Loại thiết bị':      item.product_name,
      'Trạng thái':         STATUS_LABEL[String(item.status)] ?? item.status,
      'Ngày nhận vào kho':  fmtDate(receivedAt),
      'Ngày gửi sửa':       fmtDate(sentAt),
      'Số ngày chờ/sửa':    daysStale ?? '',
      'Kho sửa chữa':       item.repair_warehouse ?? '',
      'Kết quả':            DEST_LABEL[String(item.destination ?? '')] ?? '',
      'Lý do hoàn thành':   FINISH_LABEL[String(item.finish_reason ?? '')] ?? '',
      'Ghi chú sửa chữa':   item.notes ?? '',
      'Người nhận':         item.receiver_name ?? '',
      'Người gửi sửa':      item.sender_name ?? '',
      'CRM Repair ID':      item.crm_repair_id ?? '',
    }
  })

  // Tạo Excel
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 5 }, { wch: 20 }, { wch: 24 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
    { wch: 14 }, { wch: 22 }, { wch: 35 },
    { wch: 15 }, { wch: 15 }, { wch: 12 },
  ]
  const sheetName = filterStale ? 'Thiết bị chờ sửa trễ' : 'Lịch sử sửa chữa'
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const buf      = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const date     = new Date().toISOString().split('T')[0]
  const filename = filterStale
    ? `thiet-bi-cho-sua-tre-${date}.xlsx`
    : `lich-su-sua-chua-${date}.xlsx`

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
