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

  if (!(data?.permissions ?? []).includes('admin:users')) {
    return { ok: false, error: NextResponse.json({ error: 'Không có quyền' }, { status: 403 }) }
  }
  return { ok: true }
}

// GET: lấy danh sách users
export async function GET() {
  const auth = await requireAdminPermission()
  if (!auth.ok) return auth.error!

  const { data } = await supabaseAdmin()
    .from('user_permissions_view')
    .select('*')
    .order('user_email')

  return NextResponse.json({ users: data ?? [] })
}

// POST: thêm user mới (thêm vào allowed_emails + gán role)
export async function POST(req: NextRequest) {
  const auth = await requireAdminPermission()
  if (!auth.ok) return auth.error!

  const { email, roleId } = await req.json()
  if (!email || !roleId) {
    return NextResponse.json({ error: 'Thiếu email hoặc roleId' }, { status: 400 })
  }

  const sb = supabaseAdmin()

  // Thêm vào allowed_emails
  await sb.from('allowed_emails').upsert({ email }, { onConflict: 'email' })

  // Kiểm tra xem user đã có trong auth chưa
  const { data: authUsers } = await sb.auth.admin.listUsers()
  const authUser = authUsers?.users?.find((u: { email?: string }) => u.email === email)

  if (authUser) {
    // Upsert user_role
    await sb.from('user_roles').upsert(
      { user_id: authUser.id, user_email: email, role_id: roleId },
      { onConflict: 'user_email' }
    )
  }

  return NextResponse.json({ ok: true })
}

// PATCH: đổi role user
export async function PATCH(req: NextRequest) {
  const auth = await requireAdminPermission()
  if (!auth.ok) return auth.error!

  const { userId, roleId } = await req.json()
  await supabaseAdmin()
    .from('user_roles')
    .update({ role_id: roleId })
    .eq('user_id', userId)

  return NextResponse.json({ ok: true })
}

// DELETE: xóa quyền truy cập
export async function DELETE(req: NextRequest) {
  const auth = await requireAdminPermission()
  if (!auth.ok) return auth.error!

  const { userId } = await req.json()
  const sb = supabaseAdmin()

  // Lấy email để xóa khỏi allowed_emails
  const { data: userRole } = await sb
    .from('user_roles')
    .select('user_email')
    .eq('user_id', userId)
    .single()

  await sb.from('user_roles').delete().eq('user_id', userId)
  if (userRole?.user_email) {
    await sb.from('allowed_emails').delete().eq('email', userRole.user_email)
  }

  return NextResponse.json({ ok: true })
}
