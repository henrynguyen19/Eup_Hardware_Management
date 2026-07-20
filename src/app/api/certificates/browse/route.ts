import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'

const ROOT_FOLDER_ID = '1wmuGM092uFqujUj_UUVDW0MZxRe15TZd'

function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Thiếu GOOGLE_SERVICE_ACCOUNT_JSON trong .env.local')
  const credentials = JSON.parse(raw)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  return google.drive({ version: 'v3', auth })
}

// GET /api/certificates/browse?folderId=XXX
// Returns folders + files inside a Drive folder
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const folderId = req.nextUrl.searchParams.get('folderId') || ROOT_FOLDER_ID

  try {
    const drive = getDriveClient()

    // Lấy tên folder hiện tại
    const folderMeta = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType',
    })

    // Lấy danh sách items trong folder
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

    return NextResponse.json({
      folderId,
      folderName: folderMeta.data.name,
      items,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[Drive browse]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
