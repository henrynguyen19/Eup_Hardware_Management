import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// GET /api/kho/equipment/[id]/vehicle-compat
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data, error } = await sb()
    .from('device_vehicle_compat')
    .select(`
      requirement,
      group_note,
      notes,
      vehicle_types (id, name, category, sort_order)
    `)
    .eq('equipment_id', params.id)
    .order('requirement', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ compat: data ?? [] })
}

// POST /api/kho/equipment/[id]/vehicle-compat — thêm xe tương thích
// Body: { vehicle_type_id, requirement, group_note?, notes? }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { vehicle_type_id, requirement, group_note, notes } = await req.json()
  if (!vehicle_type_id || !requirement) {
    return NextResponse.json({ error: 'Thiếu vehicle_type_id hoặc requirement' }, { status: 400 })
  }
  if (!['mandatory', 'optional'].includes(requirement)) {
    return NextResponse.json({ error: 'requirement phải là mandatory hoặc optional' }, { status: 400 })
  }

  const { error } = await sb()
    .from('device_vehicle_compat')
    .upsert(
      {
        equipment_id: params.id,
        vehicle_type_id,
        requirement,
        group_note: group_note ?? null,
        notes: notes ?? null,
      },
      { onConflict: 'equipment_id,vehicle_type_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/kho/equipment/[id]/vehicle-compat — cập nhật requirement/notes
// Body: { vehicle_type_id, requirement?, group_note?, notes? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { vehicle_type_id, requirement, group_note, notes } = await req.json()
  if (!vehicle_type_id) {
    return NextResponse.json({ error: 'Thiếu vehicle_type_id' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (requirement !== undefined) update.requirement = requirement
  if (group_note  !== undefined) update.group_note  = group_note
  if (notes       !== undefined) update.notes       = notes

  const { error } = await sb()
    .from('device_vehicle_compat')
    .update(update)
    .eq('equipment_id', params.id)
    .eq('vehicle_type_id', vehicle_type_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/kho/equipment/[id]/vehicle-compat — xoá 1 bản ghi compat
// Body: { vehicle_type_id }
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { vehicle_type_id } = await req.json()
  if (!vehicle_type_id) {
    return NextResponse.json({ error: 'Thiếu vehicle_type_id' }, { status: 400 })
  }

  const { error } = await sb()
    .from('device_vehicle_compat')
    .delete()
    .eq('equipment_id', params.id)
    .eq('vehicle_type_id', vehicle_type_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
