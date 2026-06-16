import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

async function getUser() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// GET: lấy danh sách thiết bị
export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { data, error } = await supabaseAdmin()
    .from('equipment_cards')
    .select('*')
    .order('device_type')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST: thêm thiết bị mới
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const body = await req.json()
  const {
    equipment_id, name, device_type, category, vendor, status,
    tags, notes, main_photo, main_photo_public_id, detail_photos,
    documents, is_new
  } = body

  if (!equipment_id || !name) {
    return NextResponse.json({ error: 'Thiếu mã thiết bị hoặc tên' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin()
    .from('equipment_cards')
    .insert({
      equipment_id,
      name,
      device_type: device_type ?? 'GPS Tracker',
      category: category ?? null,
      vendor: vendor ?? null,
      status: status ?? 'Hiện hành',
      tags: tags ?? [],
      notes: notes ?? null,
      main_photo: main_photo ?? null,
      main_photo_public_id: main_photo_public_id ?? null,
      detail_photos: detail_photos ?? [],
      documents: documents ?? [],
      is_new: is_new ?? false,
      updated_by: user.email,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
