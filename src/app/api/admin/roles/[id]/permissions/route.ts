import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminUser, getAuthUser } from '@/lib/auth-helpers'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

const VALID_PERMISSION_KEYS = [
  'read_all_cards', 'read_active_only', 'read_documents', 'read_notes', 'read_vendor',
  'read_updated_by', 'read_updated_content', 'use_bookmarks', 'filter_all_statuses', 'filter_no_photo',
  'create_delete_cards',
  'edit_card_equipment_id', 'edit_card_name', 'edit_card_category', 'edit_card_status',
  'edit_card_vendor', 'edit_card_tags', 'edit_card_notes', 'edit_card_weight',
  'edit_card_documents', 'edit_card_is_new', 'edit_card_main_photo', 'edit_card_detail_photos',
  'manage_users', 'manage_roles', 'use_groups',
  'view_tracker', 'view_my_tasks', 'create_issues', 'tracker_edit_issue',
]

// GET /api/admin/roles/[id]/permissions
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (!(await isAdminUser(user.id))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const { data, error } = await sb()
    .from('role_permissions')
    .select('permission_key')
    .eq('role_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const permissions = (data ?? [])
    .map(p => p.permission_key)
    .filter(k => VALID_PERMISSION_KEYS.includes(k))

  return NextResponse.json({ permissions })
}

// PUT /api/admin/roles/[id]/permissions — ghi đè toàn bộ permissions
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (!(await isAdminUser(user.id))) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const { permissions } = await req.json() as { permissions: string[] }
  if (!Array.isArray(permissions)) {
    return NextResponse.json({ error: 'permissions phải là mảng' }, { status: 400 })
  }

  const invalid = permissions.filter(k => !VALID_PERMISSION_KEYS.includes(k))
  if (invalid.length > 0) {
    return NextResponse.json({ error: `permission_key không hợp lệ: ${invalid.join(', ')}` }, { status: 400 })
  }

  // read_all_cards và read_active_only xung đột — giữ read_active_only
  let finalPerms = [...permissions]
  if (finalPerms.includes('read_all_cards') && finalPerms.includes('read_active_only')) {
    finalPerms = finalPerms.filter(k => k !== 'read_all_cards')
  }

  const db = sb()

  const { data: role, error: fetchErr } = await db
    .from('roles').select('id').eq('id', params.id).single()
  if (fetchErr || !role) return NextResponse.json({ error: 'Không tìm thấy vai trò' }, { status: 404 })

  const { error: delErr } = await db.from('role_permissions').delete().eq('role_id', params.id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (finalPerms.length > 0) {
    const rows = finalPerms.map(key => ({ role_id: params.id, permission_key: key }))
    const { error: insertErr } = await db.from('role_permissions').insert(rows)
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, permissions: finalPerms })
}
