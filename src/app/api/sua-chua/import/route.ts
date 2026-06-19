import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const SPREADSHEET_ID = '1nn77HB7xZRGGCKNbLgMyWPH9ROJht8k_Egk5gljz9Fc'

// Device types theo thứ tự cột trong sheet (cột B trở đi)
const DEVICE_TYPES = [
  '4G', '4GH', 'GO', 'SBOX', 'MT99', 'Temp sensor',
  'FS100', 'SOJI', 'SW sensor', 'SINET sensor', 'Collision sensor',
  'DVR88', 'C43', 'H5', 'Bewin', 'Camera'
]

// Mapping status section header → status_type key
const STATUS_SECTIONS: Record<string, string> = {
  'Đã sửa':       'da_sua',
  'Gửi bảo hành': 'gui_bao_hanh',
  'Không lỗi':    'khong_loi',
  'Hỏng hẳn':     'hong_han',
  'Chờ sửa':      'cho_sua',
}

// Giới hạn hợp lý cho số thiết bị/tuần — tránh đọc nhầm số tích lũy
const MAX_QTY_PER_CELL = 999

function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Thiếu GOOGLE_SERVICE_ACCOUNT_JSON')
  const credentials = JSON.parse(raw)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  return google.sheets({ version: 'v4', auth })
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Chuẩn hóa chuỗi: bỏ dấu tiếng Việt, lowercase, bỏ khoảng trắng
// Dùng ̀-ͯ tường minh để tránh lỗi encoding khi deploy
function normalize(s: string): string {
  return s.trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // bỏ combining diacritics (U+0300 → U+036F)
    .replace(/[đĐ]/g, 'd')            // đ/Đ không có NFD decomposition nên xử lý riêng
    .toLowerCase()
    .replace(/\s+/g, '')
}

// ISO week calculation (same as frontend)
function getISOWeekYear(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const isoYear = d.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { week, year: isoYear }
}

// Parse sheet title to extract year (for fallback).
// e.g. "Tuan 21 - 2026" → { title_week: 21, year: 2026 }
function parseSheetTitle(title: string) {
  const m = title.match(/(\d+)\s*-\s*(20\d{2})\b/)
  if (!m) return null
  const week_number = parseInt(m[1])
  const year = parseInt(m[2])
  if (week_number < 1 || week_number > 53) return null
  return { week_number, year }
}

// Extract date range from sheet cells (first 15 rows, any column).
// Looks for patterns like "07/06", "07/06/2026", "07/06-12/06", "07/06/2026-12/06/2026"
// Returns ISO week/year from the start date, plus date_start / date_end strings.
function extractDateRange(values: string[][], fallbackYear: number): {
  isoWeek: number; isoYear: number;
  dateStart: string | null; dateEnd: string | null
} | null {
  // Matches dd/mm or dd-mm (with optional year), robust to mixed separators
  const dateRe = /(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/g

  for (let i = 0; i < Math.min(20, values.length); i++) {
    for (const cell of values[i] ?? []) {
      const cellStr = (cell || '').trim()
      if (!cellStr) continue
      const matches = [...cellStr.matchAll(dateRe)]
      if (matches.length === 0) continue

      // Try each match as a potential start date (skip invalid ones)
      let startIdx = -1
      let d0 = 0, mo0 = 0, yr0 = 0
      for (let mi = 0; mi < matches.length; mi++) {
        const m = matches[mi]
        const dd = parseInt(m[1]), mm = parseInt(m[2])
        const yy = m[3] ? parseInt(m[3]) : fallbackYear
        // Normalize 2-digit years
        const fullYr = yy < 100 ? 2000 + yy : yy
        if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
          d0 = dd; mo0 = mm; yr0 = fullYr; startIdx = mi; break
        }
      }
      if (startIdx === -1) continue  // no valid date in this cell

      const dateStart = `${yr0}-${String(mo0).padStart(2, '0')}-${String(d0).padStart(2, '0')}`

      let dateEnd: string | null = null
      let endDate: Date | null = null
      // Look for a second valid date after the first
      for (let mi = startIdx + 1; mi < matches.length; mi++) {
        const m1 = matches[mi]
        const d1 = parseInt(m1[1]), mo1 = parseInt(m1[2])
        const yr1 = m1[3] ? (parseInt(m1[3]) < 100 ? 2000 + parseInt(m1[3]) : parseInt(m1[3])) : yr0
        if (d1 >= 1 && d1 <= 31 && mo1 >= 1 && mo1 <= 12) {
          dateEnd = `${yr1}-${String(mo1).padStart(2, '0')}-${String(d1).padStart(2, '0')}`
          endDate = new Date(yr1, mo1 - 1, d1)
          break
        }
      }

      // Use midpoint to determine ISO week (avoids Sun→Mon boundary issue)
      const startDate = new Date(yr0, mo0 - 1, d0)
      const refDate = endDate
        ? new Date((startDate.getTime() + endDate.getTime()) / 2)
        : startDate
      const { week, year } = getISOWeekYear(refDate)

      return { isoWeek: week, isoYear: year, dateStart, dateEnd }
    }
  }
  return null
}

