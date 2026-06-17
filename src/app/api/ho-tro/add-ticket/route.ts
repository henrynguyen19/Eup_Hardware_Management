import { NextRequest, NextResponse } from 'next/server'
import { google, sheets_v4 } from 'googleapis'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { STAFF_SHEETS } from '@/lib/staff-sheets'

type Sheets = sheets_v4.Sheets

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

function getSheetsClient(): Sheets {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) throw new Error('Missing Google Service Account credentials')
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

// "2026-06-15" or "15/06/2026" → "15/06/2026"
function toSheetDate(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }
  return dateStr
}

// "tháng M/YY" from date string
function sheetTabFromDate(dateStr: string): string {
  let month = 0, yearShort = ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split('-')
    yearShort = parts[0].slice(2)
    month = parseInt(parts[1])
  } else if (dateStr.includes('/')) {
    const p = dateStr.split('/')
    month = parseInt(p[1]); yearShort = (p[2] ?? '').slice(2)
  }
  if (!month || !yearShort) return 'tháng 6/26'
  return `tháng ${month}/${yearShort}`
}

// Quote tab name for Sheets range notation
function q(tab: string) { return `'${tab.replace(/'/g, "\\'")}'` }

interface ParsedRow {
  code: string; sos: string; company: string; date: string
  contact: string; type: string; salesAlias: string; direction: string
  content: string; reply: string; status: string; assignee: string
  salesMan: string; assistant: string; startPoint: string; endPoint: string
  licensePlate: string; col17: string; attachment: string; raw: string[]
}

function rowToValues(r: ParsedRow): string[] {
  return [
    r.code, r.sos, r.company, r.date, r.contact,
    r.type || 'Xử lý vấn đề', r.salesAlias, r.direction,
    r.content, r.reply, r.status, r.assignee,
    r.salesMan, r.assistant, r.startPoint, r.endPoint,
    r.licensePlate, r.col17, r.attachment,
  ]
}

const DATE_CELL_RE = /^\d{2}\/\d{2}\/\d{4}$/

