import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const VALID_STATUSES = ['cho_xu_ly', 'dang_xu_ly', 'da_gui', 'da_nhan', 'da_huy']

// ─── GET /api/giao-hang/don-hang ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const mine   = sp.get('mine') !== '0'
  const status = sp.get('status') ?? ''
  const page   = parseInt(sp.get('page') ?? '1')
  const limit  = Math.min(parseInt(sp.get('limit') ?? '50'), 100)
  const offset = (page - 1) * limit

  const { data: permData } = await db()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()
  const isAdmin = (permData?.permissions ?? []).includes('admin:users')

  // All authenticated users can view all orders; mine=0 shows everyone's
  const filterMine = mine

  let query = db()
    .from('giao_hang_don_hang')
    .select('*, giao_hang_don_items(*)', { count: 'exact' })

  if (filterMine) query = query.eq('orderer_email', user.email!)
  if (status && VALID_STATUSES.includes(status)) query = query.eq('status', status)

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    orders: data ?? [],
    total: count ?? 0,
    page,
    limit,
    is_admin: isAdmin,
  })
}

// ─── PATCH /api/giao-hang/don-hang — cập nhật trạng thái ─────────────────────
export async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const body = await req.json() as {
    id: string
    status: string
    item_serials?: { item_id: string; serials: string[] }[]
  }

  if (!body.id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
  if (!VALID_STATUSES.includes(body.status))
    return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })

  const admin = db()
  const { data: permData } = await admin
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()
  const isAdmin = (permData?.permissions ?? []).includes('admin:users')

  const { data: existing } = await admin
    .from('giao_hang_don_hang')
    .select('orderer_email')
    .eq('id', body.id)
    .single()

  if (!existing)
    return NextResponse.json({ error: 'Đơn hàng không tồn tại' }, { status: 404 })
  // All authenticated users can update status (not just admin/owner)

  const now = new Date().toISOString()
  const { error } = await admin
    .from('giao_hang_don_hang')
    .update({
      status:             body.status,
      status_updated_by:  user.email,
      status_updated_at:  now,
      updated_at:         now,
    })
    .eq('id', body.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Save device serials per item (when shipping)
  if (body.item_serials && body.item_serials.length > 0) {
    for (const { item_id, serials } of body.item_serials) {
      await admin.from('giao_hang_don_items')
        .update({ device_serials: serials })
        .eq('id', item_id)
    }
  }

  return NextResponse.json({ ok: true })
}
