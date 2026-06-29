import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

async function requireAdmin(): Promise<{ ok: boolean; error?: NextResponse; perms?: string[] }> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Chua dang nhap' }, { status: 401 }) }

  const { data } = await supabaseAdmin()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()

  const perms: string[] = data?.permissions ?? []
  const canManage = perms.includes('admin:roles') || perms.includes('admin:users')
  if (!canManage) {
    return { ok: false, error: NextResponse.json({ error: 'Khong co quyen' }, { status: 403 }) }
  }
  return { ok: true, perms }
}

// GET: danh sach tat ca roles kem permissions
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chua dang nhap' }, { status: 401 })

  const { data: roles } = await supabaseAdmin()
    .from('roles')
    .select('id, name, is_system, role_permissions(permission)')
    .order('name')

  const result = (roles ?? []).map((r: {
    id: string; name: string; is_system: boolean;
    role_permissions: { permission: string }[]
  }) => ({
    id: r.id,
    name: r.name,
    is_system: r.is_system,
    permissions: (r.role_permissions ?? []).map(p => p.permission).filter(Boolean),
  }))

  return NextResponse.json({ roles: result })
}

// POST: tao role moi
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { name, permissions } = await req.json() as { name: string; permissions?: string[] }
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Ten vai tro khong duoc de trong' }, { status: 400 })
  }

  const sb = supabaseAdmin()

  const { data: existing } = await sb.from('roles').select('id').eq('name', name.trim()).single()
  if (existing) return NextResponse.json({ error: 'Ten vai tro da ton tai' }, { status: 409 })

  const { data: newRole, error: insertErr } = await sb
    .from('roles')
    .insert({ name: name.trim(), is_system: false })
    .select('id, name, is_system')
    .single()

  if (insertErr || !newRole) {
    return NextResponse.json({ error: insertErr?.message ?? 'Tao role that bai' }, { status: 500 })
  }

  const permList: string[] = Array.isArray(permissions) ? permissions : []
  if (permList.length > 0) {
    const rows = permList.map(p => ({ role_id: newRole.id, permission: p }))
    const { error: permErr } = await sb.from('role_permissions').insert(rows)
    if (permErr) return NextResponse.json({ error: permErr.message }, { status: 500 })
  }

  return NextResponse.json({ id: newRole.id, name: newRole.name, is_system: false, permissions: permList }, { status: 201 })
}

// PUT: cap nhat permissions cho mot role
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { roleId, permissions } = await req.json() as { roleId: string; permissions: string[] }
  if (!roleId || !Array.isArray(permissions)) {
    return NextResponse.json({ error: 'Thieu roleId hoac permissions' }, { status: 400 })
  }

  const sb = supabaseAdmin()
  await sb.from('role_permissions').delete().eq('role_id', roleId)
  if (permissions.length > 0) {
    const rows = permissions.map(p => ({ role_id: roleId, permission: p }))
    const { error } = await sb.from('role_permissions').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE: xoa role (chi role khong phai system)
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { roleId } = await req.json() as { roleId: string }
  if (!roleId) return NextResponse.json({ error: 'Thieu roleId' }, { status: 400 })

  const sb = supabaseAdmin()

  const { data: role } = await sb.from('roles').select('is_system').eq('id', roleId).single()
  if (role?.is_system) {
    return NextResponse.json({ error: 'Khong the xoa role he thong' }, { status: 400 })
  }

  await sb.from('role_permissions').delete().eq('role_id', roleId)
  await sb.from('user_roles').delete().eq('role_id', roleId)
  const { error } = await sb.from('roles').delete().eq('id', roleId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
