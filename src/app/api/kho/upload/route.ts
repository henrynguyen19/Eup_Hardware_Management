import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { createSupabaseServerClient } from '@/lib/supabase-server'

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(req: NextRequest) {
  // Kiểm tra đăng nhập
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const equipmentId = formData.get('equipment_id') as string | null

  if (!file) return NextResponse.json({ error: 'Không có file' }, { status: 400 })

  // Chuyển file sang buffer
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Upload lên Cloudinary
  const uploadResult = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const folder = process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'eup-hardware'
    const publicId = equipmentId
      ? `${folder}/devices/${equipmentId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`
      : undefined

    cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, overwrite: true, resource_type: 'image' },
      (err, result) => {
        if (err || !result) reject(err ?? new Error('Upload thất bại'))
        else resolve({ secure_url: result.secure_url, public_id: result.public_id })
      }
    ).end(buffer)
  })

  return NextResponse.json(uploadResult)
}
