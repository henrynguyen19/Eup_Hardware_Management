import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const SPREADSHEET_ID = '1q3rgjEmoYDPjAu8m-jTaathrl4fsrzHvwqUWKtkZWvo'

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

// ─── Google Sheets helpers ────────────────────────────────────────────────────

function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Thieu GOOGLE_SERVICE_ACCOUNT_JSON')
  const credentials = JSON.parse(raw)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

function norm(s: string): string {
  return (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, ' ')
}

function colLetter(n: number): string {
  let result = ''; let idx = n
  while (idx >= 0) { result = String.fromCharCode(65 + (idx % 26)) + result; idx = Math.floor(idx / 26) - 1 }
  return result
}

interface Section { start: number; end: number }

function detectSections(header1: string[], totalCols: number): Record<string, Section> {
  const cols: { name: string; col: number }[] = []
  for (let c = 0; c < header1.length; c++) {
    const h = norm(header1[c] || '')
    if      (h.includes('up thanh pham'))                         cols.push({ name: 'thanh_pham', col: c })
    else if (h.includes('hang gui') || h.includes('van phong'))   cols.push({ name: 'hang_gui',   col: c })
    else if (h.includes('thu hoi') || h.includes('thiet bi loi')) cols.push({ name: 'thu_hoi',    col: c })
    else if (h.includes('other')   || h.includes('cong viec khac') ||
             h.includes('cac tb')  || h.includes('cac tbi'))      cols.push({ name: 'other',      col: c })
  }
  cols.sort((a, b) => a.col - b.col)
  const result: Record<string, Section> = {}
  for (let i = 0; i < cols.length; i++) {
    result[cols[i].name] = { start: cols[i].col, end: i + 1 < cols.length ? cols[i + 1].col : totalCols }
  }
  return result
}

function fillDeviceSection(row: string[], header2: string[], section: Section | undefined, devices: DeviceQty[]) {
  if (!section) return
  const { start, end } = section
  const namedCols: Record<string, number> = {}
  const overflowPairs: Array<[number, number]> = []
  for (let i = start; i < end; i++) {
    const hn = norm(header2[i] || '')
    if (!hn) continue
    if (hn.includes('ten thiet bi') || hn.includes('thiet bi khac')) {
      for (let j = i + 1; j < end; j++) {
        if (norm(header2[j] || '').includes('so luong')) { overflowPairs.push([i, j]); break }
      }
    } else if (!hn.includes('so luong') && !hn.includes('quantity')) {
      namedCols[hn] = i
    }
  }
  for (const col of Object.values(namedCols)) row[col] = ''
  for (const [nc, qc] of overflowPairs) { row[nc] = ''; row[qc] = '' }
  const overflow: DeviceQty[] = []
  for (const dv of devices) {
    const dn = norm(dv.device)
    if (namedCols[dn] !== undefined) row[namedCols[dn]] = String(dv.qty)
    else overflow.push(dv)
  }
  let pi = 0
  for (const dv of overflow) {
    if (pi >= overflowPairs.length) break
    const [nc, qc] = overflowPairs[pi++]
    row[nc] = dv.device; row[qc] = String(dv.qty)
  }
}

function fillThuHoiSection(row: string[], header2: string[], section: Section | undefined, items: ThuHoiItem[]) {
  if (!section) return
  const { start, end } = section
  const triplets: number[] = []
  for (let i = start; i < end - 2; i++) {
    const h = norm(header2[i] || '')
    if (h.includes('loai') || h === 'loai thu hoi') triplets.push(i)
  }
  for (const t of triplets) { row[t] = ''; if (t+1 < end) row[t+1] = ''; if (t+2 < end) row[t+2] = '' }
  for (let i = 0; i < items.length && i < triplets.length; i++) {
    const col = triplets[i]
    row[col] = items[i].loai || ''
    if (col+1 < end) row[col+1] = items[i].device || ''
    if (col+2 < end) row[col+2] = String(items[i].qty)
  }
}

function fillOtherSection(row: string[], header2: string[], section: Section | undefined, tasks: OtherTask[]) {
  if (!section) return
  const { start, end } = section

  // Build triplets by scanning header2: find each group of (cong viec, ten thiet bi, so luong)
  // The triplets may not be perfectly at col+1, col+2 — scan explicitly
  const triplets: Array<{ taskCol: number; deviceCol: number; qtyCol: number }> = []
  let i = start
  while (i < end) {
    const hn = norm(header2[i] || '')
    if (hn.includes('cong viec')) {
      // Find next device col and qty col within the next few columns
      let deviceCol = i + 1
      let qtyCol    = i + 2
      // Scan up to 4 cols ahead to find "ten thiet bi" and "so luong"
      for (let j = i + 1; j < Math.min(i + 5, end); j++) {
        const jn = norm(header2[j] || '')
        if (jn.includes('ten thiet bi') || jn.includes('thiet bi')) deviceCol = j
        else if (jn.includes('so luong') || jn.includes('quantity'))  qtyCol   = j
      }
      triplets.push({ taskCol: i, deviceCol, qtyCol })
      i = qtyCol + 1
    } else {
      i++
    }
  }

  // Clear all triplet columns first
  for (const { taskCol, deviceCol, qtyCol } of triplets) {
    row[taskCol]   = ''
    if (deviceCol < end) row[deviceCol] = ''
    if (qtyCol    < end) row[qtyCol]    = ''
  }

  // Write tasks into triplets
  for (let t = 0; t < tasks.length && t < triplets.length; t++) {
    const { taskCol, deviceCol, qtyCol } = triplets[t]
    row[taskCol] = tasks[t].task || ''
    if (deviceCol < end) row[deviceCol] = tasks[t].device || ''
    if (qtyCol    < end) row[qtyCol]    = tasks[t].qty > 0 ? String(tasks[t].qty) : ''
  }
}