// Parse a single sheet's values into stats rows.
//
// Chiến lược đọc dữ liệu:
// - Đã sửa / Gửi bảo hành / Không lỗi / Hỏng hẳn: đọc hàng TỔNG cuối mỗi section
// - Chờ sửa: đọc hàng "SỐ LƯỢNG" ở cột A (dòng data duy nhất của section này)
// - Chỉ đọc trong phạm vi cột A–Q (1 label + 16 thiết bị)
// - Bỏ qua tất cả hàng lỗi chi tiết, sub-header, v.v.
function parseSheetData(values: string[][], weekId: string) {
  const statsRows: Array<{ week_id: string; status_type: string; fault_type: string; device_type: string; quantity: number }> = []

  let currentStatus: string | null = null
  // dataStartCol: index cột đầu tiên chứa số lượng thiết bị (auto-detect từ header row)
  let dataStartCol = 1  // mặc định: cột B (index 1)

  // Helper: tìm ô không rỗng đầu tiên trong N cột đầu → { label, col }
  function firstNonEmpty(row: string[], maxCols = 3): { label: string; col: number } | null {
    for (let i = 0; i < maxCols && i < row.length; i++) {
      const v = (row[i] || '').trim()
      if (v) return { label: v, col: i }
    }
    return null
  }

  // Đọc 16 thiết bị từ hàng, lưu với fault_type chỉ định
  function readAggregateRow(row: string[], faultLabel: string): void {
    if (!currentStatus) return
    DEVICE_TYPES.forEach((deviceType, idx) => {
      // Chỉ đọc trong phạm vi cột A–Q (dataStartCol + 16 thiết bị)
      const rawVal = (row[dataStartCol + idx] || '').replace(/,/g, '').trim()
      const qty = Math.min(parseInt(rawVal) || 0, MAX_QTY_PER_CELL)
      if (qty > 0) {
        statsRows.push({
          week_id: weekId,
          status_type: currentStatus!,
          fault_type: faultLabel,
          device_type: deviceType,
          quantity: qty,
        })
      }
    })
  }

  const sectionNormMap: Record<string, string> = {
    'dasua':       'da_sua',
    'guibaohanh':  'gui_bao_hanh',
    'khongloi':    'khong_loi',
    'honghan':     'hong_han',
    'chosua':      'cho_sua',
  }

  // Helper: check if a row has at least one non-zero value in device columns
  function hasNumericData(row: string[]): boolean {
    for (let i = 0; i < DEVICE_TYPES.length; i++) {
      const rawVal = (row[dataStartCol + i] || '').replace(/,/g, '').trim()
      if ((parseInt(rawVal) || 0) > 0) return true
    }
    return false
  }

  for (const row of values) {
    if (!row || row.length === 0) continue

    const found = firstNonEmpty(row, 3)
    if (!found) continue
    const { label, col } = found

    // Normalize label
    const labelNorm = normalize(label)

    // === Detect header row "Lỗi \ Thiết Bị" → xác định dataStartCol ===
    if (labelNorm.startsWith('loi') || labelNorm.startsWith('thietbi')) {
      dataStartCol = col + 1
      continue
    }

    // === Detect STATUS section headers ===
    const matchedStatus = STATUS_SECTIONS[label] || sectionNormMap[labelNorm]
    if (matchedStatus) {
      currentStatus = matchedStatus
      continue
    }

    if (!currentStatus) continue

    // === Bỏ qua hàng TỔNG — chúng ta đọc từng loại lỗi riêng ===
    if (labelNorm === 'tong') continue

    // === Chờ sửa: hàng "SỐ LƯỢNG" ở cột A là dòng data duy nhất ===
    if (currentStatus === 'cho_sua' && labelNorm.startsWith('so') && col === 0) {
      readAggregateRow(row, 'SỐ LƯỢNG')
      continue
    }

    // === Đọc từng hàng loại lỗi (cột A hoặc B) nếu có số liệu ===
    if (currentStatus !== 'cho_sua' && col <= 1 && hasNumericData(row)) {
      readAggregateRow(row, label.trim())
    }
  }

  return { statsRows }
}

