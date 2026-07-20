import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// GET — list all active combos with items
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { data, error } = await db()
    .from('device_combos')
    .select('*, device_combo_items(*)')
    .eq('is_active', true)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ combos: data ?? [] })
}

// POST — create combo + items
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const body = await req.json()
  const { name, description, items = [] } = body
  if (!name?.trim()) return NextResponse.json({ error: 'Thiếu tên combo' }, { status: 400 })

  const { data: combo, error } = await db()
    .from('device_combos')
    .insert({ name: name.trim(), description: description?.trim() ?? null, created_by: user.email })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (items.length > 0) {
    const rows = items.map((it: { device_name: string; quantity?: number; notes?: string }, i: number) => ({
      combo_id: combo.id, device_name: it.device_name, quantity: it.quantity ?? 1,
      notes: it.notes ?? null, sort_order: i,
    }))
    await db().from('device_combo_items').insert(rows)
  }

  const { data: full } = await db().from('device_combos').select('*, device_combo_items(*)').eq('id', combo.id).single()
  return NextResponse.json({ ok: true, combo: full }, { status: 201 })
}

// PUT — update combo + replace items
export async function PUT(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const body = await req.json()
  const { id, name, description, items, is_active } = body
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name       !== undefined) update.name        = name.trim()
  if (description !== undefined) update.description = description?.trim() ?? null
  if (is_active  !== undefined) update.is_active   = is_active

  await db().from('device_combos').update(update).eq('id', id)

  if (Array.isArray(items)) {
    await db().from('device_combo_items').delete().eq('combo_id', id)
    if (items.length > 0) {
      const rows = items.map((it: { device_name: string; quantity?: number; notes?: string }, i: number) => ({
        combo_id: id, device_name: it.device_name, quantity: it.quantity ?? 1,
        notes: it.notes ?? null, sort_order: i,
      }))
      await db().from('device_combo_items').insert(rows)
    }
  }

  const { data: full } = await db().from('device_combos').select('*, device_combo_items(*)').eq('id', id).single()
  return NextResponse.json({ ok: true, combo: full })
}

// DELETE — deactivate
export async function DELETE(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
  await db().from('device_combos').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ ok: true })
}
