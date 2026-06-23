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
  stt:            number
  ngay_tao:       string
  link:           string
  issue_key:      string
  due_date_sheet: string | null   // cột M trong sheet
  due_date_jira:  string | null   // lấy từ Jira API (parent hoặc linked)
  due_date_source:string          // 'parent' | 'linked:<key>' | 'none'
  done_date:      string
  bug_type:       string
  reporter:       string
  assignee:       string | null   // lấy từ Jira (parent hoặc linked)
  assignee_source:string          // 'parent' | 'linked:<key>' | 'none'
  linked_issues:  { key: string; summary: string; status: string; duedate: string | null; assignee: string | null }[]
  summary:        string
  status:         string
  status_color:   string
}

// ── Fetch sheet ───────────────────────────────────────────────
async function fetchSheetBugs(): Promise<Omit<JiraBug,
  'due_date_jira'|'due_date_source'|'assignee'|'assignee_source'|'linked_issues'|'summary'|'status'|'status_color'>[]> {
  const url = `https://docs.google.com/spreadsheets/d/${JIRA_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${JIRA_SHEET_GID}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`)
  const csv = await res.text()

  const bugs = []
  for (const line of csv.split('\n')) {
    const cols = parseCSVRow(line)
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

// ── Fetch single Jira issue (lightweight) ────────────────────
async function fetchJiraIssueRaw(issueKey: string, auth: string) {
  const res = await fetch(
    `${JIRA_BASE}/rest/api/3/issue/${issueKey}?fields=duedate,summary,status,assignee,issuelinks`,
    { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }, cache: 'no-store' }
  )
  if (!res.ok) return null
  return res.json()
}

function statusColor(name: string) {
  const n = name.toLowerCase()
  if (n.includes('done') || n.includes('closed') || n.includes('resolved')) return 'green'
  if (n.includes('progress')) return 'blue'
  return 'gray'
}

// ── Fetch Jira issue + resolve duedate/assignee from linked items ──
async function fetchJiraIssue(issueKey: string, auth: string): Promise<{
  duedate: string | null
  due_date_source: string
  assignee: string | null
  assignee_source: string
  summary: string
  status: string
  status_color: string
  linked_issues: JiraBug['linked_issues']
}> {
  const empty = {
    duedate: null, due_date_source: 'none',
    assignee: null, assignee_source: 'none',
    summary: '', status: '', status_color: 'gray', linked_issues: [],
  }

  try {
    const j = await fetchJiraIssueRaw(issueKey, auth)
    if (!j) return empty

    const parentDuedate:  string | null = j.fields?.duedate ?? null
    const parentAssignee: string | null = j.fields?.assignee?.displayName ?? null
    const parentSummary:  string        = j.fields?.summary ?? ''
    const parentStatus:   string        = j.fields?.status?.name ?? ''

    // Parse issuelinks — collect all linked EPB keys
    const issuelinks: { key: string; linkType: string }[] = []
    for (const link of (j.fields?.issuelinks ?? [])) {
      const linked = link.outwardIssue ?? link.inwardIssue
      if (!linked?.key) continue
      issuelinks.push({ key: linked.key, linkType: link.type?.name ?? '' })
    }

    // Fetch all linked issues concurrently
    const linkedDetails = await Promise.all(
      issuelinks.map(async ({ key }) => {
        try {
          const lj = await fetchJiraIssueRaw(key, auth)
          if (!lj) return null
          return {
            key,
            summary:  (lj.fields?.summary ?? '') as string,
            status:   (lj.fields?.status?.name ?? '') as string,
            duedate:  (lj.fields?.duedate ?? null) as string | null,
            assignee: (lj.fields?.assignee?.displayName ?? null) as string | null,
          }
        } catch { return null }
      })
    )
    const linked_issues = linkedDetails.filter(Boolean) as JiraBug['linked_issues']

    // Resolve duedate: parent first, then first linked that has one
    let duedate: string | null = parentDuedate
    let due_date_source = parentDuedate ? 'parent' : 'none'
    if (!duedate) {
      const fallback = linked_issues.find(l => l.duedate)
      if (fallback) { duedate = fallback.duedate; due_date_source = `linked:${fallback.key}` }
    }

    // Resolve assignee: parent first, then first linked that has one
    let assignee: string | null = parentAssignee
    let assignee_source = parentAssignee ? 'parent' : 'none'
    if (!assignee) {
      const fallback = linked_issues.find(l => l.assignee)
      if (fallback) { assignee = fallback.assignee; assignee_source = `linked:${fallback.key}` }
    }

    return {
      duedate, due_date_source,
      assignee, assignee_source,
      summary: parentSummary,
      status:  parentStatus,
      status_color: statusColor(parentStatus),
      linked_issues,
    }
  } catch (err) {
    console.error('[fetchJiraIssue] error for', issueKey, err)
    return empty
  }
}

// ── GET ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = process.env.JIRA_EMAIL?.trim()
  const token = process.env.JIRA_API_TOKEN?.trim()
  console.log('[jira/bugs] JIRA_EMAIL:', email ? `"${email}"` : 'MISSING', '| TOKEN len:', token?.length ?? 'MISSING')
  console.log('[jira/bugs] env keys with JIRA:', Object.keys(process.env).filter(k => k.includes('JIRA')))

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

    const results: JiraBug[] = []
    // Batch 3 at a time (each issue now spawns sub-fetches for linked issues)
    for (let i = 0; i < bugs.length; i += 3) {
      const batch = bugs.slice(i, i + 3)
      const jiraData = await Promise.all(batch.map(b => fetchJiraIssue(b.issue_key, auth)))
      batch.forEach((bug, idx) => {
        const d = jiraData[idx]
        results.push({
          ...bug,
          due_date_jira:  d.duedate,
          due_date_source: d.due_date_source,
          assignee:       d.assignee,
          assignee_source: d.assignee_source,
          linked_issues:  d.linked_issues,
          summary:        d.summary,
          status:         d.status,
          status_color:   d.status_color,
        })
      })
    }

    return NextResponse.json({ bugs: results, total: results.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
