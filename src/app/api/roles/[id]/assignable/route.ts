import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// PUT /api/roles/[id]/assignable
// Save which roles this role is allowed to assign to users
// Permission: manage_roles
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { assignable_role_names } = await req.json()

  if (!Array.isArray(assignable_role_names)) {
    return NextResponse.json({ error: 'assignable_role_names must be an array' }, { status: 400 })
  }

  const supabase = getSupabase()

  const { error } = await supabase
    .from('roles')
    .update({ assignable_role_names: assignable_role_names.length > 0 ? assignable_role_names : null })
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
