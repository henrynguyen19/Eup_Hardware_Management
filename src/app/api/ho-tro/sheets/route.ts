import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import type { DailyRecord } from '@/types/ho-tro'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) throw new Error('Missing Google Service Account credentials')
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  return google.sheets({ version: 'v4', auth })
}

// ── Assistant → Location mapping (from DB departments) ───────
// Departments named like "VP Hà Nội", "VP HCM" etc. are regional offices.
// Each assistant user is assigned to one such department.
// Parser reads colN (assistant name) → maps to location key.

function deptNameToLocationKey(deptName: string): string | null {
  const n = deptName.toLowerCase()
  if (n.includes('hà nội') || n.includes('ha noi'))               return 'Ha Noi'
  if (n.includes('hồ chí minh') || n.includes('ho chi minh') || n.includes('hcm')) return 'HCM'
  if (n.includes('hải phòng') || n.includes('hai phong'))         return 'Hai Phong'
  if (n.includes('bình dương') || n.includes('binh duong'))       return 'Binh Duong'
  if (n.includes('đà nẵng') || n.includes('da nang'))             return 'Da Nang'
  return null
}

// Returns map: assistant_name_lowercase → location_key
// e.g. { "canary": "Ha Noi", "vivian": "HCM", ... }
async function getAssistantLocationMap(
  db: ReturnType<typeof adminClient>
): Promise<Record<string, string>> {
  try {
    // 1. Get all VP departments
    const { data: depts } = await db
      .from('departments')
      .select('id, name')
      .like('name', 'VP %')

    if (!depts?.length) return {}

    // Build deptId → locationKey map
    const deptLocMap: Record<string, string> = {}
    for (const d of depts) {
      const loc = deptNameToLocationKey(d.name)
      if (loc) deptLocMap[d.id] = loc
    }

    const deptIds = Object.keys(deptLocMap)
    if (!deptIds.length) return {}

    // 2. Get user_departments for those VP depts
    const { data: userDepts } = await db
      .from('user_departments')
      .select('user_id, department_id')
      .in('department_id', deptIds)

    if (!userDepts?.length) return {}

    // 3. Get emails from Auth to extract display name
    const { data: authData } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const emailMap: Record<string, string> = Object.fromEntries(
      (authData?.users ?? []).map(u => [u.id, u.email ?? ''])
    )

    // 4. Build name → location map
    const result: Record<string, string> = {}
    for (const ud of userDepts) {
      const email = emailMap[ud.user_id] ?? ''
      const name = email.split('@')[0].toLowerCase()  // "canary@eup.net.vn" → "canary"
      const loc = deptLocMap[ud.department_id]
      if (name && loc) result[name] = loc
    }
    return result
  } catch {
    return {}
  }
}

// ── Parse raw table ────────────────────────────────────────────
// Sheet structure (per tab "tháng M/YY"):
//   - Date header rows: col A = "DD/MM/YYYY" (merged, green)
//   - Ticket rows (~150 per day): col A = numeric ticket code
//   - Empty rows: skipped
// Columns (0-indexed): A=code, B=sos, C=company, D=date, E=contact,
//   F=type, G=salesAlias, H=direction, I=content, J=reply,
//   K=status, L=assignee, M=salesMan, N=assistant, O=startPoint, P=endPoint
const DATE_HDR_RE = /^(\d{1,2})\/(\d{2})\/(\d{4})$/

function emptyDay(display: string, sortKey: string): DailyRecord {
  return {
    date: display, sortKey,
    total_requests: 0, avg_time: 0, max_time: 0,
    devices:    { 'Go168':0,'Gotrack':0,'VN88':0,'VN88 4G':0,'VN88 4GH':0,'DVR':0,'BW':0,'C43':0,'H5':0,'MT99':0,'Soji':0,'FS100':0,'FuelSensor':0,'PM':0 },
    resolution: { 'Fast':0,'Normal':0,'Low':0,'Hen':0,'Mai bao lai':0,'Tong':0 },
    locations:  { 'Ha Noi':0,'Hai Phong':0,'Da Nang':0,'HCM':0,'Binh Duong':0 },
    channels:   { 'Zalo':0,'Hotline':0,'Ngay nghi':0 },
    errors:     { 'NC':0,'GSM':0,'GPS':0,'SD':0,'Roaming':0,'ACC':0,'RFID':0,'PW':0,'SS':0,'DMS':0,'ADAS':0,'SP':0,'IO':0 },
    pm_types:   { 'Video':0,'App':0,'Report':0,'FuelSensor':0 },
  }
}

