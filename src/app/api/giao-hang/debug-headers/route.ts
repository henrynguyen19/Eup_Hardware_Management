import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'
import * as XLSX from 'xlsx'

const SPREADSHEET_ID = '1Tso4WKmsncr5sMhJ7F-ylu4MeWkb5pHu'
const SHEET_NAME     = 'Order hàng VP- Kho'

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

async function fetchRows(): Promise<{ rows: string[][], source: string }> {
  const auth = getGoogleAuth()
  try {
    const sheets = google.sheets({ version: 'v4', auth })
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A1:Z10`,
    })
    return { rows: (resp.data.values ?? []) as string[][], source: 'sheets_api' }
  } catch (e: unknown) {
    if (!String(e).includes('Office file') && !String(e).includes('not supported')) throw e
  }
  const drive = google.drive({ version: 'v3', auth })
  const resp  = await drive.files.get(
    { fileId: SPREADSHEET_ID, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  const wb      = XLSX.read(Buffer.from(resp.data as ArrayBuffer), { type: 'buffer' })
  const sheetNm = wb.SheetNames.find(n => n.includes('Order') || n.includes('Kho')) ?? wb.SheetNames[0]
  const allRows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetNm], { header: 1, defval: '' })
  return { rows: allRows.slice(0, 10) as string[][], source: 'drive_xlsx' }
}

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  try {
    const { rows, source } = await fetchRows()
    // Show each row as { rowIndex, cells: [{col, value}] }
    const preview = rows.slice(0, 8).map((row, i) => ({
      rowIndex: i,
      sheetRow: i + 1,
      cells: row.map((v, j) => ({
        col: String.fromCharCode(65 + j),
        colIndex: j,
        value: String(v ?? ''),
      })).filter(c => c.value.trim()),
    }))
    return NextResponse.json({ source, preview, sheetNames: undefined })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
