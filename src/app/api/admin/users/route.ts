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

// GET: lấy danh sách users — từ Supabase Auth (tất cả user, không phụ thuộc view cũ)
export async function GET() {
  const auth = await requireAdminPermission()
  if (!auth.ok) return auth.error!

  const sb = supabaseAdmin()
  // Lấy tất cả user từ Auth (hỗ trợ tối đa 1000 user/page)
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const users = (data?.users ?? [])
    .filter(u => u.email)
    .map(u => ({ user_id: u.id, user_email: u.email! }))
    .sort((a, b) => a.user_email.localeCompare(b.user_email))

  return NextResponse.json({ users })
}

// POST: thêm user mới — tạo tài khoản Supabase Auth với mật khẩu mặc định eupvn123
export async function POST(req: NextRequest) {
  const auth = await requireAdminPermission()
  if (!auth.ok) return auth.error!

  const { email, roleId, departmentId } = await req.json()
  if (!email) {
    return NextResponse.json({ error: 'Thiếu email' }, { status: 400 })
  }

  const sb = supabaseAdmin()

  // Thử tạo user mới trước
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password: 'eupvn123',
    email_confirm: true,
  })

  if (!createErr) {
    const userId = created.user?.id
    try { await sb.from('allowed_emails').upsert({ email }, { onConflict: 'email' }) } catch { /* ignore */ }
    if (userId) {
      await sb.from('user_roles').upsert(
        { user_id: userId, user_email: email, role_id: roleId ?? null },
        { onConflict: 'user_id' }
      )
      if (departmentId) {
        await sb.from('user_departments').insert({ user_id: userId, department_id: departmentId }).catch(() => {})
      }
    }
    return NextResponse.json({ ok: true, userId })
  }

  // Nếu lỗi "already exists" → tìm userId và đảm bảo user_roles tồn tại
  const errMsg = createErr.message?.toLowerCase() ?? ''
  if (errMsg.includes('already') || errMsg.includes('duplicate') || errMsg.includes('exists')) {
    // Tìm userId từ view
    const { data: viewRow } = await sb
      .from('user_permissions_view')
      .select('user_id')
      .eq('user_email', email)
      .maybeSingle()

    if (viewRow?.user_id) {
      // Đảm bảo user_roles tồn tại
      await sb.from('user_roles').upsert(
        { user_id: viewRow.user_id, user_email: email, role_id: null },
        { onConflict: 'user_id' }
      )
      return NextResponse.json({ ok: true, userId: viewRow.user_id, alreadyExists: true })
    }

    // Tìm qua listUsers
    const { data: page } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const found = page?.users?.find((u: { email?: string }) => u.email === email)
    if (found) {
      await sb.from('user_roles').upsert(
        { user_id: found.id, user_email: email, role_id: null },
        { onConflict: 'user_id' }
      )
      return NextResponse.json({ ok: true, userId: found.id, alreadyExists: true })
    }

    return NextResponse.json({ error: 'Email này đã tồn tại nhưng không tìm được userId' }, { status: 409 })
  }

  // Lỗi khác
  return NextResponse.json({ error: createErr.message }, { status: 500 })
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

// PUT: reset mật khẩu về mặc định
export async function PUT(req: NextRequest) {
  const auth = await requireAdminPermission()
  if (!auth.ok) return auth.error!

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 })

  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, {
    password: 'eupvn123',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE: xóa tài khoản hoàn toàn
export async function DELETE(req: NextRequest) {
  const auth = await requireAdminPermission()
  if (!auth.ok) return auth.error!

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 })

  const sb = supabaseAdmin()

  // Xóa khỏi user_departments (cascade khi xóa auth user, nhưng xóa trước cho chắc)
  await sb.from('user_departments').delete().eq('user_id', userId)

  // Xóa khỏi user_roles + allowed_emails (backward compat)
  const { data: userRole } = await sb.from('user_roles').select('user_email').eq('user_id', userId).maybeSingle()
  await sb.from('user_roles').delete().eq('user_id', userId)
  if (userRole?.user_email) {
    await sb.from('allowed_emails').delete().eq('email', userRole.user_email)
  }

  // Xóa tài khoản Auth
  const { error } = await sb.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
