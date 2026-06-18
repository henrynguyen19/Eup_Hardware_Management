import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// GET /api/kho/vehicle-types — danh sách loại xe
export async function GET() {
  const { data, error } = await sb()
    .from('vehicle_types')
    .select('id, name, category, sort_order')
    .eq('is_active', true)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ vehicleTypes: data ?? [] })
}

// GET /api/kho/vehicle-types?vehicleTypeId=xxx — thiết bị phù hợp cho 1 loại xe
export async function POST(req: NextRequest) {
  const { vehicleTypeId } = await req.json()
  if (!vehicleTypeId) return NextResponse.json({ error: 'Thiếu vehicleTypeId' }, { status: 400 })

  const { data, error } = await sb()
    .from('device_vehicle_compat')
    .select(`
      requirement,
      group_note,
      notes,
      equipment_cards (equipment_id, name, category, status, photo_url)
    `)
    .eq('vehicle_type_id', vehicleTypeId)
    .order('requirement', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ compat: data ?? [] })
}
