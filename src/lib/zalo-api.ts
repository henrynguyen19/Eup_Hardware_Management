/**
 * Zalo Official Account API helpers
 *
 * Env vars cần có:
 *   ZALO_OA_ACCESS_TOKEN   — access token của OA (lấy từ developers.zalo.me)
 *   ZALO_OA_SECRET         — app secret dùng để verify webhook signature
 *   ZALO_VERIFY_TOKEN      — token tự đặt khi cấu hình webhook trên Zalo dev portal
 */

const ZALO_API_BASE = 'https://openapi.zalo.me'

function getAccessToken(): string {
  const token = process.env.ZALO_OA_ACCESS_TOKEN
  if (!token) throw new Error('Thiếu ZALO_OA_ACCESS_TOKEN trong env')
  return token
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZaloTextMessage {
  recipient: { user_id: string }
  message:   { text: string }
}

export interface ZaloButtonMessage {
  recipient: { user_id: string }
  message: {
    attachment: {
      type:    'template'
      payload: {
        template_type: 'button'
        text:          string
        buttons:       ZaloButton[]
      }
    }
  }
}

export interface ZaloButton {
  title:   string
  type:    'oa.query.show' | 'oa.query.hide' | 'oa.open.url' | 'oa.open.phone'
  payload: string
}

export interface ZaloEvent {
  app_id:    string
  sender:    { id: string; display_name?: string }
  recipient: { id: string }
  event_name: string   // 'user_send_text' | 'follow' | 'g4.message' | 'group_message' | ...
  timestamp:  number
  message?: {
    msg_id: string
    text?:  string
  }
  // GMF group fields
  group_id?:   string
  group_name?: string
}

// ─── Send helpers ─────────────────────────────────────────────────────────────

/**
 * Gửi tin nhắn văn bản đến 1 user Zalo (qua OA)
 */
export async function sendText(userId: string, text: string): Promise<boolean> {
  const body: ZaloTextMessage = {
    recipient: { user_id: userId },
    message:   { text: text.substring(0, 2000) },   // Zalo giới hạn 2000 ký tự
  }
  return _callSendAPI('/v3.0/oa/message/cs', body)
}

/**
 * Gửi tin nhắn có nút bấm
 */
export async function sendButtons(
  userId:  string,
  text:    string,
  buttons: ZaloButton[],
): Promise<boolean> {
  const body: ZaloButtonMessage = {
    recipient: { user_id: userId },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text,
          buttons: buttons.slice(0, 3),   // Zalo tối đa 3 nút
        },
      },
    },
  }
  return _callSendAPI('/v3.0/oa/message/cs', body)
}

/**
 * Gửi tin nhắn text vào nhóm GMF
 */
export async function sendGroupText(groupId: string, text: string): Promise<boolean> {
  const body = {
    recipient: { group_id: groupId },
    message:   { text: text.substring(0, 2000) },
  }
  return _callSendAPI('/v3.0/oa/message/group', body)
}

async function _callSendAPI(path: string, body: object): Promise<boolean> {
  try {
    const res = await fetch(`${ZALO_API_BASE}${path}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': getAccessToken(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    })
    const json = await res.json() as { error?: number; message?: string }
    if (json.error && json.error !== 0) {
      console.error('[zalo-api] sendAPI error:', json)
      return false
    }
    return true
  } catch (e) {
    console.error('[zalo-api] fetch error:', e)
    return false
  }
}

// ─── Webhook signature verification ──────────────────────────────────────────

/**
 * Xác minh chữ ký HMAC-SHA256 từ Zalo (header: X-ZaloOA-Signature)
 * Gọi khi nhận POST webhook để đảm bảo request đến từ Zalo
 */
export async function verifyZaloSignature(
  rawBody:   string,
  signature: string,
): Promise<boolean> {
  const secret = process.env.ZALO_OA_SECRET
  if (!secret) {
    console.warn('[zalo-api] Thiếu ZALO_OA_SECRET — bỏ qua kiểm tra chữ ký')
    return true
  }
  try {
    const enc     = new TextEncoder()
    const keyData = enc.encode(secret)
    const msgData = enc.encode(rawBody)
    const key = await crypto.subtle.importKey(
      'raw', keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign'],
    )
    const sig    = await crypto.subtle.sign('HMAC', key, msgData)
    const hexSig = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    // Zalo gửi dạng "sha256=<hex>" hoặc chỉ "<hex>"
    const expected = signature.replace(/^sha256=/, '')
    return hexSig === expected
  } catch {
    return false
  }
}
