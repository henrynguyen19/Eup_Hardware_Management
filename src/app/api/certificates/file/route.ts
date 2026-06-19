import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'

// ── Google Drive auth via Service Account ────────────────────
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

// GET /api/certificates/file?id=DRIVE_FILE_ID
export async function GET(req: NextRequest) {
  // Chỉ user đã đăng nhập mới được xem
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const fileId = req.nextUrl.searchParams.get('id')
  if (!fileId) return NextResponse.json({ error: 'Thiếu file id' }, { status: 400 })

  try {
    const drive = getDriveClient()

    // Lấy metadata để biết mimeType
    const meta = await drive.files.get({ fileId, fields: 'name,mimeType,size' })
    const mimeType = meta.data.mimeType ?? 'application/octet-stream'
    const fileName = meta.data.name ?? 'file'

    // Stream nội dung file
    const fileRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    )

    const stream = fileRes.data as NodeJS.ReadableStream

    // Chuyển stream Node.js → ReadableStream Web API
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
        // Cache 5 phút — tránh gọi Drive API liên tục
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[Drive proxy]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
