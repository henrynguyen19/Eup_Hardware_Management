import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const SPREADSHEET_ID = '1nn77HB7xZRGGCKNbLgMyWPH9ROJht8k_Egk5gljz9Fc'

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

// GET /api/sua-chua/debug?sheet=Tuan+21+-+2026&rows=40
// Trả về raw values của sheet để kiểm tra cấu trúc
export async function GET(req: NextRequest) {
  const sheetName = req.nextUrl.searchParams.get('sheet') || 'Tuan 21 - 2026'
  const rowLimit = parseInt(req.nextUrl.searchParams.get('rows') || '60')

  try {
    const sheets = getSheetsClient()
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1:T${rowLimit}`,
    })

    const values = resp.data.values ?? []

    const normalize = (s: string): string => {
      return s.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, '')
    }
    const firstNonEmpty = (row: string[], maxCols = 3) => {
      for (let i = 0; i < maxCols && i < row.length; i++) {
        const v = (row[i] || '').trim()
        if (v) return { label: v, col: i, norm: normalize(v) }
      }
      return null
    }

    // Return with row numbers + normalized label for debugging
    const annotated = values.map((row, i) => {
      const found = firstNonEmpty(row, 3)
      return {
        row: i + 1,
        label: found?.label ?? '',
        col: found?.col ?? -1,
        norm: found?.norm ?? '',  // ← key field để debug matching
        A: row[0] ?? '',
        B: row[1] ?? '',
        C: row[2] ?? '',
        D: row[3] ?? '',
        E: row[4] ?? '',
        F: row[5] ?? '',
      }
    })

    return NextResponse.json({ sheet: sheetName, rows: annotated })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
