import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * GET /api/repair-tracking/age-analysis
 * Phân tích tuổi thiết bị theo kết quả xử lý (destination).
 *
 * Yêu cầu: chạy migration migrations/repair_age_analysis_fn.sql trước.
 * Function SQL: repair_age_analysis() → (destination, product_name, age_days)
 * Join: device_inventory.device_code = repair_items.imei
 * Tuổi = received_at − imported_date (ngày)
 */
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminDb()

  // Gọi PostgreSQL function (xem migrations/repair_age_analysis_fn.sql)
  const { data: rows, error } = await db.rpc('repair_age_analysis')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Tính toán client-side ─────────────────────────────────────────────────
  type Row = { destination: string; product_name: string; age_days: number }

  const DEST_LABEL: Record<string, string> = {
    old_device: 'Trả lại sử dụng',
    supplier:   'Gửi nhà cung cấp (RMA)',
    scrap:      'Báo phế',
  }

  // Aggregate: { product × destination → [age_days] }
  type Bucket = { ages: number[]; product: string; destination: string }
  const map = new Map<string, Bucket>()

  for (const r of (rows as Row[]) ?? []) {
    const key = `${r.product_name}|||${r.destination}`
    if (!map.has(key)) map.set(key, { ages: [], product: r.product_name, destination: r.destination })
    map.get(key)!.ages.push(r.age_days)
  }

  function avg(arr: number[]) { return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0 }
  function median(arr: number[]) {
    if (!arr.length) return 0
    const s = [...arr].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
  }

  // ── By destination (tổng hợp) ─────────────────────────────────────────────
  const destMap = new Map<string, number[]>()
  for (const b of map.values()) {
    if (!destMap.has(b.destination)) destMap.set(b.destination, [])
    destMap.get(b.destination)!.push(...b.ages)
  }

  const byDestination = Array.from(destMap.entries())
    .filter(([d]) => DEST_LABEL[d])
    .map(([destination, ages]) => ({
      destination,
      label:       DEST_LABEL[destination] ?? destination,
      count:       ages.length,
      avg_days:    avg(ages),
      median_days: median(ages),
      p25: (() => { const s = [...ages].sort((a, b) => a - b); return s[Math.floor(s.length * 0.25)] ?? 0 })(),
      p75: (() => { const s = [...ages].sort((a, b) => a - b); return s[Math.floor(s.length * 0.75)] ?? 0 })(),
    }))
    .sort((a, b) => a.avg_days - b.avg_days)

  // ── By product × destination ──────────────────────────────────────────────
  const byProduct = Array.from(map.entries())
    .filter(([k]) => DEST_LABEL[k.split('|||')[1]])
    .map(([, b]) => ({
      product:     b.product,
      destination: b.destination,
      label:       DEST_LABEL[b.destination] ?? b.destination,
      count:       b.ages.length,
      avg_days:    avg(b.ages),
      median_days: median(b.ages),
    }))
    .filter(r => r.count >= 5)  // chỉ hiện nếu có đủ mẫu
    .sort((a, b) => a.product.localeCompare(b.product) || a.avg_days - b.avg_days)

  // ── Age distribution buckets ──────────────────────────────────────────────
  const allAges = Array.from(map.values()).flatMap(b => b.ages)

  const getAges = (dest: string) =>
    Array.from(map.entries())
      .filter(([k]) => k.endsWith(`|||${dest}`))
      .flatMap(([, bk]) => bk.ages)

  const buckets = [
    { label: '< 6 tháng',  min: 0,    max: 180  },
    { label: '6-12 tháng', min: 180,  max: 365  },
    { label: '1-2 năm',    min: 365,  max: 730  },
    { label: '2-3 năm',    min: 730,  max: 1095 },
    { label: '> 3 năm',    min: 1095, max: 9999 },
  ].map(b => ({
    label:      b.label,
    total:      allAges.filter(d => d >= b.min && d < b.max).length,
    old_device: getAges('old_device').filter(d => d >= b.min && d < b.max).length,
    supplier:   getAges('supplier').filter(d => d >= b.min && d < b.max).length,
    scrap:      getAges('scrap').filter(d => d >= b.min && d < b.max).length,
  }))

  return NextResponse.json({
    ok: true,
    total_matched: (rows as Row[])?.length ?? 0,
    by_destination:   byDestination,
    by_product:       byProduct,
    age_distribution: buckets,
  })
}
