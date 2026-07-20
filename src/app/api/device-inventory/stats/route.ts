/**
 * GET /api/device-inventory/stats
 * Dùng PostgreSQL RPC functions để join device_inventory + repair_items
 * tại DB thay vì load hết lên RAM (tránh timeout 504).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime     = 'nodejs'
export const maxDuration = 60

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = sb()

  // Kiểm tra xem đã có dữ liệu inventory chưa
  const { count: invCount } = await db
    .from('device_inventory')
    .select('*', { count: 'exact', head: true })

  if (!invCount) {
    return NextResponse.json({
      totalImported: 0, totalUniqImei: 0, totalRepaired: 0, overallRepairRate: 0,
      byProduct: [],
      message: 'Chưa có dữ liệu inventory. Chạy Sync CRM trước.',
    })
  }

  // Gọi 2 RPC functions song song
  const [overviewRes, byProductRes] = await Promise.all([
    db.rpc('device_inventory_overview'),
    db.rpc('device_inventory_failure_stats'),
  ])

  if (overviewRes.error) {
    // RPC chưa được tạo → trả về thông báo rõ ràng
    return NextResponse.json({
      error: `RPC chưa được tạo: ${overviewRes.error.message}. Chạy migration device_inventory_stats_fn.sql trong Supabase.`,
    }, { status: 500 })
  }

  if (byProductRes.error) {
    return NextResponse.json({ error: byProductRes.error.message }, { status: 500 })
  }

  const overview = (overviewRes.data as {
    total_imported: number; total_uniq_imei: number; total_repaired: number
  }[])?.[0] ?? { total_imported: 0, total_uniq_imei: 0, total_repaired: 0 }

  const byProduct = (byProductRes.data as {
    product_name: string
    total_imported: number; total_repaired: number
    total_supplier: number; total_scrap: number
    repair_rate: number; supplier_rate: number; scrap_rate: number
  }[]) ?? []

  const totalUniq = Number(overview.total_uniq_imei)
  const totalRep  = Number(overview.total_repaired)

  return NextResponse.json({
    totalImported:     Number(overview.total_imported),
    totalUniqImei:     totalUniq,
    totalRepaired:     totalRep,
    overallRepairRate: totalUniq > 0 ? Math.round(totalRep / totalUniq * 1000) / 10 : 0,
    byProduct: byProduct.map(p => ({
      product_name:   p.product_name,
      total_imported: Number(p.total_imported),
      total_repaired: Number(p.total_repaired),
      total_supplier: Number(p.total_supplier),
      total_scrap:    Number(p.total_scrap),
      repair_rate:    Number(p.repair_rate)   ?? 0,
      supplier_rate:  Number(p.supplier_rate) ?? 0,
      scrap_rate:     Number(p.scrap_rate)    ?? 0,
    })),
  })
}
