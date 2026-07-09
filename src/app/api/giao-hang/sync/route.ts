import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'

const SPREADSHEET_ID = '1Tso4WKmsncr5sMhJ7F-ylu4MeWkb5pHu'
const SHEET_NAME     = 'Order hàng VP- Kho'
// Header row index (0-indexed). Row 2 in sheet = index 1.
const HEADER_ROW_IDX = 1
// Data starts after header + legend rows
const DATA_START_IDX = 3  // row 4 in sheet (index 3)

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

function norm(s: unknown) {
  return String(s ?? '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, '')
}

/** Detect column indices from header row */
function detectCols(headerRow: string[]) {
  let stt = 0, orderTime = 1, office = 2, orderer = 3
  let deviceType = 4, quantity = 5, expectedDate = 6, recipientInfo = 7

  for (let i = 0; i < headerRow.length; i++) {
    const h = norm(headerRow[i])
    if (h.includes('thoigian') || h.includes('tgdat')) orderTime = i
    else if (h === 'office' || h.includes('vanphong')) office = i
    else if (h.includes('nguoidat')) orderer = i
    else if (h.includes('loaitb') || h.includes('loaithietbi')) deviceType = i
    else if (h.includes('soluong')) quantity = i
    else if (h.includes('tgdukien') || h.includes('tglap')) expectedDate = i
    else if (h.includes('thongtin') || h.includes('nguoinhan')) recipientInfo = i
  }

  return { stt, orderTime, office, orderer, deviceType, quantity, expectedDate, recipientInfo }
}

function getCell(row: string[], idx: number) {
  return (row[idx] ?? '').toString().trim()
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const clearFirst: boolean = body.clear_first ?? false

    const sheets = getSheetsClient()
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A1:Z2000`,
      valueRenderOption: 'FORMATTED_VALUE',
    })

    const values = (resp.data.values ?? []) as string[][]
    if (values.length <= HEADER_ROW_IDX) {
      return NextResponse.json({ error: 'Sheet trống hoặc không có header' }, { status: 400 })
    }

    const headerRow = values[HEADER_ROW_IDX] ?? []
    const cols = detectCols(headerRow)

    const db = sb()
    if (clearFirst) {
      await db.from('giao_hang_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    }

    const records = []
    for (let i = DATA_START_IDX; i < values.length; i++) {
      const row = values[i] ?? []
      // Skip completely empty rows
      if (!row.some(c => c?.toString().trim())) continue

      const orderTime = getCell(row, cols.orderTime)
      const office    = getCell(row, cols.office)
      const orderer   = getCell(row, cols.orderer)
      const deviceType = getCell(row, cols.deviceType)

      // Skip rows that look like sub-headers or empty data
      if (!orderTime && !office && !orderer && !deviceType) continue

      records.push({
        sheet_row:     i + 1,   // 1-indexed for Google Sheets API
        stt:           getCell(row, cols.stt),
        order_time:    orderTime,
        office,
        orderer,
        device_type:   deviceType,
        quantity:      getCell(row, cols.quantity),
        expected_date: getCell(row, cols.expectedDate),
        recipient_info: getCell(row, cols.recipientInfo),
        synced_at:     new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      })
    }

    // Upsert in batches
    let inserted = 0
    const errors: string[] = []
    for (let i = 0; i < records.length; i += 100) {
      const batch = records.slice(i, i + 100)
      const { error } = await db.from('giao_hang_orders')
        .upsert(batch, { onConflict: 'sheet_row' })
      if (error) errors.push(error.message)
      else inserted += batch.length
    }

    return NextResponse.json({
      ok: errors.length === 0,
      total: records.length,
      inserted,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      sheet: SHEET_NAME,
      headerCols: cols,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
