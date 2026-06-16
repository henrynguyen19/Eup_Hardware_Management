import { NextRequest, NextResponse } from 'next/server'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { getSettings } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// GET /api/settings — 公開，任何đăng nhập者可讀
export async function GET() {
  const settings = await getSettings()
  return NextResponse.json(settings)
}

// PATCH /api/settings — Quản trị viên或有 edit_card_category / edit_card_status quyền
export async function PATCH(req: NextRequest) {
  // Session check
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { permissions } = await getUserRoleWithPermissions()
  const canManageSettings =
    permissions.includes('manage_roles') ||
    permissions.includes('edit_card_category') ||
    permissions.includes('edit_card_status')
  if (!canManageSettings) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { key, value } = await req.json()
  if (!['categories', 'statuses', 'documentTypes', 'issueTypes', 'issueTags'].includes(key) || !Array.isArray(value)) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  // 欄位層級隔離：根據各自 permission 限制可thao tác的 key
  const allowedKeys: string[] = []
  if (permissions.includes('manage_roles')) {
    allowedKeys.push('categories', 'statuses', 'documentTypes', 'issueTypes', 'issueTags')
  } else {
    if (permissions.includes('edit_card_category')) allowedKeys.push('categories', 'documentTypes')
    if (permissions.includes('edit_card_status')) allowedKeys.push('statuses')
  }
  if (!allowedKeys.includes(key)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await getSupabase()
    .from('app_settings')
    .upsert({ key, value }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
