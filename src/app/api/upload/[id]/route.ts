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

// ── DELETE /api/upload/[id] ───────────────────────────────────
// [id] = URL-encoded Cloudinary public_id
//        e.g. equipment-cards%2F1000003_main
// Query:
//   ?equipment_id=1000003   必填
//   &type=main|detail       必填
//
// 流程：先刪 Cloudinary 圖片，再Cập nhật Supabase
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requireAuth()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const public_id     = decodeURIComponent(params.id)
    const { searchParams } = req.nextUrl
    const equipment_id  = searchParams.get('equipment_id')
    const type          = searchParams.get('type') // 'main' | 'detail'

    if (!equipment_id || !type) {
      return NextResponse.json(
        { error: 'equipment_id and type are required as query params' },
        { status: 400 },
      )
    }

    const supabase = getSupabase()
    // 1. 從 Cloudinary Xóa
    const result = await getCloudinary().uploader.destroy(public_id)
    if (result.result !== 'ok' && result.result !== 'not found') {
      return NextResponse.json(
        { error: `Cloudinary delete failed: ${result.result}` },
        { status: 502 },
      )
    }

    // 2. Cập nhật Supabase
    if (type === 'main') {
      const { error } = await supabase
        .from('equipment_cards')
        .update({ main_photo: null, main_photo_public_id: null })
        .eq('equipment_id', equipment_id)

      if (error) throw error
    } else if (type === 'weight') {
      // 從 weight_photos 陣列移除對應 public_id
      const { data: wData, error: wFetchError } = await supabase
        .from('equipment_cards')
        .select('weight_photos')
        .eq('equipment_id', equipment_id)
        .single()

      if (wFetchError) throw wFetchError

      const updatedW = (wData?.weight_photos ?? []).filter(
        (p: { public_id: string }) => p.public_id !== public_id,
      )

      const { error: wError } = await supabase
        .from('equipment_cards')
        .update({ weight_photos: updatedW })
        .eq('equipment_id', equipment_id)

      if (wError) throw wError
    } else {
      // detail：從陣列Trung bình移除對應 public_id
      const { data, error: fetchError } = await supabase
        .from('equipment_cards')
        .select('detail_photos')
        .eq('equipment_id', equipment_id)
        .single()

      if (fetchError) throw fetchError

      const updated = (data?.detail_photos ?? []).filter(
        (p: { public_id: string }) => p.public_id !== public_id,
      )

      const { error } = await supabase
        .from('equipment_cards')
        .update({ detail_photos: updated })
        .eq('equipment_id', equipment_id)

      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[upload/delete] error', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
