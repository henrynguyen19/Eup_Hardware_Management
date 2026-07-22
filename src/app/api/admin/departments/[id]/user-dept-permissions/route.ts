import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminUser } from '@/lib/auth-helpers'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await isAdminUser(user.id)))
    return { ok: false, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true }
}

type Params = { params: { id: string } }

/**
 * GET /api/admin/departments/[id]/user-dept-permissions?userId=xxx
 * Trả về danh sách permission_key của user trong phòng này
 */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 })

  const { data, error } = await sb()
    .from('user_dept_permissions')
    .select('permission_key')
    .eq('user_id', userId)
    .eq('department_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ permissions: (data ?? []).map(r => r.permission_key) })
}

/**
 * PUT /api/admin/departments/[id]/user-dept-permissions
 * Body: { userId: string, permissions: string[] }
 * Thay thế toàn bộ permission_key của user trong phòng này
 * Chỉ được set permissions là subset của role phòng
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { userId, permissions } = await req.json() as { userId: string; permissions: string[] }
  if (!userId) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 })
  if (!Array.isArray(permissions)) return NextResponse.json({ error: 'permissions phải là array' }, { status: 400 })

  const client = sb()

  // Lấy role của phòng để validate ceiling
  const { data: dept } = await client
    .from('departments')
    .select('role_id')
    .eq('id', params.id)
    .single()

  if (dept?.role_id) {
    const { data: rolePerms } = await client
      .from('role_permissions')
      .select('permission_key')
      .eq('role_id', dept.role_id)

    const ceiling = new Set((rolePerms ?? []).map(r => r.permission_key))
    const invalid = permissions.filter(p => !ceiling.has(p))
    if (invalid.length > 0) {
      return NextResponse.json({
        error: `Quyền vượt quá ceiling của phòng: ${invalid.join(', ')}`
      }, { status: 400 })
    }
  }

  // Xóa permissions cũ và insert mới
  const { error: delErr } = await client
    .from('user_dept_permissions')
    .delete()
    .eq('user_id', userId)
    .eq('department_id', params.id)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (permissions.length > 0) {
    const rows = permissions.map(p => ({
      user_id: userId,
      department_id: params.id,
      permission_key: p,
    }))
    const { error: insErr } = await client.from('user_dept_permissions').insert(rows)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, saved: permissions.length })
}
