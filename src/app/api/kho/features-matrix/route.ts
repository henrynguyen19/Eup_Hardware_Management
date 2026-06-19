import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// GET /api/kho/features-matrix
export async function GET() {
  const client = sb()

  const [cardsRes, featuresRes, metaRes, groupsRes] = await Promise.all([
    client.from('equipment_cards').select('equipment_id, name, status, device_type').order('name'),
    client.from('device_features').select('equipment_id, feature_key, value, notes'),
    client.from('feature_meta').select('feature_key, group_label, sort_order').order('sort_order'),
    client.from('feature_group_defs').select('label, icon, color, sort_order').order('sort_order'),
  ])

  if (cardsRes.error)    return NextResponse.json({ error: cardsRes.error.message },    { status: 500 })
  if (featuresRes.error) return NextResponse.json({ error: featuresRes.error.message }, { status: 500 })

  const matrix: Record<string, Record<string, { value: string; notes: string | null }>> = {}
  for (const f of featuresRes.data ?? []) {
    if (!matrix[f.equipment_id]) matrix[f.equipment_id] = {}
    matrix[f.equipment_id][f.feature_key] = { value: f.value, notes: f.notes }
  }

  const metaKeys = (metaRes.data ?? []).map(m => m.feature_key)
  const extraKeys = Array.from(
    new Set((featuresRes.data ?? []).map(f => f.feature_key).filter(k => !metaKeys.includes(k)))
  ).sort()
  const allKeys = [...metaKeys, ...extraKeys]

  const devicesWithFeatures = (cardsRes.data ?? []).filter(c => matrix[c.equipment_id])

  return NextResponse.json({
    devices: devicesWithFeatures,
    featureKeys: allKeys,
    matrix,
    featureMeta: metaRes.data ?? [],
    groupDefs: groupsRes.data ?? [],
  })
}

// POST — thêm tính năng mới
// Body: { feature_key, group_label }
export async function POST(req: NextRequest) {
  const { feature_key, group_label } = await req.json()
  if (!feature_key?.trim()) return NextResponse.json({ error: 'Thiếu tên tính năng' }, { status: 400 })

  const client = sb()
  const key = feature_key.trim()
  const group = (group_label ?? 'Khác').trim()

  const { error: metaErr } = await client
    .from('feature_meta')
    .upsert({ feature_key: key, group_label: group, sort_order: 999 }, { onConflict: 'feature_key' })
  if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 500 })

  const { data: cards } = await client.from('equipment_cards').select('equipment_id')
  if (cards && cards.length > 0) {
    await client.from('device_features').upsert(
      cards.map(c => ({ equipment_id: c.equipment_id, feature_key: key, value: 'Khong', notes: null })),
      { onConflict: 'equipment_id,feature_key', ignoreDuplicates: true }
    )
  }

  return NextResponse.json({ ok: true })
}

// PATCH — đổi tên feature key
// Body: { old_key, new_key }
export async function PATCH(req: NextRequest) {
  const { old_key, new_key } = await req.json()
  if (!old_key || !new_key) return NextResponse.json({ error: 'Thiếu old_key hoặc new_key' }, { status: 400 })

  const client = sb()

  const { data: existing } = await client
    .from('device_features').select('equipment_id, value, notes').eq('feature_key', old_key)

  if (existing && existing.length > 0) {
    await client.from('device_features').delete().eq('feature_key', old_key)
    await client.from('device_features').insert(existing.map(r => ({ ...r, feature_key: new_key })))
  }

  const { data: meta } = await client
    .from('feature_meta').select('group_label, sort_order').eq('feature_key', old_key).single()
  await client.from('feature_meta').delete().eq('feature_key', old_key)
  await client.from('feature_meta').upsert({
    feature_key: new_key,
    group_label: meta?.group_label ?? 'Khác',
    sort_order: meta?.sort_order ?? 999,
  })

  return NextResponse.json({ ok: true })
}

// DELETE — xóa tính năng hoàn toàn
// Body: { feature_key }
export async function DELETE(req: NextRequest) {
  const { feature_key } = await req.json()
  if (!feature_key) return NextResponse.json({ error: 'Thiếu feature_key' }, { status: 400 })

  const client = sb()
  await client.from('device_features').delete().eq('feature_key', feature_key)
  await client.from('feature_meta').delete().eq('feature_key', feature_key)

  return NextResponse.json({ ok: true })
}
