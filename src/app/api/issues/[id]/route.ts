import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission, getUserRoleWithPermissions } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// ── GET /api/issues/[id] ──────────────────────────────────────
// truy vấn單mụcVấn đề（含 assignees + updates）
// quyền：view_tracker
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()

    const { data: issue, error } = await supabase
      .from('issues')
      .select(`
        id, title, type, priority, status, due_date, description, tags,
        created_by, created_at, updated_at,
        issue_assignees(user_email),
        issue_updates(id, content, created_by, created_at)
      `)
      .eq('id', params.id)
      .order('created_at', { referencedTable: 'issue_updates', ascending: false })
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Không tìm thấy vấn đề' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json(issue)
  } catch (err) {
    console.error('[issues] get error', err)
    return NextResponse.json({ error: 'Truy vấn thất bại' }, { status: 500 })
  }
}

// ── PATCH /api/issues/[id] ────────────────────────────────────
// Cập nhậtVấn đề欄位
// quyền：本人（created_by = 當前 email）或有 create_issues quyền
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // 一次取得 user + permissions，避免重複 DB 往返
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { permissions } = await getUserRoleWithPermissions()

  if (!permissions.includes('view_tracker')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const canCreateIssues = permissions.includes('create_issues')

  try {
    const adminClient = getSupabase()

    // 取得Vấn đềxác nhận存在並檢查quyền
    const { data: issue, error: fetchError } = await adminClient
      .from('issues')
      .select('id, created_by, status')
      .eq('id', params.id)
      .single()

    if (fetchError || !issue) {
      return NextResponse.json({ error: 'Không tìm thấy vấn đề' }, { status: 404 })
    }

    const isAuthor = issue.created_by === user.email

    // 判斷是否為Người phụ trách（Người phụ trách可Cập nhậtTrạng thái）
    const { data: assigneeRow } = await adminClient
      .from('issue_assignees')
      .select('user_email')
      .eq('issue_id', params.id)
      .eq('user_email', user.email)
      .maybeSingle()

    const isAssignee = !!assigneeRow

    const body = await req.json()
    const { title, type, priority, status, due_date, description, tags, assignees } = body

    // Trạng tháiCập nhật：Người phụ trách + Tạo者 + 有 create_issues 者
    if (status !== undefined && !isAuthor && !isAssignee && !canCreateIssues) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Khác欄位Cập nhật：本人 或 有 create_issues
    const hasFullEdit = isAuthor || canCreateIssues
    if (!hasFullEdit && status === undefined) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updateFields: Record<string, unknown> = {}
    if (hasFullEdit) {
      if (title !== undefined) updateFields.title = title.trim()
      if (type !== undefined) updateFields.type = type.trim()
      if (priority !== undefined) updateFields.priority = priority
      if (due_date !== undefined) updateFields.due_date = due_date ?? null
      if (description !== undefined) updateFields.description = description?.trim() ?? null
      if (tags !== undefined) updateFields.tags = Array.isArray(tags) ? tags : []
    }
    if (status !== undefined) {
      updateFields.status = status
    }

    if (Object.keys(updateFields).length > 0) {
      const { error: updateError } = await adminClient
        .from('issues')
        .update(updateFields)
        .eq('id', params.id)

      if (updateError) throw updateError
    }

    // Cập nhậtNgười phụ trách清單（僅 hasFullEdit 者可thao tác）
    if (hasFullEdit && Array.isArray(assignees)) {
      const { error: deleteError } = await adminClient
        .from('issue_assignees')
        .delete()
        .eq('issue_id', params.id)

      if (deleteError) {
        console.error('[issues] assignees delete error', deleteError)
        return NextResponse.json(
          { error: 'Vấn đề已Cập nhật，但Người phụ trách同步thất bại，請重新Chỉnh sửa', partial: true },
          { status: 500 },
        )
      }

      if (assignees.length > 0) {
        const rows = assignees.map((email: string) => ({
          issue_id: params.id,
          user_email: email,
        }))
        const { error: insertError } = await adminClient
          .from('issue_assignees')
          .insert(rows)

        if (insertError) {
          console.error('[issues] assignees insert error', insertError)
          return NextResponse.json(
            { error: 'Vấn đề已Cập nhật，但Người phụ trách同步thất bại，請重新Chỉnh sửa', partial: true },
            { status: 500 },
          )
        }
      }
    }

    // 回傳最新Vấn đềdữ liệu
    const { data: updated, error: refetchError } = await adminClient
      .from('issues')
      .select(`
        id, title, type, priority, status, due_date, description, tags,
        created_by, created_at, updated_at,
        issue_assignees(user_email),
        issue_updates(id, content, created_by, created_at)
      `)
      .eq('id', params.id)
      .order('created_at', { referencedTable: 'issue_updates', ascending: false })
      .single()

    if (refetchError) throw refetchError

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[issues] update error', err)
    return NextResponse.json({ error: 'Cập nhậtthất bại' }, { status: 500 })
  }
}

// ── DELETE /api/issues/[id] ───────────────────────────────────
// XóaVấn đề（前端需通過 ConfirmDialog xác nhận後才呼叫）
// quyền：本人（created_by = 當前 email）或有 crud_cards quyền
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const adminClient = getSupabase()

    const { data: issue, error: fetchError } = await adminClient
      .from('issues')
      .select('id, created_by')
      .eq('id', params.id)
      .single()

    if (fetchError || !issue) {
      return NextResponse.json({ error: 'Không tìm thấy vấn đề' }, { status: 404 })
    }

    const isAuthor = issue.created_by === user.email
    const hasCrudCards = await requirePermission('crud_cards')

    if (!isAuthor && !hasCrudCards) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // CASCADE 會自動Xóa issue_assignees 與 issue_updates
    const { error: deleteError } = await adminClient
      .from('issues')
      .delete()
      .eq('id', params.id)

    if (deleteError) throw deleteError

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[issues] delete error', err)
    return NextResponse.json({ error: 'Xóathất bại' }, { status: 500 })
  }
}
