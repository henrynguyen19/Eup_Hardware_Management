import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const person = searchParams.get('person')

  const client = sb()
  let query = client.from('kho_daily_records')
    .select('*')
    .order('entry_date', { ascending: false })

  if (from) query = query.gte('entry_date', from)
  if (to) query = query.lte('entry_date', to)
  if (person) query = query.eq('person_name', person)

  const { data, error } = await query.limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ records: data ?? [] })
}
