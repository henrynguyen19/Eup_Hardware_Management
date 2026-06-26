/**
 * POST /api/jira/sync-duedate
 * Lấy due date từ Jira và ghi ngược lại cột M của Google Sheet.
 * Chỉ ghi khi cột M đang trống (hoặc overwrite=true trong body).
 * Yêu cầu admin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export const runtime     = 'nodejs'
export const maxDuration = 60

const JIRA_SHEET_ID  = '1NoYiwiIVjoJNBt-mqWthbcBZg2X3ToDf5WCoCPdiNsw'
const JIRA_SHEET_GID = 1295593616
const JIRA_BASE      = 'https://euptw.atlassian.net'

// ── Google Sheets client ──────────────────────────────────────
function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / PRIVATE_KEY')
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

// ── Tìm tên sheet theo GID ────────────────────────────────────
async function getSheetNameByGid(sheetId: string, gid: number): Promise<string> {
  const sheets = getSheetsClient()
  const meta   = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties' })
  const found  = meta.data.sheets?.find(s => s.properties?.sheetId === gid)
  if (!found?.properties?.title) throw new Error(`Không tìm thấy sheet với GID ${gid}`)
  return found.properties.title
}

// ── CSV parser (giống jira/bugs route) ───────────────────────
function parseCSVRow(line: string): string[] {
  const result: string[] = []
  let cur = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; continue }
      inQuote = !inQuote; continue
    }
    if (c === ',' && !inQuote) { result.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  result.push(cur.trim())
  return result
}

// ── Fetch Jira duedate cho 1 issue ───────────────────────────
async function fetchJiraDuedate(issueKey: string, auth: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${JIRA_BASE}/rest/api/3/issue/${issueKey}?fields=duedate,issuelinks`,
      { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }, cache: 'no-store' }
    )
    if (!res.ok) return null
    const j = await res.json()
    // Lấy duedate của issue cha trước
    if (j.fields?.duedate) return j.fields.duedate as string
    // Nếu không có, tìm trong linked issues
    for (const link of (j.fields?.issuelinks ?? [])) {
      const linked = link.outwardIssue ?? link.inwardIssue
      if (!linked?.key) continue
      const lr = await fetch(
        `${JIRA_BASE}/rest/api/3/issue/${linked.key}?fields=duedate`,
        { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }, cache: 'no-store' }
      )
      if (!lr.ok) continue
      const lj = await lr.json()
      if (lj.fields?.duedate) return lj.fields.duedate as string
    }
    return null
  } catch { return null }
}

// "2026-06-30" → "30/06/2026"
function isoToSheetDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ── POST handler ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Auth
  let authed = false
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) authed = true
  } catch { /* ignore */ }
  if (!authed) {
    const authHeader = req.headers.get('authorization') ?? ''
    if (authHeader.startsWith('Bearer ')) {
      try {
        const sb2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
        const { data: { user } } = await sb2.auth.getUser(authHeader.slice(7))
        if (user) authed = true
      } catch { /* ignore */ }
    }
  }
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { overwrite?: boolean }
  const overwrite = body.overwrite === true

  const jiraEmail = process.env.JIRA_EMAIL?.trim()
  const jiraToken = process.env.JIRA_API_TOKEN?.trim()
  if (!jiraEmail || !jiraToken)
    return NextResponse.json({ error: 'JIRA_EMAIL / JIRA_API_TOKEN chưa cấu hình' }, { status: 500 })

  const jiraAuth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64')

  try {
    // 1. Lấy tên sheet từ GID
    const sheetName = await getSheetNameByGid(JIRA_SHEET_ID, JIRA_SHEET_GID)

    // 2. Đọc toàn bộ sheet qua Sheets API (để có row number chính xác)
    const sheets    = getSheetsClient()
    const readRes   = await sheets.spreadsheets.values.get({
      spreadsheetId: JIRA_SHEET_ID,
      range:         `'${sheetName}'!A:N`,
      valueRenderOption: 'FORMATTED_VALUE',
    })
    const rows = readRes.data.values ?? []

    // 3. Xác định các row cần cập nhật
    // Cột L = index 11 (link), Cột M = index 12 (due_date_sheet)
    type UpdateItem = { rowNum: number; issueKey: string; hasExistingDate: boolean }
    const toProcess: UpdateItem[] = []

    for (let i = 0; i < rows.length; i++) {
      const cols    = rows[i]
      const link    = (cols[11] ?? '').replace(/\s+/g, '')
      if (!link.includes('atlassian.net/browse/EPB-')) continue
      const issueKey = link.match(/EPB-\d+/)?.[0]
      if (!issueKey) continue
      const existingDate = (cols[12] ?? '').trim()
      if (existingDate && !overwrite) continue   // đã có ngày, skip khi không overwrite
      toProcess.push({ rowNum: i + 1, issueKey, hasExistingDate: !!existingDate })
    }

    if (toProcess.length === 0)
      return NextResponse.json({ ok: true, updated: 0, skipped: 0, note: 'Không có ô nào cần cập nhật' })

    // 4. Fetch Jira duedates (batch 5 cùng lúc)
    const updates: { range: string; values: string[][] }[] = []
    let fetched = 0, skippedNoDate = 0

    for (let i = 0; i < toProcess.length; i += 5) {
      const batch = toProcess.slice(i, i + 5)
      const duedates = await Promise.all(batch.map(b => fetchJiraDuedate(b.issueKey, jiraAuth)))
      for (let j = 0; j < batch.length; j++) {
        const item    = batch[j]
        const duedate = duedates[j]
        if (!duedate) { skippedNoDate++; continue }
        updates.push({
          range:  `'${sheetName}'!M${item.rowNum}`,
          values: [[isoToSheetDate(duedate)]],
        })
        fetched++
      }
    }

    if (updates.length === 0)
      return NextResponse.json({ ok: true, updated: 0, skippedNoDate, note: 'Jira không có due date nào để ghi' })

    // 5. Batch write vào sheet
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: JIRA_SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates,
      },
    })

    return NextResponse.json({
      ok:            true,
      updated:       fetched,
      skippedNoDate,
      total:         toProcess.length,
      overwrite,
    })
  } catch (err) {
    console.error('[jira/sync-duedate] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
