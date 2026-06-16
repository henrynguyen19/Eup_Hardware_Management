import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/setup-admin
// Tạo tài khoản admin mặc định nếu chưa có
// Chỉ chạy 1 lần khi khởi tạo hệ thống
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const ADMIN_EMAIL = 'admin@eup.net.vn'
  const ADMIN_PASSWORD = 'admin'

  // Kiểm tra user đã tồn tại chưa
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const exists = existingUsers?.users?.some((u: { email?: string }) => u.email === ADMIN_EMAIL)

  if (exists) {
    return NextResponse.json({ message: 'Admin đã tồn tại, không cần setup lại.' })
  }

  // Tạo user admin trong Supabase Auth
  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true, // bỏ qua xác nhận email
  })

  if (createError || !newUser?.user) {
    return NextResponse.json({ error: createError?.message ?? 'Tạo user thất bại' }, { status: 500 })
  }

  // Thêm vào allowed_emails
  await supabase.from('allowed_emails').upsert({ email: ADMIN_EMAIL }, { onConflict: 'email' })

  // Lấy role admin
  const { data: adminRole } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'admin')
    .single()

  if (adminRole) {
    // Gán role admin
    await supabase.from('user_roles').upsert(
      {
        user_id: newUser.user.id,
        user_email: ADMIN_EMAIL,
        role_id: adminRole.id,
      },
      { onConflict: 'user_email' }
    )
  }

  return NextResponse.json({
    message: 'Tạo tài khoản admin thành công!',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    note: 'Hãy đổi mật khẩu sau khi đăng nhập lần đầu.',
  })
}
