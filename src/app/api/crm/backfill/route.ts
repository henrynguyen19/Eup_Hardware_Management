/**
 * POST /api/crm/backfill
 * Quét TOÀN BỘ ho_tro_tickets, cập nhật các trường còn thiếu từ dữ liệu đã có:
 * - speed_tag: parse từ cột reply (CS_Memo)
 * Admin only.
 */
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { parseSpeedTag } from '@/lib/crm-utils'

export const runtime     = 'nodejs'
export const maxDuration = 60

const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  const { data: permData } = await db
    .from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  const perms: string[] = permData?.permissions ?? []
  if (!perms.includes('admin:users'))
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  let scanned = 0
  let speedTagUpdated = 0
  const errors: string[] = []
  const PAGE = 1000

  // Quét toàn bộ — loop cho đến hết
  for (let offset = 0; ; offset += PAGE) {
    const { data: rows, error: fetchErr } = await db
      .from('ho_tro_tickets')
      .select('id, reply, speed_tag')
      .not('reply', 'is', null)
      .range(offset, offset + PAGE - 1)

    if (fetchErr) { errors.push(fetchErr.message); break }
    if (!rows || rows.length === 0) break

    scanned += rows.length

    // Chỉ update những hàng speed_tag còn null
    const toUpdate = rows
      .filter(r => r.speed_tag === null || r.speed_tag === undefined)
      .map(r => ({ id: r.id, tag: parseSpeedTag(r.reply ?? '') }))
      .filter(r => r.tag !== null)

    // Batch update 100 cùng lúc
    const results = await Promise.allSettled(
      toUpdate.map(u =>
        db.from('ho_tro_tickets')
          .update({ speed_tag: u.tag })
          .eq('id', u.id)
          .is('speed_tag', null)
      )
    )
    for (const r of results) {
      if (r.status === 'rejected') errors.push(String(r.reason))
      else if (r.value.error) errors.push(r.value.error.message)
      else speedTagUpdated++
    }

    if (rows.length < PAGE) break // last page
  }

  return NextResponse.json({
    ok: true,
    scanned,
    speedTagUpdated,
    errors: errors.length ? errors.slice(0, 10) : undefined,
  })
}
