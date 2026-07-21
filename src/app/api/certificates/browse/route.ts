import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'
import { isAdminUser, hasSubPagePerm } from '@/lib/auth-helpers'

const ROOT_FOLDER_ID = '1wmuGM092uFqujUj_UUVDW0MZxRe15TZd'

function getDriveClient(write = false) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Thiếu GOOGLE_SERVICE_ACCOUNT_JSON trong .env.local')
  const credentials = JSON.parse(raw)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: write
      ? ['https://www.googleapis.com/auth/drive']
      : ['https://www.googleapis.com/auth/drive.readonly'],
  })
  return google.drive({ version: 'v3', auth })
}

function adminDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function canWrite(userId: string): Promise<boolean> {
  const [admin, hasPerm] = await Promise.all([
    isAdminUser(userId),
    hasSubPagePerm(userId, 'giay_chung_nhan_main', 'can_create'),
  ])
  return admin || hasPerm
}

// GET /api/certificates/browse?folderId=XXX
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const folderId = req.nextUrl.searchParams.get('folderId') || ROOT_FOLDER_ID

  try {
    const drive = getDriveClient()

    const folderMeta = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType',
    })

    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,size,modifiedTime,iconLink)',
      orderBy: 'folder,name',
      pageSize: 200,
    })

    const files = listRes.data.files ?? []
    const items = files.map(f => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType!,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      size: f.size ? parseInt(f.size) : null,
      modifiedTime: f.modifiedTime,
    }))

    return NextResponse.json({ folderId, folderName: folderMeta.data.name, items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[Drive browse]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/certificates/browse
// Body: { parentId: string, folderName: string }
// Tạo folder mới — yêu cầu chung_nhan:write hoặc admin:users
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  if (!(await canWrite(user.id))) {
    return NextResponse.json({ error: 'Không có quyền tạo thư mục' }, { status: 403 })
  }

  try {
    const { parentId, folderName } = await req.json() as { parentId: string; folderName: string }
    if (!parentId || !folderName?.trim()) {
      return NextResponse.json({ error: 'Thiếu parentId hoặc folderName' }, { status: 400 })
    }

    const drive = getDriveClient(true)
    const res = await drive.files.create({
      requestBody: {
        name: folderName.trim(),
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id,name,mimeType,modifiedTime',
    })

    return NextResponse.json({ ok: true, folder: res.data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[Drive create folder]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
