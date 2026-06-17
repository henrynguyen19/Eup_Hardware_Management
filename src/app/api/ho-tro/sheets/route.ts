import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import type { DailyRecord } from '@/types/ho-tro'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ── CSV single-row parser ────────────────────────────────────
function parseCSVRow(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; continue }
      inQuote = !inQuote
      continue
    }
    if (c === ',' && !inQuote) { result.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  result.push(cur.trim())
  return result
}

// ── Excel serial → DD/MM/YYYY ────────────────────────────────
// Excel epoch = Jan 0, 1900 (with bug treating 1900 as leap year, so day 1 = Jan 1 1900)
function excelSerialToDate(serial: number): { display: string; sortKey: string } | null {
  // Excel serial 1 = 1900-01-01. JS: new Date(0) = 1970-01-01.
  // Days from 1970-01-01 to 1900-01-01 = -25569 days (reversed)
  // Excel incorrectly includes 1900-02-29 (serial 60), so we subtract 1 for serials > 60
  const adjusted = serial > 60 ? serial - 1 : serial
  const msPerDay = 86400000
  const epoch1900 = Date.UTC(1900, 0, 1) // Jan 1 1900 in ms
  const ms = epoch1900 + (adjusted - 1) * msPerDay
  const date = new Date(ms)
  const y = date.getUTCFullYear()
  if (y < 2020 || y > 2035) return null
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = date.getUTCDate().toString().padStart(2, '0')
  return { display: `${d}/${m}/${y}`, sortKey: `${y}-${m}-${d}` }
}

// ── Known metric names (sorted descending by length to avoid prefix conflicts) ──
// Format: [Vietnamese name, value number follows immediately after name]
const KNOWN_METRICS: string[] = [
  'số yêu cầu xử lý sang ngày thứ 5',
  'số yêu cầu xử lý sang ngày thứ 4',
  'số yêu cầu xử lý sang ngày thứ 3',
  'số yêu cầu xử lý sang ngày thứ 2',
  'số yêu cầu xử lý trong ngày',
  'Tiếp nhận chưa xử lý',
  'thời gian xử lý trung bình',
  'số lượng yêu cầu',
  'Số lục trong ngày nghỉ',
  'Tiếp nhận từ hotline',
  'Tiếp nhận từ zalo',
  'thời gian xử lý lâu',
  'Gotrack - Go 168',
  'Hẹn xử lý',
  'Hải Phòng',
  'Bình Dương',
  'Hà Nội',
  'Hồ Chí Minh',
  'Đà Nẵng',
  'Phần mềm',
  'VN88 4GH',
  'VN 88 2G',
  'C43 & H5',
  'VN88 4G',
  'FS100',
  'MT99',
  'ADAS',
  'RFID',
  'SOJI',
  'S168',
  'ACC',
  'DVR',
  'DMS',
  'FUEL',
  'GPS',
  'GSM',
  'Tổng',
  'BW',
  'IO',
  'NC',
  'PW',
  'SS',
  'SP',
]
// Sort by descending length so longer names match first (e.g. VN88 4GH before VN88 4G)
KNOWN_METRICS.sort((a, b) => b.length - a.length)

