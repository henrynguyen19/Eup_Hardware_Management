import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data } = await sb().from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  if (!(data?.permissions ?? []).includes('admin:users'))
    return { ok: false, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true }
}

// GET /api/admin/departments — list all departments with member count
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error!

  const { data: depts } = await sb().from('departments').select('*').order('name')
  if (!depts) return NextResponse.json({ departments: [] })

  // Get member counts
  const { data: memberships } = await sb().from('user_departments').select('department_id')
  const countMap: Record<string, number> = {}
  for (const m of memberships ?? []) {
    countMap[m.department_id] = (countMap[m.department_id] ?? 0) + 1
  }

  return NextResponse.json({
    departments: depts.map(d => ({ ...d, member_count: countMap[d.id] ?? 0 }))
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
