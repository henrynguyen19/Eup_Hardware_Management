import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'

const SPREADSHEET_ID = '1Tso4WKmsncr5sMhJ7F-ylu4MeWkb5pHu'
const SHEET_NAME     = 'Order hàng VP- Kho'
// Columns A-H (0-7) in the sheet
const SHEET_COL_START = 'A'
const SHEET_COL_END   = 'H'

function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Thiếu GOOGLE_SERVICE_ACCOUNT_JSON')
  const credentials = JSON.parse(raw)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── GET /api/giao-hang/orders?office=X&search=Y&page=1&limit=50 ────────────
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const sp         = req.nextUrl.searchParams
  const office     = sp.get('office') ?? ''
  const search     = sp.get('search') ?? ''
  const hasDevice  = sp.get('has_device') === '1'   // only rows with non-empty device_type
  const page       = parseInt(sp.get('page') ?? '1')
  const limit      = Math.min(parseInt(sp.get('limit') ?? '100'), 200)
  const offset     = (page - 1) * limit

  let query = db().from('giao_hang_orders').select('*', { count: 'exact' })

  if (office) query = query.ilike('office', `%${office}%`)
  if (hasDevice) query = query.neq('device_type', '').not('device_type', 'is', null)
  if (search) {
    query = query.or(
      `orderer.ilike.%${search}%,device_type.ilike.%${search}%,recipient_info.ilike.%${search}%,order_time.ilike.%${search}%`
    )
  }

  query = query.order('sheet_row', { ascending: false }).range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ orders: data ?? [], total: count ?? 0, page, limit })
}

// ─── PUT /api/giao-hang/orders — cập nhật một đơn + write back sheet ────────
export async function PUT(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const body = await req.json() as {
      id: string
      sheet_row: number
      stt?: string
      order_time?: string
      office?: string
      orderer?: string
      device_type?: string
      quantity?: string
      expected_date?: string
      recipient_info?: string
    }

    if (!body.id || !body.sheet_row) {
      return NextResponse.json({ error: 'Thiếu id hoặc sheet_row' }, { status: 400 })
    }

    // Build the row values for A-H
    const rowValues = [
      body.stt           ?? '',
      body.order_time    ?? '',
      body.office        ?? '',
      body.orderer       ?? '',
      body.device_type   ?? '',
      body.quantity      ?? '',
      body.expected_date ?? '',
      body.recipient_info ?? '',
    ]

    // Write back to Google Sheet
    const sheets = getSheetsClient()
    const range = `'${SHEET_NAME}'!${SHEET_COL_START}${body.sheet_row}:${SHEET_COL_END}${body.sheet_row}`
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    })

    // Update DB
    const updateFields: Record<string, string> = { updated_at: new Date().toISOString() }
    if (body.stt           !== undefined) updateFields.stt           = body.stt
    if (body.order_time    !== undefined) updateFields.order_time    = body.order_time
    if (body.office        !== undefined) updateFields.office        = body.office
    if (body.orderer       !== undefined) updateFields.orderer       = body.orderer
    if (body.device_type   !== undefined) updateFields.device_type   = body.device_type
    if (body.quantity      !== undefined) updateFields.quantity      = body.quantity
    if (body.expected_date !== undefined) updateFields.expected_date = body.expected_date
    if (body.recipient_info !== undefined) updateFields.recipient_info = body.recipient_info

    const { error } = await db().from('giao_hang_orders')
      .update(updateFields).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.j