import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAuthUser() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function checkWritePermission(userId: string): Promise<boolean> {
  const { data } = await sb()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', userId)
    .single()
  const perms: string[] = data?.permissions ?? []
  return perms.includes('sua_chua:write') || perms.includes('admin:users')
}

// GET — danh sách tuần (có thể kèm tổng)
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year = searchParams.get('year')

  let query = sb().from('repair_weeks').select('*').order('year', { ascending: false }).order('week_number', { ascending: false })
  if (year) query = query.eq('year', parseInt(year))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ weeks: data ?? [] })
}

// POST — thêm tuần mới
// Body: { year, week_number, week_label, date_start?, date_end?, notes? }
export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const canWrite = await checkWritePermission(user.id)
  if (!canWrite) return NextResponse.json({ error: 'Không có quyền nhập liệu sửa chữa' }, { status: 403 })

  const body = await req.json()
  const { year, week_number, week_label, date_start, date_end, notes } = body

  if (!year || !week_number || !week_label) {
    return NextResponse.json({ error: 'Thiếu year, week_number hoặc week_label' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data, error } = await sb()
    .from('repair_weeks')
    .upsert({
      year, week_number, week_label, date_start, date_end, notes,
      updated_at: now,
    }, { onConflict: 'year,week_number' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ week: data })
}

// DELETE — xóa tuần (cascade xóa stats + totals)
// Body: { week_id }
export async function DELETE(req: NextRequest) {
  const { week_id } = await req.json()
  if (!week_id) return NextResponse.json({ error: 'Thiếu week_id' }, { status: 400 })

  const { error } = await sb().from('repair_weeks').delete().eq('id', week_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
