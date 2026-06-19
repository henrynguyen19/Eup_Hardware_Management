import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// GET — danh sách nhóm
export async function GET() {
  const { data, error } = await sb()
    .from('feature_group_defs')
    .select('label, icon, color, sort_order')
    .order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ groups: data ?? [] })
}

// POST — thêm nhóm mới
// Body: { label, icon, color }
export async function POST(req: NextRequest) {
  const { label, icon, color } = await req.json()
  if (!label?.trim()) return NextResponse.json({ error: 'Thiếu tên nhóm' }, { status: 400 })

  const { error } = await sb().from('feature_group_defs').upsert(
    { label: label.trim(), icon: icon ?? '⚙️', color: color ?? 'gray', sort_order: 999 },
    { onConflict: 'label' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — xóa nhóm (chỉ khi không còn tính năng nào dùng)
// Body: { label }
export async function DELETE(req: NextRequest) {
  const { label } = await req.json()
  if (!label) return NextResponse.json({ error: 'Thiếu label' }, { status: 400 })

  const client = sb()
  const { count } = await client
    .from('feature_meta')
    .select('*', { count: 'exact', head: true })
    .eq('group_label', label)

  if (count && count > 0)
    return NextResponse.json({ error: `Nhóm đang có ${count} tính năng, không thể xóa` }, { status: 400 })

  await client.from('feature_group_defs').delete().eq('label', label)
  return NextResponse.json({ ok: true })
}
