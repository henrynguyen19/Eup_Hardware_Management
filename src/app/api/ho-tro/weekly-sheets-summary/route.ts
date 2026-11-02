/**
 * GET /api/ho-tro/weekly-sheets-summary
 * Tổng hợp dữ liệu từ Google Sheets cache (ho_tro_daily_records) cho báo cáo tuần.
 * Trả về: resolution (Fast/Normal/Low/Hen/Mai bao lai), channels (Zalo/Hotline),
 *          errors, devices, locations — aggregate cho khoảng ngày cho trước.
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

function addRecord(target: Record<string, number>, source: Record<string, number> | null) {
  if (!source) return
  for (const [k, v] of Object.entries(source)) {
    target[k] = (target[k] ?? 0) + (Number(v) || 0)
  }
}

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

  // Lấy tất cả daily records trong khoảng ngày từ DB cache
  const { data, error } = await sb()
    .from('ho_tro_daily_records')
    .select('sort_key, total_requests, resolution, channels, errors, devices, locations, pm_types')
    .gte('sort_key', from)
    .lte('sort_key', to)
    .order('sort_key')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  // Aggregate all JSON fields
  const resolution: Record<string, number> = {}
  const channels:   Record<string, number> = {}
  const errors:     Record<string, number> = {}
  const devices:    Record<string, number> = {}
  const locations:  Record<string, number> = {}
  const pm_types:   Record<string, number> = {}
  let totalRequests = 0

  for (const row of rows) {
    totalRequests += row.total_requests ?? 0
    addRecord(resolution, row.resolution)
    addRecord(channels,   row.channels)
    addRecord(errors,     row.errors)
    addRecord(devices,    row.devices)
    addRecord(locations,  row.locations)
    addRecord(pm_types,   row.pm_types)
  }

  // Build sorted arrays for easy chart rendering
  const resolutionArray = Object.entries(resolution)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }))

  const channelsArray = Object.entries(channels)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }))

  const errorsArray = Object.entries(errors)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }))

  const devicesArray = Object.entries(devices)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }))

  const locationsArray = Object.entries(locations)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }))

  return NextResponse.json({
    from, to,
    totalRequests,
    daysFound: rows.length,
    resolution: resolutionArray,
    channels:   channelsArray,
    errors:     errorsArray,
    devices:    devicesArray,
    locations:  locationsArray,
    pm_types:   Object.entries(pm_types).filter(([,v]) => v > 0).map(([key, count]) => ({ key, count })),
  })
}
