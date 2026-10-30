/**
 * GET /api/repair-tracking/weekly-summary
 * Tổng hợp kết quả sửa chữa theo tuần — dùng cho báo cáo tuần.
 *
 * Query params:
 *   from=YYYY-MM-DD  (default: đầu tuần hiện tại)
 *   to=YYYY-MM-DD    (default: hôm nay)
 *
 * Response:
 *   total, repaired, warranty, noFault, broken (counts + pct)
 *   byProduct: [ { product, delivered, repaired, warranty, noFault, broken } ]
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function pct(n: number, total: number) {
  if (!total) return 0
  return Math.round((n / total) * 100)
}

/** Chuẩn hoá tên loại thiết bị: rút gọn theo alias */
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

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams

  // Default: đầu tuần hiện tại (thứ 2) → hôm nay
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  const defaultFrom = monday.toISOString().split('T')[0]
  const defaultTo   = now.toISOString().split('T')[0]

  const from = sp.get('from') || defaultFrom
  const to   = sp.get('to')   || defaultTo

  // Lấy tất cả items đã hoàn thành trong khoảng thời gian
  const { data, error } = await sb()
    .from('repair_items')
    .select('product_name, destination, finish_reason, completed_at')
    .eq('status', 'da_sua_xong')
    .gte('completed_at', `${from}T00:00:00`)
    .lte('completed_at', `${to}T23:59:59`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  let repaired = 0, warranty = 0, noFault = 0, broken = 0

  // Gom theo product
  const byProductMap = new Map<string, { delivered: number; repaired: number; warranty: number; noFault: number; broken: number }>()

  function getEntry(p: string) {
    if (!byProductMap.has(p)) byProductMap.set(p, { delivered: 0, repaired: 0, warranty: 0, noFault: 0, broken: 0 })
    return byProductMap.get(p)!
  }

  for (const r of rows) {
    const product = normalizeProduct(r.product_name ?? '')
    const entry   = getEntry(product)
    entry.delivered++

    const dest   = r.destination  ?? ''
    const reason = r.finish_reason ?? ''

    if (dest === 'supplier') {
      warranty++; entry.warranty++
    } else if (dest === 'scrap') {
      broken++; entry.broken++
    } else if (dest === 'old_device') {
      if (reason === 'khong_loi_bt') {
        noFault++; entry.noFault++
      } else {
        // sua_xong, loai_bo_bo_mach, send_supplier → Repaired
        repaired++; entry.repaired++
      }
    } else {
      // destination null/unknown → count as repaired
      repaired++; entry.repaired++
    }
  }

  const total = rows.length

  // Sort by delivered desc
  const byProduct = Array.from(byProductMap.entries())
    .map(([product, counts]) => ({ product, ...counts }))
    .sort((a, b) => b.delivered - a.delivered)

  return NextResponse.json({
    from, to,
    total,
    repaired, repairedPct: pct(repaired, total),
    warranty, warrantyPct: pct(warranty, total),
    noFault,  noFaultPct:  pct(noFault,  total),
    broken,   brokenPct:   pct(broken,   total),
    byProduct,
  })
}
