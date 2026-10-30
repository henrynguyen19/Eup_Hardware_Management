/**
 * GET /api/repair-tracking/weekly-error-matrix
 * Ma trận Device × Hashtag-Error cho báo cáo sửa chữa tuần.
 *
 * Query params:
 *   from=YYYY-MM-DD  (default: đầu tuần hiện tại)
 *   to=YYYY-MM-DD    (default: hôm nay)
 *
 * Response:
 *   devices: string[]          — danh sách thiết bị (cột)
 *   errors:  string[]          — danh sách loại lỗi (hàng)
 *   matrix:  Record<error, Record<device, number>>
 *   totalByError:  Record<error, number>
 *   totalByDevice: Record<device, number>
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Chuẩn hoá tên thiết bị
function normalizeProduct(name: string): string {
  const n = (name ?? '').trim()
  if (/go.?168|go-168|go168/i.test(n))       return 'GO'
  if (/c-?43|streamax.*c43|c43/i.test(n))    return 'C43'
  if (/vn88.*4g[h]|4gh/i.test(n))            return '4GH'
  if (/dvr|mdvr|h5.*dvr/i.test(n))           return 'DVR88'
  if (/camera|cam(?!era)/i.test(n))           return 'Camera'
  if (/\bh5\b/i.test(n))                     return 'H5'
  if (/bewin|bw/i.test(n))                   return 'Bewin'
  if (/gotrack|gotrack.*s4|s400/i.test(n))   return 'Gotrack'
  if (/fuel|sensor/i.test(n))                return 'FuelSensor'
  if (/vn88.*4g|4g.*vn88/i.test(n))          return 'VN88 4G'
  if (/vn88/i.test(n))                       return 'VN88'
  return n || 'Khác'
}

// Nhãn hiển thị đẹp cho hashtag
const TAG_LABELS: Record<string, string> = {
  nc:      'No Connect',
  pw:      'Power',
  rfid:    'RFID',
  gps:     'GPS',
  gsm:     'GSM',
  acc:     'ACC',
  sp:      'Support',
  sd:      'SD Card',
  roaming: 'Roaming',
  dms:     'DMS',
  adas:    'ADAS',
  io:      'I/O',
}

function parseHashtags(notes: string): string[] {
  const matches = notes.match(/#([a-z0-9_]+)/gi) ?? []
  return matches
    .map(m => m.slice(1).toLowerCase())
    .filter(t => Object.keys(TAG_LABELS).includes(t))
}

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams

  // Default: đầu tuần → hôm nay
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  const defaultFrom = monday.toISOString().split('T')[0]
  const defaultTo   = now.toISOString().split('T')[0]

  const from = sp.get('from') || defaultFrom
  const to   = sp.get('to')   || defaultTo

  // Lấy items trong khoảng thời gian có notes
  const { data, error } = await sb()
    .from('repair_items')
    .select('product_name, notes, received_at')
    .gte('received_at', `${from}T00:00:00`)
    .lte('received_at', `${to}T23:59:59`)
    .not('notes', 'is', null)
    .not('notes', 'eq', '')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  // Build matrix: error → device → count
  const matrix: Record<string, Record<string, number>> = {}
  const deviceSet = new Set<string>()
  const errorSet  = new Set<string>()

  for (const row of rows) {
    const device = normalizeProduct(row.product_name ?? '')
    const tags   = parseHashtags(row.notes ?? '')
    if (!tags.length) continue

    deviceSet.add(device)
    for (const tag of tags) {
      const label = TAG_LABELS[tag] ?? tag
      errorSet.add(label)
      if (!matrix[label]) matrix[label] = {}
      matrix[label][device] = (matrix[label][device] ?? 0) + 1
    }
  }

  // Sort devices by total count desc
  const deviceTotals: Record<string, number> = {}
  for (const dev of deviceSet) {
    deviceTotals[dev] = Object.values(matrix).reduce((s, row) => s + (row[dev] ?? 0), 0)
  }
  const devices = [...deviceSet].sort((a, b) => (deviceTotals[b] ?? 0) - (deviceTotals[a] ?? 0))

  // Sort errors by total count desc
  const errorTotals: Record<string, number> = {}
  for (const err of errorSet) {
    errorTotals[err] = Object.values(matrix[err] ?? {}).reduce((s, v) => s + v, 0)
  }
  const errors = [...errorSet].sort((a, b) => (errorTotals[b] ?? 0) - (errorTotals[a] ?? 0))

  return NextResponse.json({
    from,
    to,
    devices,
    errors,
    matrix,
    totalByError:  errorTotals,
    totalByDevice: deviceTotals,
  })
}
