import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { old_equipment_id, new_equipment_id, group_ids } = await request.json()
  if (!old_equipment_id || !new_equipment_id || !Array.isArray(group_ids) || group_ids.length === 0) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const admin = adminClient()

  // xác nhận所有 group_ids 都屬於此người dùng
  const { data: userGroups } = await admin
    .from('user_groups')
    .select('id')
    .eq('user_id', user.id)
    .in('id', group_ids)

  if (!userGroups || userGroups.length !== group_ids.length) {
    return NextResponse.json({ error: 'Unauthorized group' }, { status: 403 })
  }

  // 在每個NhómTrung bìnhXóa舊Thiết bị、插入新Thiết bị
  for (const groupId of group_ids) {
    await admin.from('group_items').delete()
      .eq('group_id', groupId).eq('equipment_id', old_equipment_id)
    // ON CONFLICT DO NOTHING：新Thiết bị本來就在Nhóm裡也不報錯
    try {
      await admin.from('group_items').insert({ group_id: groupId, equipment_id: new_equipment_id })
    } catch {
      // ignore duplicate key error
    }
  }

  return NextResponse.json({ success: true })
}
