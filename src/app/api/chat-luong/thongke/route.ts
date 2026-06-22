import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { QUALITY_SHEET_ID, getTinhTrangKey } from '@/lib/chat-luong-config'

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

// ── Infer region from KTV name ────────────────────────────────
// e.g. "BÙI HỒNG THÁI-HN(KTTN)" → "HN"
function inferRegion(ktvName: string): string {
  const match = ktvName.match(/-([A-Z]{2,3})\(/)
  if (match) return match[1]
  // Fallback patterns
  if (ktvName.includes('-HN')) return 'HN'
  if (ktvName.includes('-HCM')) return 'HCM'
  if (ktvName.includes('-BD')) return 'BD'
  if (ktvName.includes('-HP')) return 'HP'
  if (ktvName.includes('-DN')) return 'DN'
  return 'OTHER'
}

export interface ThongKeRecord {
  region:          string   // inferred
  sort_key:        string
  tuan:            string | null
  thang:           number | null
  tinh_trang:      string
  loai_loi:        string
  nguyen_nhan:     string
  ly_do:           string
  ngay_dieu_phoi:  string
  nguoi_dieu_phoi: string
  ten_khach:       string
  loai_san_pham:   string
  ky_thuat_vien:   string
  so_xe:           string
  ngay_hoan_thanh: string
}

function parseRow(cols: string[]): ThongKeRecord | null {
  const ngayDieuPhoi = cols[10] ?? ''
  if (!ngayDieuPhoi || !ngayDieuPhoi.match(/^\d{4}-\d{2}-\d{2}/)) return null
  const soXe = cols[23] ?? ''
  if (!soXe) return null

  const sortKey = ngayDieuPhoi.slice(0, 10)
  const thangStr = cols[1] ?? ''
  const thang = thangStr ? parseInt(thangStr) : null
  const tinhTrang = (cols[4] ?? '').trim().toUpperCase()
  const ktvName = cols[22] ?? ''

  return {
    region:          inferRegion(ktvName),
    sort_key:        sortKey,
    tuan:            cols[2] || null,
    thang:           isNaN(thang!) ? null : thang,
    tinh_trang:      tinhTrang,
    loai_loi:        cols[5] ?? '',
    nguyen_nhan:     (cols[16] ?? '').trim(),
    ly_do:           cols[17] ?? '',
    ngay_dieu_phoi:  sortKey,
    nguoi_dieu_phoi: cols[11] ?? '',
    ten_khach:       cols[13] ?? '',
    loai_san_pham:   cols[15] ?? '',
    ky_thuat_vien:   ktvName,
    so_xe:           soXe,
    ngay_hoan_thanh: (cols[25] ?? '').slice(0, 10),
  }
}

async function fetchSheetCSVThongKe(sheetTab: string): Promise<string> {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY

  if (apiKey) {
    const key = apiKey.trim()
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${QUALITY_SHEET_ID}/values/${encodeURIComponent(sheetTab)}?key=${key}&valueRenderOption=FORMATTED_VALUE`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Sheets API v4 HTTP ${res.status}: ${errBody.slice(0, 500)}`)
    }
    const json = await res.json()
    if (json.error) throw new Error(`Sheets API: ${json.error.message}`)
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

  const url = `https://docs.google.com/spreadsheets/d/${QUALITY_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetTab)}&range=A:BM`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const csvText = await res.text()
  if (csvText.trimStart().startsWith('<')) {
    throw new Error(`Sheet "${sheetTab}" không tồn tại hoặc chưa public`)
  }
  return csvText
}

async function fetchThongKe(month: number, year: number): Promise<{ records: ThongKeRecord[]; error?: string; source?: string }> {
  try {
    const csvText = await fetchSheetCSVThongKe('Thống kê')
    const source = process.env.GOOGLE_SHEETS_API_KEY ? 'sheets_api_v4' : 'gviz'

    const lines = csvText.split('\n')
    const records: ThongKeRecord[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) continue
      const cols = parseCSVRow(line)
      const rec = parseRow(cols)
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

// ── GET ───────────────────────────────────────────────────────
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
  const month = parseInt(sp.get('month') ?? '0')
  const year  = parseInt(sp.get('year')  ?? '0')
  if (!month || !year) return NextResponse.json({ error: 'Missing month/year' }, { status: 400 })

  const { records, error, source } = await fetchThongKe(month, year)
  if (error) return NextResponse.json({ error, records: [] })

  // Tính stats tổng hợp
  const byRegion: Record<string, { total: number; ok: number; ng: number; pending: number }> = {}
  const byNguyen: Record<string, { total: number; ng: number }> = {}
  const byKTV: Record<string, { region: string; total: number; ok: number; ng: number }> = {}
  const byWeek: Record<string, { total: number; ng: number }> = {}

  for (const r of records) {
    const tk = getTinhTrangKey(r.tinh_trang)

    // By region
    if (!byRegion[r.region]) byRegion[r.region] = { total: 0, ok: 0, ng: 0, pending: 0 }
    byRegion[r.region].total++
    if (tk === 'OK')    byRegion[r.region].ok++
    if (tk === 'NG')    byRegion[r.region].ng++
    if (tk === 'blank') byRegion[r.region].pending++

    // By nguyên nhân
    const nn = r.nguyen_nhan || 'Chưa phân loại'
    if (!byNguyen[nn]) byNguyen[nn] = { total: 0, ng: 0 }
    byNguyen[nn].total++
    if (tk === 'NG') byNguyen[nn].ng++

    // By KTV
    const ktv = r.ky_thuat_vien || 'Chưa xác định'
    if (!byKTV[ktv]) byKTV[ktv] = { region: r.region, total: 0, ok: 0, ng: 0 }
    byKTV[ktv].total++
    if (tk === 'OK') byKTV[ktv].ok++
    if (tk === 'NG') byKTV[ktv].ng++

    // By week
    const wk = r.tuan || ''
    if (wk) {
      if (!byWeek[wk]) byWeek[wk] = { total: 0, ng: 0 }
      byWeek[wk].total++
      if (tk === 'NG') byWeek[wk].ng++
    }
  }

  return NextResponse.json({
    records,
    source,
    stats: {
      total:    records.length,
      ok:       records.filter(r => getTinhTrangKey(r.tinh_trang) === 'OK').length,
      ng:       records.filter(r => getTinhTrangKey(r.tinh_trang) === 'NG').length,
      pending:  records.filter(r => getTinhTrangKey(r.tinh_trang) === 'blank').length,
      byRegion,
      byNguyen,
      byKTV,
      byWeek,
    }
  })
}
