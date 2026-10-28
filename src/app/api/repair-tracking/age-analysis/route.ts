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
 * Yêu cầu: chạy migration migrations/repair_age_analysis_fn.sql.
 * Dùng 4 SQL functions để tránh giới hạn 1.000 row của Supabase RPC:
 *   repair_age_by_destination()
 *   repair_age_by_product()
 *   repair_age_distribution()
 *   repair_age_total_matched()
 */
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminDb()

  const DEST_LABEL: Record<string, string> = {
    old_device: 'Trả lại sử dụng',
    supplier:   'Gửi nhà cung cấp (RMA)',
    scrap:      'Báo phế',
  }

  // Gọi song song cả 4 functions
  const [r1, r2, r3, r4] = await Promise.all([
    db.rpc('repair_age_by_destination'),
    db.rpc('repair_age_by_product'),
    db.rpc('repair_age_distribution'),
    db.rpc('repair_age_total_matched'),
  ])

  if (r1.error) return NextResponse.json({ error: r1.error.message }, { status: 500 })
  if (r2.error) return NextResponse.json({ error: r2.error.message }, { status: 500 })
  if (r3.error) return NextResponse.json({ error: r3.error.message }, { status: 500 })

  type DestRow = { destination: string; unit_count: number; avg_days: number; median_days: number; p25_days: number; p75_days: number }
  type ProdRow = { product_name: string; destination: string; unit_count: number; avg_days: number; median_days: number }
  type BktRow  = { bucket_label: string; total_count: number; old_device: number; supplier: number; scrap: number }

  const byDestination = ((r1.data ?? []) as DestRow[]).map(d => ({
    destination:  d.destination,
    label:        DEST_LABEL[d.destination] ?? d.destination,
    count:        Number(d.unit_count),
    avg_days:     Number(d.avg_days),
    median_days:  Number(d.median_days),
    p25:          Number(d.p25_days),
    p75:          Number(d.p75_days),
  }))

  const byProduct = ((r2.data ?? []) as ProdRow[]).map(p => ({
    product:     p.product_name,
    destination: p.destination,
    label:       DEST_LABEL[p.destination] ?? p.destination,
    count:       Number(p.unit_count),
    avg_days:    Number(p.avg_days),
    median_days: Number(p.median_days),
  }))

  const age_distribution = ((r3.data ?? []) as BktRow[]).map(b => ({
    label:      b.bucket_label,
    total:      Number(b.total_count),
    old_device: Number(b.old_device),
    supplier:   Number(b.supplier),
    scrap:      Number(b.scrap),
  }))

  return NextResponse.json({
    ok: true,
    total_matched: Number(r4.data ?? 0),
    by_destination:   byDestination,
    by_product:       byProduct,
    age_distribution,
  })
}
