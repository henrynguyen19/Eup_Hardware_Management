import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * GET /api/repair-tracking/age-analysis
 * Phân tích tuổi thiết bị theo category (GPS Tracker / MDVR / Camera / ...)
 * và kết quả xử lý (old_device / supplier / scrap).
 *
 * Yêu cầu: chạy migration repair_age_analysis_fn.sql.
 */
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminDb()

  const DEST_LABEL: Record<string, string> = {
    old_device: 'Trả lại sử dụng',
    supplier:   'Gửi NCC (RMA)',
    scrap:      'Báo phế',
  }

  const [r1, r2, r3, r4] = await Promise.all([
    db.rpc('repair_age_by_dest_category'),
    db.rpc('repair_age_by_product'),
    db.rpc('repair_age_distribution'),
    db.rpc('repair_age_total_matched'),
  ])

  if (r1.error) return NextResponse.json({ error: r1.error.message }, { status: 500 })
  if (r2.error) return NextResponse.json({ error: r2.error.message }, { status: 500 })
  if (r3.error) return NextResponse.json({ error: r3.error.message }, { status: 500 })

  type DestCatRow = { device_category: string; destination: string; unit_count: number; avg_days: number; median_days: number; p25_days: number; p75_days: number }
  type ProdRow    = { device_category: string; product_name: string; destination: string; unit_count: number; avg_days: number; median_days: number }
  type BktRow     = { device_category: string; bucket_label: string; bucket_order: number; total_count: number; old_device: number; supplier: number; scrap: number }

  // by_dest_category: {category → [{destination, ...}]}
  const by_dest_category = ((r1.data ?? []) as DestCatRow[]).map(d => ({
    device_category: d.device_category,
    destination:     d.destination,
    dest_label:      DEST_LABEL[d.destination] ?? d.destination,
    count:           Number(d.unit_count),
    avg_days:        Number(d.avg_days),
    median_days:     Number(d.median_days),
    p25:             Number(d.p25_days),
    p75:             Number(d.p75_days),
  }))

  const by_product = ((r2.data ?? []) as ProdRow[]).map(p => ({
    device_category: p.device_category,
    product:         p.product_name,
    destination:     p.destination,
    dest_label:      DEST_LABEL[p.destination] ?? p.destination,
    count:           Number(p.unit_count),
    avg_days:        Number(p.avg_days),
    median_days:     Number(p.median_days),
  }))

  const age_distribution = ((r3.data ?? []) as BktRow[]).map(b => ({
    device_category: b.device_category,
    label:           b.bucket_label,
    bucket_order:    b.bucket_order,
    total:           Number(b.total_count),
    old_device:      Number(b.old_device),
    supplier:        Number(b.supplier),
    scrap:           Number(b.scrap),
  }))

  // Distinct categories (sorted)
  const categories = [...new Set(by_dest_category.map(r => r.device_category))].sort()

  return NextResponse.json({
    ok:             true,
    total_matched:  Number(r4.data ?? 0),
    categories,
    by_dest_category,
    by_product,
    age_distribution,
  })
}
