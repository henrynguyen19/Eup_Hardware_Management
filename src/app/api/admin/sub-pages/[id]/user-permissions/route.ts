import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data } = await sb().from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  if (!(data?.permissions ?? []).includes('admin:users'))
    return { ok: false, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true }
}

type Params = { params: { id: string } }

// GET /api/admin/sub-pages/[id]/user-permissions
// Returns list of users with individual permissions on this sub-page
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { data } = await sb()
    .from('user_sub_page_permissions')
    .select('user_id, can_read, can_create, can_update, can_delete')
    .eq('sub_page_id', params.id)

  if (!data || data.length === 0) return NextResponse.json({ users: [] })

  // Enrich with emails — thử view trước, fallback auth.admin nếu không có
  const userIds = data.map(r => r.user_id)
  const { data: userRows } = await sb()
    .from('user_permissions_view')
    .select('user_id, user_email')
    .in('user_id', userIds)

  const emailMap = Object.fromEntries((userRows ?? []).map(u => [u.user_id, u.user_email]))

  // Tìm những user_id còn thiếu email (không có trong view)
  const missing = userIds.filter(id => !emailMap[id])
  if (missing.length > 0) {
    const { data: authList } = await sb().auth.admin.listUsers({ page: 1, perPage: 1000 })
    for (const u of authList?.users ?? []) {
      if (missing.includes(u.id) && u.email) emailMap[u.id] = u.email
    }
  }

  return NextResponse.json({
    users: data.map(r => ({
      user_id:    r.user_id,
      user_email: emailMap[r.user_id] ?? r.user_id,
      can_read:   r.can_read,
      can_create: r.can_create,
      can_update: r.can_update,
      can_delete: r.can_delete,
    }))
  })
}

// PUT /api/admin/sub-pages/[id]/user-permissions
// Upsert individual permission for a single user
// Body: { userId, can_read, can_create, can_update, can_delete }
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { userId, can_read, can_create, can_update, can_delete } = await req.json()
  if (!userId) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 })

  const { error } = await sb()
    .from('user_sub_page_permissions')
    .upsert({
      user_id:    userId,
      sub_page_id: params.id,
      can_read:   can_read   ?? false,
      can_create: can_create ?? false,
      can_update: can_update ?? false,
      can_delete: can_delete ?? false,
    }, { onConflict: 'user_id,sub_page_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/sub-pages/[id]/user-permissions
// Remove individual permission for a user
// Body: { userId }
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { userId } = await req.json()
  const { error } = await sb()
    .from('user_sub_page_permissions')
    .delete()
    .eq('sub_page_id', params.id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
