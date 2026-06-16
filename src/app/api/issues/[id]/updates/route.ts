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

// ── POST /api/issues/[id]/updates ────────────────────────────
// Thêm mớiCập nhật紀錄
// quyền：view_tracker（任何可看追蹤板的人都能留Cập nhật）
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { content } = body

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Cập nhật內容為必填' }, { status: 400 })
    }

    const supabase = getSupabase()

    // xác nhậnVấn đề存在
    const { data: issue, error: fetchError } = await supabase
      .from('issues')
      .select('id')
      .eq('id', params.id)
      .single()

    if (fetchError || !issue) {
      return NextResponse.json({ error: 'Không tìm thấy vấn đề' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('issue_updates')
      .insert({
        issue_id: params.id,
        content: content.trim(),
        created_by: user.email!,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[issues/updates] create error', err)
    return NextResponse.json({ error: 'Thêm mớiCập nhật紀錄thất bại' }, { status: 500 })
  }
}
