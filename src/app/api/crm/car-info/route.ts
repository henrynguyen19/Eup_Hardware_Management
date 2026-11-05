/**
 * POST /api/crm/car-info
 * Body: { cust_imid: string | number }
 * Gọi CRM GetCarInfo, trả về danh sách xe của khách hàng
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCRMSessionForUser } from '@/lib/crm-session'
import { callCrmSoap } from '@/lib/crm-utils'

export const runtime     = 'nodejs'
export const maxDuration = 30

// ── In-memory cache: cust_imid → { data, expiresAt } — TTL 30 phút ──
const carInfoCache = new Map<string, { data: unknown[]; expiresAt: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { cust_imid?: string | number }
    const custImid = body.cust_imid
    if (!custImid && custImid !== 0) {
      return NextResponse.json({ error: 'Thiếu cust_imid' }, { status: 400 })
    }

    const cacheKey = String(custImid)
    const cached = carInfoCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ ok: true, data: cached.data, total: cached.data.length, fromCache: true })
    }

    const session = await getCRMSessionForUser(user.id)
    const { sessionId, identity } = session

    const records = await callCrmSoap(
      'GetCarInfo',
      { Cust_IMID: String(custImid), teamId: -1 },
      sessionId,
      identity,
      30_000
    )

    carInfoCache.set(cacheKey, { data: records, expiresAt: Date.now() + CACHE_TTL_MS })

    return NextResponse.json({ ok: true, data: records, total: records.length, fromCache: false })
  } catch (err) {
    const msg = String(err)
    console.error('[crm/car-info]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
