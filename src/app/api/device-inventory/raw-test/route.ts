/**
 * GET /api/device-inventory/raw-test?from=2026-01-01&to=2026-01-31&chunk=false
 *
 * Gọi thẳng GetDeviceMaintenance và trả về dữ liệu thô để debug.
 * chunk=true → chia 7 ngày rồi gộp lại (giống sync thật)
 * chunk=false → gọi 1 lần duy nhất cho cả khoảng
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser } from '@/lib/crm-session'
import { isAdminUser } from '@/lib/auth-helpers'
import { callCrmSoap } from '@/lib/crm-utils'

export const runtime = 'nodejs'
export const maxDuration = 60

function pad(n: number) { return String(n).padStart(2, '0') }

interface CRMDevice {
  Device_ID: number
  Device_Code: string
  Device_Date: string
  Device_TransferTime: string
  Device_Type: number
  Device_TypeName?: string
  Device_ProductName?: string
  Device_ProductKindName?: string
  QP_ProductKindName?: string
  Device_VendorName?: string
  Device_SourceStockName: string
  Device_DestStockName: string
  Device_TransferActionName: string
  Device_TransferManName: string
  [key: string]: unknown
}

async function fetchRaw(sessionId: string, identity: string, start: string, end: string) {
  return callCrmSoap<CRMDevice>(
    'GetDeviceMaintenance',
    { StartDate: start, EndDate: end, WH_ID: null, Usable: null, Device_Code: null, QP_ProductKind: null },
    sessionId, identity, 55_000
  )
}

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdminUser(user.id))) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const sp      = req.nextUrl.searchParams
  const fromRaw = sp.get('from') ?? new Date().toISOString().slice(0, 7) + '-01'  // default: 1st of this month
  const toRaw   = sp.get('to')   ?? new Date().toISOString().slice(0, 10)
  const useChunk = sp.get('chunk') !== 'false'   // default: true

  const from = fromRaw.length === 7 ? `${fromRaw}-01 00:00:00` : `${fromRaw} 00:00:00`
  const to   = toRaw.length === 7
    ? (() => { const [y,m] = toRaw.split('-').map(Number); return `${y}-${pad(m)}-${pad(new Date(y,m,0).getDate())} 23:59:59` })()
    : `${toRaw} 23:59:59`

  const { sessionId, identity } = await getCRMSessionForUser(user.id)
  const t0 = Date.now()

  if (!useChunk) {
    // Gọi 1 lần thẳng
    let records: CRMDevice[]
    try {
      records = await fetchRaw(sessionId, identity, from, to)
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
    const elapsed = Date.now() - t0
    const byType = groupByType(records)
    return NextResponse.json({ mode: 'single', from, to, total: records.length, elapsed_ms: elapsed, by_type: byType, sample: records.slice(0, 5) })
  }

  // Chunk 7 ngày
  const startDate = new Date(from.replace(' ', 'T'))
  const endDate   = new Date(to.replace(' ', 'T'))
  const CHUNK = 7
  const chunks: { s: string; e: string }[] = []
  const cur = new Date(startDate)
  while (cur <= endDate) {
    const cs = new Date(cur)
    const ce = new Date(cur); ce.setDate(ce.getDate() + CHUNK - 1)
    if (ce > endDate) ce.setTime(endDate.getTime())
    const fmt = (d: Date, isEnd: boolean) =>
      `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${isEnd?'23:59:59':'00:00:00'}`
    chunks.push({ s: fmt(cs, false), e: fmt(ce, true) })
    cur.setDate(cur.getDate() + CHUNK)
  }

  const chunkResults: { from: string; to: string; count: number; elapsed_ms: number; error?: string }[] = []
  const allRecords: CRMDevice[] = []

  for (const chunk of chunks) {
    const ct0 = Date.now()
    try {
      const recs = await fetchRaw(sessionId, identity, chunk.s, chunk.e)
      allRecords.push(...recs)
      chunkResults.push({ from: chunk.s, to: chunk.e, count: recs.length, elapsed_ms: Date.now()-ct0 })
    } catch (e) {
      chunkResults.push({ from: chunk.s, to: chunk.e, count: 0, elapsed_ms: Date.now()-ct0, error: String(e) })
    }
  }

  // Dedupe
  const seen = new Set<number>()
  const deduped = allRecords.filter(r => { if (seen.has(r.Device_ID)) return false; seen.add(r.Device_ID); return true })

  const elapsed = Date.now() - t0
  const byType = groupByType(deduped)

  return NextResponse.json({
    mode: 'chunked',
    from, to,
    chunks: chunkResults,
    total_raw: allRecords.length,
    total_deduped: deduped.length,
    elapsed_ms: elapsed,
    by_type: byType,
    sample: deduped.slice(0, 5),
  })
}

function groupByType(records: CRMDevice[]) {
  const m = new Map<string, number>()
  for (const r of records) {
    const name = r.Device_TypeName || r.Device_ProductKindName || r.QP_ProductKindName || r.Device_ProductName || `Type-${r.Device_Type}`
    m.set(name, (m.get(name) ?? 0) + 1)
  }
  return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}))
}
