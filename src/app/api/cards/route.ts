import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── POST /api/cards ───────────────────────────────────────────
// Thêm thiết bị（Quản trị viên）
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { equipment_id, name, category, vendor, status, tags, notes, is_new, documents, net_weight } = body

    if (!equipment_id || !name) {
      return NextResponse.json({ error: 'Mã thiết bị và tên là bắt buộc' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('equipment_cards')
      .insert({
        equipment_id: equipment_id.trim(),
        name: name.trim(),
        category: category || null,
        vendor: vendor?.trim() || null,
        status: status ?? 'active',
        tags: Array.isArray(tags) ? tags : [],
        notes: notes?.trim() || null,
        is_new: is_new !== false,
        detail_photos: [],
        documents: Array.isArray(documents) ? documents : [],
        net_weight: (typeof net_weight === 'number' && !isNaN(net_weight)) ? net_weight : null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Mã thiết bị đã tồn tại' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[cards] create error', err)
    return NextResponse.json({ error: 'Tạothất bại' }, { status: 500 })
  }
}
