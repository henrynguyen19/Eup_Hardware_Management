/**
 * /api/aicrm — AiCRM REST API helpers (không cần tunnel)
 * Dùng để test và sau này thay thế GetCustServiceByStaff trong HoTro
 *
 * POST /api/aicrm
 * Body: { action: 'login', account, password }
 *    → { ok, token, userId, name }
 * Body: { action: 'service-assign', account, password, days?, startTime?, endTime? }
 *    → { ok, total, data: [...] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isAdminUser, hasSubPagePerm } from '@/lib/auth-helpers'

export const runtime = 'nodejs'
export const maxDuration = 60

const AICRM_BASE = 'https://aicrm-vn.eupfin.com/AiCRM_CRM_SOAP'

async function aiCRMLogin(account: string, password: string) {
  const resp = await fetch(`${AICRM_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId: 'VN', systemKind: 'ai_crm', account, password }),
    signal: AbortSignal.timeout(15_000),
  })
  const rawText = await resp.text()
  console.log('[aicrm/login] status:', resp.status, 'body:', rawText.slice(0, 500))
  if (!resp.ok) throw new Error(`AiCRM login HTTP ${resp.status}: ${rawText.slice(0, 200)}`)
  let json: Record<string, unknown>
  try { json = JSON.parse(rawText) } catch { throw new Error(`AiCRM login: response không parse được: ${rawText.slice(0, 200)}`) }

  // Token có thể ở nhiều chỗ
  const obj = (json?.result as Record<string, unknown> | null)?.loginObject as Record<string, unknown> | null
  const token = (obj?.token ?? (json?.result as Record<string, unknown>)?.token ?? json?.token) as string | undefined
  if (!token) throw new Error(`AiCRM: không tìm thấy token. Response: ${rawText.slice(0, 300)}`)
  return {
    token,
    userId: obj?.id as number,
    name: obj?.name as string,
    enName: obj?.enName as string,
  }
}

async function aiCRMServiceAssign(token: string, startTime: string, endTime: string) {
  const resp = await fetch(`${AICRM_BASE}/service-assign/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      assignKind: null,
      assignTime: { startValue: startTime, endValue: endTime },
      status: { values: [0, 1, 3] },
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!resp.ok) throw new Error(`AiCRM service-assign HTTP ${resp.status}: ${await resp.text().catch(() => '')}`)
  const json = await resp.json()
  // Tìm array trong response — thử nhiều shape
  const raw = json?.result
  if (Array.isArray(raw)) return { data: raw, raw: json }
  if (Array.isArray(raw?.list))    return { data: raw.list,    raw: json }
  if (Array.isArray(raw?.content)) return { data: raw.content, raw: json }
  if (Array.isArray(raw?.records)) return { data: raw.records, raw: json }
  // Trả về toàn bộ để debug nếu không nhận ra shape
  return { data: [], raw: json }
}

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [adminOk, permOk] = await Promise.all([
    isAdminUser(user.id),
    hasSubPagePerm(user.id, 'hotro_bang_thong_ke', 'can_view'),
  ])
  if (!adminOk && !permOk)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    action: 'login' | 'service-assign'
    account?: string
    password?: string
    days?: number
    startTime?: string
    endTime?: string
  }

  if (!body.account || !body.password)
    return NextResponse.json({ error: 'Cần account và password' }, { status: 400 })

  try {
    if (body.action === 'login') {
      const info = await aiCRMLogin(body.account, body.password)
      return NextResponse.json({ ok: true, ...info })
    }

    if (body.action === 'service-assign') {
      // Login trước
      const { token } = await aiCRMLogin(body.account, body.password)

      // Tính time range
      let startTime = body.startTime
      let endTime   = body.endTime
      if (!startTime || !endTime) {
        const days = body.days ?? 6
        const now  = new Date()
        const from = new Date(now)
        from.setDate(from.getDate() - days)
        const fmt = (d: Date) => d.toISOString().slice(0, 10) + ' 00:00:00'
        startTime = fmt(from)
        endTime   = now.toISOString().slice(0, 10) + ' 23:59:59'
      }

      console.log(`[aicrm] service-assign ${startTime} → ${endTime}`)
      const { data, raw } = await aiCRMServiceAssign(token, startTime, endTime)
      console.log(`[aicrm] ${data.length} records`)

      return NextResponse.json({
        ok: true,
        total: data.length,
        startTime,
        endTime,
        data,
        // Giữ raw để debug nếu data = []
        ...(data.length === 0 ? { _rawShape: JSON.stringify(raw).slice(0, 500) } : {}),
      })
    }

    return NextResponse.json({ error: `action không hợp lệ: ${body.action}` }, { status: 400 })
  } catch (err) {
    console.error('[aicrm] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
