/**
 * GET /api/repair-tracking/hashtags
 * Trích xuất hashtags từ trường notes của repair_items.
 * Kỹ thuật viên ghi "#man_hinh #pin_yeu #camera_loi" → hệ thống tổng hợp.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Match hashtag: # + bất kỳ ký tự không phải space/dấu câu
const HASHTAG_RE = /#([^\s#,;.!?()[\]{}"']+)/g

function extractTags(notes: string | null): string[] {
  if (!notes?.trim()) return []
  const tags: string[] = []
  let m: RegExpExecArray | null
  HASHTAG_RE.lastIndex = 0
  while ((m = HASHTAG_RE.exec(notes)) !== null) {
    const tag = m[1].toLowerCase().trim()
    if (tag.length > 0) tags.push(tag)
  }
  return tags
}

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = sb()

  // Lấy tất cả notes (chỉ cần id, notes, product_name, status, imei)
  const PAGE = 1000
  const items: { notes: string | null; product_name: string; status: string; imei: string }[] = []
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from('repair_items')
      .select('notes, product_name, status, imei')
      .not('notes', 'is', null)
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    items.push(...(data as typeof items))
    if (data.length < PAGE) break
  }

  // Tổng hợp hashtags
  const tagMap = new Map<string, {
    count:    number
    products: Map<string, number>   // product_name → count
    statuses: Record<string, number>
    imeis:    Set<string>
  }>()

  for (const item of items) {
    const tags = extractTags(item.notes)
    for (const tag of tags) {
      if (!tagMap.has(tag)) {
        tagMap.set(tag, { count: 0, products: new Map(), statuses: {}, imeis: new Set() })
      }
      const entry = tagMap.get(tag)!
      entry.count++
      entry.products.set(item.product_name, (entry.products.get(item.product_name) ?? 0) + 1)
      entry.statuses[item.status] = (entry.statuses[item.status] ?? 0) + 1
      entry.imeis.add(item.imei)
    }
  }

  const tags = Array.from(tagMap.entries())
    .map(([tag, v]) => ({
      tag,
      count:       v.count,
      deviceCount: v.imeis.size,
      statuses:    v.statuses,
      topProducts: Array.from(v.products.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([product_name, cnt]) => ({ product_name, count: cnt })),
    }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({ tags, totalWithNotes: items.length })
}
