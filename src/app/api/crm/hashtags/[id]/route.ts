import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function checkAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = adminClient()
  const { data } = await db.from('user_permissions_view').select('permissions').eq('user_id', user.id).single()
  return ((data?.permissions ?? []) as string[]).includes('admin:users') ? user : null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await checkAdmin()
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json() as Partial<{ tag: string; meaning: string; category: string; description: string; example: string; sort_order: number }>
  const db = adminClient()
  const { data, error } = await db
    .from('hashtag_definitions')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', Number(params.id))
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, hashtag: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await checkAdmin()
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const db = adminClient()
  const { error } = await db.from('hashtag_definitions').delete().eq('id', Number(params.id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
