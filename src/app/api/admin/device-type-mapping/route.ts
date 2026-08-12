/**
 * GET  /api/admin/device-type-mapping
 *   → { mappings: Mapping[], crmTypes: {id, name}[], orderNames: string[] }
 *   crmTypes = danh sách loại thiết bị từ CRM SOAP GetDeviceType (authoritative)
 *
 * POST /api/admin/device-type-mapping
 *   body: { order_name, crm_name, crm_device_type_id?, notes? }
 *   → { ok, mapping }
 *
 * PUT  /api/admin/device-type-mapping
 *   body: { id, order_name?, crm_name?, crm_device_type_id?, notes?, is_active? }
 *   → { ok, mapping }
 *
 * DELETE /api/admin/device-type-mapping?id=UUID
 *   → { ok }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isAdminUser } from '@/lib/auth-helpers'
import { callCrmSoap } from '@/lib/crm-utils'
import { getCRMSessionForUser } from '@/lib/crm-session'

interface CRMDeviceType {
  Device_Type:         number
  Device_TypeName:     string
  Device_TypeDisabled: boolean
  Device_VendorName?:  string
}

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function checkAdmin(userId: string) {
  return isAdminUser(userId)
}

// ── GET ──────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const d = db()

  // Lấy mapping + order names song song, đồng thời gọi CRM SOAP GetDeviceType
  const session = await getCRMSessionForUser(user.id)
  const { sessionId, identity } = session

  const [mapRes, orderRes, crmRaw] = await Promise.all([
    d.from('device_type_mapping')
      .select('*')
      .order('order_name', { ascending: true }),
    d.from('giao_hang_don_items')
      .select('device_name')
      .not('device_name', 'is', null)
      .order('device_name', { ascending: true })
      .limit(10000),
    callCrmSoap<CRMDeviceType>('GetDeviceType', {}, sessionId, identity).catch(() => [] as CRMDeviceType[]),
  ])

  if (mapRes.error) return NextResponse.json({ error: mapRes.error.message }, { status: 500 })

  // Lọc bỏ disabled, sort theo tên
  const crmTypes = (crmRaw as CRMDeviceType[])
    .filter(t => !t.Device_TypeDisabled && t.Device_TypeName?.trim())
    .map(t => ({ id: t.Device_Type, name: t.Device_TypeName.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Distinct device_name từ giao_hang_don_items
  const orderSeen = new Set<string>()
  const orderNames: string[] = []
  for (const row of (orderRes.data ?? [])) {
    const n = (row.device_name as string)?.trim()
    if (n && !orderSeen.has(n)) { orderSeen.add(n); orderNames.push(n) }
  }

  return NextResponse.json({ mappings: mapRes.data ?? [], crmTypes, orderNames })
}

// ── POST ─────────────────────────────────────────────────────────────
// body: { order_name, crm_types: [{id, name}][], notes? }
// Tạo nhiều rows cùng lúc (1 order_name → nhiều CRM types)
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkAdmin(user.id))) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const { order_name, crm_types, notes } = body as {
    order_name: string
    crm_types: { id: number; name: string }[]
    notes?: string
  }

  if (!order_name?.trim())      return NextResponse.json({ error: 'Thiếu order_name' }, { status: 400 })
  if (!crm_types?.length)       return NextResponse.json({ error: 'Thiếu crm_types' }, { status: 400 })

  const rows = crm_types.map(t => ({
    order_name:         order_name.trim(),
    crm_name:           t.name.trim(),
    crm_device_type_id: t.id,
    notes:              notes?.trim() ?? null,
    created_by:         user.email,
  }))

  const { data, error } = await db()
    .from('device_type_mapping')
    .upsert(rows, { onConflict: 'order_name,crm_name', ignoreDuplicates: true })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, mappings: data }, { status: 201 })
}

// ── PUT ──────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkAdmin(user.id))) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const { id, order_name, crm_name, crm_device_type_id, notes, is_active } = body
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (order_name         !== undefined) update.order_name         = order_name.trim()
  if (crm_name           !== undefined) update.crm_name           = crm_name.trim()
  if (crm_device_type_id !== undefined) update.crm_device_type_id = crm_device_type_id
  if (notes              !== undefined) update.notes              = notes?.trim() ?? null
  if (is_active          !== undefined) update.is_active          = is_active

  const { data, error } = await db()
    .from('device_type_mapping')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, mapping: data })
}

// ── DELETE ────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkAdmin(user.id))) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })

  const { error } = await db().from('device_type_mapping').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
