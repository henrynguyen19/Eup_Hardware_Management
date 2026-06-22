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
function excelSerialToDate(serial: number): { display: string; sortKey: string } | null {
  const adjusted = serial > 60 ? serial - 1 : serial
  const msPerDay = 86400000
  const epoch1900 = Date.UTC(1900, 0, 1)
  const ms = epoch1900 + (adjusted - 1) * msPerDay
  const date = new Date(ms)
  const y = date.getUTCFullYear()
  if (y < 2020 || y > 2035) return null
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = date.getUTCDate().toString().padStart(2, '0')
  return { display: `${d}/${m}/${y}`, sortKey: `${y}-${m}-${d}` }
}

// ── Known metric names ────────────────────────────────────────
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
KNOWN_METRICS.sort((a, b) => b.length - a.length)

// ── Parse packed string ───────────────────────────────────────
function parsePackedString(packed: string): DailyRecord[] {
  if (!packed || !packed.startsWith('ngày')) return []

  const entries = packed.split('   ;')
  const dayMap = new Map<number, Map<string, number>>()
  let currentSerial = 0

  for (const rawEntry of entries) {
    const entry = rawEntry.trim()
    if (!entry) continue

    const dayMatch = entry.match(/^ngày(\d{5})/)
    if (dayMatch) {
      currentSerial = parseInt(dayMatch[1])
      if (!dayMap.has(currentSerial)) dayMap.set(currentSerial, new Map())
      const rest = entry.slice(4)
      parseMetricEntry(rest, currentSerial, dayMap.get(currentSerial)!)
    } else if (currentSerial > 0) {
      parseMetricEntry(entry, currentSerial, dayMap.get(currentSerial)!)
    }
  }

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

function parseMetricEntry(entry: string, serial: number, metrics: Map<string, number>) {
  const serialStr = String(serial)
  const rest = entry.startsWith(serialStr) ? entry.slice(serialStr.length) : entry

  for (const metricName of KNOWN_METRICS) {
    if (rest.startsWith(metricName)) {
      const valueStr = rest.slice(metricName.length)
      const value = parseFloat(valueStr)
      if (!isNaN(value)) metrics.set(metricName, value)
      return
    }
  }
}

// ── Fetch from Google Sheets ──────────────────────────────────
async function fetchFromSheets(
  sheetId: string, month: number, yearShort: string
): Promise<{ rows: DailyRecord[]; sheetName: string; error?: string }> {
  const sheetName = `báo cáo tháng ${month}/${yearShort}`
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&headers=0`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const csvText = await res.text()
    if (csvText.trimStart().startsWith('<')) {
      return { rows: [], sheetName, error: `Sheet "${sheetName}" không tồn tại hoặc chưa public` }
    }

    const firstLine = csvText.split('\n')[0] ?? ''
    const firstRow = parseCSVRow(firstLine)
    const packedStr = firstRow[0] ?? ''
    const allRows = parsePackedString(packedStr)

    // Filter to requested month/year only
    const monthNum = month
    const yearNum  = 2000 + parseInt(yearShort)
    const rows = allRows.filter(r => {
      const [, m, y] = r.date.split('/').map(Number)
      return m === monthNum && y === yearNum
    })

    return { rows, sheetName }
  } catch (err) {
    return { rows: [], sheetName, error: String(err) }
  }
}

// ── Save rows to DB cache ─────────────────────────────────────
async function saveToCache(
  db: ReturnType<typeof adminClient>,
  sheetId: string,
  staffName: string | null,
  rows: DailyRecord[]
): Promise<void> {
  if (!rows.length) return

  const now = new Date().toISOString()
  const upsertRows = rows.map(r => ({
    sheet_id:       sheetId,
    staff_name:     staffName,
    sort_key:       r.sortKey,
    date_display:   r.date,
    total_requests: r.total_requests,
    avg_time:       r.avg_time,
    max_time:       r.max_time,
    devices:        r.devices,
    resolution:     r.resolution,
    locations:      r.locations,
    channels:       r.channels,
    errors:         r.errors,
    fetched_at:     now,
  }))

  await db.from('ho_tro_daily_records')
    .upsert(upsertRows, { onConflict: 'sheet_id,sort_key' })
}

// ── Convert DB row → DailyRecord ─────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbRowToRecord(row: any): DailyRecord {
  return {
    date:           row.date_display,
    sortKey:        row.sort_key,
    total_requests: row.total_requests ?? 0,
    avg_time:       row.avg_time ?? 0,
    max_time:       row.max_time ?? 0,
    devices:        row.devices   ?? {},
    resolution:     row.resolution ?? {},
    locations:      row.locations  ?? {},
    channels:       row.channels   ?? {},
    errors:         row.errors     ?? {},
  }
}

// ── GET handler ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: permData } = await adminClient()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()
  const perms: string[] = permData?.permissions ?? []
  const hasAccess = perms.includes('ho_tro:read') || perms.includes('admin:users')
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const sheetId   = sp.get('sheetId')
  const month     = sp.get('month')
  const year      = sp.get('year')
  const staffName = sp.get('staffName') ?? null
  const refresh   = sp.get('refresh') === 'true'

  if (!sheetId || !month || !year) {
    return NextResponse.json({ error: 'Missing sheetId, month, year' }, { status: 400 })
  }

  const yearShort = year.length === 4 ? year.slice(2) : year
  const yearNum   = 2000 + parseInt(yearShort)
  const monthNum  = parseInt(month)
  const db        = adminClient()

  // ── 1. Check DB cache (unless force refresh) ──────────────
  if (!refresh) {
    const prefix = `${yearNum}-${String(monthNum).padStart(2, '0')}-`
    const { data: cached } = await db
      .from('ho_tro_daily_records')
      .select('*')
      .eq('sheet_id', sheetId)
      .gte('sort_key', `${prefix}01`)
      .lte('sort_key', `${prefix}31`)
      .order('sort_key')

    if (cached && cached.length > 0) {
      const rows = cached.map(dbRowToRecord)
      const fetchedAt = cached[0].fetched_at
      const sheetName = `báo cáo tháng ${month}/${yearShort}`
      return NextResponse.json({ rows, sheetName, month, year: yearShort, cached: true, fetched_at: fetchedAt })
    }
  }

  // ── 2. Fetch from Google Sheets ───────────────────────────
  const { rows, sheetName, error } = await fetchFromSheets(sheetId, monthNum, yearShort)

  if (error) {
    return NextResponse.json({ error, rows: [], sheetName, cached: false })
  }

  if (!rows.length) {
    return NextResponse.json({
      error: `Chưa có dữ liệu cho "${sheetName}"`,
      rows: [], sheetName, cached: false,
    })
  }

  // ── 3. Save to DB cache (fire-and-forget, don't block response) ──
  saveToCache(db, sheetId, staffName, rows).catch(e =>
    console.error('[ho-tro/sheets] cache save error:', e)
  )

  return NextResponse.json({ rows, sheetName, month, year: yearShort, cached: false })
}

// ── DELETE handler — xóa cache của 1 sheet + tháng ───────────
// Body: { sheetId, month, year }
export async function DELETE(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sheetId, month, year } = await req.json()
  if (!sheetId || !month || !year) {
    return NextResponse.json({ error: 'Missing sheetId, month, year' }, { status: 400 })
  }

  const yearShort = String(year).length === 4 ? String(year).slice(2) : String(year)
  const yearNum   = 2000 + parseInt(yearShort)
  const monthNum  = parseInt(month)
  const prefix    = `${yearNum}-${String(monthNum).padStart(2, '0')}-`

  const db = adminClient()
  const { error } = await db.from('ho_tro_daily_records')
    .delete()
    .eq('sheet_id', sheetId)
    .gte('sort_key', `${prefix}01`)
    .lte('sort_key', `${prefix}31`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
