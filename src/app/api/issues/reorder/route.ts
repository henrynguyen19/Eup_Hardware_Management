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

// PATCH /api/issues/reorder
// 批次Cập nhật同欄 sort_order
// quyền：view_tracker（能看就能sắp xếp）
// body: { orders: [{ id: string, sort_order: number }] }
export async function PATCH(req: NextRequest) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { orders } = body as { orders: { id: string; sort_order: number }[] }

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: 'orders là mảng bắt buộc' }, { status: 400 })
    }

    const supabase = getSupabase()

    // 批次Cập nhật（逐mục upsert sort_order）
    const updates = orders.map(({ id, sort_order }) =>
      supabase
        .from('issues')
        .update({ sort_order })
        .eq('id', id)
    )

    const results = await Promise.all(updates)
    const failed = results.filter(r => r.error)
    if (failed.length > 0) {
      console.error('[issues/reorder] partial failure', failed[0].error)
      return NextResponse.json({ error: '部分Cập nhậtthất bại' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[issues/reorder] error', err)
    return NextResponse.json({ error: 'sắp xếpCập nhậtthất bại' }, { status: 500 })
  }
}
