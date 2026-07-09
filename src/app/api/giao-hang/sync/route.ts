import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'
import * as XLSX from 'xlsx'

const SPREADSHEET_ID = '1Tso4WKmsncr5sMhJ7F-ylu4MeWkb5pHu'
const SHEET_NAME     = 'Order hàng VP- Kho'
const HEADER_ROW_IDX = 1   // Row 2 in sheet (0-indexed)
const DATA_START_IDX = 3   // Row 4 in sheet (0-indexed)

function getGoogleAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Thiếu GOOGLE_SERVICE_ACCOUNT_JSON')
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  })
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function norm(s: unknown) {
  return String(s ?? '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd').replace(/\s+/g, '')
}

function detectCols(headerRow: string[]) {
  let stt = 0, orderTime = 1, office = 2, orderer = 3
  let deviceType = 4, quantity = 5, expectedDate = 6, recipientInfo = 7
  for (let i = 0; i < headerRow.length; i++) {
    const h = norm(headerRow[i])
    if (h.includes('thoigian') || h.includes('tgdat'))          orderTime    = i
    else if (h === 'office' || h.includes('vanphong'))           office       = i
    else if (h.includes('nguoidat'))                             orderer      = i
    else if (h.includes('loaitb') || h.includes('loaithietbi')) deviceType   = i
    else if (h.includes('soluong'))                              quantity     = i
    else if (h.includes('tgdukien') || h.includes('tglap'))     expectedDate = i
    else if (h.includes('thongtin') || h.includes('nguoinhan')) recipientInfo= i
  }
  return { stt, orderTime, office, orderer, deviceType, quantity, expectedDate, recipientInfo }
}

function getCell(row: unknown[], idx: number): string {
  return String(row[idx] ?? '').trim()
}

/** Try Sheets API first; if file is an Office file, fall back to Drive download + xlsx parse */
async function fetchSheetRows(): Promise<{ values: string[][]; source: string }> {
  const auth = getGoogleAuth()

  // ── Attempt 1: Sheets API ──────────────────────────────────────
  try {
    const sheets = google.sheets({ version: 'v4', auth })
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A1:Z2000`,
      valueRenderOption: 'FORMATTED_VALUE',
    })
    return { values: (resp.data.values ?? []) as string[][], source: 'sheets_api' }
  } catch (e: unknown) {
    const msg = String(e)
    // Only fall back for "Office file" errors
    if (!msg.includes('Office file') && !msg.includes('not supported')) throw e
    // Otherwise fall through to Drive fallback
  }

  // ── Attempt 2: Drive download + xlsx parse ─────────────────────
  const drive = google.drive({ version: 'v3', auth })
  const resp = await drive.files.get(
    { fileId: SPREADSHEET_ID, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  const buffer = Buffer.from(resp.data as ArrayBuffer)
  const wb     = XLSX.read(buffer, { type: 'buffer', cellDates: false })

  // Find matching sheet tab
  const sheetName = wb.SheetNames.find(n => n.includes('Order') || n.includes('Kho')) ?? wb.SheetNames[0]
  const ws        = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Không tìm thấy sheet tab trong file. Có: ${wb.SheetNames.join(', ')}`)

  const rows: string[][] = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
  return { values: rows, source: 'drive_xlsx' }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const body        = await req.json().catch(() => ({}))
    const clearFirst  = body.clear_first ?? false

    const { values, source } = await fetchSheetRows()

    if (values.length <= HEADER_ROW_IDX) {
      return NextResponse.json({ error: 'Sheet trống hoặc không có header' }, { status: 400 })
    }

    const headerRow = (values[HEADER_ROW_IDX] ?? []).map(String)
    const cols      = detectCols(headerRow)
    const db        = sb()

    if (clearFirst) {
      await db.from('giao_hang_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    }

    const records = []
    for (let i = DATA_START_IDX; i < values.length; i++) {
      const row = values[i] ?? []
      if (!row.some(c => String(c ?? '').trim())) continue
      const orderTime  = getCell(row, cols.orderTime)
      const office     = getCell(row, cols.office)
      const orderer    = getCell(row, cols.orderer)
      const deviceType = getCell(row, cols.deviceType)
      if (!orderTime && !office && !orderer && !deviceType) continue
      records.push({
        sheet_row:      i + 1,
        stt:            getCell(row, cols.stt),
        order_time:     orderTime,
        office,
        orderer,
        device_type:    deviceType,
        quantity:       getCell(row, cols.quantity),
        expected_date:  getCell(row, cols.expectedDate),
        recipient_info: getCell(row, cols.recipientInfo),
        synced_at:      new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      })
    }

    let upserted = 0
    const errors: string[] = []
    for (let i = 0; i < records.length; i += 100) {
      const batch = records.slice(i, i + 100)
      const { error } = await db.from('giao_hang_orders')
        .upsert(batch, { onConflict: 'sheet_row' })
      if (error) errors.push(error.message)
      else upserted += batch.length
    }

    return NextResponse.json({
      ok: errors.length === 0,
      total: records.length,
      upserted,
      source,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
