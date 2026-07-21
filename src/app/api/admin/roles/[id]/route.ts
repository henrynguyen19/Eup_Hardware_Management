import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminUser, getAuthUser } from '@/lib/auth-helpers'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

async function guard() {
  const user = await getAuthUser()
  if (!user) return { ok: false as const, res: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) }
  if (!(await isAdminUser(user.id))) return { ok: false as const, res: NextResponse.json({ error: 'Không có quyền' }, { status: 403 }) }
  return { ok: true as const }
}

// PATCH /api/admin/roles/[id] — cập nhật name hoặc dept_group
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const g = await guard()
  if (!g.ok) return g.res

  const { id } = params
  const body = await req.json() as { name?: string; dept_group?: string | null }
  const { name, dept_group } = body

  if (name === undefined && dept_group === undefined) {
    return NextResponse.json({ error: 'Cần truyền name hoặc dept_group' }, { status: 400 })
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return NextResponse.json({ error: 'Tên vai trò không được để trống' }, { status: 400 })
  }

  const { data: role, error: fetchErr } = await sb()
    .from('roles').select('id, is_system').eq('id', id).single()
  if (fetchErr || !role) return NextResponse.json({ error: 'Không tìm thấy vai trò' }, { status: 404 })
  if (name !== undefined && role.is_system) {
    return NextResponse.json({ error: 'Không thể đổi tên vai trò hệ thống' }, { status: 403 })
  }

  const updateFields: Record<string, unknown> = {}
  if (name !== undefined) updateFields.name = name.trim()
  if (dept_group !== undefined) updateFields.dept_group = dept_group

  const { data: updated, error: updateErr } = await sb()
    .from('roles').update(updateFields).eq('id', id).select('id, name, dept_group').single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json(updated)
}

// DELETE /api/admin/roles/[id] — xóa role (chỉ non-system)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const g = await guard()
  if (!g.ok) return g.res

  const { id } = params
  const db = sb()

  const { data: role, error: fetchErr } = await db
    .from('roles').select('id, name, is_system').eq('id', id).single()
  if (fetchErr || !role) return NextResponse.json({ error: 'Không tìm thấy vai trò' }, { status: 404 })
  if (role.is_system) return NextResponse.json({ error: 'Không thể xóa vai trò hệ thống' }, { status: 403 })

  await db.from('role_permissions').delete().eq('role_id', id)
  await db.from('user_roles').delete().eq('role_id', id)
  const { error } = await db.from('roles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
