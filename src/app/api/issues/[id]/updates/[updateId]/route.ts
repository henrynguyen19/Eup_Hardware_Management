import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission, getUserRoleWithPermissions } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// ── DELETE /api/issues/[id]/updates/[updateId] ───────────────
// XóaCập nhật紀錄
// quyền：Cập nhật的Tạo者 OR 擁有 create_issues quyền
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; updateId: string } },
) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()

    // 取得既有Cập nhật紀錄
    const { data: update, error: fetchError } = await supabase
      .from('issue_updates')
      .select('id, created_by, issue_id')
      .eq('id', params.updateId)
      .single()

    if (fetchError || !update) {
      return NextResponse.json({ error: '找不到Cập nhật紀錄' }, { status: 404 })
    }

    // xác nhận updateId 屬於指定 issue
    if (update.issue_id !== params.id) {
      return NextResponse.json({ error: 'Cập nhật紀錄不屬於此Vấn đề' }, { status: 400 })
    }

    // quyền檢查：Tạo者本人 OR 擁有 create_issues quyền
    const isOwner = update.created_by === user.email
    if (!isOwner) {
      const { permissions } = await getUserRoleWithPermissions()
      if (!permissions.includes('create_issues')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const { error } = await supabase
      .from('issue_updates')
      .delete()
      .eq('id', params.updateId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[issues/updates/[updateId]] delete error', err)
    return NextResponse.json({ error: 'XóaCập nhật紀錄thất bại' }, { status: 500 })
  }
}
