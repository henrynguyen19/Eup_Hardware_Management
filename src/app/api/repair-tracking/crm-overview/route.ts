/**
 * GET /api/repair-tracking/crm-overview
 *
 * Báo cáo tổng hợp từ repair_items (dữ liệu CRM sync).
 * Tương đương Overview nhưng dùng finish_reason/destination thay vì nhập tay.
 *
 * Query params (chọn 1):
 *   ?week=YYYY-Www      → tuần ISO
 *   ?month=YYYY-MM      → tháng
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD → khoảng ngày
 *   (không truyền) → 30 ngày gần nhất
 *
 * Response:
 *   kpis       — tổng hợp outcomes
 *   byDevice   — breakdown theo product_name
 *   noHashtag  — items đã xử lý nhưng notes không có #tag
 *   comparison — so sánh với repair_stats (tay) cùng kỳ (nếu có)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Date range helpers ────────────────────────────────────────────────────────
function isoWeekRange(weekStr: string): { from: string; to: string } | null {
  // "2026-W46" → Mon–Sun
  const m = weekStr.match(/^(\d{4})-W(\d{1,2})$/)
  if (!m) return null
  const year = parseInt(m[1])
  const week = parseInt(m[2])
  // ISO week 1 = week containing first Thursday
  const jan4 = new Date(year, 0, 4)
  const mon = new Date(jan4)
  mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return {
    from: mon.toISOString().slice(0, 10),
    to:   sun.toISOString().slice(0, 10),
  }
}

function monthRange(monthStr: string): { from: string; to: string } | null {
  const m = monthStr.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year  = parseInt(m[1])
  const month = parseInt(m[2])
  const from  = `${year}-${String(month).padStart(2, '0')}-01`
  const last  = new Date(year, month, 0).getDate()
  const to    = `${year}-${String(month).padStart(2, '0')}-${last}`
  return { from, to }
}

// ── Classify finish_reason → outcome bucket ───────────────────────────────────
function outcomeBucket(finish_reason: string | null, destination: string | null): string {
  if (!finish_reason) return 'pending'
  if (finish_reason === 'sua_xong')                                return 'da_sua'
  if (finish_reason === 'khong_loi_bt')                           return 'khong_loi'
  if (finish_reason === 'send_supplier')                           return 'gui_bh'
  if (finish_reason === 'loai_bo' || finish_reason === 'loai_bo_bo_mach') return 'hong_han'
  if (destination   === 'scrap')                                   return 'hong_han'
  if (destination   === 'supplier')                                return 'gui_bh'
  if (destination   === 'old_device')                              return 'da_sua'
  return 'da_sua' // fallback for unknown finish
}

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db  = sb()
  const sp  = req.nextUrl.searchParams
  const weekParam  = sp.get('week')
  const monthParam = sp.get('month')
  const fromParam  = sp.get('from')
  const toParam    = sp.get('to')

  let from: string
  let to: string

  if (weekParam) {
    const r = isoWeekRange(weekParam)
    if (!r) return NextResponse.json({ error: 'Invalid week format (expected YYYY-Www)' }, { status: 400 })
    from = r.from; to = r.to
  } else if (monthParam) {
    const r = monthRange(monthParam)
    if (!r) return NextResponse.json({ error: 'Invalid month format (expected YYYY-MM)' }, { status: 400 })
    from = r.from; to = r.to
  } else if (fromParam && toParam) {
    from = fromParam; to = toParam
  } else {
    // 30 ngày gần nhất
    const t  = new Date()
    to   = t.toISOString().slice(0, 10)
    t.setDate(t.getDate() - 29)
    from = t.toISOString().slice(0, 10)
  }

  // ── Fetch repair_items trong khoảng ngày ─────────────────────────────────
  // Dùng received_at (ngày nhận về kho = Repair_InsertDate)
  const { data: items, error } = await db
    .from('repair_items')
    .select('id, imei, product_name, notes, status, finish_reason, destination, received_at, repaired_at')
    .gte('received_at', from + 'T00:00:00')
    .lte('received_at', to   + 'T23:59:59')
    .order('received_at', { ascending: false })
    .limit(10000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = items ?? []

  // ── KPI aggregation ───────────────────────────────────────────────────────
  type KpiKey = 'da_sua' | 'khong_loi' | 'gui_bh' | 'hong_han' | 'pending'
  const kpiCount: Record<KpiKey, number> = { da_sua: 0, khong_loi: 0, gui_bh: 0, hong_han: 0, pending: 0 }
  const noHashtag: Array<{ id: number; imei: string; product_name: string; received_at: string | null; finish_reason: string | null; notes: string | null }> = []

  // device breakdown: { [productName]: { da_sua, khong_loi, gui_bh, hong_han, pending, total } }
  const deviceMap: Record<string, Record<string, number>> = {}

  for (const r of rows) {
    const bucket = outcomeBucket(r.finish_reason, r.destination) as KpiKey
    kpiCount[bucket]++

    // No-hashtag: completed items without any # in notes
    if (bucket !== 'pending') {
      const hasTag = r.notes && /#+[a-zA-Z_]+/.test(r.notes)
      if (!hasTag) {
        noHashtag.push({
          id:           r.id,
          imei:         r.imei,
          product_name: r.product_name,
          received_at:  r.received_at,
          finish_reason: r.finish_reason,
          notes:        r.notes,
        })
      }
    }

    // device breakdown
    const dev = r.product_name || 'Unknown'
    if (!deviceMap[dev]) deviceMap[dev] = { da_sua: 0, khong_loi: 0, gui_bh: 0, hong_han: 0, pending: 0, total: 0 }
    deviceMap[dev][bucket] = (deviceMap[dev][bucket] || 0) + 1
    deviceMap[dev].total++
  }

  const delivered = kpiCount.da_sua + kpiCount.khong_loi + kpiCount.gui_bh + kpiCount.hong_han
  const kpis = {
    total:     rows.length,
    delivered, // đã xử lý xong (không tính pending)
    da_sua:    kpiCount.da_sua,
    khong_loi: kpiCount.khong_loi,
    gui_bh:    kpiCount.gui_bh,
    hong_han:  kpiCount.hong_han,
    pending:   kpiCount.pending,
    no_hashtag: noHashtag.length,
  }

  const byDevice = Object.entries(deviceMap)
    .map(([product_name, counts]) => ({ product_name, ...counts }))
    .sort((a, b) => (b.total as number) - (a.total as number))

  // ── So sánh với repair_stats (nhập tay) cùng kỳ ──────────────────────────
  // Lấy các tuần trong khoảng [from, to] → so với repair_stats
  const { data: weeks } = await db
    .from('repair_weeks')
    .select('id, week_label, date_start, date_end')
    .gte('date_start', from)
    .lte('date_end',   to)
    .order('date_start')

  let comparison: Array<{
    week_label: string
    manual: { da_sua: number; khong_loi: number; gui_bh: number; hong_han: number; total: number }
    crm:    { da_sua: number; khong_loi: number; gui_bh: number; hong_han: number; total: number }
    diff:   { da_sua: number; khong_loi: number; gui_bh: number; hong_han: number; total: number }
  }> = []

  if (weeks && weeks.length > 0) {
    const weekIds = weeks.map(w => w.id)
    const { data: manualStats } = await db
      .from('repair_stats')
      .select('week_id, status_type, quantity')
      .in('week_id', weekIds)

    // Aggregate manual stats per week
    const manualByWeek: Record<string, Record<string, number>> = {}
    for (const s of manualStats ?? []) {
      if (!manualByWeek[s.week_id]) manualByWeek[s.week_id] = {}
      manualByWeek[s.week_id][s.status_type] = (manualByWeek[s.week_id][s.status_type] || 0) + s.quantity
    }

    // Aggregate CRM items per week
    const crmByWeek: Record<string, Record<string, number>> = {}
    for (const r of rows) {
      const date = r.received_at?.slice(0, 10) ?? ''
      const week = weeks.find(w => w.date_start <= date && date <= w.date_end)
      if (!week) continue
      if (!crmByWeek[week.id]) crmByWeek[week.id] = {}
      const bucket = outcomeBucket(r.finish_reason, r.destination)
      if (bucket !== 'pending') {
        // Map CRM bucket → manual status_type
        const key = bucket === 'gui_bh' ? 'gui_bao_hanh' : bucket
        crmByWeek[week.id][key] = (crmByWeek[week.id][key] || 0) + 1
      }
    }

    comparison = weeks.map(w => {
      const m = manualByWeek[w.id] ?? {}
      const c = crmByWeek[w.id]   ?? {}
      const manualTotal = (m.da_sua ?? 0) + (m.khong_loi ?? 0) + (m.gui_bao_hanh ?? 0) + (m.hong_han ?? 0)
      const crmTotal    = (c.da_sua ?? 0) + (c.khong_loi ?? 0) + (c.gui_bao_hanh ?? 0) + (c.hong_han ?? 0)
      return {
        week_label: w.week_label,
        manual: { da_sua: m.da_sua ?? 0, khong_loi: m.khong_loi ?? 0, gui_bh: m.gui_bao_hanh ?? 0, hong_han: m.hong_han ?? 0, total: manualTotal },
        crm:    { da_sua: c.da_sua ?? 0, khong_loi: c.khong_loi ?? 0, gui_bh: c.gui_bao_hanh ?? 0, hong_han: c.hong_han ?? 0, total: crmTotal },
        diff:   {
          da_sua:    (c.da_sua ?? 0)       - (m.da_sua ?? 0),
          khong_loi: (c.khong_loi ?? 0)    - (m.khong_loi ?? 0),
          gui_bh:    (c.gui_bao_hanh ?? 0) - (m.gui_bao_hanh ?? 0),
          hong_han:  (c.hong_han ?? 0)     - (m.hong_han ?? 0),
          total:     crmTotal - manualTotal,
        },
      }
    })
  }

  return NextResponse.json({
    from, to,
    kpis,
    byDevice,
    noHashtag:  noHashtag.slice(0, 200), // cap ở 200
    comparison,
  })
}
