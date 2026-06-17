import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { STAFF_SHEETS } from '@/lib/staff-sheets'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) throw new Error('Missing Google Service Account credentials')
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

// Get sheet tab name: "tháng M/YY" derived from the date column (col D)
// Accepts formats: "2026-06-17" or "17/06/2026"
function sheetTabFromDate(dateStr: string): string {
  let month = 0, yearShort = ''
  if (dateStr.includes('-')) {
    const [y, m] = dateStr.split('-')
    month = parseInt(m)
    yearShort = y.slice(2)
  } else if (dateStr.includes('/')) {
    const parts = dateStr.split('/')
    // could be DD/MM/YYYY or MM/DD/YYYY — assume DD/MM/YYYY (Vietnamese)
    month = parseInt(parts[1])
    yearShort = parts[2]?.slice(2) ?? ''
  }
  if (!month || !yearShort) return 'tháng 6/26' // fallback
  return `tháng ${month}/${yearShort}`
}

interface ParsedRow {
  code:       string
  company:    string
  date:       string
  contact:    string
  type:       string
  salesAlias: string
  direction:  string
  content:    string
  reply:      string
  status:     string
  assignee:   string
  salesMan:   string
  assistant:  string
  raw:        string[]
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
  const hasAccess = perms.includes('ho_tro:write') || perms.includes('ho_tro:read') || perms.includes('admin:users')
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { rows: ParsedRow[] }
  const rows = body.rows ?? []
  if (!rows.length) return NextResponse.json({ error: 'Không có dòng dữ liệu' }, { status: 400 })

  // Group rows by assignee
  const byAssignee = new Map<string, ParsedRow[]>()
  for (const row of rows) {
    const name = row.assignee?.trim()
    if (!name) continue
    if (!byAssignee.has(name)) byAssignee.set(name, [])
    byAssignee.get(name)!.push(row)
  }

  const sheets  = getSheetsClient()
  const results: string[] = []
  const errors:  string[] = []

  for (const [assignee, assigneeRows] of byAssignee) {
    const staff = STAFF_SHEETS.find(s => s.name.toLowerCase() === assignee.toLowerCase())
    if (!staff) {
      errors.push(`Không tìm thấy sheet cho: ${assignee}`)
      continue
    }

    // Group this assignee's rows by sheet tab (different dates → different tabs)
    const byTab = new Map<string, ParsedRow[]>()
    for (const row of assigneeRows) {
      const tab = sheetTabFromDate(row.date)
      if (!byTab.has(tab)) byTab.set(tab, [])
      byTab.get(tab)!.push(row)
    }

    for (const [tab, tabRows] of byTab) {
      // Build values array — each row is columns A through at least Q
      // Matching the existing sheet structure:
      // A=code, B=blank, C=company, D=date, E=contact, F=type, G=salesAlias,
      // H=direction, I=content, J=reply, K=status, L=assignee, M=salesMan,
      // N=assistant, O=blank, P=blank, Q=company (repeated)
      const values = tabRows.map(r => [
        r.code,
        '',
        r.company,
        r.date,
        r.contact,
        r.type || 'Xử lý vấn đề',
        r.salesAlias,
        r.direction,
        r.content,
        r.reply,
        r.status,
        r.assignee,
        r.salesMan,
        r.assistant,
        '',
        '',
        r.company,
      ])

      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId:   staff.sheetId,
          range:           `${tab}!A:Q`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values },
        })
        results.push(`${assignee}/${tab}: ${tabRows.length} dòng`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${assignee}/${tab}: ${msg}`)
      }
    }
  }

  const totalWritten = rows.filter(r => {
    const staff = STAFF_SHEETS.find(s => s.name.toLowerCase() === r.assignee?.toLowerCase())
    return !!staff
  }).length

  return NextResponse.json({
    success: errors.length === 0,
    message: `Đã ghi ${totalWritten} dòng → ${results.join(', ')}${errors.length ? ` | Lỗi: ${errors.join(', ')}` : ''}`,
    results,
    errors,
  })
}
