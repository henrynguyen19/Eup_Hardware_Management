import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'
import * as XLSX from 'xlsx'

const SPREADSHEET_ID = '1Tso4WKmsncr5sMhJ7F-ylu4MeWkb5pHu'
const SHEET_NAME     = 'Order hàng VP- Kho'
const DATA_START_IDX = 3

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

function norm(s: unknown) {
  return String(s ?? '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd').replace(/\s+/g, '')
}

async function fetchRows(): Promise<string[][]> {
  const auth = getGoogleAuth()

  // Try Sheets API first
  try {
    const sheets = google.sheets({ version: 'v4', auth })
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A1:H1000`,
    })
    return (resp.data.values ?? []) as string[][]
  } catch (e: unknown) {
    if (!String(e).includes('Office file') && !String(e).includes('not supported')) throw e
  }

  // Fallback: Drive download
  const drive = google.drive({ version: 'v3', auth })
  const resp  = await drive.files.get(
    { fileId: SPREADSHEET_ID, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  const wb       = XLSX.read(Buffer.from(resp.data as ArrayBuffer), { type: 'buffer' })
  const sheetNm  = wb.SheetNames.find(n => n.includes('Order') || n.includes('Kho')) ?? wb.SheetNames[0]
  return XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetNm], { header: 1, defval: '' })
}

let cache: { data: Record<string, number>; ts: number } | null = null
const CACHE_MS = 10 * 60 * 1000

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json({ data: cache.data, cached: true })
  }

  try {
    const rows = await fetchRows()

    // Detect cols from header row (index 1)
    const headerRow = (rows[1] ?? []).map(String)
    let deviceTypeCol = 4
    let quantityCol   = 5
    for (let i = 0; i < headerRow.length; i++) {
      const h = norm(headerRow[i])
      if (h.includes('loaitb') || h.includes('loaithietbi')) deviceTypeCol = i
      if (h.includes('soluong'))                              quantityCol   = i
    }

    const counts: Record<string, number> = {}
    for (let i = DATA_START_IDX; i < rows.length; i++) {
      const row  = rows[i]
      const name = String(row[deviceTypeCol] ?? '').trim()
      const qty  = parseInt(String(row[quantityCol] ?? '1')) || 1
      if (name) counts[name] = (counts[name] ?? 0) + qty
    }

    cache = { data: counts, ts: Date.now() }
    return NextResponse.json({ data: counts })
  } catch (e) {
    return NextResponse.json({ data: {}, error: String(e) })
  }
}
