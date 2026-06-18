import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// GET /api/kho/features-matrix
// Returns all devices + all feature keys + matrix of values
export async function GET() {
  // 1. Fetch all equipment cards (active ones)
  const { data: cards, error: cardErr } = await sb()
    .from('equipment_cards')
    .select('equipment_id, name, status, device_type')
    .order('name')

  if (cardErr) return NextResponse.json({ error: cardErr.message }, { status: 500 })

  // 2. Fetch all device features
  const { data: features, error: featErr } = await sb()
    .from('device_features')
    .select('equipment_id, feature_key, value, notes')

  if (featErr) return NextResponse.json({ error: featErr.message }, { status: 500 })

  // 3. Collect unique feature keys (preserve order from data)
  const keySet = new Set<string>()
  for (const f of features ?? []) keySet.add(f.feature_key)
  const allKeys = Array.from(keySet).sort()

  // 4. Build matrix: equipment_id → feature_key → { value, notes }
  const matrix: Record<string, Record<string, { value: string; notes: string | null }>> = {}
  for (const f of features ?? []) {
    if (!matrix[f.equipment_id]) matrix[f.equipment_id] = {}
    matrix[f.equipment_id][f.feature_key] = { value: f.value, notes: f.notes }
  }

  // 5. Only return devices that have at least 1 feature entry
  const devicesWithFeatures = (cards ?? []).filter(c => matrix[c.equipment_id])

  return NextResponse.json({
    devices: devicesWithFeatures,
    featureKeys: allKeys,
    matrix,
  })
}
