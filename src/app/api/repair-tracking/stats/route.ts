/**
 * GET /api/repair-tracking/stats
 * Trả về thống kê tổng hợp: thiết bị lặp, tỉ lệ kết quả, phân tích theo loại thiết bị.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = sb()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') // YYYY-MM-DD
  const to   = searchParams.get('to')

  // Lấy TẤT CẢ items — paginate qua từng batch 1000 để vượt giới hạn PostgREST
  const PAGE = 1000
  const items: {
    id: string; imei: string; product_name: string; status: string
    destination: string | null; finish_reason: string | null
    received_at: string; sent_at: string | null; completed_at: string | null
    repair_warehouse: string | null; crm_repair_id: number | null
  }[] = []

  for (let page = 0; ; page++) {
    let q = db
      .from('repair_items')
      .select('id, imei, product_name, status, destination, finish_reason, received_at, sent_at, completed_at, repair_warehouse, crm_repair_id')
      .order('received_at', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (from) q = q.gte('received_at', from + 'T00:00:00')
    if (to)   q = q.lte('received_at', to + 'T23:59:59')
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    items.push(...data)
    if (data.length < PAGE) break  // trang cuối
  }

  // ── 1. Tổng quan ─────────────────────────────────────────────
  const total     = items.length
  const completed = items.filter(i => i.status === 'da_sua_xong').length
  const inRepair  = items.filter(i => i.status === 'da_gui').length
  const waiting   = items.filter(i => i.status === 'cho_gui').length

  const oldDevice = items.filter(i => i.destination === 'old_device').length
  const scrap     = items.filter(i => i.destination === 'scrap').length
  const supplier  = items.filter(i => i.destination === 'supplier').length

  // ── 2. Thống kê theo IMEI (thiết bị lặp) ─────────────────────
  const imeiMap = new Map<string, typeof items>()
  for (const it of items) {
    const key = it.imei?.trim() || `CRM-${it.crm_repair_id}`
    if (!imeiMap.has(key)) imeiMap.set(key, [])
    imeiMap.get(key)!.push(it)
  }

  // Chỉ lấy thiết bị xuất hiện > 1 lần
  const duplicates = Array.from(imeiMap.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([imei, rows]) => ({
      imei,
      product_name:  rows[0].product_name,
      count:         rows.length,
      last_received: rows[0].received_at,
      statuses:      rows.map(r => r.status),
      destinations:  rows.map(r => r.destination).filter(Boolean),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50)

  const duplicateDeviceCount  = imeiMap.size   // unique devices
  const repeatedDeviceCount   = duplicates.length

  // ── 3. Thống kê theo loại thiết bị (product_name) ────────────
  const productMap = new Map<string, {
    total: number; completed: number; oldDevice: number
    scrap: number; supplier: number; inRepair: number; waiting: number
  }>()

  for (const it of items) {
    const key = (it.product_name || 'Unknown').trim()
    if (!productMap.has(key)) {
      productMap.set(key, { total: 0, completed: 0, oldDevice: 0, scrap: 0, supplier: 0, inRepair: 0, waiting: 0 })
    }
    const s = productMap.get(key)!
    s.total++
    if (it.status === 'da_sua_xong') s.completed++
    if (it.status === 'da_gui')      s.inRepair++
    if (it.status === 'cho_gui')     s.waiting++
    if (it.destination === 'old_device') s.oldDevice++
    if (it.destination === 'scrap')      s.scrap++
    if (it.destination === 'supplier')   s.supplier++
  }

  const byProduct = Array.from(productMap.entries())
    .map(([product_name, s]) => ({
      product_name,
      ...s,
      successRate:   s.total > 0 ? Math.round(s.oldDevice / s.total * 100) : 0,
      scrapRate:     s.total > 0 ? Math.round(s.scrap     / s.total * 100) : 0,
      supplierRate:  s.total > 0 ? Math.round(s.supplier  / s.total * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // ── 4. Thống kê theo kho sửa ─────────────────────────────────
  const warehouseMap = new Map<string, { total: number; completed: number; scrap: number; supplier: number }>()
  for (const it of items) {
    if (!it.repair_warehouse) continue
    const key = it.repair_warehouse
    if (!warehouseMap.has(key)) warehouseMap.set(key, { total: 0, completed: 0, scrap: 0, supplier: 0 })
    const w = warehouseMap.get(key)!
    w.total++
    if (it.status === 'da_sua_xong') w.completed++
    if (it.destination === 'scrap')    w.scrap++
    if (it.destination === 'supplier') w.supplier++
  }
  const byWarehouse = Array.from(warehouseMap.entries())
    .map(([warehouse, s]) => ({ warehouse, ...s }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({
    total, completed, inRepair, waiting,
    oldDevice, scrap, supplier,
    uniqueDevices:       duplicateDeviceCount,
    repeatedDeviceCount,
    completionRate:  total > 0 ? Math.round(completed / total * 100) : 0,
    successRate:     completed > 0 ? Math.round(oldDevice / completed * 100) : 0,
    scrapRate:       completed > 0 ? Math.round(scrap    / completed * 100) : 0,
    supplierRate:    completed > 0 ? Math.round(supplier / completed * 100) : 0,
    duplicates,
    byProduct,
    byWarehouse,
  })
}
