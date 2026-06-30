import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getUser() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function getUserInfo(userId: string) {
  const { data } = await sb()
    .from('users')
    .select('full_name, username, email')
    .eq('id', userId)
    .single()
  return data?.full_name || data?.username || data?.email || userId
}

async function checkWritePerm(userId: string) {
  const { data } = await sb()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', userId)
    .single()
  const perms: string[] = data?.permissions ?? []
  return perms.includes('repair_tracking:write') || perms.includes('admin:users')
}

// GET /api/repair-tracking
// ?status=cho_gui|da_gui|da_sua_xong
// ?product=...
// ?from=YYYY-MM-DD&to=YYYY-MM-DD  (theo received_at)
// ?limit=100&offset=0
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const status  = sp.get('status')
  const product = sp.get('product')
  const from    = sp.get('from')
  const to      = sp.get('to')
  const limit   = parseInt(sp.get('limit') ?? '200')
  const offset  = parseInt(sp.get('offset') ?? '0')

  let q = sb()
    .from('repair_items')
    .select('*', { count: 'exact' })
    .order('received_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status)  q = q.eq('status', status)
  if (product) q = q.ilike('product_name', `%${product}%`)
  if (from)    q = q.gte('received_at', from)
  if (to)      q = q.lte('received_at', to + 'T23:59:59Z')

  const { data, error, count } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: data ?? [], total: count ?? 0 })
}

// POST /api/repair-tracking — tạo mới (trạng thái: cho_gui)
// Body: { imei, product_name, notes?, received_at? }
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const canWrite = await checkWritePerm(user.id)
  if (!canWrite) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const body = await req.json()
  const { imei, product_name, notes, received_at } = body

  if (!imei || !product_name) {
    return NextResponse.json({ error: 'Thiếu imei hoặc product_name' }, { status: 400 })
  }

  const receiverName = await getUserInfo(user.id)

  const { data, error } = await sb()
    .from('repair_items')
    .insert({
      imei:          imei.trim(),
      product_name:  product_name.trim(),
      notes:         notes?.trim() || null,
      status:        'cho_gui',
      received_at:   received_at ?? new Date().toISOString(),
      receiver_id:   user.id,
      receiver_name: receiverName,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}
