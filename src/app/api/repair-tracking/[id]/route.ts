import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getUser() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function getUserInfo(userId: string) {
  const { data } = await sb()
    .from('users')
    .select('full_name, username, email')
    .eq('id', userId)
    .single()
  return data?.full_name || data?.username || data?.email || userId
}

async function checkWritePerm(userId: string) {
  const { data } = await sb()
    .from('user_permissions_view')
    .select('permissions')
    .eq('user_id', userId)
    .single()
  const perms: string[] = data?.permissions ?? []
  return perms.includes('repair_tracking:write') || perms.includes('admin:users')
}

type Params = { params: { id: string } }

// GET /api/repair-tracking/[id] — chi tiết 1 item
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { data, error } = await sb()
    .from('repair_items')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/repair-tracking/[id]
// action = 'send' | 'complete' | 'edit'
//
// action=send:
//   Body: { repair_warehouse, sent_at? }
//   → status: da_gui, ghi sender_id/name, sent_at
//
// action=complete:
//   Body: { finish_reason, notes? }
//   → status: da_sua_xong, ghi completer_id/name, completed_at, destination
//
// action=edit (chỉ khi status=cho_gui):
//   Body: { imei?, product_name?, notes?, received_at? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const canWrite = await checkWritePerm(user.id)
  if (!canWrite) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const body = await req.json()
  const { action } = body

  // Lấy item hiện tại
  const { data: item, error: fetchErr } = await sb()
    .from('repair_items')
    .select('*')
    .eq('id', params.id)
    .single()

  if (fetchErr || !item) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 })

  // ── action: send ──────────────────────────────────────────
  if (action === 'send') {
    if (item.status !== 'cho_gui') {
      return NextResponse.json({ error: `Không thể gửi sửa từ trạng thái "${item.status}"` }, { status: 400 })
    }
    const { repair_warehouse, sent_at } = body
    if (!repair_warehouse) {
      return NextResponse.json({ error: 'Thiếu repair_warehouse' }, { status: 400 })
    }

    const senderName = await getUserInfo(user.id)

    const { data, error } = await sb()
      .from('repair_items')
      .update({
        status:          'da_gui',
        repair_warehouse: repair_warehouse.trim(),
        sent_at:         sent_at ?? new Date().toISOString(),
        sender_id:       user.id,
        sender_name:     senderName,
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, item: data })
  }

  // ── action: complete ──────────────────────────────────────
  if (action === 'complete') {
    if (item.status !== 'da_gui') {
      return NextResponse.json({ error: `Không thể hoàn thành từ trạng thái "${item.status}"` }, { status: 400 })
    }

    const FINISH_REASON_DESTINATION: Record<string, string> = {
      sua_xong:        'old_device',
      khong_loi_bt:    'old_device',
      loai_bo:         'scrap',
      loai_bo_bo_mach: 'scrap',
      send_supplier:   'supplier',
    }

    const { finish_reason, notes, completed_at } = body
    if (!finish_reason || !FINISH_REASON_DESTINATION[finish_reason]) {
      return NextResponse.json({ error: 'finish_reason không hợp lệ' }, { status: 400 })
    }

    const destination   = FINISH_REASON_DESTINATION[finish_reason]
    const completerName = await getUserInfo(user.id)

    const { data, error } = await sb()
      .from('repair_items')
      .update({
        status:         'da_sua_xong',
        finish_reason,
        destination,
        completed_at:   completed_at ?? new Date().toISOString(),
        completer_id:   user.id,
        completer_name: completerName,
        notes:          notes?.trim() ?? item.notes,
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, item: data })
  }

  // ── action: edit ──────────────────────────────────────────
  if (action === 'edit') {
    if (item.status !== 'cho_gui') {
      return NextResponse.json({ error: 'Chỉ sửa được khi đang Chờ gửi sửa' }, { status: 400 })
    }
    const { imei, product_name, notes, received_at } = body
    const patch: Record<string, unknown> = {}
    if (imei)         patch.imei         = imei.trim()
    if (product_name) patch.product_name = product_name.trim()
    if (notes !== undefined) patch.notes = notes?.trim() || null
    if (received_at)  patch.received_at  = received_at

    const { data, error } = await sb()
      .from('repair_items')
      .update(patch)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, item: data })
  }

  return NextResponse.json({ error: 'action không hợp lệ (send | complete | edit)' }, { status: 400 })
}

// DELETE /api/repair-tracking/[id] — chỉ xóa khi status=cho_gui
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const canWrite = await checkWritePerm(user.id)
  if (!canWrite) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const { data: item } = await sb()
    .from('repair_items')
    .select('status')
    .eq('id', params.id)
    .single()

  if (!item) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 })
  if (item.status !== 'cho_gui') {
    return NextResponse.json({ error: 'Chỉ xóa được khi đang Chờ gửi sửa' }, { status: 400 })
  }

  const { error } = await sb().from('repair_items').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
