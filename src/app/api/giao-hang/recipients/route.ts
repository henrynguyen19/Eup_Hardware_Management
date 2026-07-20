import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { data, error } = await db()
    .from('giao_hang_recipients')
    .select('*')
    .eq('is_active', true)
    .order('type').order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ recipients: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const body = await req.json()
  const { name, type = 'office', office, address, phone, contact_name, notes } = body
  if (!name?.trim()) return NextResponse.json({ error: 'Thiếu tên người nhận' }, { status: 400 })

  const { data, error } = await db().from('giao_hang_recipients').insert({
    name: name.trim(), type, office: office?.trim() ?? null,
    address: address?.trim() ?? null, phone: phone?.trim() ?? null,
    contact_name: contact_name?.trim() ?? null, notes: notes?.trim() ?? null,
    created_by: user.email,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, recipient: data }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['name','type','office','address','phone','contact_name','notes','is_active'] as const) {
    if (fields[k] !== undefined) update[k] = typeof fields[k] === 'string' ? fields[k].trim() || null : fields[k]
  }
  if (update.name === null) return NextResponse.json({ error: 'Tên không được trống' }, { status: 400 })

  const { data, error } = await db().from('giao_hang_recipients').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, recipient: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
  await db().from('giao_hang_recipients').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ ok: true })
}
