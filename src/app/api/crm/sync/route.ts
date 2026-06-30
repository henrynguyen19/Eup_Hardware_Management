import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { getCRMSessionForUser, getCRMCredentials, invalidateCRMSession, crmLoginRaw } from '@/lib/crm-session'
import { extractHandlerFromMemo, parseSpeedTag, parseCRMTime } from '@/lib/crm-utils'
import { google } from 'googleapis'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// ─── Jira Sheet write-back ────────────────────────────────────────────────────
const JIRA_SHEET_ID  = '1NoYiwiIVjoJNBt-mqWthbcBZg2X3ToDf5WCoCPdiNsw'
const JIRA_SHEET_GID = 1295593616
const JIRA_BASE      = 'https://euptw.atlassian.net'

function extractJiraInfo(text: string): { key: string; url: string } | null {
  const urlMatch = text.match(/https?:\/\/[^\s<>"]+\/browse\/([A-Z]{2,10}-\d+)/i)
  if (urlMatch) {
    const url = urlMatch[0].replace(/[)"'\].>]+$/, '')
    return { url, key: urlMatch[1].toUpperCase() }
  }
  const keyMatch = text.match(/\b([A-Z]{2,10}-\d+)\b/)
  if (keyMatch) return { key: keyMatch[1].toUpperCase(), url: `${JIRA_BASE}/browse/${keyMatch[1]}` }
  return null
}

function normH(s: string): string {
  return String(s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/d\u0301/g, 'd').replace(/\s+/g, ' ')
}

interface JiraTicketData {
  date: string; company: string; contact: string; ticket_type: string
  direction: string; content: string; reply: string; handler: string
  car_number: string; code: string; jira_url: string; zone: string
}

function mapHeaderToValue(header: string, t: JiraTicketData): string {
  const h = normH(header)
  if (!h) return ''
  if (h.includes('ngay') || h.includes('date') || h.includes('thoi gian')) return t.date
  if (h.includes('khach hang') || h.includes('cong ty') || h.includes('company')) return t.company
  if ((h.includes('loai') || h.includes('type')) && !h.includes('ngay')) return t.ticket_type
  if (h.includes('nguoi lien he') || (h.includes('lien he') && !h.includes('ky thuat'))) return t.contact
  if (h.includes('noi dung') || h === 'content' || h.includes('van de')) return t.content
  if (h.includes('ghi chu') || h.includes('phan hoi') || h.includes('reply') || h.includes('memo')) return t.reply.substring(0, 500)
  if (h.includes('ky thuat') || h.includes('nhan vien') || h.includes('nguoi xu ly') || h === 'handler') return t.handler
  if (h.includes('xu ly') && !h.includes('noi dung') && !h.includes('ky thuat')) return t.handler
  if (h.includes('bien so') || (h.includes('xe') && !h.includes('xu')) || h.includes('car')) return t.car_number
  if (h.includes('jira') || h.includes('link') || h.includes('atlassian')) return t.jira_url
  if ((h.includes('ma') || h === 'code' || h === 'id' || h.includes('so phieu')) && !h.includes('thiet bi')) return t.code
  if (h.includes('chieu') || h === 'io' || h.includes('direction')) return t.direction
  if (h.includes('vung') || h.includes('zone') || h.includes('khu vuc')) return t.zone
  return ''
}

interface JiraWriteTicket {
  csId: number; csDate: string; custName: string; cmName: string; ccName: string
  csIO: string; csContext: string; csMemo: string; csCarNumber: string; zone: string
  handler: string; jiraInfo: { key: string; url: string }
}

async function writeJiraTicketsToSheet(
  tickets: JiraWriteTicket[]
): Promise<{ written: number; updated: number; error?: string }> {
  if (!tickets.length) return { written: 0, updated: 0 }
  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
    if (!email || !key) throw new Error('Thieu Google Service Account credentials')
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: key },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    const sheets = google.sheets({ version: 'v4', auth })

    const meta = await sheets.spreadsheets.get({ spreadsheetId: JIRA_SHEET_ID, fields: 'sheets.properties' })
    const sheetProp = meta.data.sheets?.find(s => s.properties?.sheetId === JIRA_SHEET_GID)
    if (!sheetProp?.properties?.title) throw new Error(`Khong tim thay sheet GID ${JIRA_SHEET_GID}`)
    const sheetName  = sheetProp.properties.title
    const sheetRowCount = sheetProp.properties.gridProperties?.rowCount ?? 1000

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: JIRA_SHEET_ID,
      range: `'${sheetName}'!A1:Q${sheetRowCount}`,
      valueRenderOption: 'FORMATTED_VALUE',
    })
    const rows = (resp.data.values ?? []) as string[][]
    const headers = rows[0] ?? []

    const keyToRow = new Map<string, number>()
    for (let i = 1; i < rows.length; i++) {
      const cell = String(rows[i][11] ?? '')
      const km   = cell.match(/([A-Z]{2,10}-\d+)/i)
      if (km) keyToRow.set(km[1].toUpperCase(), i + 1)
    }

    let nextRow = 2
    for (let i = rows.length - 1; i >= 1; i--) {
      if (rows[i].some(c => String(c ?? '').trim() !== '')) { nextRow = i + 2; break }
    }

    const updates: { range: string; values: string[][] }[] = []
    let written = 0, updated = 0

    for (const t of tickets) {
      const td: JiraTicketData = {
        date: t.csDate, company: t.custName || '', contact: t.cmName || '',
        ticket_type: t.ccName || '', direction: t.csIO || '', content: t.csContext || '',
        reply: t.csMemo || '', handler: t.handler, car_number: t.csCarNumber || '',
        code: String(t.csId), jira_url: t.jiraInfo.url, zone: t.zone || '',
      }
      const cells: string[] = []
      for (let ci = 9; ci <= 16; ci++) {
        cells.push(mapHeaderToValue(headers[ci] ?? '', td))
      }
      const existingRow = keyToRow.get(t.jiraInfo.key)
      if (existingRow) {
        const jVal = String(rows[existingRow - 1]?.[9] ?? '').trim()
        if (jVal === '') {
          updates.push({ range: `'${sheetName}'!J${existingRow}:Q${existingRow}`, values: [cells] })
          updated++
        }
      } else {
        updates.push({ range: `'${sheetName}'!J${nextRow}:Q${nextRow}`, values: [cells] })
        keyToRow.set(t.jiraInfo.key, nextRow)
        nextRow++
        written++
      }
    }

    if (updates.length === 0) return { written, updated }

    // Mở rộng sheet nếu nextRow vượt quá số row hiện tại
    const maxRowNeeded = nextRow - 1
    if (maxRowNeeded > sheetRowCount) {
      const rowsToAdd = maxRowNeeded - sheetRowCount + 50  // thêm buffer 50 rows
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: JIRA_SHEET_ID,
        requestBody: {
          requests: [{
            appendDimension: {
              sheetId:    JIRA_SHEET_GID,
              dimension:  'ROWS',
              length:     rowsToAdd,
            }
          }]
        }
      })
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: JIRA_SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    })
    return { written, updated }
  } catch (e) {
    console.error('[crm/sync] writeJiraTicketsToSheet:', e)
    return { written: 0, updated: 0, error: String(e) }
  }
}

