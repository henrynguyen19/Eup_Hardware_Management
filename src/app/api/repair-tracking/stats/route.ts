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
    notes: string | null; receiver_name: string | null
    sender_name: string | null; completer_name: string | null
  }[] = []

  for (let page = 0; ; page++) {
    let q = db
      .from('repair_items')
      .select('id, imei, product_name, status, destination, finish_reason, received_at, sent_at, completed_at, repair_warehouse, crm_repair_id, notes, receiver_name, sender_name, completer_name')
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

  // ── 2. Thống kê theo IMEI (thiết bị lặp) — gom theo loại ────
  const imeiMap = new Map<string, { product_name: string; rows: typeof items }>()
  for (const it of items) {
    const key = it.imei?.trim() || `CRM-${it.crm_repair_id}`
    if (!imeiMap.has(key)) imeiMap.set(key, { product_name: it.product_name, rows: [] })
    imeiMap.get(key)!.rows.push(it)
  }

  // Chỉ lấy thiết bị xuất hiện > 1 lần
  const repeatedDevices = Array.from(imeiMap.entries())
    .filter(([, { rows }]) => rows.length > 1)
    .map(([imei, { product_name, rows }]) => ({
      imei,
      product_name: (product_name || 'Unknown').trim(),
      count:        rows.length,
      last_received: rows[0].received_at,
      repairs: rows.map(r => ({
        id:              r.id,
        received_at:     r.received_at,
        sent_at:         r.sent_at,
        completed_at:    r.completed_at,
        status:          r.status,
        destination:     r.destination,
        finish_reason:   r.finish_reason,
        notes:           r.notes,
        repair_warehouse: r.repair_warehouse,
        receiver_name:   r.receiver_name,
        sender_name:     r.sender_name,
        completer_name:  r.completer_name,
      })),
    }))
    .sort((a, b) => b.count - a.count)

  // Gom theo loại thiết bị
  const productDupMap = new Map<string, { deviceCount: number; totalRepairs: number; devices: typeof repeatedDevices }>()
  for (const d of repeatedDevices) {
    const key = d.product_name
    if (!productDupMap.has(key)) productDupMap.set(key, { deviceCount: 0, totalRepairs: 0, devices: [] })
    const g = productDupMap.get(key)!
    g.deviceCount++
    g.totalRepairs += d.count
    g.devices.push(d)
  }

  const duplicatesByProduct = Array.from(productDupMap.entries())
    .map(([product_name, g]) => ({
      product_name,
      deviceCount:  g.deviceCount,
      totalRepairs: g.totalRepairs,
      devices: g.devices.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.totalRepairs - a.totalRepairs)

  const duplicateDeviceCount = imeiMap.size
  const repeatedDeviceCount  = repeatedDevices.length

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
    if (it.destination === 'supplier') w.