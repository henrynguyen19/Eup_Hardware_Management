/**
 * hotro-weekly-stats.ts
 * Hàm server-side tổng hợp dữ liệu YC hỗ trợ kỹ thuật theo tuần ISO,
 * upsert vào bảng `hotro_weekly_stats` trong Supabase.
 *
 * Gọi sau mỗi lần sync CRM để bảng luôn cập nhật.
 * GET /api/ho-tro/weekly-stats chỉ cần SELECT từ bảng này — nhanh.
 */

import { SupabaseClient } from '@supabase/supabase-js'

// ── Parsing hashtag errors ───────────────────────────────────────────────────
function parseErrors(memo: string) {
  const t = (memo ?? '').toLowerCase()
  return {
    no_connect: /#nc\b/.test(t)      ? 1 : 0,
    gsm:        /#gsm\b/.test(t)     ? 1 : 0,
    gps:        /#gps\b/.test(t)     ? 1 : 0,
    acc:        /#acc\b/.test(t)     ? 1 : 0,
    rfid:       /#rfid\b/.test(t)    ? 1 : 0,
    pw:         /#pw\b/.test(t)      ? 1 : 0,
    support:    /#sp\b/.test(t)      ? 1 : 0,
  }
}

// ── ISO week key ─────────────────────────────────────────────────────────────
function getISOWeekKey(isoDate: string): { weekKey: string; weekLabel: string; year: number; weekNum: number } | null {
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return null
  d.setHours(12, 0, 0, 0)
  const dow   = d.getDay() === 0 ? 7 : d.getDay()     // 1=Mon..7=Sun
  const jan1  = new Date(d.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000)
  const weekNum   = Math.floor((dayOfYear + (4 - dow)) / 7) + 1
  const year      = d.getFullYear()
  const weekLabel = `W${String(weekNum).padStart(2, '0')}`
  const weekKey   = `${year}-${weekLabel}`
  return { weekKey, weekLabel, year, weekNum }
}

// ── Main rebuild function ─────────────────────────────────────────────────────
export async function rebuildWeeklyStats(
  db: SupabaseClient,
  opts: { year?: number } = {}
): Promise<{ ok: boolean; weeks: number; totalRows: number; error?: string }> {
  const year      = opts.year ?? new Date().getFullYear()
  const yearStart = `${year}-01-01`
  const yearEnd   = `${year}-12-31`

  // ── Fetch tất cả tickets trong năm (chỉ 2 cột nhỏ) ──
  const PAGE_SIZE = 1000
  let   from      = 0
  const allRows: { ticket_date: string; reply: string | null }[] = []

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await db
      .from('ho_tro_tickets')
      .select('ticket_date, reply')
      .like('sheet_row_key', 'crm:%')
      .gte('ticket_date', yearStart)
      .lte('ticket_date', yearEnd)
      .order('ticket_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { ok: false, weeks: 0, totalRows: 0, error: error.message }
    if (!data || data.length === 0) break

    allRows.push(...(data as { ticket_date: string; reply: string | null }[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  // ── Aggregate theo tuần ──
  type WeekRow = {
    week_key:   string
    week_label: string
    year:       number
    week_num:   number
    total:      number
    no_connect: number
    rfid:       number
    acc:        number
    pw:         number
    support:    number
    gps:        number
    gsm:        number
    updated_at: string
  }

  const weekMap = new Map<string, WeekRow>()

  for (const row of allRows) {
    if (!row.ticket_date) continue
    const wk = getISOWeekKey(row.ticket_date)
    if (!wk) continue

    if (!weekMap.has(wk.weekKey)) {
      weekMap.set(wk.weekKey, {
        week_key:   wk.weekKey,
        week_label: wk.weekLabel,
        year:       wk.year,
        week_num:   wk.weekNum,
        total:      0,
        no_connect: 0,
        rfid:       0,
        acc:        0,
        pw:         0,
        support:    0,
        gps:        0,
        gsm:        0,
        updated_at: new Date().toISOString(),
      })
    }

    const entry = weekMap.get(wk.weekKey)!
    const errs  = parseErrors(row.reply ?? '')
    entry.total++
    entry.no_connect += errs.no_connect
    entry.gsm        += errs.gsm
    entry.gps        += errs.gps
    entry.acc        += errs.acc
    entry.rfid       += errs.rfid
    entry.pw         += errs.pw
    entry.support    += errs.support
  }

  const rows = Array.from(weekMap.values())
  if (rows.length === 0) return { ok: true, weeks: 0, totalRows: 0 }

  // ── Upsert vào hotro_weekly_stats ──
  const BATCH = 100
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from('hotro_weekly_stats')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'week_key' })
    if (error) return { ok: false, weeks: rows.length, totalRows: allRows.length, error: error.message }
  }

  return { ok: true, weeks: rows.length, totalRows: allRows.length }
}

// ── Format output for API response ───────────────────────────────────────────
export type WeeklyStatsRow = {
  week_key: string; week_label: string; year: number; week_num: number
  total: number; no_connect: number; rfid: number; acc: number
  pw: number; support: number; gps: number; gsm: number
}

export function formatWeeklyStatsForChart(rows: WeeklyStatsRow[]) {
  const sorted = [...rows].sort((a, b) => a.week_key.localeCompare(b.week_key))

  const weekTotalData = sorted.map(r => ({
    weekLabel: r.week_label,
    total:     r.total,
  }))

  const weekErrData = sorted.map(r => ({
    weekLabel:    r.week_label,
    'No Connect': r.no_connect,
    'RFID':       r.rfid,
    'ACC':        r.acc,
    'PW':         r.pw,
    'Support':    r.support,
    'GPS':        r.gps,
    'GSM':        r.gsm,
  }))

  return { weekTotalData, weekErrData }
}
