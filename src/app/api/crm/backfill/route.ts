/**
 * POST /api/crm/backfill
 *
 * Cập nhật các trường còn thiếu trong ho_tro_tickets mà KHÔNG cần gọi lại CRM:
 *
 * 1. speed_tag  — parse từ cột `reply` (= CS_Memo đã lưu) cho những hàng đang NULL
 *
 * Admin only.
 */
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { parseSpeedTag } from '@/lib/crm-utils'

export const runtime     = 'nodejs'
export const maxDuration = 60

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export async function POST() {
  // Auth — admin only
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  if (!perms.includes('admin:users'))
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  // ── 1. Backfill speed_tag từ reply đã có trong DB ──────────────────────────
  // Chỉ xử lý hàng: speed_tag IS NULL và reply IS NOT NULL
  const { data: rows, error: fetchErr } = await db
    .from('ho_tro_tickets')
    .select('id, reply')
    .is('speed_tag', null)
    .not('reply', 'is', null)
    .limit(5000)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  // Parse speed_tag từ reply
  const updates: { id: number; speed_tag: string }[] = []
  for (const row of (rows ?? [])) {
    const tag = parseSpeedTag(row.reply ?? '')
    if (tag) updates.push({ id: row.id, speed_tag: tag })
  }

  let speedTagUpdated = 0
  const errors: string[] = []

  // Batch update 500 hàng 1 lần
  for (let i = 0; i < updates.length; i += 500) {
    const batch = updates.slice(i, i + 500)
    // Supabase không hỗ trợ upsert bằng non-PK field nên update từng id
    // Dùng Promise.allSettled để tránh 1 lỗi block toàn bộ
    const results = await Promise.allSettled(
      batch.map(u =>
        db.from('ho_tro_tickets')
          .update({ speed_tag: u.speed_tag })
          .eq('id', u.id)
          .is('speed_tag', null)   // double-check: chỉ update nếu vẫn còn null
      )
    )
    for (const r of results) {
      if (r.status === 'rejected') errors.push(String(r.reason))
      else if (r.value.error) errors.push(r.value.error.message)
      else speedTagUpdated++
    }
  }

  return NextResponse.json({
    ok: true,
    scanned:         rows?.length ?? 0,
    speedTagFound:   updates.length,
    speedTagUpdated,
    errors:          errors.length ? errors.slice(0, 10) : undefined,
    note: 'customer_id và zone cần CRM sync — sẽ tự điền khi nhấn sync từng người',
  })
}
