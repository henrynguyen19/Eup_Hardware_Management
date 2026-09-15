/**
 * GET /api/repair-tracking/hashtags
 *
 * Phân tích hashtag từ trường notes của repair_items.
 * Toàn bộ aggregation chạy trên PostgreSQL — không load rows vào Node.js.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ISO week: "YYYY-Www" từ date string
function getWeekKey(dateStr: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const tmp = new Date(d)
  tmp.setHours(0,0,0,0)
  tmp.setDate(tmp.getDate() + 3 - (tmp.getDay() + 6) % 7)
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  const weekNum = 1 + Math.round(
    ((tmp.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7
  )
  return `${tmp.getFullYear()}-W${String(weekNum).padStart(2,'0')}`
}

function getMonthKey(dateStr: string | null): string | null {
  if (!dateStr) return null
  return dateStr.substring(0, 7)
}

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = sb()

  // ── 1. Tổng hợp hashtags — chạy hoàn toàn trên PostgreSQL ────────────────
  // regexp_matches + unnest để tách từng tag, group để đếm
  const { data: tagRows, error: tagErr } = await db.rpc('hashtag_summary' as never) as {
    data: Array<{
      tag: string
      count: number
      device_count: number
      statuses: Record<string, number>
      top_products: Array<{ product_name: string; count: number }>
    }> | null
    error: unknown
  }

  // Nếu function chưa tồn tại → fallback query trực tiếp
  if (tagErr || !tagRows) {
    return await legacyRoute(db)
  }

  const tags = tagRows.map(r => ({
    tag:          r.tag,
    count:        Number(r.count),
    deviceCount:  Number(r.device_count),
    statuses:     r.statuses ?? {},
    topProducts:  r.top_products ?? [],
  }))

  // ── 2. Trend data — dùng SQL aggregation theo tháng ──────────────────────
  const { data: trendRows } = await db
    .from('repair_items')
    .select('notes, product_name, received_at')
    .not('notes', 'is', null)
    .not('notes', 'eq', '')
    .order('received_at', { ascending: true }) as { data: Array<{ notes: string; product_name: string; received_at: string | null }> | null }

  const items = trendRows ?? []

  const HASHTAG_RE = /#([^\s#,;.!?()[\]{}"']+)/g
  function extractTags(notes: string): string[] {
    const tags: string[] = []
    let m: RegExpExecArray | null
    HASHTAG_RE.lastIndex = 0
    while ((m = HASHTAG_RE.exec(notes)) !== null) {
      const t = m[1].toLowerCase().trim()
      if (t.length > 0) tags.push(t)
    }
    return tags
  }

  const topTags    = tags.slice(0, 8).map(t => t.tag)
  const topDevices = (() => {
    const devMap = new Map<string, number>()
    for (const item of items) {
      if (extractTags(item.notes).length > 0)
        devMap.set(item.product_name, (devMap.get(item.product_name) ?? 0) + 1)
    }
    return Array.from(devMap.entries()).sort((a,b) => b[1]-a[1]).slice(0,6).map(([n]) => n)
  })()

  // Build trend maps từ lightweight select (notes + product_name + received_at)
  const weekTrendMap   = new Map<string, Map<string, number>>()
  const monthTrendMap  = new Map<string, Map<string, number>>()
  const weekDeviceMap  = new Map<string, Map<string, Map<string, number>>>()
  const monthDeviceMap = new Map<string, Map<string, Map<string, number>>>()

  for (const item of items) {
    const tags2   = extractTags(item.notes)
    const weekKey  = getWeekKey(item.received_at)
    const monthKey = getMonthKey(item.received_at)

    for (const tag of tags2) {
      if (weekKey) {
        if (!weekTrendMap.has(weekKey)) weekTrendMap.set(weekKey, new Map())
        const wm = weekTrendMap.get(weekKey)!
        wm.set(tag, (wm.get(tag) ?? 0) + 1)
        if (!weekDeviceMap.has(weekKey)) weekDeviceMap.set(weekKey, new Map())
        const wd = weekDeviceMap.get(weekKey)!
        if (!wd.has(item.product_name)) wd.set(item.product_name, new Map())
        const wdt = wd.get(item.product_name)!
        wdt.set(tag, (wdt.get(tag) ?? 0) + 1)
      }
      if (monthKey) {
        if (!monthTrendMap.has(monthKey)) monthTrendMap.set(monthKey, new Map())
        const mm = monthTrendMap.get(monthKey)!
        mm.set(tag, (mm.get(tag) ?? 0) + 1)
        if (!monthDeviceMap.has(monthKey)) monthDeviceMap.set(monthKey, new Map())
        const md = monthDeviceMap.get(monthKey)!
        if (!md.has(item.product_name)) md.set(item.product_name, new Map())
        const mdt = md.get(item.product_name)!
        mdt.set(tag, (mdt.get(tag) ?? 0) + 1)
      }
    }
  }

  const weeklyTrends = Array.from(weekTrendMap.entries()).sort(([a],[b]) => a.localeCompare(b))
    .map(([week, tc]) => { const r: Record<string, string|number> = { period: week }; for (const t of topTags) r[t] = tc.get(t) ?? 0; return r })
  const monthlyTrends = Array.from(monthTrendMap.entries()).sort(([a],[b]) => a.localeCompare(b))
    .map(([month, tc]) => { const r: Record<string, string|number> = { period: month }; for (const t of topTags) r[t] = tc.get(t) ?? 0; return r })

  const weeklyDeviceTrends = Array.from(weekDeviceMap.entries()).sort(([a],[b]) => a.localeCompare(b))
    .map(([week, dm]) => {
      const r: Record<string, string|number> = { period: week }
      for (const dev of topDevices) { let s = 0; dm.get(dev)?.forEach(v => { s += v }); r[dev] = s }
      return r
    })
  const monthlyDeviceTrends = Array.from(monthDeviceMap.entries()).sort(([a],[b]) => a.localeCompare(b))
    .map(([month, dm]) => {
      const r: Record<string, string|number> = { period: month }
      for (const dev of topDevices) { let s = 0; dm.get(dev)?.forEach(v => { s += v }); r[dev] = s }
      return r
    })

  const deviceWeeklyTagTrends: Record<string, Array<Record<string, string|number>>> = {}
  const deviceMonthlyTagTrends: Record<string, Array<Record<string, string|number>>> = {}
  for (const dev of topDevices) {
    deviceWeeklyTagTrends[dev] = Array.from(weekDeviceMap.entries()).sort(([a],[b]) => a.localeCompare(b))
      .map(([week, dm]) => { const r: Record<string, string|number> = { period: week }; const tc = dm.get(dev); for (const t of topTags) r[t] = tc?.get(t) ?? 0; return r })
    deviceMonthlyTagTrends[dev] = Array.from(monthDeviceMap.entries()).sort(([a],[b]) => a.localeCompare(b))
      .map(([month, dm]) => { const r: Record<string, string|number> = { period: month }; const tc = dm.get(dev); for (const t of topTags) r[t] = tc?.get(t) ?? 0; return r })
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

// ── Fallback khi chưa có PostgreSQL function ──────────────────────────────────
async function legacyRoute(db: ReturnType<typeof sb>) {
  const PAGE = 1000
  const items: { notes: string|null; product_name: string; status: string; imei: string; received_at: string|null }[] = []
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from('repair_items')
      .select('notes, product_name, status, imei, received_at')
      .not('notes', 'is', null)
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) return NextResponse.json({ error: (error as {message: string}).message }, { status: 500 })
    if (!data || data.length === 0) break
    items.push(...(data as typeof items))
    if (data.length < PAGE) break
  }

  const HASHTAG_RE2 = /#([^\s#,;.!?()[\]{}"']+)/g
  function extractTags2(notes: string|null): string[] {
    if (!notes?.trim()) return []
    const tags: string[] = []; let m: RegExpExecArray|null
    HASHTAG_RE2.lastIndex = 0
    while ((m = HASHTAG_RE2.exec(notes)) !== null) { const t = m[1].toLowerCase().trim(); if (t) tags.push(t) }
    return tags
  }
  function getWeekKey2(s: string|null) { return getWeekKey(s) }
  function getMonthKey2(s: string|null) { return getMonthKey(s) }

  const tagMap = new Map<string, { count: number; products: Map<string, number>; statuses: Record<string, number>; imeis: Set<string> }>()
  const weekTrendMap = new Map<string, Map<string, number>>()
  const monthTrendMap = new Map<string, Map<string, number>>()
  const weekDeviceMap = new Map<string, Map<string, Map<string, number>>>()
  const monthDeviceMap = new Map<string, Map<string, Map<string, number>>>()

  for (const item of items) {
    const tags = extractTags2(item.notes)
    const wk = getWeekKey2(item.received_at)
    const mk = getMonthKey2(item.received_at)
    for (const tag of tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, { count: 0, products: new Map(), statuses: {}, imeis: new Set() })
      const e = tagMap.get(tag)!
      e.count++; e.products.set(item.product_name, (e.products.get(item.product_name) ?? 0) + 1)
      e.statuses[item.status] = (e.statuses[item.status] ?? 0) + 1; e.imeis.add(item.imei)
      if (wk) {
        if (!weekTrendMap.has(wk)) weekTrendMap.set(wk, new Map())
        weekTrendMap.get(wk)!.set(tag, (weekTrendMap.get(wk)!.get(tag) ?? 0) + 1)
        if (!weekDeviceMap.has(wk)) weekDeviceMap.set(wk, new Map())
        const wd = weekDeviceMap.get(wk)!
        if (!wd.has(item.product_name)) wd.set(item.product_name, new Map())
        wd.get(item.product_name)!.set(tag, (wd.get(item.product_name)!.get(tag) ?? 0) + 1)
      }
      if (mk) {
        if (!monthTrendMap.has(mk)) monthTrendMap.set(mk, new Map())
        monthTrendMap.get(mk)!.set(tag, (monthTrendMap.get(mk)!.get(tag) ?? 0) + 1)
        if (!monthDeviceMap.has(mk)) monthDeviceMap.set(mk, new Map())
        const md = monthDeviceMap.get(mk)!
        if (!md.has(item.product_name)) md.set(item.product_name, new Map())
        md.get(item.product_name)!.set(tag, (md.get(item.product_name)!.get(tag) ?? 0) + 1)
      }
    }
  }

  const tagsSorted = Array.from(tagMap.entries())
    .map(([tag, v]) => ({
      tag, count: v.count, deviceCount: v.imeis.size, statuses: v.statuses,
      topProducts: Array.from(v.products.entries()).sort((a,b) => b[1]-a[1]).slice(0,5).map(([product_name,count]) => ({ product_name, count })),
    })).sort((a,b) => b.count - a.count)

  const topTags2   = tagsSorted.slice(0,8).map(t => t.tag)
  const devTotals  = new Map<string, number>()
  for (const item of items) if (extractTags2(item.notes).length > 0) devTotals.set(item.product_name, (devTotals.get(item.product_name) ?? 0) + 1)
  const topDevices2 = Array.from(devTotals.entries()).sort((a,b) => b[1]-a[1]).slice(0,6).map(([n]) => n)

  const mkTrend = (map: Map<string, Map<string, number>>, keys: string[]) =>
    Array.from(map.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([period, tc]) => { const r: Record<string,string|number> = {period}; for (const k of keys) r[k] = tc.get(k) ?? 0; return r })
  const mkDevTrend = (map: Map<string, Map<string, Map<string, number>>>, devs: string[]) =>
    Array.from(map.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([period, dm]) => { const r: Record<string,string|number> = {period}; for (const d of devs) { let s=0; dm.get(d)?.forEach(v => {s+=v}); r[d]=s }; return r })

  const deviceWeeklyTagTrends2: Record<string, Array<Record<string,string|number>>> = {}
  const deviceMonthlyTagTrends2: Record<string, Array<Record<string,string|number>>> = {}
  for (const dev of topDevices2) {
    deviceWeeklyTagTrends2[dev] = Array.from(weekDeviceMap.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([period, dm]) => { const r: Record<string,string|number> = {period}; const tc=dm.get(dev); for (const t of topTags2) r[t] = tc?.get(t) ?? 0; return r })
    deviceMonthlyTagTrends2[dev] = Array.from(monthDeviceMap.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([period, dm]) => { const r: Record<string,string|number> = {period}; const tc=dm.get(dev); for (const t of topTags2) r[t] = tc?.get(t) ?? 0; return r })
  }

  return NextResponse.json({
    tags: tagsSorted, totalWithNotes: items.length, topTags: topTags2, topDevices: topDevices2,
    weeklyTrends: mkTrend(weekTrendMap, topTags2), monthlyTrends: mkTrend(monthTrendMap, topTags2),
    weeklyDeviceTrends: mkDevTrend(weekDeviceMap, topDevices2), monthlyDeviceTrends: mkDevTrend(monthDeviceMap, topDevices2),
    deviceWeeklyTagTrends: deviceWeeklyTagTrends2, deviceMonthlyTagTrends: deviceMonthlyTagTrends2,
  })
}
