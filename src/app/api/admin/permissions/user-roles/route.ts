import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

// GET: lấy role hiện tại của tất cả users
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const sb = supabaseAdmin()

  const { data } = await sb
    .from('user_roles')
    .select('user_id, user_email, role_id, roles(name)')

  const userRoles = (data ?? []).map((r: {
    user_id: string
    user_email: string
    role_id: string | null
    roles: { name: string } | null
  }) => ({
    user_id:   r.user_id,
    user_email: r.user_email,
    role_id:   r.role_id,
    role_name: r.roles?.name ?? null,
  }))

  return NextResponse.json({ userRoles })
}
