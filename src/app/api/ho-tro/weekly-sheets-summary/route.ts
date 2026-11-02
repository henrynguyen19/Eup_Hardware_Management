/**
 * GET /api/ho-tro/weekly-sheets-summary
 * Tổng hợp dữ liệu từ Sheets tickets trong ho_tro_tickets cho báo cáo tuần.
 *
 * Sheets tickets có sheet_row_key KHÔNG bắt đầu bằng 'crm:' và chứa
 * speed_tag thực sự (fast/normal/low/hen/mai_bao_lai) từ hashtag #f/#n/#l.
 *
 * CRM tickets (sheet_row_key LIKE 'crm:%') chỉ có speed_tag = hen/mai_bao_lai.
 *
 * Query params:
 *   from=YYYY-MM-DD
 *   to=YYYY-MM-DD
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams

  const now = new Date()
  const day = now.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(now); monday.setDate(now.getDate() + mondayOffset)
  const defaultFrom = monday.toISOString().split('T')[0]
  const defaultTo   = now.toISOString().split('T')[0]

  const from = sp.get('from') || defaultFrom
  const to   = sp.get('to')   || defaultTo

  // ── Lấy Sheets tickets (không phải CRM) trong khoảng thời gian ──
  // Sheets tickets được parsed từ Google Sheets và có speed_tag đầy đủ (fast/normal/low)
  const { data, error } = await sb()
    .from('ho_tro_tickets')
    .select('ticket_date, speed_tag, direction, ticket_type')
    .not('sheet_row_key', 'like', 'crm:%')
    .gte('ticket_date', from)
    .lte('ticket_date', to)
    .order('ticket_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  // ── Aggregate ──
  const resolution: Record<string, number> = {
    Fast: 0, Normal: 0, Low: 0, Hen: 0, 'Mai bao lai': 0,
  }
  const channels: Record<string, number> = { Zalo: 0, Hotline: 0 }
  const typeMap:  Record<string, number> = {}
  let totalRequests = 0

  for (const row of rows) {
    totalRequests++

    // Speed
    const tag = row.speed_tag as string | null
    if      (tag === 'fast'        || tag === 'f') resolution['Fast']++
    else if (tag === 'normal'      || tag === 'n') resolution['Normal']++
    else if (tag === 'low'         || tag === 'l') resolution['Low']++
    else if (tag === 'hen')                        resolution['Hen']++
    else if (tag === 'mai_bao_lai')                resolution['Mai bao lai']++

    // Channel từ direction column
    const dir = (row.direction ?? '').toLowerCase()
    if      (dir.includes('zalo'))    channels['Zalo']++
    else if (dir.includes('hotline')) channels['Hotline']++

    // Ticket type
    const t = row.ticket_type as string | null
    if (t) typeMap[t] = (typeMap[t] ?? 0) + 1
  }

  // ── Cũng lấy từ ho_tro_daily_records cho errors/devices (cache từ Sheets) ──
  const { data: cacheRows } = await sb()
    .from('ho_tro_daily_records')
    .select('errors, devices, locations')
    .gte('sort_key', from)
    .lte('sort_key', to)

  const errorsMap:   Record<string, number> = {}
  const devicesMap:  Record<string, number> = {}
  const locationsMap:Record<string, number> = {}

  for (const row of (cacheRows ?? [])) {
    for (const [k, v] of Object.entries(row.errors   ?? {})) errorsMap[k]    = (errorsMap[k]    ?? 0) + Number(v)
    for (const [k, v] of Object.entries(row.devices  ?? {})) devicesMap[k]   = (devicesMap[k]   ?? 0) + Number(v)
    for (const [k, v] of Object.entries(row.locations ?? {})) locationsMap[k] = (locationsMap[k] ?? 0) + Number(v)
  }

  const toArray = (m: Record<string, number>) =>
    Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))

  return NextResponse.json({
    from, to,
    totalRequests,
    sheetsRowsFound: rows.length,
    resolution: toArray(resolution),
    channels:   toArray(channels),
    errors:     toArray(errorsMap),
    devices:    toArray(devicesMap),
    locations:  toArray(locationsMap),
    byType:     toArray(typeMap),
  })
}
