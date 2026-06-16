import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function getCloudinary() {
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
  return cloudinary
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function requireAuth() {
  const client = createSupabaseServerClient()
  const { data: { user } } = await client.auth.getUser()
  return user
}

// ── POST /api/upload ──────────────────────────────────────────
// Body: { equipment_id: string, type: 'main' | 'detail' }
// 回傳簽名參數，前端直接 POST 到 Cloudinary（避免檔案經過 Vercel）
export async function POST(req: NextRequest) {
  if (!await requireAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { equipment_id, type } = await req.json()

    if (!equipment_id || !type) {
      return NextResponse.json({ error: 'equipment_id and type are required' }, { status: 400 })
    }
    // 拒絕裸字 'weight'，強制要求帶後綴（如 weight_1234_0），避免多ảnhảnh的 public_id 衝突
    if (type === 'weight') {
      return NextResponse.json({ error: "type 'weight' requires suffix, e.g. weight_1234_0" }, { status: 400 })
    }

    const folder    = process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'equipment-cards'
    const timestamp = Math.floor(Date.now() / 1000)

    // public_id 規則：{folder}/{equipment_id}_{type}
    // type='main' → equipment-cards/1000003_main
    // type='detail' 由前端帶入後綴，如 '1000003_2'
    const public_id = `${folder}/${equipment_id}_${type}`

    const paramsToSign = { folder, public_id, timestamp }
    const signature = getCloudinary().utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET!,
    )

    return NextResponse.json({
      signature,
      timestamp,
      public_id,
      folder,
      api_key:    process.env.CLOUDINARY_API_KEY,
      cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    })
  } catch (err) {
    console.error('[upload] sign error', err)
    return NextResponse.json({ error: 'Failed to generate signature' }, { status: 500 })
  }
}

// ── PATCH /api/upload ─────────────────────────────────────────
// uploadHoàn thành後，前端將 Cloudinary 回傳的 public_id + secure_url
// 寫回 Supabase equipment_cards
// Body: {
//   equipment_id: string,
//   type: 'main' | 'detail',
//   public_id: string,
//   url: string,
// }
export async function PATCH(req: NextRequest) {
  if (!await requireAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { equipment_id, type, public_id, url } = await req.json()

    if (!equipment_id || !type || !public_id || !url) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = getSupabase()

    if (type === 'main') {
      const { error } = await supabase
        .from('equipment_cards')
        .update({ main_photo: url, main_photo_public_id: public_id })
        .eq('equipment_id', equipment_id)

      if (error) throw error
    } else if (type === 'weight' || type.startsWith('weight_')) {
      // 將新ảnh append 進 weight_photos 陣列
      const { data: wData, error: wFetchError } = await supabase
        .from('equipment_cards')
        .select('weight_photos')
        .eq('equipment_id', equipment_id)
        .single()

      if (wFetchError) throw wFetchError

      const existingW: { public_id: string; url: string }[] = wData?.weight_photos ?? []
      const updatedW = [...existingW, { public_id, url }]

      const { error: wError } = await supabase
        .from('equipment_cards')
        .update({ weight_photos: updatedW })
        .eq('equipment_id', equipment_id)

      if (wError) throw wError
    } else {
      // detail：將新物件 append 進 detail_photos 陣列
      const { data, error: fetchError } = await supabase
        .from('equipment_cards')
        .select('detail_photos')
        .eq('equipment_id', equipment_id)
        .single()

      if (fetchError) throw fetchError

      const existing: { public_id: string; url: string }[] = data?.detail_photos ?? []
      const updated = [...existing, { public_id, url }]

      const { error } = await supabase
        .from('equipment_cards')
        .update({ detail_photos: updated })
        .eq('equipment_id', equipment_id)

      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[upload] patch error', err)
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 })
  }
}
