import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

const VALID_DEVICE_TYPES = ['GPS Tracker', 'MDVR', 'Camera', 'Accessory', 'Sensor', 'Simcard', 'Storage']

// POST: import danh sách thiết bị từ JSON (parsed từ Excel ở client)
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { rows } = await req.json() as {
    rows: Array<{
      equipment_id: string
      name: string
      device_type?: string
      vendor?: string
      status?: string
      notes?: string
    }>
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Không có dữ liệu' }, { status: 400 })
  }

  const records = rows.map(r => ({
    equipment_id: String(r.equipment_id ?? '').trim(),
    name: String(r.name ?? '').trim(),
    device_type: VALID_DEVICE_TYPES.includes(r.device_type ?? '')
      ? r.device_type
      : 'GPS Tracker',
    vendor: r.vendor ?? null,
    status: r.status ?? 'Hiện hành',
    notes: r.notes ?? null,
    tags: [],
    detail_photos: [],
    documents: [],
    is_new: false,
    updated_by: user.email,
  })).filter(r => r.equipment_id && r.name)

  const { data, error } = await supabaseAdmin()
    .from('equipment_cards')
    .upsert(records, { onConflict: 'equipment_id' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imported: data?.length ?? 0 })
}
