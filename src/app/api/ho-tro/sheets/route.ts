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

// ── Parse raw table format ────────────────────────────────────
// Sheet structure: date header rows (col A = "DD/MM/YYYY"), then ticket rows
// Columns (0-indexed): A=code, B=sos, C=company, D=date, E=contact,
//   F=type, G=salesAlias, H=direction, I=content, J=reply,
//   K=status, L=assignee, M=salesMan, N=assistant, O=startPoint, P=endPoint
const DATE_HDR_RE = /^(\d{1,2})\/(\d{2})\/(\d{4})$/

function emptyDay(display: string, sortKey: string): DailyRecord {
  return {
    date: display, sortKey,
    total_requests: 0, avg_time: 0, max_time: 0,
    devices:    { 'VN88 2G':0,'VN88 4G':0,'VN88 4GH':0,'S168':0,'DVR':0,'FUEL':0,'Go168':0,'MT99':0,'C43&H5':0,'BW':0,'Phan mem':0 },
    resolution: { 'Chua xu ly':0,'Hen xu ly':0,'Ngay 1':0,'Ngay 2':0,'Ngay 3':0,'Ngay 4':0,'Ngay 5':0,'Tong':0 },
    locations:  { 'Ha Noi':0,'Hai Phong':0,'Da Nang':0,'HCM':0,'Binh Duong':0 },
    channels:   { 'Zalo':0,'Hotline':0,'Ngay nghi':0 },
    errors:     { 'ACC':0,'RFID':0,'PW':0,'GPS':0,'GSM':0,'IO':0,'SS':0,'DMS':0,'ADAS':0,'NC':0,'SP':0,'FS100':0,'SOJI':0 },
  }
}

