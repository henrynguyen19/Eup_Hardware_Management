import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'

const SPREADSHEET_ID = '1Tso4WKmsncr5sMhJ7F-ylu4MeWkb5pHu'
const SHEET_NAME     = 'Order hàng VP- Kho'
const DATA_START_IDX = 3   // row 4 onwards

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

function norm(s: unknown) {
  return String(s ?? '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, '')
}

// Cache 10 phút
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
    const sheets = getSheetsClient()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_NAME}'!A1:H1000`,
    })
    const rows = res.data.values ?? []

    // Detect header (row index 1)
    const headerRow = (rows[1] ?? []).map(String)
    let deviceTypeCol = 4  // col E default
    let quantityCol   = 5  // col F default
    for (let i = 0; i < headerRow.length; i++) {
      const h = norm(headerRow[i])
      if (h.includes('loaitb') || h.includes('loaithietbi')) deviceTypeCol = i
      if (h.includes('soluong')) quantityCol = i
    }

    // Count from DATA_START_IDX onwards
    const counts: Record<string, number> = {}
    for (let i = DATA_START_IDX; i < rows.length; i++) {
      const row = rows[i]
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
