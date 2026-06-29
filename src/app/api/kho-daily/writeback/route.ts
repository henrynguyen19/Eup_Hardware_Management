import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

const SPREADSHEET_ID = '1q3rgjEmoYDPjAu8m-jTaathrl4fsrzHvwqUWKtkZWvo'

interface DeviceQty  { device: string; qty: number }
interface ThuHoiItem { loai: string; device: string; qty: number }
interface OtherTask  { task: string; device: string; qty: number }

function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Thiếu GOOGLE_SERVICE_ACCOUNT_JSON')
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
  let result = ''
  let idx = n
  while (idx >= 0) {
    result = String.fromCharCode(65 + (idx % 26)) + result
    idx = Math.floor(idx / 26) - 1
  }
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
    const end = i + 1 < cols.length ? cols[i + 1].col : totalCols
    result[cols[i].name] = { start: cols[i].col, end }
  }
  return result
}

function fillDeviceSection(
  row: string[], header2: string[], section: Section | undefined, devices: DeviceQty[]
) {
  if (!section) return
  const { start, end } = section

  // Map named device cols + collect overflow "Tên thiết bị khác" pairs
  const namedCols: Record<string, number> = {}
  const overflowPairs: [number, number][] = []

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

  // Clear section
  for (const col of Object.values(namedCols)) row[col] = ''
  for (const [nc, qc] of overflowPairs) { row[nc] = ''; row[qc] = '' }

  const overflow: DeviceQty[] = []
  for (const dv of devices) {
    const dn = norm(dv.device)
    if (namedCols[dn] !== undefined) {
      row[namedCols[dn]] = String(dv.qty)
    } else {
      overflow.push(dv)
    }
  }

  let pi = 0
  for (const dv of overflow) {
    if (pi >= overflowPairs.length) break
    const [nc, qc] = overflowPairs[pi++]
    row[nc] = dv.device
    row[qc] = String(dv.qty)
  }
}

function fillThuHoiSection(
  row: string[], header2: string[], section: Section | undefined, items: ThuHoiItem[]
) {
  if (!section) return
  const { start, end } = section

  const triplets: number[] = []
  for (let i = start; i < end - 2; i++) {
    const h = norm(header2[i] || '')
    if (h.includes('loai') || h === 'loai thu hoi') triplets.push(i)
  }

  for (const t of triplets) {
    row[t] = ''
    if (t + 1 < end) row[t + 1] = ''
    if (t + 2 < end) row[t + 2] = ''
  }

  for (let i = 0; i < items.length && i < triplets.length; i++) {
    const col = triplets[i]
    row[col] = items[i].loai || ''
    if (col + 1 < end) row[col + 1] = items[i].device || ''
    if (col + 2 < end) row[col + 2] = String(items[i].qty)
  }
}

function fillOtherSection(
  row: string[], header2: string[], section: Section | undefined, tasks: OtherTask[]
) {
  if (!section) return
  const { start, end } = section

  const cvCols: number[] = []
  for (let i = start; i < end; i++) {
    if (norm(header2[i] || '').includes('cong viec')) cvCols.push(i)
  }

  for (const c of cvCols) {
    row[c] = ''
    if (c + 1 < end) row[c + 1] = ''
    if (c + 2 < end) row[c + 2] = ''
  }

  for (let i = 0; i < tasks.length && i < cvCols.length; i++) {
    const col = cvCols[i]
    row[col] = tasks[i].task || ''
    if (col + 1 < end) row[col + 1] = tasks[i].device || ''
    if (col + 2 < end) row[col + 2] = tasks[i].qty > 0 ? String(tasks[i].qty) : ''
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const adminSb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: permData } = await adminSb
      .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
    const perms: string[] = permData?.permissions ?? []
    if (!perms.includes('kho_daily:write') && !perms.includes('admin:users')) {
      return NextResponse.json({ error: 'Không có quyền ghi' }, { status: 403 })
    }

    const body = await req.json() as {
      person_name: string
      entry_date: string
      week_label?: string
      thanh_pham_devices: DeviceQty[]
      hang_gui_vp_devices: DeviceQty[]
      thu_hoi_details: ThuHoiItem[]
      other_tasks: OtherTask[]
    }

    if (!body.person_name || !body.entry_date) {
      return NextResponse.json({ error: 'Thiếu person_name hoặc entry_date' }, { status: 400 })
    }

    const sheets = getSheetsClient()
    const sheetName = `${body.person_name}_report`

    // Read the full sheet
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${sheetName}'!A1:ZZ600`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    })
    const values = (resp.data.values ?? []) as string[][]

    if (values.length < 2) {
      return NextResponse.json({ error: `Sheet "${sheetName}" không tìm thấy hoặc trống` }, { status: 404 })
    }

    const header1 = values[0] ?? []
    const header2 = values[1] ?? []
    const totalCols = Math.max(header1.length, header2.length)

    const sections = detectSections(header1, totalCols)

    // Find target row by date (col index 2 = column C)
    const [yr, mo, dy] = body.entry_date.split('-')
    const dateStr = `${parseInt(dy)}/${parseInt(mo)}/${yr}`

    let targetRowIdx = -1
    for (let ri = 2; ri < values.length; ri++) {
      const cellDate = String(values[ri][2] ?? '').trim()
      const normCell   = cellDate.split('/').map(p => String(parseInt(p) || p)).join('/')
      const normTarget = dateStr.split('/').map(p => String(parseInt(p))).join('/')
      if (normCell === normTarget) { targetRowIdx = ri; break }
    }

    // Build the write row
    const existingRow = targetRowIdx >= 0 ? [...(values[targetRowIdx] ?? [])] : []
    const writeRow: string[] = [...existingRow]
    while (writeRow.length < totalCols) writeRow.push('')

    if (body.week_label) writeRow[1] = body.week_label
    writeRow[2] = dateStr

    fillDeviceSection(writeRow, header2, sections['thanh_pham'], body.thanh_pham_devices)
    fillDeviceSection(writeRow, header2, sections['hang_gui'],   body.hang_gui_vp_devices)
    fillThuHoiSection(writeRow, header2, sections['thu_hoi'],    body.thu_hoi_details)
    fillOtherSection (writeRow, header2, sections['other'],      body.other_tasks)

    // Determine row number (1-indexed for Sheets API)
    let targetGSheetRow: number
    if (targetRowIdx >= 0) {
      targetGSheetRow = targetRowIdx + 1
    } else {
      // Find last non-empty data row then append after it
      let lastDataRow = 2
      for (let ri = values.length - 1; ri >= 2; ri--) {
        if ((values[ri] ?? []).some(c => (c || '').toString().trim() !== '')) {
          lastDataRow = ri + 1
          break
        }
      }
      targetGSheetRow = lastDataRow + 1
    }

    const endCol = colLetter(writeRow.length - 1)
    const range = `'${sheetName}'!A${targetGSheetRow}:${endCol}${targetGSheetRow}`

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [writeRow] },
    })

    return NextResponse.json({
      ok: true,
      sheet: sheetName,
      row: targetGSheetRow,
      action: targetRowIdx >= 0 ? 'updated' : 'appended',
      date: dateStr,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
