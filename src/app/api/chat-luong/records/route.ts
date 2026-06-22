import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { QUALITY_SHEET_ID, QUALITY_REGIONS, getTinhTrangKey } from '@/lib/chat-luong-config'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ── CSV parser ────────────────────────────────────────────────
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

// ── Parse một row CSV thành record ───────────────────────────
// Column mapping (0-indexed):
// 0:rowid 1:thang 2:tuan 3:ngay 4:tinh_trang 5:loai_loi
// 7:ghi_chu 10:ngay_dieu_phoi 11:nguoi_dieu_phoi 12:ma_khach
// 13:ten_khach 14:nv_kinh_doanh 15:loai_san_pham
// 16:nguyen_nhan 17:ly_do 22:ky_thuat_vien 23:so_xe
// 24:ngay_hen 25:ngay_hoan_thanh 27:phi 28:ly_do_vo_hieu
// 29:ghi_chu2 31:ten_lien_he 33:so_dien_thoai 34:dia_chi
export interface QualityRecord {
  region:           string
  sort_key:         string
  tuan:             string | null
  thang:            number | null
  tinh_trang:       string     // '', 'OK', 'NG'
  loai_loi:         string
  nguyen_nhan:      string
  ly_do:            string
  ngay_dieu_phoi:   string
  nguoi_dieu_phoi:  string
  ma_khach:         string
  ten_khach:        string
  nv_kinh_doanh:    string
  loai_san_pham:    string
  ky_thuat_vien:    string
  so_xe:            string
  ngay_hen:         string
  ngay_hoan_thanh:  string
  phi:              string
  ly_do_vo_hieu:    string
  ghi_chu:          string
  ten_lien_he:      string
  so_dien_thoai:    string
  dia_chi:          string
}

function parseRow(cols: string[], region: string): QualityRecord | null {
  // Col 10 = ngay_dieu_phoi, must be a valid date
  const ngayDieuPhoi = cols[10] ?? ''
  if (!ngayDieuPhoi || !ngayDieuPhoi.match(/^\d{4}-\d{2}-\d{2}/)) return null

  const sortKey = ngayDieuPhoi.slice(0, 10)  // 'YYYY-MM-DD'
  const soXe    = cols[23] ?? ''
  if (!soXe) return null  // skip rows without vehicle number

  const thangStr = cols[1] ?? ''
  const thang = thangStr ? parseInt(thangStr) : null

  // Normalize tinh_trang: 'OK ', 'ok', 'NG' → uppercase trimmed
  const tinhTrang = (cols[4] ?? '').trim().toUpperCase()

  return {
    region,
    sort_key:        sortKey,
    tuan:            cols[2] || null,
    thang:           isNaN(thang!) ? null : thang,
    tinh_trang:      tinhTrang,
    loai_loi:        cols[5] ?? '',
    nguyen_nhan:     (cols[16] ?? '').trim(),
    ly_do:           cols[17] ?? '',
    ngay_dieu_phoi:  sortKey,
    nguoi_dieu_phoi: cols[11] ?? '',
    ma_khach:        cols[12] ?? '',
    ten_khach:       cols[13] ?? '',
    nv_kinh_doanh:   cols[14] ?? '',
    loai_san_pham:   cols[15] ?? '',
    ky_thuat_vien:   cols[22] ?? '',
    so_xe:           soXe,
    ngay_hen:        (cols[24] ?? '').slice(0, 10),
    ngay_hoan_thanh: (cols[25] ?? '').slice(0, 10),
    phi:             cols[27] ?? '',
    ly_do_vo_hieu:   cols[28] ?? '',
    ghi_chu:         cols[29] ?? '',
    ten_lien_he:     cols[31] ?? '',
    so_dien_thoai:   cols[33] ?? '',
    dia_chi:         cols[34] ?? '',
  }
}

