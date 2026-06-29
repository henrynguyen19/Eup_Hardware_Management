import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const SPREADSHEET_ID = '1q3rgjEmoYDPjAu8m-jTaathrl4fsrzHvwqUWKtkZWvo'
const PERSONS = ['Kai', 'Thor', 'Nick', 'Bop', 'Peter']

function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Thieu GOOGLE_SERVICE_ACCOUNT_JSON')
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

function errMsg(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    if (o.message) return String(o.message)
    if (o.details) return `${o.code}: ${o.details}`
    return JSON.stringify(e)
  }
  return String(e)
}

interface DeviceQty  { device: string; qty: number }
interface ThuHoiItem { loai: string; device: string; qty: number }
interface OtherTask  { task: string; device: string; qty: number }

function norm(s: string): string {
  return (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, ' ')
}

function parseDeviceSection(
  header2: string[], row: string[], start: number, end: number
): DeviceQty[] {
  const result: DeviceQty[] = []
  let i = start
  while (i < end) {
    const h  = (header2[i] || '').trim()
    const hn = norm(h)
    if (!h) { i++; continue }
    if (hn.includes('ten thiet bi') || hn.includes('thiet bi khac') ||
        (hn.includes('other') && hn.includes('tb'))) {
      const deviceName = (row[i] || '').trim()
      const qty = parseInt((row[i + 1] || '').replace(/,/g, '').trim()) || 0
      if (deviceName && qty > 0 && qty < 50000) result.push({ device: deviceName, qty })
      i += 2
      continue
    }
    if (hn.includes('so luong') || hn === 'quantity') { i++; continue }
    const qty = parseInt((row[i] || '').replace(/,/g, '').trim()) || 0
    if (qty > 0 && qty < 50000) result.push({ device: h, qty })
    i++
  }
  return result
}

function parseThuHoi(
  header2: string[], row: string[], start: number, end: number
): ThuHoiItem[] {
  const result: ThuHoiItem[] = []
  let i = start
  while (i < end) {
    const h  = (header2[i] || '').trim()
    const hn = norm(h)
    if (!h) { i++; continue }
    if (hn.includes('loai') && (hn.includes('thu hoi') || hn === 'loai')) {
      const loai   = (row[i]     || '').trim()
      const device = (row[i + 1] || '').trim()
      const qty    = parseInt((row[i + 2] || '').replace(/,/g, '').trim()) || 0
      if ((loai || device) && qty > 0) result.push({ loai, device, qty })
      i += 3
      continue
    }
    if (hn.includes('ten thiet bi') || hn.includes('thiet bi khac') ||
        hn.includes('so luong')) { i++; continue }
    const qty = parseInt((row[i] || '').replace(/,/g, '').trim()) || 0
    if (qty > 0 && qty < 50000) result.push({ loai: 'Dung duoc', device: h, qty })
    i++
  }
  return result
}

function parseOther(
  header2: string[], row: string[], start: number, end: number
): OtherTask[] {
  const result: OtherTask[] = []
  let i = start
  while (i < end) {
    const h  = (header2[i] || '').trim()
    const hn = norm(h)
    if (!h) { i++; continue }
    if (hn.includes('cong viec')) {
      const task      = (row[i] || '').trim()
      const deviceCol = i + 1
      let qtyCol = i + 2
      if (qtyCol < end && !norm(header2[qtyCol] || '').includes('so luong')) {
        if (qtyCol + 1 < end) qtyCol++
      }
      const device = deviceCol < end ? (row[deviceCol] || '').trim() : ''
      const qty    = qtyCol   < end ? (parseInt((row[qtyCol] || '').replace(/,/g, '').trim()) || 0) : 0
      if (task && qty > 0) result.push({ task, device, qty })
      i = qtyCol + 1
      continue
    }
    if (hn.includes('ten thiet bi') || hn.includes('thiet bi') ||
        hn.includes('so luong')) { i++; continue }
    i++
  }
  return result
}

