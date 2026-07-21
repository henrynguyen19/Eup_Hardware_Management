import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminUser, getAuthUser } from '@/lib/auth-helpers'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

// PUT /api/admin/roles/[id]/assignable — cập nhật danh sách roles có thể assign
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (!(await isAdminUser(user.id))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const { assignable_role_names } = await req.json()
  if (!Array.isArray(assignable_role_names)) {
    return NextResponse.json({ error: 'assignable_role_names phải là mảng' }, { status: 400 })
  }

  const { error } = await sb()
    .from('roles')
    .update({ assignable_role_names: assignable_role_names.length > 0 ? assignable_role_names : null })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
