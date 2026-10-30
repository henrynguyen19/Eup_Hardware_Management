/**
 * GET /api/ho-tro/weekly-detail
 * Chi tiết HoTro theo ngày cho báo cáo tuần.
 *
 * Query params:
 *   from=YYYY-MM-DD  (default: đầu tuần hiện tại)
 *   to=YYYY-MM-DD    (default: hôm nay)
 *
 * Response:
 *   days: DayDetail[]      — chi tiết theo ngày (total, fast, normal, slow, scheduled, followup, staff{})
 *   staffNames: string[]   — danh sách nhân viên
 *   errMatrix: {           — Error × Device matrix từ device_error_pairs
 *     errors, devices, matrix, totalByError, totalByDevice
 *   }
 *   totals: { total, fast, fastPct, byStaff: Record<string, number> }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const STAFF_ORDER = ['Blue', 'Irene', 'Kane', 'Shiro', 'Stefan']

// Chuẩn hoá tên lỗi
const HASHTAG_LABELS: Record<string, string> = {
  '#nc': 'No Connect', '#pw': 'Power', '#rfid': 'RFID', '#gps': 'GPS',
  '#gsm': 'GSM', '#acc': 'ACC', '#sp': 'Support', '#sd': 'SD Card',
  '#roaming': 'Roaming', '#dms': 'DMS', '#adas': 'ADAS', '#io': 'I/O',
}

// Chuẩn hoá tên thiết bị rút gọn
function normDevice(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('go168') || n.includes('go-168')) return 'Go168'
  if (n.includes('c43') || n.includes('c-43'))      return 'C43'
  if (n.includes('vn88') && n.includes('4gh'))      return 'VN88 4GH'
  if (n.includes('vn88') && n.includes('4g'))       return 'VN88 4G'
  if (n.includes('gotrack') || n.includes('s400'))  return 'Gotrack'
  if (n.includes('fuel') || n.includes('sensor'))   return 'FuelSensor'
  if (n.includes('bewin') || n.includes('bw'))      return 'BW'
  if (n.includes('h5'))                             return 'H5'
  return name
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

  // Lấy tất cả tickets trong khoảng thời gian
  const { data, error } = await sb()
    .from('ho_tro_tickets')
    .select('ticket_date, speed_tag, staff_name, zone, device_error_pairs')
    .gte('ticket_date', from)
    .lte('ticket_date', to)
    .order('ticket_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  // ── Tổng hợp theo ngày ──
  const dayMap = new Map<string, {
    total: number; fast: number; normal: number; slow: number; scheduled: number; followup: number;
    staff: Record<string, number>
  }>()

  function getDay(date: string) {
    if (!dayMap.has(date)) dayMap.set(date, {
      total: 0, fast: 0, normal: 0, slow: 0, scheduled: 0, followup: 0, staff: {}
    })
    return dayMap.get(date)!
  }

  // ── Error × Device matrix ──
  const errDevMap = new Map<string, Map<string, number>>()
  const deviceSet = new Set<string>()
  const errorSet  = new Set<string>()

  // Staff set
  const staffSet = new Set<string>()

  for (const row of rows) {
    const date = row.ticket_date as string
    const d = getDay(date)
    d.total++

    const tag = row.speed_tag as string
    if (tag === 'f')           d.fast++
    else if (tag === 'n')      d.normal++
    else if (tag === 'l')      d.slow++
    else if (tag === 'hen')    d.scheduled++
    else if (tag === 'mai_bao_lai') d.followup++

    const staff = row.staff_name as string
    if (staff) {
      staffSet.add(staff)
      d.staff[staff] = (d.staff[staff] ?? 0) + 1
    }

    // Parse device_error_pairs — key format: "DeviceName×ErrorName"
    const pairs = row.device_error_pairs as Record<string, number> | null
    if (pairs) {
      for (const [key, count] of Object.entries(pairs)) {
        const parts = key.split('×')
        if (parts.length !== 2) continue
        const [rawDev, rawErr] = parts
        const dev = normDevice(rawDev.trim())
        // Normalise error: check if it matches a hashtag label
        const errEntry = Object.entries(HASHTAG_LABELS).find(([tag, label]) =>
          rawErr.toLowerCase().includes(tag) || rawErr.toLowerCase().includes(label.toLowerCase())
        )
        const err = errEntry ? errEntry[1] : rawErr.trim()

        deviceSet.add(dev)
        errorSet.add(err)

        if (!errDevMap.has(err)) errDevMap.set(err, new Map())
        const devMap = errDevMap.get(err)!
        devMap.set(dev, (devMap.get(dev) ?? 0) + count)
      }
    }
  }

  // Build days array sorted by date
  const days = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      total: d.total, fast: d.fast, normal: d.normal,
      slow: d.slow, scheduled: d.scheduled, followup: d.followup,
      staff: d.staff,
    }))

  // Staff names sorted (prefer known order)
  const staffNames = [
    ...STAFF_ORDER.filter(s => staffSet.has(s)),
    ...[...staffSet].filter(s => !STAFF_ORDER.includes(s)).sort(),
  ]

  // Build totals
  const total = rows.length
  const fast  = rows.filter(r => r.speed_tag === 'f').length
  const byStaff: Record<string, number> = {}
  for (const s of staffSet) byStaff[s] = rows.filter(r => r.staff_name === s).length

  // Build error matrix
  const errors: string[] = [...errorSet]
  const devices: string[] = [...deviceSet]
  const matrix: Record<string, Record<string, number>> = {}
  const totalByError: Record<string, number> = {}
  const totalByDevice: Record<string, number> = {}

  for (const [err, devMap] of errDevMap.entries()) {
    matrix[err] = Object.fromEntries(devMap)
    totalByError[err] = [...devMap.values()].reduce((s, v) => s + v, 0)
  }
  for (const dev of deviceSet) {
    totalByDevice[dev] = errors.reduce((s, err) => s + (matrix[err]?.[dev] ?? 0), 0)
  }

  // Sort errors and devices by total desc
  errors.sort((a, b) => (totalByError[b] ?? 0) - (totalByError[a] ?? 0))
  devices.sort((a, b) => (totalByDevice[b] ?? 0) - (totalByDevice[a] ?? 0))

  return NextResponse.json({
    from, to,
    days,
    staffNames,
    totals: { total, fast, fastPct: total ? Math.round(fast / total * 100) : 0, byStaff },
    errMatrix: { errors, devices, matrix, totalByError, totalByDevice },
  })
}
