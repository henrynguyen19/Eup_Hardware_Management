import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface BatchRow {
  equipment_id: string
  name: string
  category?: string
  vendor?: string
  status?: string
  tags?: string[]
  notes?: string
  net_weight?: number
}

// ── POST /api/cards/batch ─────────────────────────────────────
// 批次Thêm thiết bị（Quản trị viên）
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let rows: BatchRow[]
  try {
    const body = await req.json()
    rows = body.rows
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Không có dữ liệu hợp lệ' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Định dạng sai' }, { status: 400 })
  }

  const supabase = getSupabase()
  const inserted: string[] = []
  const updated: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  for (const row of rows) {
    const { error } = await supabase
      .from('equipment_cards')
      .insert({
        equipment_id: row.equipment_id.trim(),
        name: row.name.trim(),
        category: row.category?.trim() || null,
        vendor: row.vendor?.trim() || null,
        status: row.status?.trim() || 'Hiện hành',
        tags: Array.isArray(row.tags) ? row.tags : [],
        notes: row.notes?.trim() || null,
        detail_photos: [],
        net_weight: (typeof row.net_weight === 'number' && !isNaN(row.net_weight)) ? row.net_weight : null,
      })

    if (error) {
      if (error.code === '23505') {
        // Mã thiết bị đã tồn tại：改為Cập nhật有提供且非空的欄位
        const updatePayload: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        }
        if (row.name.trim()) updatePayload.name = row.name.trim()
        if (row.category?.trim()) updatePayload.category = row.category.trim()
        if (row.vendor?.trim()) updatePayload.vendor = row.vendor.trim()
        if (row.status?.trim()) updatePayload.status = row.status.trim()
        if (Array.isArray(row.tags) && row.tags.length > 0) updatePayload.tags = row.tags
        if (row.notes?.trim()) updatePayload.notes = row.notes.trim()
        if (typeof row.net_weight === 'number' && !isNaN(row.net_weight)) {
          updatePayload.net_weight = row.net_weight
        }

        const { error: updateError } = await supabase
          .from('equipment_cards')
          .update(updatePayload)
          .eq('equipment_id', row.equipment_id.trim())

        if (updateError) {
          errors.push(`${row.equipment_id}：${updateError.message}`)
        } else {
          updated.push(row.equipment_id)
        }
      } else {
        errors.push(`${row.equipment_id}：${error.message}`)
      }
    } else {
      inserted.push(row.equipment_id)
    }
  }

  return NextResponse.json({ inserted: inserted.length, updated: updated.length, skipped, errors })
}
