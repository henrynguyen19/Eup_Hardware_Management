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

// PATCH /api/roles/[id]
// 支援Cập nhật name 或 dept_group（至少需傳入其一）
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '無效的yêu cầu內容' }, { status: 400 })
  }

  const { name, dept_group } = body as { name?: unknown; dept_group?: unknown }

  // 驗證：至少需要 name 或 dept_group 其Trung bình一個
  const hasName = name !== undefined
  const hasDeptGroup = dept_group !== undefined

  if (!hasName && !hasDeptGroup) {
    return NextResponse.json({ error: '請提供 name 或 dept_group' }, { status: 400 })
  }

  if (hasName && (typeof name !== 'string' || (name as string).trim() === '')) {
    return NextResponse.json({ error: 'vai tròtên不可為空' }, { status: 400 })
  }

  if (hasDeptGroup && dept_group !== null && typeof dept_group !== 'string') {
    return NextResponse.json({ error: 'dept_group 必須為字串或 null' }, { status: 400 })
  }

  const supabase = getSupabase()

  const { data: role, error: fetchError } = await supabase
    .from('roles')
    .select('id, is_system')
    .eq('id', id)
    .single()

  if (fetchError || !role) {
    return NextResponse.json({ error: '找不到vai trò' }, { status: 404 })
  }

  if (hasName && role.is_system) {
    return NextResponse.json({ error: 'hệ thốngvai trò不可重命名' }, { status: 403 })
  }

  const updateFields: Record<string, unknown> = {}
  if (hasName) updateFields.name = (name as string).trim()
  if (hasDeptGroup) updateFields.dept_group = (dept_group as string | null)

  const { data: updated, error: updateError } = await supabase
    .from('roles')
    .update(updateFields)
    .eq('id', id)
    .select('id, name, dept_group')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}

// DELETE /api/roles/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const supabase = getSupabase()

  const { data: role, error: fetchError } = await supabase
    .from('roles')
    .select('id, name, is_system')
    .eq('id', id)
    .single()

  if (fetchError || !role) {
    return NextResponse.json({ error: '找不到vai trò' }, { status: 404 })
  }

  if (role.is_system) {
    return NextResponse.json({ error: 'hệ thốngvai trò不可Xóa' }, { status: 403 })
  }

  // xác nhận沒有 allowed_emails 在使用此vai trò
  const { data: usersWithRole, error: usersError } = await supabase
    .from('allowed_emails')
    .select('email')
    .eq('role', role.name)

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 })
  }

  if (usersWithRole && usersWithRole.length > 0) {
    const emails = usersWithRole.map((u) => u.email).join(', ')
    return NextResponse.json(
      { error: `vai trò仍有người dùng，請先重新Phân côngvai trò後再Xóa。相關người dùng：${emails}` },
      { status: 409 },
    )
  }

  const { error: deleteError } = await supabase
    .from('roles')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
