import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'

const GUIDES_DIR = path.join(process.cwd(), 'public', 'guides')

// Sanitise filename — chỉ cho phép [a-z0-9._-].html, chặn path traversal
function safeName(file: string): string | null {
  const name = path.basename(file)
  if (!/^[a-z0-9._-]+\.html$/.test(name)) return null
  return name
}

// GET ?file=filename.html — đọc nội dung file
export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get('file') ?? ''
  const name = safeName(file)
  if (!name) return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })

  try {
    const content = await fs.readFile(path.join(GUIDES_DIR, name), 'utf-8')
    return NextResponse.json({ content })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}

// PUT — ghi nội dung mới vào file
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as { file?: string; content?: string }
    const name = safeName(body.file ?? '')
    if (!name) return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    if (typeof body.content !== 'string') return NextResponse.json({ error: 'Missing content' }, { status: 400 })

    // Kiểm tra file tồn tại trước (không tạo file mới qua API này)
    await fs.access(path.join(GUIDES_DIR, name))
    await fs.writeFile(path.join(GUIDES_DIR, name), body.content, 'utf-8')
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
