/**
 * GET /api/repair-tracking/hashtags
 * Trích xuất hashtags từ trường notes của repair_items.
 * Kỹ thuật viên ghi "#man_hinh #pin_yeu #camera_loi" → hệ thống tổng hợp.
 * Trả về: tags (tổng hợp), weeklyTrends, monthlyTrends, topTags
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Match hashtag: # + bất kỳ ký tự không phải space/dấu câu
const HASHTAG_RE = /#([^\s#,;.!?()[\]{}"']+)/g

function extractTags(notes: string | null): string[] {
  if (!notes?.trim()) return []
  const tags: string[] = []
  let m: RegExpExecArray | null
  HASHTAG_RE.lastIndex = 0
  while ((m = HASHTAG_RE.exec(notes)) !== null) {
    const tag = m[1].toLowerCase().trim()
    if (tag.length > 0) tags.push(tag)
  }
  return tags
}

function getWeekKey(dateStr: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  // ISO week calculation
  const tmp = new Date(d.getTime())
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - (tmp.getDay() + 6) % 7)
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(
    ((tmp.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7
  )
  return `${tmp.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function getMonthKey(dateStr: string | null): string | null {
  if (!dateStr) return null
  return dateStr.substring(0, 7) // "YYYY-MM"
}

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = sb()

  // Lấy tất cả notes + received_at (để tính trend theo thời gian)
  const PAGE = 1000
  const items: {
    notes: string | null
    product_name: string
    status: string
    imei: string
    received_at: string | null
  }[] = []
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from('repair_items')
      .select('notes, product_name, status, imei, received_at')
      .not('notes', 'is', null)
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    items.push(...(data as typeof items))
    if (data.length < PAGE) break
  }

  // ── Tổng hợp hashtags (existing) ──────────────────────────────────────────
  const tagMap = new Map<string, {
    count:    number
    products: Map<string, number>
    statuses: Record<string, number>
    imeis:    Set<string>
  }>()

  // ── Trend maps ────────────────────────────────────────────────────────────
  // weekTrendMap[weekKey][tag] = count
  const weekTrendMap = new Map<string, Map<string, number>>()
  // monthTrendMap[monthKey][tag] = count
  const monthTrendMap = new Map<string, Map<string, number>>()
  // weekDeviceMap[weekKey][product_name][tag] = count
  const weekDeviceMap = new Map<string, Map<string, Map<string, number>>>()
  // monthDeviceMap[monthKey][product_name][tag] = count
  const monthDeviceMap = new Map<string, Map<string, Map<string, number>>>()

  for (const item of items) {
    const tags = extractTags(item.notes)
    const weekKey  = getWeekKey(item.received_at)
    const monthKey = getMonthKey(item.received_at)

    for (const tag of tags) {
      // --- tag totals ---
      if (!tagMap.has(tag)) {
        tagMap.set(tag, { count: 0, products: new Map(), statuses: {}, imeis: new Set() })
      }
      const entry = tagMap.get(tag)!
      entry.count++
      entry.products.set(item.product_name, (entry.products.get(item.product_name) ?? 0) + 1)
      entry.statuses[item.status] = (entry.statuses[item.status] ?? 0) + 1
      entry.imeis.add(item.imei)

      // --- weekly trend by tag ---
      if (weekKey) {
        if (!weekTrendMap.has(weekKey)) weekTrendMap.set(weekKey, new Map())
        const wm = weekTrendMap.get(weekKey)!
        wm.set(tag, (wm.get(tag) ?? 0) + 1)

        // weekly by device
        if (!weekDeviceMap.has(weekKey)) weekDeviceMap.set(weekKey, new Map())
        const wd = weekDeviceMap.get(weekKey)!
        if (!wd.has(item.product_name)) wd.set(item.product_name, new Map())
        const wdt = wd.get(item.product_name)!
        wdt.set(tag, (wdt.get(tag) ?? 0) + 1)
      }

      // --- monthly trend by tag ---
      if (monthKey) {
        if (!monthTrendMap.has(monthKey)) monthTrendMap.set(monthKey, new Map())
        const mm = monthTrendMap.get(monthKey)!
        mm.set(tag, (mm.get(tag) ?? 0) + 1)

        // monthly by device
        if (!monthDeviceMap.has(monthKey)) monthDeviceMap.set(monthKey, new Map())
        const md = monthDeviceMap.get(monthKey)!
        if (!md.has(item.product_name)) md.set(item.product_name, new Map())
        const mdt = md.get(item.product_name)!
        mdt.set(tag, (mdt.get(tag) ?? 0) + 1)
      }
    }
  }

  // ── Serialize tag totals ──────────────────────────────────────────────────
  const tags = Array.from(tagMap.entries())
    .map(([tag, v]) => ({
      tag,
      count:       v.count,
      deviceCount: v.imeis.size,
      statuses:    v.statuses,
      topProducts: Array.from(v.products.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([product_name, cnt]) => ({ product_name, count: cnt })),
    }))
    .sort((a, b) => b.count - a.count)

  // Top 8 tags for trend charts
  const topTags = tags.slice(0, 8).map(t => t.tag)

  // ── Serialize weekly trends ───────────────────────────────────────────────
  const weeklyTrends = Array.from(weekTrendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, tagCounts]) => {
      const row: Record<string, string | number> = { period: week }
      for (const tag of topTags) {
        row[tag] = tagCounts.get(tag) ?? 0
      }
      return row
    })

  // ── Serialize monthly trends ──────────────────────────────────────────────
  const monthlyTrends = Array.from(monthTrendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, tagCounts]) => {
      const row: Record<string, string | number> = { period: month }
      for (const tag of topTags) {
        row[tag] = tagCounts.get(tag) ?? 0
      }
      return row
    })

  // ── Serialize weekly device trends ────────────────────────────────────────
  // Top 6 devices overall
  const deviceTotals = new Map<string, number>()
  for (const item of items) {
    if (extractTags(item.notes).length > 0) {
      deviceTotals.set(item.product_name, (deviceTotals.get(item.product_name) ?? 0) + 1)
    }
  }
  const topDevices = Array.from(deviceTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name)

  const weeklyDeviceTrends = Array.from(weekDeviceMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, devMap]) => {
      const row: Record<string, string | number> = { period: week }
      for (const dev of topDevices) {
        let total = 0
        const tagMap2 = devMap.get(dev)
        if (tagMap2) for (const cnt of tagMap2.values()) total += cnt
        row[dev] = total
      }
      return row
    })

  const monthlyDeviceTrends = Array.from(monthDeviceMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, devMap]) => {
      const row: Record<string, string | number> = { period: month }
      for (const dev of topDevices) {
        let total = 0
        const tagMap2 = devMap.get(dev)
        if (tagMap2) for (const cnt of tagMap2.values()) total += cnt
        row[dev] = total
      }
      return row
    })

  // ── Serialize device×tag weekly/monthly breakdown ────────────────────────
  // deviceWeeklyTagTrends[deviceName] = [{ period, tag1: n, tag2: n, ... }]
  const deviceWeeklyTagTrends: Record<string, Array<Record<string, string | number>>> = {}
  const deviceMonthlyTagTrends: Record<string, Array<Record<string, string | number>>> = {}

  for (const dev of topDevices) {
    const wSeries: Array<Record<string, string | number>> = []
    for (const [weekKey, devMap] of Array.from(weekDeviceMap.entries()).sort(([a],[b]) => a.localeCompare(b))) {
      const tagCounts = devMap.get(dev)
      const row: Record<string, string | number> = { period: weekKey }
      for (const tag of topTags) row[tag] = tagCounts?.get(tag) ?? 0
      wSeries.push(row)
    }
    deviceWeeklyTagTrends[dev] = wSeries

    const mSeries: Array<Record<string, string | number>> = []
    for (const [monthKey, devMap] of Array.from(monthDeviceMap.entries()).sort(([a],[b]) => a.localeCompare(b))) {
      const tagCounts = devMap.get(dev)
      const row: Record<string, string | number> = { period: monthKey }
      for (const tag of topTags) row[tag] = tagCounts?.get(tag) ?? 0
      mSeries.push(row)
    }
    deviceMonthlyTagTrends[dev] = mSeries
  }

  return NextResponse.json({
    tags,
    totalWithNotes: items.length,
    topTags,
    topDevices,
    weeklyTrends,
    monthlyTrends,
    weeklyDeviceTrends,
    monthlyDeviceTrends,
    deviceWeeklyTagTrends,
    deviceMonthlyTagTrends,
  })
}
