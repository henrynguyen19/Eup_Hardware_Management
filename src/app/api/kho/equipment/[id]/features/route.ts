import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// GET /api/kho/equipment/[id]/features
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data, error } = await sb()
    .from('device_features')
    .select('feature_key, value, notes')
    .eq('equipment_id', params.id)
    .order('feature_key')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ features: data ?? [] })
}

// PUT /api/kho/equipment/[id]/features
// Body: { features: Array<{ feature_key, value, notes? }> }
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { features } = await req.json()
  if (!Array.isArray(features)) {
    return NextResponse.json({ error: 'features phải là array' }, { status: 400 })
  }

  // Xoá toàn bộ features cũ, insert lại
  const { error: delErr } = await sb()
    .from('device_features')
    .delete()
    .eq('equipment_id', params.id)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (features.length > 0) {
    const rows = features.map((f: { feature_key: string; value: string; notes?: string }) => ({
      equipment_id: params.id,
      feature_key: f.feature_key,
      value: f.value,
      notes: f.notes ?? null,
    }))
    const { error: insErr } = await sb().from('device_features').insert(rows)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// PATCH /api/kho/equipment/[id]/features — upsert một feature
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { feature_key, value, notes } = await req.json()
  if (!feature_key || value === undefined) {
    return NextResponse.json({ error: 'Thiếu feature_key hoặc value' }, { status: 400 })
  }

  const { error } = await sb()
    .from('device_features')
    .upsert(
      { equipment_id: params.id, feature_key, value, notes: notes ?? null },
      { onConflict: 'equipment_id,feature_key' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/kho/equipment/[id]/features — xoá một feature theo key
// Body: { feature_key: string }
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { feature_key } = await req.json()
  if (!feature_key) {
    return NextResponse.json({ error: 'Thiếu feature_key' }, { status: 400 })
  }

  const { error } = await sb()
    .from('device_features')
    .delete()
    .eq('equipment_id', params.id)
    .eq('feature_key', feature_key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