interface CRMTicket {
  CS_ID: number; CS_Date: string; CS_IO: string; CS_Context: string; CS_Memo: string
  CC_Kind: number; CC_Name: string; CM_Name: string; CS_CarNumber: string
  CS_RecordTime: string; CS_UpdateTime: string; CS_Task: string; CS_SPlace: string
  CS_Miles: string; CS_Attached: string; CS_HighlightStaffID: number
  CS_HighlightStaffName: string; Cust_ID: number; Cust_Name: string
  Cust_SaleManAssistant_Zone: string
}
interface CRMResponse { status: number; error: string; result: CRMTicket[] }

async function callCRMSoap(staffId: number, sessionId: string, identity: string, url: string): Promise<CRMTicket[]> {
  const form = new URLSearchParams()
  form.append('MethodName', 'GetCustServiceByStaff')
  form.append('Param', JSON.stringify({ NotRead: '0', Staff_ID: String(staffId) }))
  form.append('SESSION_ID', sessionId)
  form.append('IDENTITY', identity)
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(90_000),  // tăng lên 90s — staff nhiều data như Stefan cần thời gian
  })
  if (!resp.ok) throw new Error(`CRM HTTP ${resp.status}`)
  const rawText = await resp.text()
  if (!rawText || rawText.trim() === '') throw new Error('CRM tra ve body rong')
  let json: CRMResponse
  try { json = JSON.parse(rawText) } catch { throw new Error(`CRM response khong parse duoc: ${rawText.substring(0, 100)}`) }
  if (!json.status) throw new Error(json.error || 'CRM returned status=0')
  return json.result ?? []
}

