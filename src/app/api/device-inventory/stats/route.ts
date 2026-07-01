/**
 * GET /api/device-inventory/stats
 * Thống kê tỉ lệ lỗi: tổng nhập vs tổng sửa theo loại thiết bị.
 * Chỉ tính thiết bị CÓ trong inventory (có ngày nhập).
 * Join: device_inventory.device_code = repair_items.imei
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const maxDuration = 60

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = sb()

  // ── 1. Tổng số thiết bị đã nhập — từ device_inventory ─────────
  const { count: invTotal } = await db
    .from('device_inventory')
    .select('*', { count: 'exact', head: true })

  if (!invTotal) {
    return NextResponse.json({
      totalImported: 0, byProduct: [],
      message: 'Chưa có dữ liệu inventory. Chạy Sync CRM trước.',
    })
  }

  // ── 2. Load device_inventory (paginated, chỉ cần device_code + product_name + imported_date) ──
  const PAGE = 1000
  const inventory: { device_code: string | null; product_name: string; imported_date: string | null }[] = []
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from('device_inventory')
      .select('device_code, product_name, imported_date')
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    inventory.push(...data)
    if (data.length < PAGE) break
  }

  // ── 3. Load tất cả repair_items (chỉ imei + destination) ───────
  const repairItems: { imei: string; destination: string | null }[] = []
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from('repair_items')
      .select('imei, destination')
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    repairItems.push(...data)
    if (data.length < PAGE) break
  }

  // ── 4. Build lookup: imei → Set<destination> ───────────────────
  // Mỗi thiết bị có thể sửa nhiều lần — chúng ta đếm số IMEI riêng (unique)
  const imeiDestMap = new Map<string, Set<string>>()
  for (const r of repairItems) {
    if (!r.imei) continue
    if (!imeiDestMap.has(r.imei)) imeiDestMap.set(r.imei, new Set())
    imeiDestMap.get(r.imei)!.add(r.destination ?? 'unknown')
  }

  // ── 5. Group inventory theo product_name ────────────────────────
  const productMap = new Map<string, {
    imported:  Set<string>  // device_codes nhập vào
    repaired:  Set<string>  // device_codes đã có ≥1 lần sửa
    supplier:  Set<string>  // device_codes bị gửi hãng
    scrap:     Set<string>  // device_codes báo phế
  }>()

  for (const inv of inventory) {
    const product = (inv.product_name || 'Unknown').trim()
    if (!productMap.has(product)) {
      productMap.set(product, { imported: new Set(), repaired: new Set(), supplier: new Set(), scrap: new Set() })
    }
    const g = productMap.get(product)!
    const code = inv.device_code?.trim()
    if (!code) continue

    g.imported.add(code)

    if (imeiDestMap.has(code)) {
      g.repaired.add(code)
      const dests = imeiDestMap.get(code)!
      if (dests.has('supplier')) g.supplier.add(code)
      if (dests.has('scrap'))    g.scrap.add(code)
    }
  }

  // ── 6. Build result ─────────────────────────────────────────────
  const byProduct = Array.from(productMap.entries())
    .map(([product_name, g]) => {
      const total_imported = g.imported.size
      const total_repaired = g.repaired.size
      const total_supplier = g.supplier.size
      const total_scrap    = g.scrap.size
      return {
        product_name,
        total_imported,
        total_repaired,
        total_supplier,
        total_scrap,
        repair_rate:    total_imported > 0 ? Math.round(total_repaired / total_imported * 1000) / 10 : 0,
        supplier_rate:  total_imported > 0 ? Math.round(total_supplier / total_imported * 1000) / 10 : 0,
        scrap_rate:     total_imported > 0 ? Math.round(total_scrap    / total_imported * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => b.total_imported - a.total_imported)

  const totalImported = inventory.length
  const totalUniqImei = new Set(inventory.map(i => i.device_code).filter(Boolean)).size
  const totalRepaired = new Set(
    inventory.map(i => i.device_code).filter(c => c && imeiDestMap.has(c!))
  ).size

  return NextResponse.json({
    totalImported,
    totalUniqImei,
    totalRepaired,
    overallRepairRate: totalUniqImei > 0 ? Math.round(totalRepaired / totalUniqImei * 1000) / 10 : 0,
    byProduct,
  })
}
