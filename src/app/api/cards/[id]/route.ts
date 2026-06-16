import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, getUserRoleWithPermissions } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function getCloudinary() {
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
  return cloudinary
}

// ── PATCH /api/cards/[id] ─────────────────────────────────────
// Cập nhậtThiết bị文字欄位（Quản trị viên）
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabaseClient = createSupabaseServerClient()
  const { data: { user } } = await supabaseClient.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { permissions } = await getUserRoleWithPermissions()
  const canEdit =
    permissions.includes('create_delete_cards') ||
    permissions.some(p => p.startsWith('edit_card_'))
  if (!canEdit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const adminUser = user

  try {
    const body = await req.json()
    const { equipment_id: newId, name, category, vendor, status, tags, notes, is_new, detail_photo_captions, documents, net_weight, updated_fields } = body

    const supabase = getSupabase()

    // 欄位層級過濾：根據 permissions 決定允許寫入的欄位
    const allowedUpdates: Record<string, unknown> = {}
    const isFullAdmin = permissions.includes('create_delete_cards')

    if (isFullAdmin || permissions.includes('edit_card_equipment_id')) {
      if (newId !== undefined) allowedUpdates.equipment_id_candidate = newId
    }
    if (isFullAdmin || permissions.includes('edit_card_name')) {
      if (name !== undefined) allowedUpdates.name = name?.trim()
    }
    if (isFullAdmin || permissions.includes('edit_card_category')) {
      if (category !== undefined) allowedUpdates.category = category || null
    }
    if (isFullAdmin || permissions.includes('edit_card_status')) {
      if (status !== undefined) allowedUpdates.status = status
    }
    if (isFullAdmin || permissions.includes('edit_card_vendor')) {
      if (vendor !== undefined) allowedUpdates.vendor = vendor?.trim() || null
    }
    if (isFullAdmin || permissions.includes('edit_card_tags')) {
      if (tags !== undefined) allowedUpdates.tags = Array.isArray(tags) ? tags : []
    }
    if (isFullAdmin || permissions.includes('edit_card_notes')) {
      if (notes !== undefined) allowedUpdates.notes = notes?.trim() || null
    }
    if (isFullAdmin || permissions.includes('edit_card_weight')) {
      if (net_weight !== undefined) allowedUpdates.net_weight = (typeof net_weight === 'number' && !isNaN(net_weight)) ? net_weight : null
    }
    if (isFullAdmin || permissions.includes('edit_card_documents')) {
      if (documents !== undefined && Array.isArray(documents)) allowedUpdates.documents = documents
    }
    if (isFullAdmin || permissions.includes('edit_card_is_new')) {
      if (typeof is_new === 'boolean') allowedUpdates.is_new = is_new
    }

    // 取出Mã thiết bị候選值（特殊處理，不直接進 update 物件）
    const resolvedNewId = allowedUpdates.equipment_id_candidate as string | undefined
    delete allowedUpdates.equipment_id_candidate

    // 若Mã thiết bị有變動，先xác nhận新Mã thiết bị不重複
    if (resolvedNewId && resolvedNewId.trim() !== params.id) {
      const { data: existing } = await supabase
        .from('equipment_cards')
        .select('equipment_id')
        .eq('equipment_id', resolvedNewId.trim())
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ error: 'Mã thiết bị đã tồn tại' }, { status: 409 })
      }
    }

    // 只記錄實際被允許Cập nhật的欄位
    const allowedFieldNames = Object.keys(allowedUpdates)
    const filteredUpdatedFields = Array.isArray(updated_fields)
      ? updated_fields.filter(f => allowedFieldNames.includes(f) || (f === 'equipment_id' && resolvedNewId))
      : []

    const { data, error } = await supabase
      .from('equipment_cards')
      .update({
        ...(resolvedNewId && resolvedNewId.trim() !== params.id ? { equipment_id: resolvedNewId.trim() } : {}),
        ...allowedUpdates,
        updated_at: new Date().toISOString(),
        updated_by: adminUser.email ?? null,
        ...(filteredUpdatedFields.length > 0 ? { updated_fields: filteredUpdatedFields } : {}),
      })
      .eq('equipment_id', params.id)
      .select()
      .single()

    if (error) throw error

    // 合併 caption Cập nhật（不影響 public_id / url）
    if (detail_photo_captions && typeof detail_photo_captions === 'object' && !Array.isArray(detail_photo_captions)) {
      const finalId = (newId && newId.trim() !== params.id) ? newId.trim() : params.id
      const { data: current } = await supabase
        .from('equipment_cards')
        .select('detail_photos')
        .eq('equipment_id', finalId)
        .single()
      if (current?.detail_photos) {
        const merged = (current.detail_photos as Array<{public_id: string; url: string; caption?: string}>).map(p => {
          const cap = (detail_photo_captions as Record<string, string>)[p.public_id]
          if (cap === undefined) return p
          if (!cap) return { ...p, caption: undefined }
          return { ...p, caption: cap }
        })
        await supabase.from('equipment_cards').update({ detail_photos: merged }).eq('equipment_id', finalId)
      }
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[cards] update error', err)
    return NextResponse.json({ error: 'Cập nhậtthất bại' }, { status: 500 })
  }
}

// ── DELETE /api/cards/[id] ────────────────────────────────────
// Xóa thiết bị（Quản trị viên）：同時清除 Cloudinary 所有ảnh
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()
    const cdn = getCloudinary()

    // 1. 取得Thiết bị（需要ảnh public_id）
    const { data: card, error: fetchError } = await supabase
      .from('equipment_cards')
      .select('main_photo_public_id, detail_photos, weight_photo_public_id, weight_photos')
      .eq('equipment_id', params.id)
      .single()

    if (fetchError) throw fetchError

    // 2. Xóa Cloudinary ảnh（parallel）
    const publicIds: string[] = []
    if (card?.main_photo_public_id) publicIds.push(card.main_photo_public_id)
    const details: { public_id: string }[] = card?.detail_photos ?? []
    details.forEach(p => publicIds.push(p.public_id))
    if (card?.weight_photo_public_id) publicIds.push(card.weight_photo_public_id)
    const weightPhotos: { public_id: string }[] = card?.weight_photos ?? []
    weightPhotos.forEach(p => publicIds.push(p.public_id))

    await Promise.allSettled(
      publicIds.map(id => cdn.uploader.destroy(id))
    )

    // 3. Xóa Supabase dữ liệu
    const { error: deleteError } = await supabase
      .from('equipment_cards')
      .delete()
      .eq('equipment_id', params.id)

    if (deleteError) throw deleteError

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[cards] delete error', err)
    return NextResponse.json({ error: 'Xóathất bại' }, { status: 500 })
  }
}
