import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

async function requireAdminPermission(): Promise<{ ok: boolean; error?: NextResponse }> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 }) }

  const { data } = await supabaseAdmin()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', user.id)
    .single()

  if (!(data?.permissions ?? []).includes('admin:roles')) {
    return { ok: false, error: NextResponse.json({ error: 'Không có quyền' }, { status: 403 }) }
  }
  return { ok: true }
}

// PUT: cập nhật permissions cho một role
export async function PUT(req: NextRequest) {
  const auth = await requireAdminPermission()
  if (!auth.ok) return auth.error!

  const { roleId, permissions } = await req.json() as { roleId: string; permissions: string[] }
  if (!roleId || !Array.isArray(permissions)) {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }

  const sb = supabaseAdmin()

  // Xóa permissions cũ của role này
  await sb.from('role_permissions').delete().eq('role_id', roleId)

  // Thêm permissions mới
  if (permissions.length > 0) {
    await sb.from('role_permissions').insert(
      permissions.map(p => ({ role_id: roleId, permission: p }))
    )
  }

  return NextResponse.json({ ok: true })
}
