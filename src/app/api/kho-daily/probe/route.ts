import { NextResponse } from 'next/server'
import { google } from 'googleapis'

const SPREADSHEET_ID = '1q3rgjEmoYDPjAu8m-jTaathrl4fsrzHvwqUWKtkZWvo'
const SHEET_NAMES = ['Kai_report', 'Bob_report', 'Thor_report', 'Nick_report']

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

// GET /api/kho-daily/probe
// Đọc 30 dòng đầu tiên của mỗi sheet để hiểu cấu trúc
export async function GET() {
  try {
    const sheets = getSheetsClient()

    // Lấy danh sách tất cả sheets trong spreadsheet
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const allSheetNames = (meta.data.sheets ?? []).map(s => s.properties?.title ?? '')

    const result: Record<string, { headers: string[]; sample_rows: string[][] }> = {}

    for (const sheetName of SHEET_NAMES) {
      if (!allSheetNames.includes(sheetName)) {
        result[sheetName] = { headers: ['SHEET NOT FOUND'], sample_rows: [] }
        continue
      }

      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'!A1:Z30`,
      })

      const values = (resp.data.values ?? []) as string[][]
      const headers = values[0] ?? []
      const sample_rows = values.slice(1, 10)

      result[sheetName] = { headers, sample_rows }
    }

    return NextResponse.json({
      spreadsheet_id: SPREADSHEET_ID,
      all_sheets: allSheetNames,
      probe: result,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