export const runtime     = 'nodejs'
export const maxDuration = 300  // 5 phút — 5 staff × ~90s mỗi staff

// ── POST /api/crm/sync ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const internalCall = cronSecret && req.headers.get('x-cron-secret') === cronSecret

  let isAdmin = false
  let user: { id: string } | null = null

  if (!internalCall) {
    const supabase = createSupabaseServerClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    user = authUser

    const db2 = adminClient()
    const { data: permData } = await db2
      .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
    const perms: string[] = permData?.permissions ?? []
    if (!perms.includes('admin:users') && !perms.includes('ho_tro:write'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    isAdmin = perms.includes('admin:users') || perms.includes('ho_tro:admin')
  } else {
    isAdmin = true
  }

  const url = process.env.CRM_SOAP_URL
  if (!url) return NextResponse.json({ error: 'Thieu CRM_SOAP_URL' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as {
    mode?: 'full' | 'self' | 'one'
    staffName?: string
    fromDate?: string
    toDate?: string
  }
  const mode = body.mode ?? 'self'

  if ((mode === 'full' || mode === 'one') && !isAdmin)
    return NextResponse.json({ error: 'Chi admin moi dung duoc' }, { status: 403 })

  const FULL_STAFF = [
    { id: 9141, name: 'Kane'   },
    { id: 9090, name: 'Stefan' },
    { id: 9146, name: 'Shiro'  },
    { id: 9168, name: 'Irene'  },
    { id: 9268, name: 'Blue'   },
  ]

  let staffToFetch: { id: number; name: string }[]
  let myNickName: string | null = null

  if (mode === 'full') {
    staffToFetch = FULL_STAFF
  } else if (mode === 'one') {
    const target = FULL_STAFF.find(s => s.name.toLowerCase() === (body.staffName ?? '').toLowerCase())
    if (!target) return NextResponse.json({ error: `Khong tim thay staff: ${body.staffName}` }, { status: 400 })
    staffToFetch = [target]
  } else {
    if (!user) return NextResponse.json({ error: 'user required for self sync' }, { status: 400 })
    const creds = await getCRMCredentials(user.id)
    if (!creds) return NextResponse.json({ error: 'Chua cau hinh CRM credentials' }, { status: 400 })
    myNickName = creds.crm_nick_name ?? null
    staffToFetch = [{ id: creds.crm_staff_id, name: myNickName ?? 'Self' }]
  }

  const db = adminClient()

  const { data: allMappings } = await db
    .from('user_crm_mapping')
    .select('user_id, crm_staff_id, crm_nick_name, crm_account, crm_password')

  type MappingRow = { user_id: string; crm_staff_id: number; crm_nick_name: string | null; crm_account: string | null; crm_password: string | null }
  const credMap = new Map<number, MappingRow>()
  for (const m of ((allMappings ?? []) as MappingRow[])) {
    if (m.crm_staff_id) credMap.set(m.crm_staff_id, m)
  }

  let selfSession: { sessionId: string; staffId: number; identity: string; fromCache: boolean } | null = null
  if (mode === 'self' && user) {
    try { selfSession = await getCRMSessionForUser(user.id) }
    catch (err) { return NextResponse.json({ error: String(err) }, { status: 400 }) }
  }

  const fetchResults: PromiseSettledResult<{ name: string; tickets: CRMTicket[]; error?: string }>[] = []

  for (const s of staffToFetch) {
    try {
      let sessionId: string
      let identity: string

      if (mode === 'self' && selfSession) {
        sessionId = selfSession.sessionId
        identity  = selfSession.identity
      } else {
        const cred = credMap.get(s.id)
        if (!cred?.crm_account || !cred?.crm_password) {
          throw new Error(`Khong tim thay crm_account/crm_password cho ${s.name} (id=${s.id})`)
        }
        console.log(`[sync] Login CRM cho ${s.name} (account=${cred.crm_account})`)
        const loginRes = await crmLoginRaw(cred.crm_account, cred.crm_password)
        if (!loginRes.ok || !loginRes.detectedSessionId) {
          throw new Error(`Login CRM that bai cho ${s.name}: ${loginRes.error ?? 'No SESSION_ID'}`)
        }
        sessionId = loginRes.detectedSessionId
        identity  = loginRes.detectedIdentity ?? String(s.id)
        console.log(`[sync] ${s.name} login OK - SESSION=${sessionId.substring(0, 16)}... IDENTITY=${identity}`)
      }

      const tickets = await callCRMSoap(s.id, sessionId, identity, url)
      console.log(`[sync] ${s.name}(${s.id}): ${tickets.length} tickets`)
      fetchResults.push({ status: 'fulfilled', value: { name: s.name, tickets } })
    } catch (err) {
      const msg = String(err)
      console.error(`[sync] FAILED ${s.name}(${s.id}):`, msg)
      fetchResults.push({ status: 'fulfilled', value: { name: s.name, tickets: [] as CRMTicket[], error: msg } })
    }
  }

  const ticketMap = new Map<number, CRMTicket>()
  const fetchErrors: Record<string, string> = {}
  let totalFetched = 0

  for (const r of fetchResults) {
    if (r.status === 'rejected') continue
    const { name, tickets, error } = r.value as { name: string; tickets: CRMTicket[]; error?: string }
    if (error) { fetchErrors[name] = error; continue }
    totalFetched += tickets.length
    for (const t of tickets) {
      const existing = ticketMap.get(t.CS_ID)
      if (!existing) {
        ticketMap.set(t.CS_ID, t)
      } else {
        const existT = parseCRMTime(existing.CS_UpdateTime)
        const newT   = parseCRMTime(t.CS_UpdateTime)
        if (newT && (!existT || newT > existT)) ticketMap.set(t.CS_ID, t)
      }
    }
  }

  let allTickets = Array.from(ticketMap.values())

  if (body.fromDate) allTickets = allTickets.filter(t => t.CS_Date >= body.fromDate!)
  if (body.toDate)   allTickets = allTickets.filter(t => t.CS_Date <= body.toDate!)

  const keys = allTickets.map(t => `crm:${t.CS_ID}`)
  type ExistingRow = { sheet_row_key: string; cs_update_time: string | null; has_unread_update: boolean; customer_id: string | null; zone: string | null }
  const existingMap = new Map<string, ExistingRow>()
  for (let i = 0; i < keys.length; i += 500) {
    const { data } = await db
      .from('ho_tro_tickets')
      .select('sheet_row_key, cs_update_time, has_unread_update, customer_id, zone')
      .in('sheet_row_key', keys.slice(i, i + 500))
    for (const row of (data ?? [])) existingMap.set(row.sheet_row_key, row as ExistingRow)
  }

  let newCount = 0, updatedCount = 0, skippedCount = 0, rejectedCount = 0
  const rows = []
  const backfillRows: { sheet_row_key: string; customer_id: string | null; zone: string | null }[] = []

  for (const t of allTickets) {
    const key           = `crm:${t.CS_ID}`
    const crmUpdateTime = parseCRMTime(t.CS_UpdateTime)
    const existing      = existingMap.get(key)

    if (existing) {
      if (existing.cs_update_time && crmUpdateTime) {
        const dbMs  = new Date(existing.cs_update_time).getTime()
        const crmMs = new Date(crmUpdateTime).getTime()
        if (crmMs <= dbMs) {
          if (!existing.customer_id || !existing.zone) {
            backfillRows.push({
              sheet_row_key: key,
              customer_id:   t.Cust_ID ? String(t.Cust_ID) : null,
              zone:          t.Cust_SaleManAssistant_Zone || null,
            })
          } else {
            skippedCount++
          }
          continue
        }
      }
      updatedCount++
      rows.push({
        sheet_row_key:    key,
        staff_name:       extractHandlerFromMemo(t.CS_Memo ?? '') ?? 'Unknown',
        ticket_date:      t.CS_Date,
        company:          t.Cust_Name  || null,
        contact:          t.CM_Name    || null,
        ticket_type:      t.CC_Name    || null,
        direction:        t.CS_IO      || null,
        content:          t.CS_Context || null,
        reply:            t.CS_Memo    || null,
        speed_tag:        parseSpeedTag(t.CS_Memo ?? ''),
        code:             String(t.CS_ID),
        zone:             t.Cust_SaleManAssistant_Zone || null,
        customer_id:      t.Cust_ID ? String(t.Cust_ID) : null,
        created_by:       user?.id ?? 'cron',
        cs_update_time:   crmUpdateTime,
        has_unread_update: true,
      })
    } else {
      const handler = extractHandlerFromMemo(t.CS_Memo ?? '')

      if (mode === 'self') {
        if (!handler || handler.toLowerCase() !== (myNickName ?? '').toLowerCase()) {
          rejectedCount++; continue
        }
      } else {
        if (!handler) { rejectedCount++; continue }
      }

      newCount++
      rows.push({
        sheet_row_key:    key,
        staff_name:       handler,
        ticket_date:      t.CS_Date,
        company:          t.Cust_Name  || null,
        contact:          t.CM_Name    || null,
        ticket_type:      t.CC_Name    || null,
        direction:        t.CS_IO      || null,
        content:          t.CS_Context || null,
        reply:            t.CS_Memo    || null,
        speed_tag:        parseSpeedTag(t.CS_Memo ?? ''),
        code:             String(t.CS_ID),
        zone:             t.Cust_SaleManAssistant_Zone || null,
        customer_id:      t.Cust_ID ? String(t.Cust_ID) : null,
        created_by:       user?.id ?? 'cron',
        cs_update_time:   crmUpdateTime,
        has_unread_update: false,
      })
    }
  }

  let saved = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await db.from('ho_tro_tickets').upsert(batch, { onConflict: 'sheet_row_key' })
    if (error) return NextResponse.json({ error: error.message, saved }, { status: 500 })
    saved += batch.length
  }

  for (let i = 0; i < backfillRows.length; i += 50) {
    const batch = backfillRows.slice(i, i + 50)
    await Promise.all(batch.map(bRow =>
      db.from('ho_tro_tickets')
        .update({ customer_id: bRow.customer_id, zone: bRow.zone })
        .eq('sheet_row_key', bRow.sheet_row_key)
    ))
    saved += batch.length
  }

  // ── Ghi Jira tickets len Google Sheet ─────────────────────────────────────
  // Chỉ quét tickets của tháng hiện tại để tránh timeout với lượng data lớn
  const now2 = new Date()
  const jiraMonthFrom = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}-01`
  const jiraTicketsThisMonth = allTickets.filter(t => t.CS_Date >= jiraMonthFrom)

  const jiraWriteTickets: JiraWriteTicket[] = []
  for (const t of jiraTicketsThisMonth) {
    if (!t.CS_Memo) continue
    const jiraInfo = extractJiraInfo(t.CS_Memo)
    if (!jiraInfo) continue
    const handler = extractHandlerFromMemo(t.CS_Memo) ?? 'Unknown'
    jiraWriteTickets.push({
      csId: t.CS_ID, csDate: t.CS_Date, custName: t.Cust_Name || '',
      cmName: t.CM_Name || '', ccName: t.CC_Name || '', csIO: t.CS_IO || '',
      csContext: t.CS_Context || '', csMemo: t.CS_Memo || '',
      csCarNumber: t.CS_CarNumber || '', zone: t.Cust_SaleManAssistant_Zone || '',
      handler, jiraInfo,
    })
  }
  console.log(`[crm/sync] Jira scan: ${jiraTicketsThisMonth.length} tickets tháng ${now2.getMonth()+1} → ${jiraWriteTickets.length} có Jira link`)

  let jiraSheet: { written: number; updated: number; error?: string } | null = null
  if (jiraWriteTickets.length > 0) {
    jiraSheet = await writeJiraTicketsToSheet(jiraWriteTickets)
    console.log('[crm/sync] Jira sheet write-back:', jiraSheet)
  }

  return NextResponse.json({
    ok:           true,
    mode:         body.mode ?? 'incremental',
    saved,
    newCount,
    updatedCount,
    skippedCount,
    rejectedCount,
    fetchErrors,
    jiraSheet,
  })
}