// grid: array of rows, each row is array of cell strings (FORMATTED_VALUE from Sheets API)
// assistantMap: { "canary" → "Ha Noi", "vivian" → "HCM", ... } — from DB, empty if not configured
function parseRawTable(
  grid: string[][], monthNum: number, yearNum: number,
  assistantMap: Record<string, string>,
  debugLog?: string[]
): DailyRecord[] {
  const dayMap = new Map<string, DailyRecord>()
  let currentKey = ''

  for (let rowIdx = 0; rowIdx < grid.length; rowIdx++) {
    const cols = grid[rowIdx]
    const colA = (cols[0] ?? '').trim()
    if (!colA) continue

    // ── Date header: "DD/MM/YYYY" ──
    const hdr = colA.match(DATE_HDR_RE)
    if (hdr) {
      const d = hdr[1].padStart(2, '0'), m = hdr[2], y = hdr[3]
      if (parseInt(m) === monthNum && parseInt(y) === yearNum) {
        currentKey = `${y}-${m}-${d}`
        if (!dayMap.has(currentKey)) {
          dayMap.set(currentKey, emptyDay(`${d}/${m}/${y}`, currentKey))
          debugLog?.push(`row${rowIdx + 1}: DATE_HDR "${colA}" → ${currentKey}`)
          // Show next 3 rows raw to diagnose structure
          for (let peek = 1; peek <= 3 && rowIdx + peek < grid.length; peek++) {
            const pr = grid[rowIdx + peek]
            debugLog?.push(`  +${peek}: A="${pr[0]??''}" B="${pr[1]??''}" C="${pr[2]??''}" D="${pr[3]??''}" E="${pr[4]??''}"`)
          }
        }
      } else {
        currentKey = ''
      }
      continue
    }

    // ── Ticket row: must have a valid date in col D (idx 3) ──
    // Template/empty rows have no date.
    // Real tickets have date in DD/MM/YYYY (text) or YYYY-MM-DD (Google Sheets date cell).
    const colD = (cols[3] ?? '').trim()
    const isTicket = /^\d{1,2}\/\d{2}\/\d{4}$/.test(colD) || /^\d{4}-\d{2}-\d{2}$/.test(colD)
    if (!currentKey || !isTicket) {
      if (colA && !isTicket && debugLog) {
        const colB = (cols[1] ?? '').trim()
        debugLog.push(`row${rowIdx + 1}: SKIP colA="${colA}" colB="${colB}" colD="${colD}"`)
      }
      continue
    }
    const day = dayMap.get(currentKey)!
    day.total_requests++
    day.resolution['Tong']++

    // Tags live in reply col (J=idx 9) and content col (I=idx 8)
    const reply   = (cols[9] ?? '').toLowerCase()
    const content = (cols[8] ?? '').toLowerCase()
    const tags    = reply + ' ' + content

    // ── Devices (hashtag-based, most-specific first) ──
    if      (/#vn88 4gh\b/.test(tags))   day.devices['VN88 4GH']++
    else if (/#vn88 4g\b/.test(tags))    day.devices['VN88 4G']++
    else if (/#vn88\b/.test(tags))       day.devices['VN88']++
    else if (/#go168\b/.test(tags))      day.devices['Go168']++
    else if (/#gotrack\b/.test(tags))    day.devices['Gotrack']++
    else if (/#mt99\b/.test(tags))       day.devices['MT99']++
    else if (/#dvr\b/.test(tags))        day.devices['DVR']++
    else if (/#bw\b/.test(tags))         day.devices['BW']++
    else if (/#c43\b/.test(tags))        day.devices['C43']++
    else if (/#h5\b/.test(tags))         day.devices['H5']++
    else if (/#sj\b/.test(tags))         day.devices['Soji']++
    else if (/#fs\b/.test(tags))         day.devices['FS100']++
    else if (/#fuelsensor\b/.test(tags)) day.devices['FuelSensor']++
    else if (/#pm\b/.test(tags))         day.devices['PM']++

    // ── Errors ──
    if (/#nc\b/.test(tags))      day.errors['NC']++
    if (/#gsm\b/.test(tags))     day.errors['GSM']++
    if (/#gps\b/.test(tags))     day.errors['GPS']++
    if (/#sd\b/.test(tags))      day.errors['SD']++
    if (/#roaming\b/.test(tags)) day.errors['Roaming']++
    if (/#acc\b/.test(tags))     day.errors['ACC']++
    if (/#rfid\b/.test(tags))    day.errors['RFID']++
    if (/#pw\b/.test(tags))      day.errors['PW']++
    if (/#ss\b/.test(tags))      day.errors['SS']++
    if (/#dms\b/.test(tags))     day.errors['DMS']++
    if (/#adas\b/.test(tags))    day.errors['ADAS']++
    if (/#sp\b/.test(tags))      day.errors['SP']++
    if (/#io\b/.test(tags))      day.errors['IO']++

    // ── PM sub-types (only when #pm present) ──
    if (/#pm\b/.test(tags)) {
      if (/#video\b/.test(tags))      day.pm_types['Video']++
      if (/#app\b/.test(tags))        day.pm_types['App']++
      if (/#report\b/.test(tags))     day.pm_types['Report']++
      if (/#fuelsensor\b/.test(tags)) day.pm_types['FuelSensor']++
    }

    // ── Tốc độ xử lý: #f=Fast, #n=Normal, #l=Low (exclusive) ──
    if      (/#f\b/.test(tags)) day.resolution['Fast']++
    else if (/#n\b/.test(tags)) day.resolution['Normal']++
    else if (/#l\b/.test(tags)) day.resolution['Low']++

    // ── Cần theo dõi: plain text "mai báo lại" / "hẹn" (independent) ──
    if (/mai báo lại/i.test(tags) || /mai bao lai/i.test(tags))
      day.resolution['Mai bao lai']++
    else if (/\bhẹn\b/i.test(tags))
      day.resolution['Hen']++

    // ── Channels: check direction col (H=idx 7) ──
    const dir = (cols[7] ?? '').toLowerCase()
    if (dir.includes('zalo') || tags.includes('zalo'))             day.channels['Zalo']++
    else if (dir.includes('hotline') || tags.includes('hotline')) day.channels['Hotline']++

    // ── Locations: assistant col (N=idx 13) → lookup assistantMap from DB ──
    // assistantMap built from user_departments (VP Hà Nội, VP HCM, etc.)
    const assistantName = (cols[13] ?? '').trim().toLowerCase()
    const mappedLoc = assistantMap[assistantName]
    if (mappedLoc && mappedLoc in day.locations) {
      day.locations[mappedLoc as keyof typeof day.locations]++
    } else if (assistantName && !mappedLoc) {
      // Fallback: if assistant not in map, try to read startPoint col (O=idx 14)
      const loc = (cols[14] ?? '').toLowerCase()
      if (loc.includes('hà nội') || loc.includes('ha noi') || loc.includes('hn'))           day.locations['Ha Noi']++
      else if (loc.includes('hải phòng') || loc.includes('hai phong') || loc.includes('hp')) day.locations['Hai Phong']++
      else if (loc.includes('đà nẵng') || loc.includes('da nang') || loc.includes('dn'))    day.locations['Da Nang']++
      else if (loc.includes('hồ chí minh') || loc.includes('hcm') || loc.includes('sài gòn')) day.locations['HCM']++
      else if (loc.includes('bình dương') || loc.includes('binh duong') || loc.includes('bd')) day.locations['Binh Duong']++
    }
  }

  return Array.from(dayMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}

// ── Fetch from Google Sheets via API (service account) ───────
async function fetchFromSheets(
  sheetId: string, month: number, yearShort: string,
  assistantMap: Record<string, string>,
  debugMode = false
): Promise<{ rows: DailyRecord[]; sheetName: string; error?: string; debugLog?: string[]; totalRows?: number }> {
  const sheetName = `tháng ${month}/${yearShort}`
  try {
    const sheets = getSheetsClient()

    // Quote tab name to handle special chars (spaces, /)
    const quotedTab = `'${sheetName.replace(/'/g, "\\'")}'`
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${quotedTab}!A:S`,
      valueRenderOption: 'FORMATTED_VALUE',
    })

    const grid = (resp.data.values ?? []).map(
      row => (row as string[]).map(cell => String(cell ?? ''))
    )

    const yearNum = 2000 + parseInt(yearShort)
    const debugLog: string[] = []
    const rows = parseRawTable(grid, month, yearNum, assistantMap, debugMode ? debugLog : undefined)
    return { rows, sheetName, debugLog: debugMode ? debugLog : undefined, totalRows: grid.length }
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
    pm_types:       r.pm_types,
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
    pm_types:       row.pm_types   ?? {},
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
  const debugMode = sp.get('debug') === 'true'

  if (!sheetId || !month || !year) {
    return NextResponse.json({ error: 'Missing sheetId, month, year' }, { status: 400 })
  }

  const yearShort = year.length === 4 ? year.slice(2) : year
  const yearNum   = 2000 + parseInt(yearShort)
  const monthNum  = parseInt(month)
  const db        = adminClient()

  // ── 1. Check DB cache (always, unless force refresh) ──
  // Tháng hiện tại cũng dùng cache — chỉ fetch lại khi user bấm "Làm mới" (refresh=true)
  // hoặc khi chưa có dữ liệu trong DB.
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
      const sheetName = `tháng ${month}/${yearShort}`
      return NextResponse.json({ rows, sheetName, month, year: yearShort, cached: true, fetched_at: fetchedAt })
    }
  }

  // ── 2. Fetch from Google Sheets ───────────────────────────
  const assistantMap = await getAssistantLocationMap(db)
  const { rows, sheetName, error, debugLog, totalRows } = await fetchFromSheets(sheetId, monthNum, yearShort, assistantMap, debugMode)

  if (error) {
    return NextResponse.json({ error, rows: [], sheetName, cached: false })
  }

  // Debug mode: return raw parse info without saving to cache
  if (debugMode) {
    return NextResponse.json({
      debug: true,
      sheetName,
      totalRows,
      daysFound: rows.map(r => ({ date: r.date, total: r.total_requests })),
      log: debugLog,
      cached: false,
    })
  }

  if (!rows.length) {
    return NextResponse.json({
      error: `Chưa có dữ liệu cho "${sheetName}"`,
      rows: [], sheetName, cached: false,
    })
  }

  // ── 3. Save to DB cache (fire-and-forget) ────────────────
  saveToCache(db, sheetId, staffName, rows).catch(e =>
    console.error('[ho-tro/sheets] cache save error:', e)
  )

  return NextResponse.json({ rows, sheetName, month, year: yearShort, cached: false })
}

// ── DELETE handler — xóa cache của 1 sheet + tháng ───────────
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
