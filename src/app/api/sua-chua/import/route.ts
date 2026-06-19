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
  'Đã sửa':         'da_sua',
  'Gửi bảo hành':   'gui_bao_hanh',
  'Không lỗi':      'khong_loi',
  'Hỏng hẳn':       'hong_han',
  'Chờ sửa':        'cho_sua',
}

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

// Parse a single sheet's values into stats rows
function parseSheetData(values: string[][], weekId: string) {
  const statsRows: Array<{ week_id: string; status_type: string; fault_type: string; device_type: string; quantity: number }> = []
  const totalsRows: Array<{ week_id: string; device_type: string; total_received: number }> = []

  let currentStatus: string | null = null
  let inTotal = false

  for (const row of values) {
    if (!row || row.length === 0) continue

    const firstCell = (row[0] || '').trim()

    // Detect section header
    if (STATUS_SECTIONS[firstCell]) {
      currentStatus = STATUS_SECTIONS[firstCell]
      inTotal = false
      continue
    }

    // Detect totals section (various labels)
    if (/tổng|total|bàn giao/i.test(firstCell) && !currentStatus) {
      inTotal = true
      continue
    }

    // Skip header rows ("SỐ LƯỢNG", "Lỗi \ Thiết Bị", empty)
    if (!firstCell || /số lượng|lỗi|thiết bị/i.test(firstCell)) continue

    if (currentStatus) {
      // Parse fault type row: col A = fault name, col B+ = quantities per device
      const faultType = firstCell
      DEVICE_TYPES.forEach((deviceType, idx) => {
        const rawVal = (row[idx + 1] || '').replace(/,/g, '').trim()
        const qty = parseInt(rawVal) || 0
        if (qty > 0) {
          statsRows.push({ week_id: weekId, status_type: currentStatus!, fault_type: faultType, device_type: deviceType, quantity: qty })
        }
      })
    } else if (inTotal) {
      // Parse totals row
      DEVICE_TYPES.forEach((deviceType, idx) => {
        const rawVal = (row[idx + 1] || '').replace(/,/g, '').trim()
        const qty = parseInt(rawVal) || 0
        if (qty > 0) {
          totalsRows.push({ week_id: weekId, device_type: deviceType, total_received: qty })
        }
      })
      inTotal = false // only 1 row of totals
    }
  }

  return { statsRows, totalsRows }
}

// POST /api/sua-chua/import
// Body: { sheet_titles?: string[] }  — nếu bỏ qua thì import tất cả sheet
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const filterTitles: string[] | undefined = body.sheet_titles

    const sheets = getSheetsClient()
    const client = sb()

    // Lấy danh sách sheet
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const allSheets = meta.data.sheets ?? []

    const results: Array<{ title: string; status: string; rows?: number }> = []

    for (const sheet of allSheets) {
      const title = sheet.properties?.title ?? ''
      const parsed = parseSheetTitle(title)
      if (!parsed) continue // skip trang tổng hợp, chart, etc.
      if (filterTitles && !filterTitles.includes(title)) continue

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