function parseRawTable(csvText: string, monthNum: number, yearNum: number): DailyRecord[] {
  const lines = csvText.split('\n')
  const dayMap = new Map<string, DailyRecord>()
  let currentKey = ''

  for (const line of lines) {
    const cols = parseCSVRow(line)
    const colA = cols[0]?.trim() ?? ''
    if (!colA) continue

    // Date header row
    const hdr = colA.match(DATE_HDR_RE)
    if (hdr) {
      const d = hdr[1].padStart(2,'0'), m = hdr[2], y = hdr[3]
      if (parseInt(m) === monthNum && parseInt(y) === yearNum) {
        currentKey = `${y}-${m}-${d}`
        if (!dayMap.has(currentKey)) dayMap.set(currentKey, emptyDay(`${d}/${m}/${y}`, currentKey))
      } else {
        currentKey = ''
      }
      continue
    }

    // Ticket row: col A is numeric code
    if (!currentKey || !/^\d{3,}$/.test(colA)) continue
    const day = dayMap.get(currentKey)!
    day.total_requests++
    day.resolution['Tong']++

    // Tags live in reply col (J=idx 9) and content col (I=idx 8)
    const reply   = (cols[9] ?? '').toLowerCase()
    const content = (cols[8] ?? '').toLowerCase()
    const tags    = reply + ' ' + content

    // ── Devices ──
    if (tags.includes('fuel') || tags.includes('#fuelsensor'))            day.devices['FUEL']++
    else if (tags.includes('go168') || tags.includes('go 168'))           day.devices['Go168']++
    else if (tags.includes('vn88 4gh') || tags.includes('vn884gh'))       day.devices['VN88 4GH']++
    else if (tags.includes('vn 88 2g') || tags.includes('vn882g') || tags.includes('vn88 2g')) day.devices['VN88 2G']++
    else if (tags.includes('vn88 4g'))                                    day.devices['VN88 4G']++
    else if (tags.includes('s168'))                                       day.devices['S168']++
    else if (tags.includes('c43') || tags.includes('h5'))                 day.devices['C43&H5']++
    else if (tags.includes('dvr'))                                        day.devices['DVR']++
    else if (tags.includes('mt99'))                                       day.devices['MT99']++
    else if (tags.includes('#bw') || /\bbw\b/.test(tags))                 day.devices['BW']++
    else if (tags.includes('phần mềm') || tags.includes('phan mem') || tags.includes('#software')) day.devices['Phan mem']++

    // ── Errors ──
    if (/#sp\b/.test(tags))   day.errors['SP']++
    if (/#gps\b/.test(tags))  day.errors['GPS']++
    if (/#gsm\b/.test(tags))  day.errors['GSM']++
    if (/#pw\b/.test(tags))   day.errors['PW']++
    if (/#acc\b/.test(tags))  day.errors['ACC']++
    if (/#rfid\b/.test(tags)) day.errors['RFID']++
    if (/#io\b/.test(tags))   day.errors['IO']++
    if (/#ss\b/.test(tags))   day.errors['SS']++
    if (/#dms\b/.test(tags))  day.errors['DMS']++
    if (/#adas\b/.test(tags)) day.errors['ADAS']++
    if (/#nc\b/.test(tags))   day.errors['NC']++
    if (tags.includes('fs100'))  day.errors['FS100']++
    if (tags.includes('soji'))   day.errors['SOJI']++

    // ── Resolution: #F=ngày 1, #N=chưa, #H=hẹn, #2/#3/#4/#5=sang ngày ──
    if (/#f\b/.test(tags))       day.resolution['Ngay 1']++
    else if (/#2\b/.test(tags))  day.resolution['Ngay 2']++
    else if (/#3\b/.test(tags))  day.resolution['Ngay 3']++
    else if (/#4\b/.test(tags))  day.resolution['Ngay 4']++
    else if (/#5\b/.test(tags))  day.resolution['Ngay 5']++
    else if (/#h\b/.test(tags))  day.resolution['Hen xu ly']++
    else if (/#n\b/.test(tags))  day.resolution['Chua xu ly']++

    // ── Channels: check direction col (H=idx 7) and content ──
    const dir = (cols[7] ?? '').toLowerCase()
    if (dir.includes('zalo') || tags.includes('zalo'))       day.channels['Zalo']++
    else if (dir.includes('hotline') || tags.includes('hotline')) day.channels['Hotline']++

    // ── Locations: startPoint col (O=idx 14) ──
    const loc = (cols[14] ?? '').toLowerCase()
    if (loc.includes('hà nội') || loc.includes('ha noi') || loc.includes('hn'))         day.locations['Ha Noi']++
    else if (loc.includes('hải phòng') || loc.includes('hai phong') || loc.includes('hp')) day.locations['Hai Phong']++
    else if (loc.includes('đà nẵng') || loc.includes('da nang') || loc.includes('dn'))  day.locations['Da Nang']++
    else if (loc.includes('hồ chí minh') || loc.includes('hcm') || loc.includes('sài gòn')) day.locations['HCM']++
    else if (loc.includes('bình dương') || loc.includes('binh duong') || loc.includes('bd')) day.locations['Binh Duong']++
  }

  return Array.from(dayMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}

// ── Fetch from Google Sheets ──────────────────────────────────
async function fetchFromSheets(
  sheetId: string, month: number, yearShort: string
): Promise<{ rows: DailyRecord[]; sheetName: string; error?: string }> {
  // Tab name matches write API: "tháng M/YY"
  const sheetName = `tháng ${month}/${yearShort}`
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&headers=0`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const csvText = await res.text()
    if (csvText.trimStart().startsWith('<')) {
      return { rows: [], sheetName, error: `Tab "${sheetName}" không tồn tại hoặc chưa public` }
    }

    const yearNum = 2000 + parseInt(yearShort)
    const rows = parseRawTable(csvText, month, yearNum)
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

  // ── 1. Check DB cache (unless force refresh or current month) ──
  const now = new Date()
  const isCurrentMonth = yearNum === now.getUTCFullYear() && monthNum === now.getUTCMonth() + 1

  if (!refresh && !isCurrentMonth) {
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
