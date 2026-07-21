import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'
import { isAdminUser, hasSubPagePerm } from '@/lib/auth-helpers'

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

// GET /api/certificates/file?id=DRIVE_FILE_ID
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const fileId = req.nextUrl.searchParams.get('id')
  if (!fileId) return NextResponse.json({ error: 'Thiếu file id' }, { status: 400 })

  try {
    const drive = getDriveClient()

    const meta = await drive.files.get({ fileId, fields: 'name,mimeType,size' })
    const mimeType = meta.data.mimeType ?? 'application/octet-stream'
    const fileName = meta.data.name ?? 'file'

    const fileRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    )

    const stream = fileRes.data as NodeJS.ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => controller.enqueue(chunk))
        stream.on('end', () => controller.close())
        stream.on('error', (err: Error) => controller.error(err))
      },
    })

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[Drive proxy]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/certificates/file
// FormData: file (Blob), parentId (string)
// Upload file lên Drive — yêu cầu chung_nhan:write hoặc admin:users
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  if (!(await canWrite(user.id))) {
    return NextResponse.json({ error: 'Không có quyền upload file' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    const parentId = formData.get('parentId') as string | null

    if (!file || !parentId) {
      return NextResponse.json({ error: 'Thiếu file hoặc parentId' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const drive  = getDriveClient(true)

    const { Readable } = await import('stream')
    const stream = Readable.from(buffer)

    const res = await drive.files.create({
      requestBody: {
        name:    file.name,
        parents: [parentId],
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body:     stream,
      },
      fields: 'id,name,mimeType,size,modifiedTime',
    })

    return NextResponse.json({ ok: true, file: res.data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[Drive upload]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
