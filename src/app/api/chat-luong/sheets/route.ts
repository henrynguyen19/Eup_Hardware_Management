import { NextResponse } from 'next/server'
import { QUALITY_SHEET_ID } from '@/lib/chat-luong-config'

// Debug endpoint: liệt kê tất cả tên tab trong spreadsheet
export async function GET() {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY?.trim()
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 400 })

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${QUALITY_SHEET_ID}?key=${apiKey}&fields=sheets.properties.title`
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json()

  if (!res.ok) return NextResponse.json({ error: json.error?.message ?? 'Unknown error' }, { status: res.status })

  const sheets = (json.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title)
  return NextResponse.json({ sheets })
}
