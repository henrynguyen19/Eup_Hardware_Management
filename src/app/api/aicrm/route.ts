/**
 * /api/aicrm — AiCRM REST API qua tunnel (IP nội địa)
 *
 * Flow: Vercel → Tunnel → crm-proxy /aicrm → aicrm-vn.eupfin.com
 *
 * POST /api/aicrm
 * Body: { action: 'login', account, password }
 * Body: { action: 'service-assign', account, password, days?, startTime?, endTime? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isAdminUser, hasSubPagePerm } from '@/lib/auth-helpers'

export const runtime = 'nodejs'
export const maxDuration = 60

// Gọi /aicrm endpoint trên crm-proxy (đi qua tunnel → IP nội địa)
async function proxyAiCRM(action: string, params: Record<string, unknown>) {
  const tunnelUrl = process.env.CRM_SOAP_URL // dạng https://xxx.trycloudflare.com/proxy
  if (!tunnelUrl) throw new Error('Thiếu CRM_SOAP_URL trong env')
  // Đổi /proxy → /aicrm
  const aiCRMUrl = tunnelUrl.replace(/\/proxy$/, '/aicrm')

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.PROXY_SECRET) headers['x-proxy-secret'] = process.env.PROXY_SECRET

  const resp = await fetch(aiCRMUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...params }),
    signal: AbortSignal.timeout(action === 'service-assign' ? 60_000 : 15_000),
  })
  const rawText = await resp.text()
  if (!resp.ok) throw new Error(`proxy /aicrm ${action} HTTP ${resp.status}: ${rawText.slice(0, 200)}`)
  try { return JSON.parse(rawText) } catch { throw new Error(`proxy /aicrm: response không parse được: ${rawText.slice(0, 200)}`) }
}

async function aiCRMLogin(account: string, password: string) {
  const json = await proxyAiCRM('login', { account, password })
  console.log('[aicrm/login] response keys:', Object.keys(json ?? {}))
  const obj = json?.result?.loginObject
  const token = obj?.token ?? json?.result?.token ?? json?.token
  if (!token) throw new Error(`AiCRM: không tìm thấy token. Response: ${JSON.stringify(json).slice(0, 300)}`)
  return { token: token as string, userId: obj?.id as number, name: obj?.name as string }
}

async function aiCRMServiceAssign(token: string, startTime: string, endTime: string) {
  const json = await proxyAiCRM('service-assign', { token, startTime, endTime })
  const raw = json?.result
  if (Array.isArray(raw))          return { data: raw,          raw: json }
  if (Array.isArray(raw?.list))    return { data: raw.list,     raw: json }
  if (Array.isArray(raw?.content)) return { data: raw.content,  raw: json }
  if (Array.isArray(raw?.records)) return { data: raw.records,  raw: json }
  return { data: [], raw: json }
}

export async function POST(req: NextRequest) {
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
      const { token } = await aiCRMLogin(body.account, body.password)

      let startTime = body.startTime
      let endTime   = body.endTime
      if (!startTime || !endTime) {
        const days = body.days ?? 7
        const now  = new Date()
        const from = new Date(now)
        from.setDate(from.getDate() - days)
        const fmt  = (d: Date) => d.toISOString().slice(0, 10) + ' 00:00:00'
        startTime  = fmt(from)
        endTime    = now.toISOString().slice(0, 10) + ' 23:59:59'
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
        ...(data.length === 0 ? { _rawShape: JSON.stringify(raw).slice(0, 500) } : {}),
      })
    }

    return NextResponse.json({ error: `action không hợp lệ: ${body.action}` }, { status: 400 })
  } catch (err) {
    console.error('[aicrm] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
