/**
 * POST /api/zalo/webhook  — nhận event từ Zalo OA
 * GET  /api/zalo/webhook  — xác minh webhook khi cài đặt trên developers.zalo.me
 *
 * Env vars:
 *   ZALO_OA_ACCESS_TOKEN  — OA access token
 *   ZALO_OA_SECRET        — app secret (verify signature)
 *   ZALO_VERIFY_TOKEN     — token tự đặt khi config webhook
 *   ANTHROPIC_API_KEY     — dùng để trả lời FAQ bằng AI
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { createClient }                     from '@supabase/supabase-js'
import Anthropic                            from '@anthropic-ai/sdk'
import { sendText, sendButtons, sendGroupText, verifyZaloSignature, type ZaloEvent } from '@/lib/zalo-api'

// Vercel: giữ function sống sau khi response đã trả về
export const maxDuration = 30  // giây — đủ cho AI call + Supabase

const adminDb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

// ── GET: xác minh webhook ────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const sp          = req.nextUrl.searchParams
  const mode        = sp.get('hub.mode')
  const token       = sp.get('hub.verify_token')
  const challenge   = sp.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.ZALO_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? 'ok', { status: 200 })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// ── POST: xử lý event ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Đọc raw body để verify signature
  const rawBody = await req.text()

  // Xác minh chữ ký Zalo (bỏ qua nếu thiếu ZALO_OA_SECRET)
  const sig = req.headers.get('x-zalooa-signature') ?? req.headers.get('x-zalosignature') ?? ''
  const valid = await verifyZaloSignature(rawBody, sig)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Zalo GMF group event có thể là mảng hoặc object đơn
  let rawEvent: unknown
  try {
    rawEvent = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Chuẩn hoá thành mảng (GMF có thể gửi batch)
  const events: ZaloEvent[] = Array.isArray(rawEvent) ? rawEvent as ZaloEvent[] : [rawEvent as ZaloEvent]

  for (const event of events) {
    if (event.event_name === 'user_send_text' && event.message?.text) {
      // Tin nhắn 1-1 với OA
      after(() =>
        handleIncomingMessage(event).catch(e =>
          console.error('[zalo-webhook] handleIncomingMessage error:', e)
        )
      )
    } else if (event.event_name === 'g4.message' || event.event_name === 'group_message') {
      // Tin nhắn trong nhóm GMF
      after(() =>
        handleGroupMessage(event).catch(e =>
          console.error('[zalo-webhook] handleGroupMessage error:', e)
        )
      )
    } else if (event.event_name === 'follow') {
      after(() => handleFollow(event).catch(() => {}))
    }
  }

  return NextResponse.json({ ok: true })
}

// ── Xử lý khi user follow OA ─────────────────────────────────────────────────
async function handleFollow(event: ZaloEvent) {
  await sendText(
    event.sender.id,
    `Xin chào! Tôi là trợ lý kỹ thuật EUP Hardware 🤖\n\n` +
    `Tôi có thể giúp bạn:\n` +
    `• Gửi yêu cầu hỗ trợ kỹ thuật\n` +
    `• Trả lời câu hỏi về thiết bị GPS, MDVR\n\n` +
    `Hãy nhắn nội dung cần hỗ trợ để bắt đầu!`,
  )
}

// ── Xử lý tin nhắn đến ───────────────────────────────────────────────────────
async function handleIncomingMessage(event: ZaloEvent) {
  const userId  = event.sender.id
  const text    = (event.message?.text ?? '').trim()
  const db      = adminDb()

  if (!text) return

  // Lấy session hiện tại của user
  const { data: session } = await db
    .from('zalo_sessions')
    .select('*')
    .eq('zalo_user_id', userId)
    .single()

  const state: string = session?.state ?? 'idle'

  // ── State machine ──────────────────────────────────────────────────────────

  if (state === 'waiting_ticket_detail') {
    // User đang nhập nội dung ticket
    await createTicketAndReply(userId, text, db)
    return
  }

  if (state === 'waiting_confirm') {
    const lower = text.toLowerCase()
    if (/^(1|có|co|yes|y|đồng ý|dong y)$/i.test(lower)) {
      // Xác nhận tạo ticket
      const detail = session?.pending_detail ?? text
      await createTicketAndReply(userId, detail, db)
    } else if (/^(2|không|khong|no|n|hủy|huy)$/i.test(lower)) {
      await db.from('zalo_sessions').upsert(
        { zalo_user_id: userId, state: 'idle', pending_detail: null },
        { onConflict: 'zalo_user_id' },
      )
      await sendText(userId, 'Đã hủy. Bạn có thể nhắn lại bất cứ lúc nào.')
    } else {
      await sendText(userId, 'Vui lòng chọn:\n1 - Xác nhận tạo ticket\n2 - Hủy')
    }
    return
  }

  // ── Phân loại intent ────────────────────────────────────────────────────────
  const intent = classifyIntent(text)

  if (intent === 'create_ticket') {
    // Hỏi thêm thông tin nếu nội dung quá ngắn
    if (text.length < 20) {
      await db.from('zalo_sessions').upsert(
        { zalo_user_id: userId, state: 'waiting_ticket_detail', pending_detail: null },
        { onConflict: 'zalo_user_id' },
      )
      await sendText(
        userId,
        'Vui lòng mô tả chi tiết vấn đề kỹ thuật bạn đang gặp phải\n' +
        '(tên thiết bị, biển số xe, lỗi cụ thể):',
      )
    } else {
      // Nội dung đủ dài → xác nhận trước khi tạo
      await db.from('zalo_sessions').upsert(
        { zalo_user_id: userId, state: 'waiting_confirm', pending_detail: text },
        { onConflict: 'zalo_user_id' },
      )
      await sendButtons(
        userId,
        `Tạo ticket hỗ trợ với nội dung:\n"${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`,
        [
          { title: '✅ Xác nhận', type: 'oa.query.hide', payload: '1' },
          { title: '❌ Hủy',     type: 'oa.query.hide', payload: '2' },
        ],
      )
    }
    return
  }

  if (intent === 'faq') {
    // Trả lời bằng AI
    const answer = await getAIAnswer(text)
    await sendText(userId, answer)
    // Hỏi xem còn cần tạo ticket không
    await sendButtons(
      userId,
      'Câu trả lời trên có giải quyết được vấn đề của bạn không?',
      [
        { title: '✅ Đã xong, cảm ơn', type: 'oa.query.hide', payload: 'done'   },
        { title: '❌ Vẫn cần hỗ trợ',  type: 'oa.query.hide', payload: 'ticket' },
      ],
    )
    return
  }

  // intent === 'unknown' → dùng AI phân tích lại + trả lời
  const answer = await getAIAnswer(text)
  await sendText(userId, answer)
}

// ── Tạo ticket trong DB ───────────────────────────────────────────────────────
async function createTicketAndReply(userId: string, content: string, db: ReturnType<typeof adminDb>) {
  const ticketCode = `ZL${Date.now().toString().slice(-8)}`

  const { error } = await db.from('ho_tro_tickets').insert({
    sheet_row_key:  `zalo:${userId}:${ticketCode}`,
    staff_name:     'Zalo Bot',
    ticket_date:    new Date().toISOString().slice(0, 10),
    content:        content,
    reply:          null,
    direction:      'in',
    ticket_type:    'Zalo',
    code:           ticketCode,
    company:        null,
    has_unread_update: true,
    created_by:     'zalo-webhook',
  })

  // Reset session
  await db.from('zalo_sessions').upsert(
    { zalo_user_id: userId, state: 'idle', pending_detail: null },
    { onConflict: 'zalo_user_id' },
  )

  if (error) {
    console.error('[zalo-webhook] createTicket error:', error)
    await sendText(
      userId,
      'Xin lỗi, có lỗi xảy ra khi tạo ticket. Vui lòng thử lại hoặc liên hệ trực tiếp với kỹ thuật viên.',
    )
    return
  }

  await sendText(
    userId,
    `✅ Đã tạo ticket thành công!\n\n` +
    `Mã ticket: ${ticketCode}\n` +
    `Nội dung: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}\n\n` +
    `Kỹ thuật viên sẽ liên hệ lại với bạn sớm nhất có thể.`,
  )
}

// ── Phân loại intent ──────────────────────────────────────────────────────────
type Intent = 'create_ticket' | 'faq' | 'unknown'

function classifyIntent(text: string): Intent {
  const t = text.toLowerCase()

  // Từ khóa yêu cầu hỗ trợ
  const supportKeywords = [
    'hỗ trợ', 'ho tro', 'sửa', 'sua', 'lỗi', 'loi', 'hỏng', 'hong',
    'không hoạt động', 'khong hoat dong', 'mất tín hiệu', 'mat tin hieu',
    'gps không', 'camera không', 'không kết nối', 'khong ket noi',
    'báo hỏng', 'bao hong', 'yêu cầu', 'yeu cau', 'cần hỗ trợ',
    'thiết bị bị', 'thiet bi bi', 'xe bị', 'mdvr', 'tracker',
  ]

  // Từ khóa FAQ / thông tin
  const faqKeywords = [
    'thông số', 'thong so', 'hỏi', 'hoi', 'giá', 'gia', 'bao nhiêu',
    'bao nhieu', 'tính năng', 'tinh nang', 'hướng dẫn', 'huong dan',
    'cách', 'cach', 'là gì', 'la gi', 'dùng như thế nào', 'phiên bản',
    'phien ban', 'firmware', 'cài đặt', 'cai dat', 'kết nối wifi',
    'sim 4g', '4g', 'thẻ nhớ', 'the nho', 'microsd',
  ]

  if (supportKeywords.some(kw => t.includes(kw))) return 'create_ticket'
  if (faqKeywords.some(kw => t.includes(kw)))     return 'faq'

  // Tin nhắn dài (>50 ký tự) có thể là mô tả vấn đề
  if (text.length > 50) return 'create_ticket'

  return 'unknown'
}

// ── AI FAQ trả lời ────────────────────────────────────────────────────────────
async function getAIAnswer(question: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return (
      'Xin lỗi, tôi chưa được cấu hình để trả lời câu hỏi này.\n' +
      'Vui lòng liên hệ kỹ thuật viên EUP Hardware để được hỗ trợ.'
    )
  }

  try {
    const client   = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system:
        'Bạn là trợ lý kỹ thuật của EUP Hardware — công ty chuyên cung cấp và lắp đặt thiết bị GPS, ' +
        'MDVR (camera hành trình), và phụ kiện cho xe tải/xe khách tại Việt Nam. ' +
        'Trả lời ngắn gọn, thực tế, bằng tiếng Việt. ' +
        'Nếu không biết, hãy đề nghị khách tạo ticket hỗ trợ kỹ thuật.',
      messages: [{ role: 'user', content: question }],
    })

    const content = response.content[0]
    if (content.type === 'text') return content.text

    return 'Xin lỗi, tôi không thể trả lời lúc này. Vui lòng nhắn "hỗ trợ" để tạo ticket.'
  } catch (e) {
    console.error('[zalo-webhook] AI error:', e)
    return 'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau hoặc nhắn "hỗ trợ" để tạo ticket.'
  }
}

// ── Xử lý tin nhắn từ nhóm GMF ───────────────────────────────────────────────
async function handleGroupMessage(event: ZaloEvent) {
  const groupId   = event.group_id
  const groupName = event.group_name ?? 'Nhóm không tên'
  const senderId  = event.sender.id
  const senderName = event.sender.display_name ?? 'Khách'
  const text      = event.message?.text?.trim()
  const db        = adminDb()

  if (!groupId || !text) return

  // Bỏ qua tin nhắn từ chính OA (tránh echo)
  const oaRecipientId = event.recipient?.id
  if (senderId === oaRecipientId) return

  const ticketCode = `GRP${Date.now().toString().slice(-8)}`
  const intent     = classifyIntent(text)
  const today      = new Date().toISOString().slice(0, 10)

  // Luôn lưu vào DB để thống kê
  await db.from('ho_tro_tickets').insert({
    sheet_row_key:     `zalo_group:${groupId}:${ticketCode}`,
    staff_name:        'Zalo Group Bot',
    ticket_date:       today,
    content:           text,
    reply:             null,
    direction:         'in',
    ticket_type:       intent === 'create_ticket' ? 'Zalo Group - Hỗ trợ' : 'Zalo Group - FAQ',
    code:              ticketCode,
    company:           groupName,
    contact:           senderName,
    has_unread_update: true,
    created_by:        'zalo-group-webhook',
  })

  // Phản hồi vào nhóm tuỳ intent
  if (intent === 'create_ticket') {
    await sendGroupText(
      groupId,
      `📋 Đã ghi nhận yêu cầu của ${senderName}!\n` +
      `Mã ticket: ${ticketCode}\n` +
      `Kỹ thuật viên sẽ liên hệ lại sớm.`,
    )
  } else if (intent === 'faq') {
    const answer = await getAIAnswer(text)
    await sendGroupText(groupId, `💬 ${senderName}: ${answer}`)
  }
  // intent === 'unknown' → không reply vào nhóm (tránh spam)
}
