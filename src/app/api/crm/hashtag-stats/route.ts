/**
 * GET /api/crm/hashtag-stats
 * Quét toàn bộ ho_tro_tickets, đếm số lần xuất hiện mỗi hashtag trong cột reply.
 * Không cần admin — tất cả thành viên có ho_tro:read đều xem được.
 */
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export const runtime     = 'nodejs'
export const maxDuration = 60

const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()

  // Lấy danh sách hashtag definitions
  const { data: defs } = await db
    .from('hashtag_definitions')
    .select('tag, meaning, category, sort_order')
    .order('sort_order')

  const tags = (defs ?? []).map(d => d.tag)
  if (!tags.length) return NextResponse.json({ stats: [] })

  // Quét toàn bộ reply column — count per hashtag using ilike
  // Dùng Promise.all để chạy song song cho tất cả hashtag
  const counts = await Promise.all(
    tags.map(async (tag) => {
      const { count } = await db
        .from('ho_tro_tickets')
        .select('*', { count: 'exact', head: true })
        .ilike('reply', `%${tag}%`)
      return { tag, count: count ?? 0 }
    })
  )

  const countMap = Object.fromEntries(counts.map(c => [c.tag, c.count]))

  const stats = (defs ?? []).map(d => ({
    ...d,
    count: countMap[d.tag] ?? 0,
  }))

  return NextResponse.json({ stats, total: stats.reduce((s, d) => s + d.count, 0) })
}