async function writeToGoogleSheet(
  person_name: string, entry_date: string, week_label: string | null,
  thanh_pham_devices: DeviceQty[], hang_gui_vp_devices: DeviceQty[],
  thu_hoi_details: ThuHoiItem[], other_tasks: OtherTask[]
): Promise<{ ok: boolean; row?: number; action?: string; error?: string }> {
  try {
    const sheets = getSheetsClient()
    const sheetName = `${person_name}_report`
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1:ZZ600`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    })
    const values = (resp.data.values ?? []) as string[][]
    if (values.length < 2) return { ok: false, error: `Sheet "${sheetName}" khong tim thay` }

    const header1 = values[0] ?? []
    const header2 = values[1] ?? []
    const totalCols = Math.max(header1.length, header2.length)
    const sections = detectSections(header1, totalCols)

    const [yr, mo, dy] = entry_date.split('-')
    const dateStr = `${parseInt(dy)}/${parseInt(mo)}/${yr}`
    const normTarget = dateStr.split('/').map(p => String(parseInt(p))).join('/')

    let targetRowIdx = -1
    for (let ri = 2; ri < values.length; ri++) {
      const cellDate = String(values[ri][2] ?? '').trim()
      const normCell = cellDate.split('/').map(p => String(parseInt(p) || p)).join('/')
      if (normCell === normTarget) { targetRowIdx = ri; break }
    }

    const existingRow = targetRowIdx >= 0 ? [...(values[targetRowIdx] ?? [])] : []
    const writeRow: string[] = [...existingRow]
    while (writeRow.length < totalCols) writeRow.push('')
    if (week_label) writeRow[1] = week_label
    writeRow[2] = dateStr

    fillDeviceSection(writeRow, header2, sections['thanh_pham'], thanh_pham_devices)
    fillDeviceSection(writeRow, header2, sections['hang_gui'],   hang_gui_vp_devices)
    fillThuHoiSection(writeRow, header2, sections['thu_hoi'],    thu_hoi_details)
    fillOtherSection (writeRow, header2, sections['other'],      other_tasks)

    let targetGSheetRow: number
    if (targetRowIdx >= 0) {
      targetGSheetRow = targetRowIdx + 1
    } else {
      let lastDataRow = 2
      for (let ri = values.length - 1; ri >= 2; ri--) {
        if ((values[ri] ?? []).some(c => (c || '').toString().trim() !== '')) {
          lastDataRow = ri + 1; break
        }
      }
      targetGSheetRow = lastDataRow + 1
    }

    const endCol = colLetter(writeRow.length - 1)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A${targetGSheetRow}:${endCol}${targetGSheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [writeRow] },
    })

    return { ok: true, row: targetGSheetRow, action: targetRowIdx >= 0 ? 'updated' : 'appended' }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

// ─── POST /api/kho-daily/entry ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      person_name,
      entry_date,
      week_label,
      thanh_pham_devices  = [] as DeviceQty[],
      hang_gui_vp_devices = [] as DeviceQty[],
      xuat_kho_devices    = [] as DeviceQty[],
      thu_hoi_details     = [] as ThuHoiItem[],
      other_tasks         = [] as OtherTask[],
    } = body

    if (!person_name || !entry_date) {
      return NextResponse.json({ error: 'Thieu person_name hoac entry_date' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) {
      return NextResponse.json({ error: 'entry_date phai co dang YYYY-MM-DD' }, { status: 400 })
    }

    const thanh_pham_total  = (thanh_pham_devices  as DeviceQty[]).reduce((s, x) => s + (x.qty || 0), 0)
    const hang_gui_vp_total = (hang_gui_vp_devices as DeviceQty[]).reduce((s, x) => s + (x.qty || 0), 0)
    const xuat_kho_total    = (xuat_kho_devices    as DeviceQty[]).reduce((s, x) => s + (x.qty || 0), 0)
    const thu_hoi_total     = (thu_hoi_details     as ThuHoiItem[]).reduce((s, x) => s + (x.qty || 0), 0)
    const other_total       = (other_tasks         as OtherTask[]).reduce((s, x) => s + (x.qty || 0), 0)

    const record = {
      person_name, entry_date, week_label: week_label || null,
      thanh_pham_devices, hang_gui_vp_devices, xuat_kho_devices,
      thu_hoi_details, other_tasks,
      thanh_pham_total, hang_gui_vp_total, xuat_kho_total, thu_hoi_total, other_total,
      updated_at: new Date().toISOString(),
    }

    // 1. Ghi vao Supabase DB
    const client = sb()
    const { error: dbError } = await client
      .from('kho_daily_records')
      .upsert(record, { onConflict: 'person_name,entry_date' })

    if (dbError) {
      return NextResponse.json({ error: errMsg(dbError) }, { status: 500 })
    }

    // 2. Ghi dong thoi len Google Sheet
    const sheetResult = await writeToGoogleSheet(
      person_name, entry_date, week_label || null,
      thanh_pham_devices, hang_gui_vp_devices, thu_hoi_details, other_tasks
    )

    return NextResponse.json({
      ok: true,
      totals: { thanh_pham_total, hang_gui_vp_total, xuat_kho_total, thu_hoi_total, other_total },
      sheet: sheetResult,
    })
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 })
  }
}
