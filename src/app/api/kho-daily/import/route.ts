import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const SPREADSHEET_ID = '1q3rgjEmoYDPjAu8m-jTaathrl4fsrzHvwqUWKtkZWvo'
const PERSONS = ['Kai', 'Thor', 'Nick', 'Bop', 'Peter']

function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Thiếu GOOGLE_SERVICE_ACCOUNT_JSON')
  const credentials = JSON.parse(raw)
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
  return google.sheets({ version: 'v4', auth })
}

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function parseDate(dateStr: string): string | null {
  const m = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
}

function norm(s: string): string {
  return (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, ' ')
}

function parseSheetRows(values: string[][], personName: string) {
  if (values.length < 3) return []

  const header1 = values[0] ?? []
  const header2 = values[1] ?? []

  let thanhPhamStart = -1
  let hangGuiVpStart = -1
  let thuHoiStart = -1
  let otherStart = -1

  for (let i = 0; i < header1.length; i++) {
    const n = norm(header1[i] || '')
    if (n.includes('up thanh pham') && thanhPhamStart === -1) thanhPhamStart = i
    else if (n.includes('hang gui') && hangGuiVpStart === -1) hangGuiVpStart = i
    else if (n.includes('thu hoi') && thuHoiStart === -1) thuHoiStart = i
    else if ((n.includes('other') || n.includes('cac tbi')) && otherStart === -1) otherStart = i
  }

  const thuHoiTriplets: Array<{loaiCol: number, deviceCol: number, qtyCol: number}> = []
  const otherTriplets: Array<{taskCol: number, deviceCol: number, qtyCol: number}> = []

  if (thuHoiStart !== -1) {
    let i = thuHoiStart
    const end = otherStart !== -1 ? otherStart : header2.length
    while (i < end - 2) {
      const n2 = norm(header2[i] || '')
      if (n2.includes('loai thu hoi') || n2.includes('loai')) {
        const n3 = norm(header2[i+1] || '')
        const n4 = norm(header2[i+2] || '')
        if ((n3.includes('ten thiet bi') || n3.includes('device')) && (n4.includes('so luong') || n4.includes('qty'))) {
          thuHoiTriplets.push({ loaiCol: i, deviceCol: i+1, qtyCol: i+2 })
          i += 3
          continue
        }
      }
      i++
    }
  }

  if (otherStart !== -1) {
    let i = otherStart
    while (i < header2.length - 1) {
      const n2 = norm(header2[i] || '')
      if (n2.includes('cong viec') || n2 === 'cong viec') {
        const deviceCol = i + 1
        let qtyCol = i + 2
        if (norm(header2[qtyCol] || '') === '' && qtyCol + 1 < header2.length) {
          const nextNorm = norm(header2[qtyCol + 1] || '')
          if (nextNorm.includes('so luong') || nextNorm.includes('quantity') || nextNorm === '') {
            qtyCol = qtyCol + 1
          }
        }
        otherTriplets.push({ taskCol: i, deviceCol, qtyCol })
        i = qtyCol + 1
        continue
      }
      i++
    }
  }

  const sectionEnd = (start: number, ...nextStarts: number[]) => {
    const nexts = nextStarts.filter(s => s > start)
    return nexts.length > 0 ? Math.min(...nexts) : header2.length
  }

  const records = []

  for (let ri = 2; ri < values.length; ri++) {
    const row = values[ri] ?? []
    const dateStr = (row[2] || '').trim()
    if (!dateStr) continue
    const entryDate = parseDate(dateStr)
    if (!entryDate) continue

    const weekLabel = (row[1] || '').trim() || null

    let thanhPhamTotal = 0
    if (thanhPhamStart !== -1) {
      const end = sectionEnd(thanhPhamStart, hangGuiVpStart, thuHoiStart, otherStart)
      for (let c = thanhPhamStart; c < end; c++) {
        const v = parseInt((row[c] || '').replace(/,/g, '').trim()) || 0
        if (v > 0 && v < 10000) thanhPhamTotal += v
      }
    }

    let hangGuiVpTotal = 0
    if (hangGuiVpStart !== -1) {
      const end = sectionEnd(hangGuiVpStart, thuHoiStart, otherStart)
      for (let c = hangGuiVpStart; c < end; c++) {
        const v = parseInt((row[c] || '').replace(/,/g, '').trim()) || 0
        if (v > 0 && v < 10000) hangGuiVpTotal += v
      }
    }

    const thuHoiDetails: Array<{loai: string, device: string, qty: number}> = []
    let thuHoiTotal = 0
    for (const t of thuHoiTriplets) {
      const loai = (row[t.loaiCol] || '').trim()
      const device = (row[t.deviceCol] || '').trim()
      const qty = parseInt((row[t.qtyCol] || '').replace(/,/g, '').trim()) || 0
      if ((loai || device) && qty > 0) {
        thuHoiDetails.push({ loai, device, qty })
        thuHoiTotal += qty
      }
    }

    const otherTasksList: Array<{task: string, device: string, qty: number}> = []
    let otherTotal = 0
    for (const t of otherTriplets) {
      const task = (row[t.taskCol] || '').trim()
      const device = (row[t.deviceCol] || '').trim()
      const qty = parseInt((row[t.qtyCol] || '').replace(/,/g, '').trim()) || 0
      if (task && qty > 0) {
        otherTasksList.push({ task, device, qty })
        otherTotal += qty
      }
    }

    if (thanhPhamTotal === 0 && hangGuiVpTotal === 0 && thuHoiTotal === 0 && otherTotal === 0) continue

    records.push({
      person_name: personName,
      entry_date: entryDate,
      week_label: weekLabel,
      thanh_pham_total: thanhPhamTotal,
      hang_gui_vp_total: hangGuiVpTotal,
      xuat_kho_total: 0,
      thu_hoi_total: thuHoiTotal,
      other_total: otherTotal,
      thu_hoi_details: thuHoiDetails,
      other_tasks: otherTasksList,
      updated_at: new Date().toISOString(),
    })
  }

  return records
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const persons: string[] = body.persons ?? PERSONS
    const clearFirst: boolean = body.clear_first ?? false

    const sheets = getSheetsClient()
    const client = sb()

    if (clearFirst) {
      await client.from('kho_daily_records').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    }

    const results = []

    for (const person of persons) {
      const sheetName = `${person}_report`
      try {
        const resp = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${sheetName}'!A1:ZZ500`,
        })
        const values = (resp.data.values ?? []) as string[][]
        const records = parseSheetRows(values, person)

        if (records.length > 0) {
          const { error } = await client.from('kho_daily_records')
            .upsert(records, { onConflict: 'person_name,entry_date' })
          if (error) throw error
        }

        results.push({ person, status: 'ok', rows: records.length })
      } catch (e) {
        results.push({ person, status: 'error: ' + String(e) })
      }
    }

    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const person = req.nextUrl.searchParams.get('person') ?? 'Nick'
  const sheetName = `${person}_report`
  try {
    const sheets = getSheetsClient()
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1:ZZ500`,
    })
    const values = (resp.data.values ?? []) as string[][]
    const records = parseSheetRows(values, person)
    return NextResponse.json({ person, total: records.length, sample: records.slice(-10) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
