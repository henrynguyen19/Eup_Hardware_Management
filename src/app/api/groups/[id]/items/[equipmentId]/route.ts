import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function DELETE(_: Request, { params }: { params: { id: string; equipmentId: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminClient()
  const { data: group } = await admin
    .from('user_groups')
    .select('user_id')
    .eq('id', params.id)
    .single()

  if (!group || group.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await admin
    .from('group_items')
    .delete()
    .eq('group_id', params.id)
    .eq('equipment_id', params.equipmentId)

  return new NextResponse(null, { status: 204 })
}
