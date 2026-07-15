import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'

const SPREADSHEET_ID = '1Tso4WKmsncr5sMhJ7F-ylu4MeWkb5pHu'
const SHEET_NAME     = 'Order hàng VP- Kho'

function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Thiếu GOOGLE_SERVICE_ACCOUNT_JSON')
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function genOrderCode(): Promise<string> {
  const now = new Date()
  const pad = (n: number, l = 2) => String(n).padStart(l, '0')
  const prefix = `DH-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const { count } = await db()
    .from('giao_hang_don_hang')
    .select('*', { count: 'exact', head: true })
    .like('order_code', `${prefix}%`)
  return `${prefix}-${((count ?? 0) + 1).toString().padStart(3, '0')}`
}

async function findNextSheetRow(sheets: ReturnType<typeof getSheetsClient>): Promise<number> {
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A1:A10000`,
    })
    const vals = resp.data.values ?? []
    let last = vals.length
    for (let i = vals.length - 1; i >= 0; i--) {
      if ((vals[i]?.[0] ?? '').toString().trim()) { last = i + 1; break }
    }
    return last + 1
  } catch { return 4 }
}

function fmtDate(iso?: string | null) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`
  } catch { return iso }
}

/** Build Loai TB cell value:
 *  "GO-168 | mã: 12345, 67890 | nhận: 15/01/2025"
 */
function buildLoaiTBCell(deviceName: string, customerCodes: string[], expectedReceipt?: string | null): string {
  const parts = [deviceName]
  if (customerCodes.length > 0) parts.push(`mã: ${customerCodes.join(', ')}`)
  if (expectedReceipt)          parts.push(`nhận: ${fmtDate(expectedReceipt) || expectedReceipt}`)
  return parts.join(' | ')
}

interface OrderItem {
  device_name:      string
  quantity:         number
  customer_codes?:  string[]
  expected_receipt?: string
  combo_name?:      string
}

interface OrderBody {
  orderer_name:       string
  office:             string
  expected_ship_date?: string   // TG dự kiến gửi
  expected_date?:      string   // legacy alias
  recipient_info?:     string
  recipient_id?:       string
  notes?:              string
  items:               OrderItem[]
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const body: OrderBody = await req.json()

    if (!body.orderer_name?.trim())
      return NextResponse.json({ error: 'Thiếu tên người đặt' }, { status: 400 })
    if (!body.office?.trim())
      return NextResponse.json({ error: 'Thiếu tên văn phòng' }, { status: 400 })
    if (!body.items?.length)
      return NextResponse.json({ error: 'Chưa chọn thiết bị nào' }, { status: 400 })
    for (const it of body.items) {
      if (!it.device_name?.trim()) return NextResponse.json({ error: 'Thiết bị không hợp lệ' }, { status: 400 })
      if (!it.quantity || it.quantity < 1) return NextResponse.json({ error: 'Số lượng phải >= 1' }, { status: 400 })
    }

    const admin         = db()
    const orderCode     = await genOrderCode()
    const expectedShip  = body.expected_ship_date ?? body.expected_date ?? null

    // ── 1. Lookup recipient info if recipient_id provided ─────────────────
    let recipientInfo = body.recipient_info ?? null
    if (body.recipient_id) {
      const { data: rec } = await admin
        .from('giao_hang_recipients')
        .select('name, address, phone, contact_name')
        .eq('id', body.recipient_id)
        .single()
      if (rec) {
        const parts = [rec.name]
        if (rec.contact_name) parts.push(rec.contact_name)
        if (rec.phone)        parts.push(rec.phone)
        if (rec.address)      parts.push(rec.address)
        recipientInfo = parts.join(' — ')
      }
    }

    // ── 2. Insert don_hang ─────────────────────────────────────────────────
    const { data: don, error: donErr } = await admin
      .from('giao_hang_don_hang')
      .insert({
        order_code:         orderCode,
        orderer_email:      user.email!,
        orderer_name:       body.orderer_name.trim(),
        office:             body.office.trim(),
        expected_date:      expectedShip,
        expected_ship_date: expectedShip,
        recipient_info:     recipientInfo,
        recipient_id:       body.recipient_id ?? null,
        notes:              body.notes ?? null,
        status:             'cho_xu_ly',
      })
      .select().single()

    if (donErr || !don)
      return NextResponse.json({ error: donErr?.message ?? 'Lỗi tạo đơn hàng' }, { status: 500 })

    // ── 3. Write to Google Sheet — 1 row per item ─────────────────────────
    const now          = new Date()
    const orderTimeStr = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
    const shipDateStr  = fmtDate(expectedShip ?? undefined)

    let sheetWriteOk = false
    const itemSheetRows: number[] = []

    try {
      const sheets  = getSheetsClient()
      const nextRow = await findNextSheetRow(sheets)

      const rowsToAppend = body.items.map(item => {
        const codes    = item.customer_codes ?? []
        const loaiTB   = buildLoaiTBCell(item.device_name, codes, item.expected_receipt)
        return [
          orderCode,           // A: STT/mã đơn
          orderTimeStr,        // B: Thời gian đặt
          body.office.trim(),  // C: VP
          body.orderer_name.trim(), // D: Người đặt
          loaiTB,              // E: Loại TB (device + mã KH + nhận)
          String(item.quantity), // F: SL
          shipDateStr,         // G: TG dự kiến gửi
          recipientInfo ?? '', // H: Người nhận
        ]
      })

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${SHEET_NAME}'!A${nextRow}`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rowsToAppend },
      })

      body.items.forEach((_, i) => itemSheetRows.push(nextRow + i))
      sheetWriteOk = true
    } catch (sheetErr) {
      console.error('[Sheet write error]', sheetErr)
    }

    // ── 4. Insert don_items with customer_codes ────────────────────────────
    const itemsToInsert = body.items.map((item, i) => ({
      order_id:         don.id,
      device_name:      item.device_name.trim(),
      quantity:         item.quantity,
      customer_codes:   item.customer_codes ?? [],
      expected_receipt: item.expected_receipt ?? null,
      sheet_row:        itemSheetRows[i] ?? null,
      combo_name:       item.combo_name ?? null,
    }))

    const { error: itemErr } = await admin.from('giao_hang_don_items').insert(itemsToInsert)
    if (itemErr) console.error('[Items insert error]', itemErr.message)

    return NextResponse.json({
      ok: true,
      order_code:  orderCode,
      order_id:    don.id,
      sheet_write: sheetWriteOk,
      item_count:  body.items.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