// Write rows into pre-existing empty rows after each date header.
// DOES NOT insert new rows — finds existing empty rows (col A empty) and fills them.
async function writeToTab(
  sheets: Sheets,
  spreadsheetId: string,
  tabName: string,
  rowsByDate: Map<string, ParsedRow[]>   // "15/06/2026" → rows
): Promise<string> {

  // Check tab exists
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  })
  const sheetMeta = meta.data.sheets?.find(s => s.properties?.title === tabName)
  if (!sheetMeta) throw new Error(`Tab "${tabName}" không tìm thấy`)

  // Read col A and col C to identify:
  //   - date-header rows: colA matches DD/MM/YYYY
  //   - occupied data rows: colA is non-empty (has ticket code) OR colC is non-empty (has company)
  //   - available rows: both colA and colC are empty
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(tabName)}!A:C`,
    valueRenderOption: 'FORMATTED_VALUE',
  })
  type Cell = string
  const grid: Cell[][] = (resp.data.values ?? []).map((r: Cell[]) => [
    (r[0] ?? '').toString().trim(),  // A = ticket code / date header
    (r[1] ?? '').toString().trim(),  // B = SOS
    (r[2] ?? '').toString().trim(),  // C = company name
  ])

  const results: string[] = []
  const errors:  string[] = []

  // Build one batchUpdate with all value writes
  const valueRanges: { range: string; values: string[][] }[] = []

  for (const [dateFmt, dateRows] of rowsByDate) {
    // Find the date-header row
    let dateRowIdx = -1
    for (let i = 0; i < grid.length; i++) {
      if (grid[i][0] === dateFmt) { dateRowIdx = i; break }
    }

    if (dateRowIdx === -1) {
      errors.push(`Không tìm thấy hàng ngày ${dateFmt} trong tab`)
      continue
    }

    // Collect consecutive available rows (col A empty AND col C empty) after the date header
    const availableRows: number[] = []
    for (let i = dateRowIdx + 1; i < grid.length; i++) {
      const colA = grid[i][0]
      const colC = grid[i][2]
      // Stop scanning when we hit the next date-header row
      if (DATE_CELL_RE.test(colA)) break
      // A row is available if it has no data in col A and col C
      if (!colA && !colC) {
        availableRows.push(i)  // 0-indexed
        if (availableRows.length >= dateRows.length) break
      }
    }

    if (availableRows.length === 0) {
      errors.push(`Không còn hàng trống cho ngày ${dateFmt}`)
      continue
    }

    const rowsToWrite = dateRows.slice(0, availableRows.length)
    if (rowsToWrite.length < dateRows.length) {
      errors.push(`Chỉ ghi được ${rowsToWrite.length}/${dateRows.length} dòng cho ngày ${dateFmt} (không đủ hàng trống)`)
    }

    // Each available row gets one record (individual update per row since they may not be contiguous)
    for (let i = 0; i < rowsToWrite.length; i++) {
      const row1 = availableRows[i] + 1  // convert to 1-indexed
      valueRanges.push({
        range: `${q(tabName)}!A${row1}:S${row1}`,
        values: [rowToValues(rowsToWrite[i])],
      })
    }

    results.push(`${dateFmt}: ${rowsToWrite.length} dòng (hàng ${availableRows.map(r => r + 1).join(', ')})`)
  }

  if (valueRanges.length > 0) {
    // Write all rows in one API call via batchUpdate
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: valueRanges,
      },
    })
  }

  if (errors.length > 0 && results.length === 0) throw new Error(errors.join('; '))

  const total = valueRanges.length
  const msg   = `${total} dòng${errors.length ? ` (⚠ ${errors.join('; ')})` : ''}`
  return msg
}

export async function POST(req: NextRequest) {
  // Auth
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: permData } = await adminClient()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()
  const perms: string[] = permData?.permissions ?? []
  const hasAccess =
    perms.includes('ho_tro:write') ||
    perms.includes('ho_tro:read') ||
    perms.includes('admin:users')
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { rows: ParsedRow[] }
  const rows = body.rows ?? []
  if (!rows.length) return NextResponse.json({ error: 'Không có dòng dữ liệu' }, { status: 400 })

  // Group: assignee → tabName → dateFormatted → rows[]
  type TabMap = Map<string, Map<string, ParsedRow[]>>
  const byStaff = new Map<string, TabMap>()

  for (const row of rows) {
    const name = row.assignee?.trim()
    if (!name) continue
    const staff = STAFF_SHEETS.find(s => s.name.toLowerCase() === name.toLowerCase())
    if (!staff) continue

    const tab     = sheetTabFromDate(row.date)
    const dateFmt = toSheetDate(row.date)

    if (!byStaff.has(staff.name)) byStaff.set(staff.name, new Map())
    const tabMap = byStaff.get(staff.name)!
    if (!tabMap.has(tab)) tabMap.set(tab, new Map())
    const dateMap = tabMap.get(tab)!
    if (!dateMap.has(dateFmt)) dateMap.set(dateFmt, [])
    dateMap.get(dateFmt)!.push(row)
  }

  const sheets  = getSheetsClient()
  const results: string[] = []
  const errors:  string[] = []

  for (const [staffName, tabMap] of byStaff) {
    const staff = STAFF_SHEETS.find(s => s.name === staffName)!
    for (const [tab, dateMap] of tabMap) {
      try {
        const summary = await writeToTab(sheets, staff.sheetId, tab, dateMap)
        results.push(`${staffName}/${tab}: ${summary}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${staffName}/${tab}: ${msg}`)
      }
    }
  }

  const totalWritten = rows.filter(r =>
    STAFF_SHEETS.some(s => s.name.toLowerCase() === r.assignee?.toLowerCase())
  ).length

  return NextResponse.json({
    success: errors.length === 0,
    message: `Đã ghi ${totalWritten} dòng → ${results.join(', ')}${errors.length ? ` | Lỗi: ${errors.join(', ')}` : ''}`,
    results,
    errors,
  })
}
