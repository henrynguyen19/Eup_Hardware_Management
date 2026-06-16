import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// GET /api/roles
export async function GET() {
  const hasPermission =
    (await requirePermission('manage_roles')) ||
    (await requirePermission('manage_users'))
  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { data, error } = await getSupabase()
      .from('roles')
      .select('id, name, is_system, created_at, role_permissions(permission_key)')
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const roles = (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      is_system: r.is_system,
      permissions: (r.role_permissions as { permission_key: string }[]).map(p => p.permission_key),
    }))

    return NextResponse.json(roles)
  } catch {
    return NextResponse.json({ error: 'roles 表尚未Tạo' }, { status: 500 })
  }
}

// POST /api/roles
export async function POST(req: NextRequest) {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, permissions } = await req.json()
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'vai tròtên不可為空' }, { status: 400 })
  }

  const supabase = getSupabase()

  const { data: existing } = await supabase
    .from('roles')
    .select('id')
    .eq('name', name.trim())
    .single()

  if (existing) {
    return NextResponse.json({ error: 'vai tròtên已存在' }, { status: 409 })
  }

  const { data: newRole, error: insertError } = await supabase
    .from('roles')
    .insert({ name: name.trim(), is_system: false })
    .select('id, name, is_system')
    .single()

  if (insertError || !newRole) {
    return NextResponse.json({ error: insertError?.message ?? 'Thêm mớithất bại' }, { status: 500 })
  }

  const permList: string[] = Array.isArray(permissions) ? permissions : []
  if (permList.length > 0) {
    const rows = permList.map((key) => ({ role_id: newRole.id, permission_key: key }))
    const { error: permError } = await supabase.from('role_permissions').insert(rows)
    if (permError) {
      return NextResponse.json({ error: permError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ id: newRole.id, name: newRole.name, is_system: newRole.is_system, permissions: permList }, { status: 201 })
}
