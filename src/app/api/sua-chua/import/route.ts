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

// Parse sheet title to extract year and week_number
// e.g. "Tuan 21 - 2026" → { year: 2026, week_number: 21 }
function parseSheetTitle(title: string) {
  const m = title.match(/(\d+)\s*-\s*(\d{4})/)
  if (!m) return null
  return { week_number: parseInt(m[1]), year: parseInt(m[2]) }
}

// Parse a single sheet's values into stats rows.
// Dynamically detects label column position (can be col A or col B depending on row type).
function parseSheetData(values: string[][], weekId: string) {
  const statsRows: Array<{ week_id: string; status_type: string; fault_type: string; device_type: string; quantity: number }> = []
  const totalsRows: Array<{ week_id: string; device_type: string; total_received: number }> = []

  let currentStatus: string | null = null
  // dataStartCol: index of the first device-quantity column (auto-detected from header row)
  let dataStartCol = 1  // default: col B

  // Helper: find first non-empty cell in first N cols, returns { label, col }
  function firstNonEmpty(row: string[], maxCols = 3): { label: string; col: number } | null {
    for (let i = 0; i < maxCols && i < row.length; i++) {
      const v = (row[i] || '').trim()
      if (v) return { label: v, col: i }
    }
    return null
  }

  for (const row of values) {
    if (!row || row.length === 0) continue

    const found = firstNonEmpty(row, 3)
    if (!found) continue
    const { label, col } = found

    // === Auto-detect header row ("Lỗi \ Thiết Bị" + device type names) ===
    // This row tells us exactly where device data starts
    if (/lỗi|thiết\s*bị/i.test(label) || label.startsWith('Lỗi')) {
      dataStartCol = col + 1
      continue
    }

    // === Detect STATUS section headers ===
    // Try exact match first, then normalize (remove extra spaces/diacritics sensitivity)
    let matchedStatus = STATUS_SECTIONS[label]
    if (!matchedStatus) {
      // Fallback: check if any known key is contained within label
      for (const [key, val] of Object.entries(STATUS_SECTIONS)) {
        if (label.toLowerCase().includes(key.toLowerCase().slice(0, 5))) {
          matchedStatus = val
          break
        }
      }
    }
    if (matchedStatus) {
      currentStatus = matchedStatus
      // Section headers are often in a different column than fault types
      // Don't change dataStartCol from what the header row told us
      continue
    }

    // === Skip known non-data rows ===
    // Exception: trong section "Chờ sửa", dòng "SỐ LƯỢNG" chính là dòng dữ liệu duy nhất
    if (/^s[oố]\s*l[uư]/i.test(label) && currentStatus !== 'cho_sua') continue

    // === Skip subtotal rows (e.g., "Tổng", "TỔNG") within a section ===
    if (/^t[oổ]ng$/i.test(label.replace(/\s/g, ''))) {
      // Check if this could be the grand total row (contains data for bàn giao)
      // Heuristic: if we're NOT in a status section, it's likely the grand total
      if (!currentStatus) {
        // Treat as total devices received
        DEVICE_TYPES.forEach((deviceType, idx) => {
          const rawVal = (row[dataStartCol + idx] || '').replace(/,/g, '').trim()
          const qty = parseInt(rawVal) || 0
          if (qty > 0) {
            totalsRows.push({ week_id: weekId, device_type: deviceType, total_received: qty })
          }
        })
      }
      // Skip this row either way (don't add subtotals as fault types)
      continue
    }

    // === Parse data row (fault type × device quantities) ===
    if (currentStatus) {
      const faultType = label
      DEVICE_TYPES.forEach((deviceType, idx) => {
        const rawVal = (row[dataStartCol + idx] || '').replace(/,/g, '').trim()
        const qty = Math.min(parseInt(rawVal) || 0, MAX_QTY_PER_CELL)
        if (qty > 0) {
          statsRows.push({ week_id: weekId, status_type: currentStatus!, fault_type: faultType, device_type: deviceType, quantity: qty })
        }
      })
    }
  }

  return { statsRows, totalsRows }
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

        // Upsert repair_week
        const { data: weekRow, error: weekErr } = await client
          .from('repair_weeks')
          .upsert(
            { year: parsed.year, week_number: parsed.week_number, week_label: title, updated_at: new Date().toISOString() },
            { onConflict: 'year,week_number' }
          )
          .select('id')
          .single()

        if (weekErr || !weekRow) {
          results.push({ title, status: 'error: ' + (weekErr?.message ?? 'no week row') })
          continue
        }

        const { statsRows, totalsRows } = parseSheetData(values, weekRow.id)

        // Upsert stats
        if (statsRows.length > 0) {
          await client.from('repair_stats')
            .upsert(statsRows, { onConflict: 'week_id,status_type,fault_type,device_type' })
        }
        // Upsert totals
        if (totalsRows.length > 0) {
          await client.from('repair_totals')
            .upsert(totalsRows, { onConflict: 'week_id,device_type' })
        }

        results.push({ title, status: 'ok', rows: statsRows.length + totalsRows.length })
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
