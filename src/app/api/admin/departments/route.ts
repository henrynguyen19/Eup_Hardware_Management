import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isAdminUser } from '@/lib/auth-helpers'

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

// GET /api/admin/departments — list all departments with member count + role info
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const client = sb()

  const [{ data: depts }, { data: memberships }, { data: roles }] = await Promise.all([
    client.from('departments').select('*').order('name'),
    client.from('user_departments').select('department_id'),
    client.from('roles').select('id, name, role_permissions(permission_key)').order('name'),
  ])

  if (!depts) return NextResponse.json({ departments: [], roles: [] })

  const countMap: Record<string, number> = {}
  for (const m of memberships ?? []) {
    countMap[m.department_id] = (countMap[m.department_id] ?? 0) + 1
  }

  const rolesFormatted = (roles ?? []).map((r: {
    id: string; name: string;
    role_permissions: { permission_key: string }[]
  }) => ({
    id: r.id,
    name: r.name,
    permissions: (r.role_permissions ?? []).map(p => p.permission_key).filter(Boolean),
  }))

  return NextResponse.json({
    departments: depts.map(d => ({ ...d, member_count: countMap[d.id] ?? 0 })),
    roles: rolesFormatted,
  })
}

// POST /api/admin/departments — create department
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { name, code, color } = await req.json()
  if (!name || !code) return NextResponse.json({ error: 'Thiếu name hoặc code' }, { status: 400 })

  const { data, error } = await sb().from('departments').insert({ name, code, color: color ?? '#6b7280' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ department: data })
}
