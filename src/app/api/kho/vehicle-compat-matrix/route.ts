import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// GET /api/kho/vehicle-compat-matrix
// Returns all vehicle types × device compat in one payload
export async function GET() {
  // 1. All active vehicle types
  const { data: vehicles, error: vErr } = await sb()
    .from('vehicle_types')
    .select('id, name, category, sort_order')
    .eq('is_active', true)
    .order('sort_order')

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })

  // 2. All compat records (with device names)
  const { data: compat, error: cErr } = await sb()
    .from('device_vehicle_compat')
    .select(`
      equipment_id,
      vehicle_type_id,
      requirement,
      group_note,
      notes,
      equipment_cards (name, status)
    `)

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // 3. Collect unique devices that have any compat entry, sorted by name
  const deviceMap = new Map<string, { equipment_id: string; name: string; status: string }>()
  for (const c of compat ?? []) {
    if (!deviceMap.has(c.equipment_id)) {
      const card = c.equipment_cards as unknown as { name: string; status: string } | null
      deviceMap.set(c.equipment_id, {
        equipment_id: c.equipment_id,
        name: card?.name ?? c.equipment_id,
        status: card?.status ?? '',
      })
    }
  }
  const devices = Array.from(deviceMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'))

  // 4. Build matrix: vehicle_type_id → equipment_id → { requirement, group_note, notes }
  type Cell = { requirement: 'mandatory' | 'optional'; group_note: string | null; notes: string | null }
  const matrix: Record<string, Record<string, Cell>> = {}
  for (const c of compat ?? []) {
    if (!matrix[c.vehicle_type_id]) matrix[c.vehicle_type_id] = {}
    matrix[c.vehicle_type_id][c.equipment_id] = {
      requirement: c.requirement,
      group_note: c.group_note,
      notes: c.notes,
    }
  }

  return NextResponse.json({
    vehicles: vehicles ?? [],
    devices,
    matrix,
  })
}
