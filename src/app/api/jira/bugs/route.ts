import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const JIRA_SHEET_ID  = '1NoYiwiIVjoJNBt-mqWthbcBZg2X3ToDf5WCoCPdiNsw'
const JIRA_SHEET_GID = '1295593616'
const JIRA_BASE      = 'https://euptw.atlassian.net'

// ── CSV parser ────────────────────────────────────────────────
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

export interface JiraBug {
  stt:          number
  ngay_tao:     string
  link:         string
  issue_key:    string
  due_date_sheet: string | null   // cột M trong sheet
  due_date_jira:  string | null   // lấy từ Jira API
  done_date:    string
  bug_type:     string
  reporter:     string
  summary:      string
  status:       string
  status_color: string
}

// ── Fetch sheet ───────────────────────────────────────────────
async function fetchSheetBugs(): Promise<Omit<JiraBug, 'due_date_jira' | 'summary' | 'status' | 'status_color'>[]> {
  const url = `https://docs.google.com/spreadsheets/d/${JIRA_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${JIRA_SHEET_GID}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`)
  const csv = await res.text()

  const bugs = []
  for (const line of csv.split('\n')) {
    const cols = parseCSVRow(line)
    // Col L (index 11): Jira link
    const link = (cols[11] ?? '').replace(/\s+/g, '')
    if (!link.includes('atlassian.net/browse/EPB-')) continue
    const issueKey = link.match(/EPB-\d+/)?.[0]
    if (!issueKey) continue
    const stt = parseInt(cols[9] ?? '0')
    if (!stt || isNaN(stt)) continue

    bugs.push({
      stt,
      ngay_tao:       (cols[10] ?? '').trim(),
      link,
      issue_key:      issueKey,
      due_date_sheet: (cols[12] ?? '').trim() || null,
      done_date:      (cols[13] ?? '').trim(),
      bug_type:       (cols[14] ?? '').trim(),
      reporter:       (cols[15] ?? '').trim(),
    })
  }
  return bugs
}

// ── Fetch Jira issue ──────────────────────────────────────────
async function fetchJiraIssue(issueKey: string, auth: string) {
  try {
    const res = await fetch(
      `${JIRA_BASE}/rest/api/3/issue/${issueKey}?fields=duedate,summary,status`,
      { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }, cache: 'no-store' }
    )
    if (!res.ok) return { duedate: null, summary: '', status: '', status_color: '' }
    const j = await res.json()
    const statusName: string = j.fields?.status?.name ?? ''
    const statusColor = statusName.toLowerCase().includes('done') || statusName.toLowerCase().includes('closed')
      ? 'green'
      : statusName.toLowerCase().includes('progress')
        ? 'blue'
        : 'gray'
    return {
      duedate:      (j.fields?.duedate ?? null) as string | null,
      summary:      (j.fields?.summary ?? '') as string,
      status:       statusName,
      status_color: statusColor,
    }
  } catch {
    return { duedate: null, summary: '', status: '', status_color: '' }
  }
}

// ── GET ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = process.env.JIRA_EMAIL?.trim()
  const token = process.env.JIRA_API_TOKEN?.trim()
  console.log('[jira/bugs] env check — JIRA_EMAIL:', email ? `"${email}"` : 'MISSING', '| JIRA_API_TOKEN:', token ? `len=${token.length}` : 'MISSING')
  console.log('[jira/bugs] all env keys with JIRA:', Object.keys(process.env).filter(k => k.includes('JIRA')))
  if (!email || !token) {
    return NextResponse.json({
      error: 'JIRA_EMAIL / JIRA_API_TOKEN chưa được cấu hình trong Vercel',
      debug: {
        JIRA_EMAIL: email ?? null,
        JIRA_API_TOKEN_len: token?.length ?? null,
        env_keys_with_JIRA: Object.keys(process.env).filter(k => k.includes('JIRA')),
      }
    }, { status: 500 })
  }
  const auth = Buffer.from(`${email}:${token}`).toString('base64')

  try {
    const bugs = await fetchSheetBugs()

    // Fetch Jira concurrently (batch of 5 để tránh rate limit)
    const results: JiraBug[] = []
    for (let i = 0; i < bugs.length; i += 5) {
      const batch = bugs.slice(i, i + 5)
      const jiraData = await Promise.all(batch.map(b => fetchJiraIssue(b.issue_key, auth)))
      batch.forEach((bug, idx) => {
        results.push({
          ...bug,
          due_date_jira:  jiraData[idx].duedate,
          summary:        jiraData[idx].summary,
          status:         jiraData[idx].status,
          status_color:   jiraData[idx].status_color,
        })
      })
    }

    return NextResponse.json({ bugs: results, total: results.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