// ── Fetch CSV text từ Sheets (bypass filter bằng Sheets API v4 nếu có API key) ──
async function fetchSheetCSV(sheetTab: string): Promise<string> {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY

  if (apiKey) {
    // Sheets API v4 — bypass TẤT CẢ filter (basic filter + filter views)
    const range = `'${sheetTab}'!A:BM`
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${QUALITY_SHEET_ID}/values/${encodeURIComponent(range)}?key=${apiKey}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Sheets API v4 HTTP ${res.status}`)
    const json = await res.json()
    if (json.error) throw new Error(`Sheets API: ${json.error.message}`)

    // Convert rows array → CSV text
    const rows: string[][] = json.values ?? []
    return rows.map(row =>
      row.map(cell => {
        const s = String(cell ?? '')
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s
      }).join(',')
    ).join('\n')
  }

  // Fallback: gviz/tq với range=A:BM (bypass filter views, không bypass basic filter)
  const url = `https://docs.google.com/spreadsheets/d/${QUALITY_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetTab)}&range=A:BM`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const csvText = await res.text()
  if (csvText.trimStart().startsWith('<')) {
    throw new Error(`Sheet "${sheetTab}" không tồn tại hoặc chưa public`)
  }
  return csvText
}

// ── Fetch từ Google Sheets ────────────────────────────────────
async function fetchFromSheets(
  region: string, month: number, year: number
): Promise<{ records: QualityRecord[]; error?: string; source?: string }> {
  const regionCfg = QUALITY_REGIONS.find(r => r.code === region)
  if (!regionCfg) return { records: [], error: `Khu vực không hợp lệ: ${region}` }

  try {
    const csvText = await fetchSheetCSV(regionCfg.sheetTab)
    const source = process.env.GOOGLE_SHEETS_API_KEY ? 'sheets_api_v4' : 'gviz'

    const lines = csvText.split('\n')
    const records: QualityRecord[] = []

    for (let i = 1; i < lines.length; i++) {  // skip header row
      const line = lines[i]
      if (!line.trim()) continue
      const cols = parseCSVRow(line)
      const rec = parseRow(cols, region)
      if (!rec) continue

      // Filter by month+year
      const recDate = new Date(rec.sort_key)
      if (recDate.getFullYear() !== year || recDate.getMonth() + 1 !== month) continue

      records.push(rec)
    }

    return { records, source }
  } catch (err) {
    return { records: [], error: String(err) }
  }
}

// ── Save to DB ────────────────────────────────────────────────
async function saveToCache(
  db: ReturnType<typeof adminClient>,
  records: QualityRecord[]
): Promise<void> {
  if (!records.length) return
  const now = new Date().toISOString()
  const rows = records.map(r => ({ ...r, fetched_at: now }))
  // Batch upsert in chunks of 500
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    await db.from('quality_records')
      .upsert(chunk, { onConflict: 'region,ngay_dieu_phoi,so_xe' })
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
  const hasAccess = perms.includes('chat_luong:read') || perms.includes('admin:users')
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(req.url).searchParams
  const region  = sp.get('region')
  const month   = sp.get('month')
  const year    = sp.get('year')
  const refresh = sp.get('refresh') === 'true'

  if (!region || !month || !year) {
    return NextResponse.json({ error: 'Missing region, month, year' }, { status: 400 })
  }

  const monthNum = parseInt(month)
  const yearNum  = parseInt(year)
  const db       = adminClient()
  const prefix   = `${yearNum}-${String(monthNum).padStart(2, '0')}-`

  // ── 1. Check DB cache ──
  if (!refresh) {
    const { data: cached } = await db
      .from('quality_records')
      .select('*')
      .eq('region', region)
      .gte('sort_key', `${prefix}01`)
      .lte('sort_key', `${prefix}31`)
      .order('sort_key')

    if (cached && cached.length > 0) {
      const fetchedAt = cached[0].fetched_at
      return NextResponse.json({ records: cached, cached: true, fetched_at: fetchedAt })
    }
  }

  // ── 2. Fetch từ Google Sheets ──
  const { records, error, source } = await fetchFromSheets(region, monthNum, yearNum)

  if (error) return NextResponse.json({ error, records: [], cached: false })

  // ── 3. Save to cache (fire-and-forget) ──
  saveToCache(db, records).catch(e =>
    console.error('[chat-luong/records] cache save error:', e)
  )

  return NextResponse.json({ records, cached: false, source })
}

// ── DELETE — xóa cache 1 region + tháng ──────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { region, month, year } = await req.json()
  if (!region || !month || !year) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  const db     = adminClient()
  const { error } = await db.from('quality_records')
    .delete()
    .eq('region', region)
    .gte('sort_key', `${prefix}01`)
    .lte('sort_key', `${prefix}31`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
