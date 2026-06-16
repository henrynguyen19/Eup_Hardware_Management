import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// ── GET /api/issues ───────────────────────────────────────────
// truy vấnVấn đề清單，支援Lọc：type / status / priority / assignee=me
// quyền：view_tracker
export async function GET(req: NextRequest) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const assignee = searchParams.get('assignee')

    const supabase = getSupabase()

    let query = supabase
      .from('issues')
      .select(`
        id, title, type, priority, status, due_date, description, tags,
        created_by, created_at, updated_at, sort_order,
        issue_assignees(user_email)
      `)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (type) query = query.eq('type', type)
    if (status) query = query.eq('status', status)
    if (priority) query = query.eq('priority', priority)

    const { data, error } = await query

    if (error) throw error

    // assignee=me：只回傳我有被Phân công的Vấn đề
    let result = data ?? []
    if (assignee === 'me') {
      const email = user.email ?? ''
      result = result.filter((issue) =>
        (issue.issue_assignees as { user_email: string }[]).some(
          (a) => a.user_email === email,
        ),
      )
    }

    // 轉換 assignees 為 email 前綴陣列
    const formatted = result.map((issue) => ({
      ...issue,
      assignees: (issue.issue_assignees as { user_email: string }[]).map(
        (a) => a.user_email.split('@')[0],
      ),
      issue_assignees: undefined,
    }))

    return NextResponse.json(formatted)
  } catch (err) {
    console.error('[issues] list error', err)
    return NextResponse.json({ error: 'Truy vấn thất bại' }, { status: 500 })
  }
}

// ── POST /api/issues ──────────────────────────────────────────
// Thêm mớiVấn đề
// quyền：create_issues
export async function POST(req: NextRequest) {
  const user = await requirePermission('create_issues')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { title, type, priority, status, due_date, description, tags, assignees } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Tiêu đề là bắt buộc' }, { status: 400 })
    }
    if (!type?.trim()) {
      return NextResponse.json({ error: 'Loại là bắt buộc' }, { status: 400 })
    }

    const supabase = getSupabase()

    // truy vấnTạo者的 dept_group（thất bại不阻斷Tạo流程）
    let deptGroup: string | null = null
    try {
      const { data: emailRow } = await supabase
        .from('allowed_emails')
        .select('role')
        .eq('email', user.email!)
        .single()

      if (emailRow?.role) {
        const { data: roleRow } = await supabase
          .from('roles')
          .select('dept_group')
          .eq('name', emailRow.role)
          .single()

        deptGroup = roleRow?.dept_group ?? null
      }
    } catch {
      // Truy vấn thất bại不阻斷，dept_group 保持 null
    }

    const { data: issue, error: issueError } = await supabase
      .from('issues')
      .insert({
        title: title.trim(),
        type: type.trim(),
        priority: priority ?? 'medium',
        status: status ?? 'Chờ xử lý',
        due_date: due_date ?? null,
        description: description?.trim() ?? null,
        tags: Array.isArray(tags) ? tags : [],
        created_by: user.email!,
        dept_group: deptGroup,
      })
      .select()
      .single()

    if (issueError) throw issueError

    // 插入Người phụ trách
    if (Array.isArray(assignees) && assignees.length > 0) {
      const rows = assignees.map((email: string) => ({
        issue_id: issue.id,
        user_email: email,
      }))
      const { error: assigneeError } = await supabase
        .from('issue_assignees')
        .insert(rows)
      if (assigneeError) throw assigneeError
    }

    return NextResponse.json(issue, { status: 201 })
  } catch (err) {
    console.error('[issues] create error', err)
    return NextResponse.json({ error: 'Tạothất bại' }, { status: 500 })
  }
}