// GET /api/sua-chua/import?dry=Tuan+21+-+2026
// Dry-run: parse một sheet và trả về debug info — KHÔNG lưu vào DB
export async function GET(req: NextRequest) {
  const sheetName = req.nextUrl.searchParams.get('dry') || 'Tuan 21 - 2026'
  try {
    const sheets = getSheetsClient()
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1:S200`,
    })
    const values = (resp.data.values ?? []) as string[][]

    // Run parse step-by-step với trace
    const trace: Array<{ row: number; label: string; norm: string; col: number; action: string }> = []
    let currentStatus: string | null = null
    let dataStartCol = 1
    const statsRows: Array<{ status_type: string; fault_type: string; device_type: string; quantity: number }> = []

    function firstNonEmpty(row: string[], maxCols = 3) {
      for (let i = 0; i < maxCols && i < row.length; i++) {
        const v = (row[i] || '').trim()
        if (v) return { label: v, col: i }
      }
      return null
    }

    const sectionNormMap: Record<string, string> = {
      'dasua':'da_sua', 'guibaohanh':'gui_bao_hanh',
      'khongloi':'khong_loi', 'honghan':'hong_han', 'chosua':'cho_sua',
    }

    values.forEach((row, i) => {
      if (!row || row.length === 0) return
      const found = firstNonEmpty(row, 3)
      if (!found) return
      const { label, col } = found
      const norm = normalize(label)

      let action = 'skip'

      if (norm.startsWith('loi') || norm.startsWith('thietbi')) {
        dataStartCol = col + 1; action = `header→dataStartCol=${dataStartCol}`
      } else {
        // Check section — EXACT match only
        const matched = STATUS_SECTIONS[label] || sectionNormMap[norm]
        if (matched) {
          currentStatus = matched; action = `section→${matched}`
        } else if (norm === 'tong' && currentStatus && currentStatus !== 'cho_sua') {
          action = `TỔNG→${currentStatus}`
          const quantities: string[] = []
          for (let idx = 0; idx < DEVICE_TYPES.length; idx++) {
            const rawVal = (row[dataStartCol + idx] || '').replace(/,/g, '').trim()
            const qty = Math.min(parseInt(rawVal) || 0, MAX_QTY_PER_CELL)
            if (qty > 0) {
              statsRows.push({ status_type: currentStatus!, fault_type: 'TỔNG', device_type: DEVICE_TYPES[idx], quantity: qty })
              quantities.push(`${DEVICE_TYPES[idx]}=${qty}`)
            }
          }
          action += ` [${quantities.join(',')}]`
        } else if (currentStatus === 'cho_sua' && norm.startsWith('so') && col === 0) {
          action = `cho_sua data row`
        }
      }

      trace.push({ row: i + 1, label, norm, col, action })
    })

    // Also run date extraction for debug
    const parsed = parseSheetTitle(sheetName)
    const dateInfo = parsed ? extractDateRange(values, parsed.year) : null

    // Show first 15 rows raw for date debug
    const first15 = values.slice(0, 15).map((row, i) => ({
      row: i + 1,
      cells: row.slice(0, 4).map(c => c || '(empty)'),
    }))

    return NextResponse.json({
      sheet: sheetName,
      dateExtraction: dateInfo ?? 'NOT FOUND',
      parsedTitle: parsed ?? 'parse failed',
      first15Rows: first15,
      dataStartCol,
      statsCount: statsRows.length,
      stats: statsRows.slice(0, 20),
      trace: trace.filter(t => t.action !== 'skip').slice(0, 50),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/sua-chua/import
// Body: {
//   sheet_titles?: string[]   — nếu bỏ qua thì import tất cả sheet đủ điều kiện
//   from_year?: number        — chỉ import từ năm này (default 2025)
//   from_week?: number        — kết hợp từ tuần này trong from_year (default 40)
//   clear_first?: boolean     — xóa data cũ trước khi import (default false)
// }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const filterTitles: string[] | undefined = body.sheet_titles
    const fromYear: number  = body.from_year  ?? 2025
    const fromWeek: number  = body.from_week  ?? 40
    const clearFirst: boolean = body.clear_first ?? false

    const sheets = getSheetsClient()
    const client = sb()

    // Xóa toàn bộ data nếu được yêu cầu
    if (clearFirst) {
      await client.from('repair_stats').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await client.from('repair_totals').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await client.from('repair_weeks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    }

    // Lấy danh sách sheet
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const allSheets = meta.data.sheets ?? []

    const results: Array<{ title: string; status: string; rows?: number }> = []

    for (const sheet of allSheets) {
      const title = sheet.properties?.title ?? ''
      const parsed = parseSheetTitle(title)
      if (!parsed) continue // skip trang tổng hợp, chart, etc.
      if (filterTitles && !filterTitles.includes(title)) continue

      // Lọc: chỉ import từ fromYear/fromWeek trở đi
      if (parsed.year < fromYear) continue
      if (parsed.year === fromYear && parsed.week_number < fromWeek) continue

      try {
        // Đọc toàn bộ sheet
        const resp = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${title}'!A1:S200`,
        })
        const values = (resp.data.values ?? []) as string[][]

        // Ưu tiên dùng ISO week từ ngày thực tế trong sheet
        // (tránh lệch tuần khi sheet dùng số tuần khác ISO)
        const dateInfo = extractDateRange(values, parsed.year)
        const isoWeek = dateInfo?.isoWeek ?? parsed.week_number
        const isoYear = dateInfo?.isoYear ?? parsed.year
        const dateStart = dateInfo?.dateStart ?? null
        const dateEnd   = dateInfo?.dateEnd   ?? null

        // Upsert repair_week
        const { data: weekRow, error: weekErr } = await client
          .from('repair_weeks')
          .upsert(
            {
              year: isoYear,
              week_number: isoWeek,
              week_label: title,
              date_start: dateStart,
              date_end: dateEnd,
              updated_at: new Date().toISOString()
            },
            { onConflict: 'year,week_number' }
          )
          .select('id')
          .single()

        if (weekErr || !weekRow) {
          results.push({ title, status: 'error: ' + (weekErr?.message ?? 'no week row') })
          continue
        }

        const { statsRows } = parseSheetData(values, weekRow.id)

        // Upsert stats (mỗi tuần có tối đa 5 status × 16 device = 80 rows)
        if (statsRows.length > 0) {
          await client.from('repair_stats')
            .upsert(statsRows, { onConflict: 'week_id,status_type,fault_type,device_type' })
        }

        results.push({ title, status: 'ok', rows: statsRows.length })
      } catch (e) {
        results.push({ title, status: 'error: ' + String(e) })
      }
    }

    return NextResponse.json({ results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
