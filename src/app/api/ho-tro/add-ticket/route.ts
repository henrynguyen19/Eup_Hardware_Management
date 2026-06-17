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

// Build Google Sheets auth from Service Account env vars
function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

// Construct the "Reply" hashtag string from form data
function buildHashtag(data: TicketInput): string {
  const parts: string[] = []

  // Category
  if (data.category) parts.push(`#${data.category}`)

  // Devices
  for (const d of data.devices ?? []) {
    parts.push(`#${d.toLowerCase().replace(/\s+/g, '')}`)
  }

  // Error types
  for (const e of data.errors ?? []) {
    parts.push(`#${e.toLowerCase()}`)
  }

  // Handler name (lowercase, no #)
  if (data.assignee) parts.push(data.assignee.toLowerCase())

  // Date DD/M
  if (data.date) {
    const [y, m, d] = data.date.split('-')
    parts.push(`${parseInt(d)}/${parseInt(m)}`)
  }

  // Flag (#F / #N / #L)
  if (data.flag) parts.push(`#${data.flag}`)

  // Vehicle plate
  if (data.licensePlate?.trim()) parts.push(data.licensePlate.trim())

  // Free-text notes
  if (data.notes?.trim()) parts.push(data.notes.trim())

  return parts.join(' ')
}

export interface TicketInput {
  // CRM fields
  code:         string   // ticket ID
  company:      string
  date:         string   // YYYY-MM-DD
  contactPerson: string
  requestType:  string
  salesAlias:   string   // trợ lý alias (Alice, Clara, Soda…)
  direction:    'Vào' | 'Ra'
  content:      string
  status:       string
  assignee:     string   // Kane / Stefan / Shiro / Irene / Blue
  salesMan:     string
  assistant:    string

  // Hashtag fields (auto-construct Reply column)
  category:     string   // hardware / fuelsensor / arrowware
  devices:      string[]
  errors:       string[]
  flag:         string   // F / N / L
  licensePlate: string
  notes:        string

  // Optional extra
  km?:          string
  startPoint?:  string
  endPoint?:    string
}

export async function POST(req: NextRequest) {
  // Auth check
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

  const body: TicketInput = await req.json()

  // Find target sheet
  const staff = STAFF_SHEETS.find(s => s.name.toLowerCase() === body.assignee.toLowerCase())
  if (!staff) {
    return NextResponse.json({ error: `Không tìm thấy nhân viên: ${body.assignee}` }, { status: 400 })
  }

  // Build sheet tab name: "tháng M/YY"
  const [year, month] = body.date.split('-')
  const yearShort = year.slice(2)
  const sheetTab  = `tháng ${parseInt(month)}/${yearShort}`

  // Build the reply/hashtag column
  const replyText = buildHashtag(body)

  // Row to append — match the CRM column order:
  // A: code, B: blank, C: company, D: date (DD/MM/YYYY), E: contact, F: type,
  // G: salesAlias, H: direction, I: content, J: reply, K: status,
  // L: assignee (cap), M: salesMan, N: assistant, O-P: blank, Q: company repeat
  const [y, mo, d] = body.date.split('-')
  const dateDisplay = `${d}/${mo}/${y}` // DD/MM/YYYY

  const row = [
    body.code,
    '',
    body.company,
    dateDisplay,
    body.contactPerson,
    body.requestType || 'Xử lý vấn đề',
    body.salesAlias,
    body.direction,
    body.content,
    replyText,
    body.status || 'Unprocessing',
    body.assignee,
    body.salesMan,
    body.assistant,
    '',
    '',
    body.company,
    body.licensePlate || '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    body.km || '',
    body.startPoint || '',
    body.endPoint || '',
  ]

  try {
    const sheets = getSheetsClient()

    await sheets.spreadsheets.values.append({
      spreadsheetId: staff.sheetId,
      range:         `${sheetTab}!A:AD`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })

    return NextResponse.json({
      success: true,
      message: `Đã ghi vào sheet của ${staff.name}: ${sheetTab}`,
      replyText,
    })
  } catch (err: unknown) {
    console.error('[add-ticket]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
