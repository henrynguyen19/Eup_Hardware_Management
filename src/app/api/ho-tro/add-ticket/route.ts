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
    month = parseInt(parts[1])  // parts[1] = tháng (06), không phải parts[2] = ngày (17)
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

// Write rows to a single tab, inserting each date group after its date-header row
async function writeToTab(
  sheets: Sheets,
  spreadsheetId: string,
  tabName: string,
  rowsByDate: Map<string, ParsedRow[]>   // "15/06/2026" → rows
): Promise<string> {

  // 1. Get sheetId (numeric) for batchUpdate
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  })
  const sheetMeta = meta.data.sheets?.find(
    s => s.properties?.title === tabName
  )
  if (!sheetMeta) throw new Error(`Tab "${tabName}" không tìm thấy`)
  const sheetId = sheetMeta.properties!.sheetId!

  // 2. Read col A (all date-header rows and data rows)
  const aResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(tabName)}!A:A`,
  })
  const colA: string[] = (aResp.data.values ?? []).map(
    (r: (string | undefined)[]) => (r[0] ?? '').toString().trim()
  )

  // 3. For each date, find the 0-indexed row where we should insert
  //    = the row just before the NEXT date-header (or end of sheet if none)
  const insertPlan: { insertAt0: number; count: number; rows: ParsedRow[] }[] = []

  for (const [dateFmt, dateRows] of rowsByDate) {
    let dateRowIdx = -1
    for (let i = 0; i < colA.length; i++) {
      if (colA[i] === dateFmt) { dateRowIdx = i; break }
    }

    let insertAt0: number
    if (dateRowIdx === -1) {
      // Date header not found → append to end
      insertAt0 = colA.length
    } else {
      // Insert immediately after the date-header row
      insertAt0 = dateRowIdx + 1
    }

    insertPlan.push({ insertAt0, count: dateRows.length, rows: dateRows })
  }

  // 4. Sort bottom-to-top so earlier insertions don't shift later positions
  insertPlan.sort((a, b) => b.insertAt0 - a.insertAt0)

  // 5. Build batchUpdate insert requests (all in one call)
  const insertRequests = insertPlan.map(({ insertAt0, count }) => ({
    insertDimension: {
      range: {
        sheetId,
        dimension: 'ROWS' as const,
        startIndex: insertAt0,
        endIndex: insertAt0 + count,
      },
      inheritFromBefore: false,  // false = inherit from row below (normal data row), not date header
    },
  }))

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: insertRequests },
  })

  // 6. Write values to the newly inserted rows
  //    (bottom-to-top order means positions are still valid)
  for (const { insertAt0, count, rows } of insertPlan) {
    const startRow1 = insertAt0 + 1  // 1-indexed
    const endRow1   = insertAt0 + count
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${q(tabName)}!A${startRow1}:S${endRow1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows.map(rowToValues) },
    })
  }

  const total = [...rowsByDate.values()].reduce((s, r) => s + r.length, 0)
  return `${total} dòng`
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
  type TabMap  = Map<string, Map<string, ParsedRow[]>>
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