// ── Parse packed string from line 0 of báo cáo CSV ──────────
// Format: "ngày{serial}số lượng yêu cầu{N}   ;{serial}{metric}{value}   ;ngày{serial2}..."
function parsePackedString(packed: string): DailyRecord[] {
  if (!packed || !packed.startsWith('ngày')) return []

  // Split by the 3-space semicolon separator
  const entries = packed.split('   ;')

  // Group entries by Excel serial (5-digit number)
  const dayMap = new Map<number, Map<string, number>>()
  let currentSerial = 0

  for (const rawEntry of entries) {
    const entry = rawEntry.trim()
    if (!entry) continue

    // Check if it starts a new day: "ngày{5digits}"
    const dayMatch = entry.match(/^ngày(\d{5})/)
    if (dayMatch) {
      currentSerial = parseInt(dayMatch[1])
      if (!dayMap.has(currentSerial)) dayMap.set(currentSerial, new Map())
      // The rest of the entry after "ngày" is still a metric entry
      const rest = entry.slice(4) // remove "ngày"
      parseMetricEntry(rest, currentSerial, dayMap.get(currentSerial)!)
    } else if (currentSerial > 0) {
      parseMetricEntry(entry, currentSerial, dayMap.get(currentSerial)!)
    }
  }

  // Build DailyRecord[] from the map
  const result: DailyRecord[] = []
  for (const [serial, metrics] of dayMap) {
    const di = excelSerialToDate(serial)
    if (!di) continue

    const g = (key: string): number => metrics.get(key) ?? 0

    result.push({
      date: di.display,
      sortKey: di.sortKey,
      total_requests: g('số lượng yêu cầu'),
      avg_time:       g('thời gian xử lý trung bình'),
      max_time:       g('thời gian xử lý lâu'),
      devices: {
        'VN88 2G':  g('VN 88 2G'),
        'VN88 4G':  g('VN88 4G'),
        'VN88 4GH': g('VN88 4GH'),
        'S168':     g('S168'),
        'DVR':      g('DVR'),
        'FUEL':     g('FUEL'),
        'Go168':    g('Gotrack - Go 168'),
        'MT99':     g('MT99'),
        'C43&H5':   g('C43 & H5'),
        'BW':       g('BW'),
        'Phan mem': g('Phần mềm'),
      },
      resolution: {
        'Chua xu ly': g('Tiếp nhận chưa xử lý'),
        'Hen xu ly':  g('Hẹn xử lý'),
        'Ngay 1':     g('số yêu cầu xử lý trong ngày'),
        'Ngay 2':     g('số yêu cầu xử lý sang ngày thứ 2'),
        'Ngay 3':     g('số yêu cầu xử lý sang ngày thứ 3'),
        'Ngay 4':     g('số yêu cầu xử lý sang ngày thứ 4'),
        'Ngay 5':     g('số yêu cầu xử lý sang ngày thứ 5'),
        'Tong':       g('Tổng'),
      },
      locations: {
        'Ha Noi':     g('Hà Nội'),
        'Hai Phong':  g('Hải Phòng'),
        'Da Nang':    g('Đà Nẵng'),
        'HCM':        g('Hồ Chí Minh'),
        'Binh Duong': g('Bình Dương'),
      },
      channels: {
        'Zalo':      g('Tiếp nhận từ zalo'),
        'Hotline':   g('Tiếp nhận từ hotline'),
        'Ngay nghi': g('Số lục trong ngày nghỉ'),
      },
      errors: {
        'ACC':   g('ACC'),
        'RFID':  g('RFID'),
        'PW':    g('PW'),
        'GPS':   g('GPS'),
        'GSM':   g('GSM'),
        'IO':    g('IO'),
        'SS':    g('SS'),
        'DMS':   g('DMS'),
        'ADAS':  g('ADAS'),
        'NC':    g('NC'),
        'SP':    g('SP'),
        'FS100': g('FS100'),
        'SOJI':  g('SOJI'),
      },
    })
  }

  return result.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}

// Parse a single metric entry like "46174số lượng yêu cầu43"
function parseMetricEntry(entry: string, serial: number, metrics: Map<string, number>) {
  const serialStr = String(serial)
  // Strip serial prefix if present
  const rest = entry.startsWith(serialStr) ? entry.slice(serialStr.length) : entry

  // Try each known metric (already sorted by descending length)
  for (const metricName of KNOWN_METRICS) {
    if (rest.startsWith(metricName)) {
      const valueStr = rest.slice(metricName.length)
      const value = parseFloat(valueStr)
      if (!isNaN(value)) {
        metrics.set(metricName, value)
      }
      return
    }
  }
}

// ── GET handler ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check ho_tro permission
  const { data: permData } = await adminClient()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()
  const perms: string[] = permData?.permissions ?? []
  const hasAccess = perms.includes('ho_tro:read') || perms.includes('admin:users')
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const sheetId = sp.get('sheetId')
  const month   = sp.get('month')
  const year    = sp.get('year') // short "26" or full "2026"

  if (!sheetId || !month || !year) {
    return NextResponse.json({ error: 'Missing sheetId, month, year' }, { status: 400 })
  }

  const yearShort = year.length === 4 ? year.slice(2) : year
  const sheetName = `báo cáo tháng ${month}/${yearShort}`

  try {
    // Use tqx=out:csv to avoid parsedNumHeaders bug with JSON format
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&headers=0`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const csvText = await res.text()

    // Check if response is HTML (sheet not found / no permission)
    if (csvText.trimStart().startsWith('<')) {
      return NextResponse.json({
        error: `Sheet "${sheetName}" khong ton tai hoac chua public`,
        rows: [],
        sheetName,
      })
    }

    // The báo cáo sheet has a packed string in the first cell of the first row.
    // It contains all daily metrics encoded as:
    // "ngày{serial}metric_name{value}   ;{serial}metric_name{value}   ;ngày{nextSerial}..."
    // Parse this packed string to extract daily records.
    const firstLine = csvText.split('\n')[0] ?? ''
    const firstRow = parseCSVRow(firstLine)
    const packedStr = firstRow[0] ?? ''

    const rows = parsePackedString(packedStr)

    // Filter to only the requested month/year
    const monthNum = parseInt(month)
    const yearNum  = 2000 + parseInt(yearShort)
    const filtered = rows.filter(r => {
      const [, m, y] = r.date.split('/').map(Number)
      return m === monthNum && y === yearNum
    })

    return NextResponse.json({ rows: filtered, sheetName, month, year: yearShort })
  } catch (err) {
    console.error('[ho-tro/sheets]', err)
    return NextResponse.json({ error: String(err), rows: [], sheetName })
  }
}
