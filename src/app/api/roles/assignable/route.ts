import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const ALLOWED_DOMAIN = '@eup.com.tw'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// GET /api/roles/assignable
// 回傳目前người dùng可Phân công給別人的vai trò清單
// - super_admin → 所有vai trò
// - dept_admin  → 同 dept_group 且 level IN ('member','viewer') 的vai trò
// - Khác        → 空陣列
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email || !user.email.endsWith(ALLOWED_DOMAIN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = getServiceClient()

  // 取得目前người dùng的vai tròtên
  const { data: emailData } = await service
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  if (!emailData?.role) {
    return NextResponse.json([])
  }

  // 取得該vai trò的 dept_group + level + assignable_role_names
  const { data: roleData, error: roleError } = await service
    .from('roles')
    .select('id, name, is_system, dept_group, level, assignable_role_names')
    .eq('name', emailData.role)
    .single()

  if (roleError || !roleData) {
    return NextResponse.json([])
  }

  const { level, dept_group, assignable_role_names } = roleData as {
    id: string
    name: string
    is_system: boolean
    dept_group: string | null
    level: string
    assignable_role_names: string[] | null
  }

  // If explicit list is configured, use it
  if (assignable_role_names && assignable_role_names.length > 0) {
    const { data, error } = await service
      .from('roles')
      .select('id, name, is_system, dept_group, level')
      .in('name', assignable_role_names)
      .order('id', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // Fallback: level-based logic
  if (level === 'super_admin') {
    // super_admin 可Phân công所有vai trò
    const { data, error } = await service
      .from('roles')
      .select('id, name, is_system, dept_group, level')
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (level === 'dept_admin') {
    // dept_admin 只能Phân công同 dept_group 且 level IN ('member','viewer') 的vai trò
    if (!dept_group) return NextResponse.json([])
    const { data, error } = await service
      .from('roles')
      .select('id, name, is_system, dept_group, level')
      .eq('dept_group', dept_group)
      .in('level', ['member', 'viewer'])
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // member / viewer 或Khác：無Phân côngquyền
  return NextResponse.json([])
}
