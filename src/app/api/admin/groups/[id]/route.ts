import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

async function requireAdmin(): Promise<{ ok: boolean; error?: NextResponse }> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) }

  const { data } = await sb()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()

  if (!(data?.permissions ?? []).includes('admin:users')) {
    return { ok: false, error: NextResponse.json({ error: 'Không có quyền' }, { status: 403 }) }
  }
  return { ok: true }
}

// PATCH /api/admin/groups/[id] — cập nhật group (name, description, permissions, color)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (body.name !== undefined)        update.name        = body.name
  if (body.description !== undefined) update.description = body.description
  if (body.permissions !== undefined) update.permissions = body.permissions
  if (body.color !== undefined)       update.color       = body.color

  const { error } = await sb()
    .from('dept_groups')
    .update(update)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/groups/[id] — xóa group
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { error } = await sb()
    .from('dept_groups')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// POST /api/admin/groups/[id] with action=addMember | removeMember
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { action, userEmail, userId } = await req.json()

  if (action === 'addMember') {
    // Tìm user_id từ email nếu chỉ có email
    let uid = userId
    if (!uid && userEmail) {
      const { data: ur } = await sb()
        .from('user_roles')
        .select('user_id')
        .eq('user_email', userEmail)
        .single()
      uid = ur?.user_id
    }
    if (!uid) return NextResponse.json({ error: 'Không tìm thấy user' }, { status: 404 })

    const { error } = await sb()
      .from('dept_group_members')
      .upsert({ user_id: uid, group_id: params.id }, { onConflict: 'user_id,group_id', ignoreDuplicates: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'removeMember') {
    let uid = userId
    if (!uid && userEmail) {
      const { data: ur } = await sb()
        .from('user_roles')
        .select('user_id')
        .eq('user_email', userEmail)
        .single()
      uid = ur?.user_id
    }
    if (!uid) return NextResponse.json({ error: 'Không tìm thấy user' }, { status: 404 })

    const { error } = await sb()
      .from('dept_group_members')
      .delete()
      .eq('user_id', uid)
      .eq('group_id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'action không hợp lệ' }, { status: 400 })
}