function parseSheetRows(values: string[][], personName: string) {
  if (values.length < 3) return []
  const header1 = values[0] ?? []
  const header2 = values[1] ?? []

  let thanhPhamStart = -1
  let hangGuiStart   = -1
  let thuHoiStart    = -1
  let otherStart     = -1
  let stopCol        = header1.length

  for (let c = 0; c < header1.length; c++) {
    const h = norm(header1[c] || '')
    if      (h.includes('up thanh pham')                           && thanhPhamStart === -1) thanhPhamStart = c
    else if ((h.includes('hang gui') || h.includes('van phong'))   && hangGuiStart   === -1) hangGuiStart   = c
    else if ((h.includes('thu hoi') || h.includes('thiet bi loi')) && thuHoiStart    === -1) thuHoiStart    = c
    else if ((h.includes('other') || h.includes('cac tbi') ||
              h.includes('cac tb') || h.includes('cong viec khac'))&& otherStart     === -1) otherStart     = c
    if (c > 5 && /^\d+$/.test((header1[c] || '').trim())) { stopCol = c; break }
  }

  if (thanhPhamStart === -1) thanhPhamStart = 3

  const rawSections = [
    { name: 'thanh_pham', col: thanhPhamStart },
    { name: 'hang_gui',   col: hangGuiStart   },
    { name: 'thu_hoi',    col: thuHoiStart     },
    { name: 'other',      col: otherStart      },
  ].filter(s => s.col >= 0).sort((a, b) => a.col - b.col)

  const sections = rawSections.map((s, idx) => ({
    name:  s.name,
    start: s.col,
    end:   idx + 1 < rawSections.length ? rawSections[idx + 1].col : stopCol,
  }))

  const seen = new Map<string, object>()

  for (let ri = 2; ri < values.length; ri++) {
    const row = values[ri] ?? []
    const dateRaw = (row[2] || '').trim()
    if (!dateRaw.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) continue

    const parts = dateRaw.split('/')
    const entryDate = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
    const weekLabel = (row[1] || '').trim()

    let thanhPhamDevices: DeviceQty[]  = []
    let hangGuiDevices:   DeviceQty[]  = []
    let xuatKhoDevices:   DeviceQty[]  = []
    let thuHoiDetails:    ThuHoiItem[] = []
    let otherTasks:       OtherTask[]  = []

    for (const sec of sections) {
      if      (sec.name === 'thanh_pham') thanhPhamDevices = parseDeviceSection(header2, row, sec.start, sec.end)
      else if (sec.name === 'hang_gui')   hangGuiDevices   = parseDeviceSection(header2, row, sec.start, sec.end)
      else if (sec.name === 'thu_hoi')    thuHoiDetails    = parseThuHoi       (header2, row, sec.start, sec.end)
      else if (sec.name === 'other')      otherTasks       = parseOther        (header2, row, sec.start, sec.end)
    }

    const thanhPhamTotal = thanhPhamDevices.reduce((s, x) => s + x.qty, 0)
    const hangGuiTotal   = hangGuiDevices.reduce  ((s, x) => s + x.qty, 0)
    const xuatKhoTotal   = xuatKhoDevices.reduce  ((s, x) => s + x.qty, 0)
    const thuHoiTotal    = thuHoiDetails.reduce   ((s, x) => s + x.qty, 0)
    const otherTotal     = otherTasks.reduce      ((s, x) => s + x.qty, 0)

    if (thanhPhamTotal + hangGuiTotal + xuatKhoTotal + thuHoiTotal + otherTotal === 0) continue

    seen.set(entryDate, {
      person_name:         personName,
      entry_date:          entryDate,
      week_label:          weekLabel || null,
      thanh_pham_devices:  thanhPhamDevices,
      hang_gui_vp_devices: hangGuiDevices,
      xuat_kho_devices:    xuatKhoDevices,
      thu_hoi_details:     thuHoiDetails,
      other_tasks:         otherTasks,
      thanh_pham_total:    thanhPhamTotal,
      hang_gui_vp_total:   hangGuiTotal,
      xuat_kho_total:      xuatKhoTotal,
      thu_hoi_total:       thuHoiTotal,
      other_total:         otherTotal,
      updated_at:          new Date().toISOString(),
    })
  }

  return Array.from(seen.values())
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const persons: string[]    = body.persons    ?? PERSONS
    const clearFirst: boolean  = body.clear_first ?? false

    const sheets = getSheetsClient()
    const client = sb()

    if (clearFirst) {
      await client.from('kho_daily_records')
        .delete().neq('id', '00000000-0000-0000-0000-000000000000')
    }

    const results = []

    for (const person of persons) {
      const sheetName = `${person}_report`
      try {
        const resp = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `'${sheetName}'!A1:ZZ600`,
        })
        const values  = (resp.data.values ?? []) as string[][]
        const records = parseSheetRows(values, person)

        let inserted = 0
        const errors: string[] = []

        for (let i = 0; i < records.length; i += 50) {
          const batch = records.slice(i, i + 50)
          const { error } = await client.from('kho_daily_records')
            .upsert(batch, { onConflict: 'person_name,entry_date' })
          if (error) errors.push(errMsg(error))
          else inserted += batch.length
        }

        results.push({ person, status: errors.length === 0 ? 'ok' : 'partial', rows: inserted, errors })
      } catch (e) {
        results.push({ person, status: 'error', rows: 0, errors: [errMsg(e)] })
      }
    }

    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const person    = req.nextUrl.searchParams.get('person') ?? 'Nick'
  const sheetName = `${person}_report`
  try {
    const sheets = getSheetsClient()
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1:ZZ600`,
    })
    const values  = (resp.data.values ?? []) as string[][]
    const records = parseSheetRows(values, person)
    return NextResponse.json({ person, total: records.length, sample: records.slice(-5) })
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 })
  }
}
