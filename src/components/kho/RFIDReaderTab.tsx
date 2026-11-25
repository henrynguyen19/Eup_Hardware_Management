'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Web Serial API (Chrome/Edge only) ─────────────────────────────────────────
interface WebSerialPort {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
}
declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: object): Promise<WebSerialPort>
      getPorts(): Promise<WebSerialPort[]>
    }
  }
}

// ── RF Binary Protocol helpers ────────────────────────────────────────────────
// Frame: AA BB [LEN] [CMD] [DATA...] [BCC]  (BCC = XOR from LEN to end of DATA)

function xorBcc(bytes: number[]): number {
  return bytes.reduce((r, b) => r ^ b, 0)
}

/** Build a frame. stx defaults to [0xFB, 0xFD] — what the reader sends as heartbeat */
function makeCmd(cmd: number, data: number[] = [], stx = [0xFB, 0xFD]): Uint8Array {
  const payload = [data.length + 1, cmd, ...data]
  return new Uint8Array([...stx, ...payload, xorBcc(payload)])
}

/** Probe commands — reader sends FB FD heartbeat, so try FB FD as STX first */
const PROBE_VARIANTS = [
  // ── FB FD (reader's own heartbeat = most likely STX) ─────────────────────
  { label: 'FB FD — cmd=0x50, REQA',    bytes: [0xFB,0xFD,0x03,0x50,0x26,0x00,0x77] },
  { label: 'FB FD — cmd=0x50, WUPA',    bytes: [0xFB,0xFD,0x03,0x50,0x52,0x00,0x03] },
  { label: 'FB FD — cmd=0x01 (detect)', bytes: [0xFB,0xFD,0x01,0x01,0x01] },
  { label: 'FB FD — cmd=0x02 (UID)',    bytes: [0xFB,0xFD,0x01,0x02,0x03] },
  { label: 'FB FD — cmd=0x20',          bytes: [0xFB,0xFD,0x01,0x20,0x21] },
  // ── Other common STX values ──────────────────────────────────────────────
  { label: 'AA BB — cmd=0x50, REQA',   bytes: [0xAA,0xBB,0x03,0x50,0x26,0x00,0x77] },
  { label: 'AB BA — cmd=0x50, REQA',   bytes: [0xAB,0xBA,0x03,0x50,0x26,0x00,0x77] },
  { label: 'Raw 0x26 (bare REQA)',      bytes: [0x26] },
  { label: 'Raw 0x52 (bare WUPA)',      bytes: [0x52] },
  { label: 'FF 00 (init/ping)',         bytes: [0xFF,0x00,0x00,0x00,0x00] },
]

/** Decode hex string to number[]. Pads/trims to `len` bytes. */
function hexDecode(hex: string, len: number): number[] {
  const h = hex.replace(/\s/g, '').toLowerCase().padEnd(len * 2, '0').slice(0, len * 2)
  return Array.from({ length: len }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16) || 0)
}

/** Encode number[] to spaced uppercase hex string */
function hexEncode(bytes: Iterable<number>): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

const CARD_TYPE_NAMES: Record<number, string> = {
  0x08: 'Mifare Classic 1K',
  0x18: 'Mifare Classic 4K',
  0x28: 'Mifare Classic 2K',
  0x44: 'Mifare UltraLight',
  0x01: 'ISO 14443A',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CardInfo {
  uid: string          // raw hex e.g. "A1B2C3D4"
  uidDisplay: string   // spaced e.g. "A1 B2 C3 D4"
  cardType: number
  cardTypeName: string
}

interface BlockData {
  block: number
  dataHex: string   // spaced hex
  dataAscii: string
}

type LogEntry = { ts: string; msg: string; kind: 'info' | 'ok' | 'err' | 'warn' }

// ── Component ─────────────────────────────────────────────────────────────────

export default function RFIDReaderTab() {
  const [supported, setSupported]   = useState<boolean | null>(null)
  const [connected, setConnected]   = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [baudRate, setBaudRate]     = useState(19200)

  const [card, setCard]           = useState<CardInfo | null>(null)
  const [polling, setPolling]     = useState(false)
  const [reading, setReading]     = useState(false)

  const [blockNum,  setBlockNum]  = useState(1)
  const [blockKey,  setBlockKey]  = useState('FFFFFFFFFFFF')
  const [keyType,   setKeyType]   = useState(0)
  const [blockData, setBlockData] = useState<BlockData | null>(null)
  const [writeData, setWriteData] = useState('')
  const [writing,   setWriting]   = useState(false)

  const [log, setLog]       = useState<LogEntry[]>([])
  const [debugMode, setDebugMode] = useState(false)
  const [rawRx, setRawRx]   = useState<string>('')   // last N raw bytes received (hex)
  const [probing, setProbing] = useState(false)
  const [probeLog, setProbeLog] = useState<string[]>([])

  // Refs (stable across renders, safe inside async loops)
  const portRef        = useRef<WebSerialPort | null>(null)
  const rxBuf          = useRef<number[]>([])
  const rawRxBuf       = useRef<number[]>([])         // debug: all received bytes
  const frameWaiters   = useRef<Array<(f: Uint8Array | null) => void>>([])
  const readLoopActive = useRef(false)
  const pollTimer      = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastUid        = useRef<string | null>(null)
  const cardRef        = useRef<CardInfo | null>(null)   // shadow of `card` for async access

  // ── Check browser support ─────────────────────────────────────────────────
  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && 'serial' in navigator)
  }, [])

  // ── Logging ───────────────────────────────────────────────────────────────
  const addLog = useCallback((msg: string, kind: LogEntry['kind'] = 'info') => {
    const entry: LogEntry = { ts: new Date().toLocaleTimeString('vi-VN'), msg, kind }
    setLog(prev => [entry, ...prev].slice(0, 60))
  }, [])

  // ── Frame parser (called from read loop) ──────────────────────────────────
  // Supports both FB FD (reader's STX) and AA BB (legacy guess)
  function tryParseFrame() {
    const buf = rxBuf.current
    for (let i = 0; i < buf.length - 1; i++) {
      const isStx = (buf[i] === 0xFB && buf[i + 1] === 0xFD) ||
                    (buf[i] === 0xAA && buf[i + 1] === 0xBB)
      if (isStx) {
        if (buf.length < i + 3) return   // wait for LEN byte
        const len = buf[i + 2]
        if (len === 0) {
          // 2-byte heartbeat or minimal frame: FB FD 00 → resolve immediately
          const frame = new Uint8Array(buf.slice(i, i + 3))
          rxBuf.current = buf.slice(i + 3)
          const resolve = frameWaiters.current.shift()
          if (resolve) resolve(frame)
          return
        }
        const need = i + 3 + len + 1     // STX STX LEN [payload:len] BCC
        if (buf.length < need) return     // wait for more bytes
        const frame = new Uint8Array(buf.slice(i, need))
        rxBuf.current = buf.slice(need)
        const resolve = frameWaiters.current.shift()
        if (resolve) resolve(frame)
        return
      }
    }
    // Discard leading garbage (keep last byte — might be first STX byte)
    if (buf.length > 128) {
      let keepIdx = -1
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i] === 0xFB || buf[i] === 0xAA) { keepIdx = i; break }
      }
      rxBuf.current = keepIdx >= 0 ? buf.slice(keepIdx) : []
    }
  }

  function waitForFrame(timeoutMs = 1000): Promise<Uint8Array | null> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        const idx = frameWaiters.current.indexOf(resolve)
        if (idx >= 0) frameWaiters.current.splice(idx, 1)
        resolve(null)
      }, timeoutMs)
      frameWaiters.current.push(frame => {
        clearTimeout(timer)
        resolve(frame)
      })
    })
  }

  // ── Background read loop ──────────────────────────────────────────────────
  async function startReadLoop(port: WebSerialPort) {
    readLoopActive.current = true
    const reader = port.readable.getReader()
    try {
      while (readLoopActive.current) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          rxBuf.current.push(...Array.from(value))
          // Debug: accumulate raw bytes
          rawRxBuf.current.push(...Array.from(value))
          if (rawRxBuf.current.length > 256) rawRxBuf.current = rawRxBuf.current.slice(-256)
          setRawRx(rawRxBuf.current.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' '))
          tryParseFrame()
        }
      }
    } catch { /* port closed */ }
    finally { reader.releaseLock() }
  }

  // ── Probe: try different protocol variants ────────────────────────────────
  const handleProbe = useCallback(async () => {
    if (!portRef.current) return
    setProbing(true)
    setProbeLog([])
    rawRxBuf.current = []
    setRawRx('')
    const results: string[] = []

    for (const v of PROBE_VARIANTS) {
      // Clear buffer and send
      rxBuf.current = []
      const writer = portRef.current.writable.getWriter()
      const sent = v.bytes.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')
      try { await writer.write(new Uint8Array(v.bytes)) }
      finally { writer.releaseLock() }

      // Wait 600ms for any response (reader may be slow)
      await new Promise(r => setTimeout(r, 600))
      const received = rawRxBuf.current.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')
      rawRxBuf.current = []

      const result = `${v.label}\n  TX: ${sent}\n  RX: ${received || '(no response)'}`
      results.push(result)
      setProbeLog([...results])

      if (received) {
        results.push(`  ✅ Reader responded! Protocol might match.`)
        setProbeLog([...results])
        break
      }
    }

    setProbing(false)
  }, [])

  // ── Send a command and wait for one frame response ────────────────────────
  async function sendCmd(cmd: number, data: number[] = [], timeoutMs = 1200): Promise<Uint8Array | null> {
    if (!portRef.current) return null
    const writer = portRef.current.writable.getWriter()
    try { await writer.write(makeCmd(cmd, data)) }
    finally { writer.releaseLock() }
    return waitForFrame(timeoutMs)
  }

  // ── Connect ───────────────────────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!navigator.serial) return
    setConnecting(true)
    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate })
      portRef.current = port
      rxBuf.current = []
      frameWaiters.current = []
      startReadLoop(port)
      setConnected(true)
      addLog(`Đã kết nối @ ${baudRate} baud`, 'ok')
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      if (!msg.includes('No port selected') && !msg.includes('cancelled'))
        addLog(`Lỗi kết nối: ${msg}`, 'err')
    } finally {
      setConnecting(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baudRate, addLog])

  // ── Disconnect ────────────────────────────────────────────────────────────
  const handleDisconnect = useCallback(async () => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
    setPolling(false)
    readLoopActive.current = false
    frameWaiters.current.forEach(r => r(null))
    frameWaiters.current = []
    if (portRef.current) {
      try { await portRef.current.close() } catch { /* ignore */ }
      portRef.current = null
    }
    setConnected(false)
    setCard(null); cardRef.current = null
    setBlockData(null)
    lastUid.current = null
    addLog('Đã ngắt kết nối', 'warn')
  }, [addLog])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      readLoopActive.current = false
      if (pollTimer.current) clearInterval(pollTimer.current)
      portRef.current?.close().catch(() => {})
    }
  }, [])

  // ── Parse a raw frame from reader into CardInfo ───────────────────────────
  // Reader is PUSH-MODE: it auto-sends card data, no command needed.
  // No-card heartbeat:  FB FD (2 bytes, or FB FD 00 BCC)
  // Card-present frame: FB [status≠FD] [len?] [UID bytes...] [BCC?]
  //                  or FB FD [len>0]  [status] [UID bytes...] [BCC]
  function tryParseCardFrame(raw: number[]): CardInfo | null {
    if (raw.length < 4) return null

    // Pattern 1: FB FD 00 → no card
    if (raw[0] === 0xFB && raw[1] === 0xFD && raw.length <= 3) return null

    // Pattern 2: FB FD LEN STATUS UID(4B)... — framed with LEN > 0
    if (raw[0] === 0xFB && raw[1] === 0xFD && raw[2] > 0) {
      const status = raw[3]
      if (status !== 0 && status !== 0x01 && status !== 0x10) return null // error codes
      if (raw.length >= 8) {
        const uidBytes = raw.slice(4, 8)
        return buildCard(uidBytes, raw[8] ?? 0x08)
      }
    }

    // Pattern 3: FB [non-FD status] UID(4B) [BCC] — compact push frame
    if (raw[0] === 0xFB && raw[1] !== 0xFD && raw.length >= 5) {
      const uidBytes = raw.slice(1, 5)
      return buildCard(uidBytes, 0x08)
    }

    // Pattern 4: just 4 UID bytes with no header (some simple readers)
    if (raw.length === 4 || raw.length === 5) {
      return buildCard(raw.slice(0, 4), 0x08)
    }

    return null
  }

  function buildCard(uidBytes: number[], cardType: number): CardInfo {
    const uidHex = uidBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('')
    return {
      uid: uidHex,
      uidDisplay: hexEncode(uidBytes),
      cardType,
      cardTypeName: CARD_TYPE_NAMES[cardType] ?? `0x${cardType.toString(16).toUpperCase()}`,
    }
  }

  // ── Read card: passive listen mode (no commands sent) ─────────────────────
  const doReadCard = useCallback(async (): Promise<CardInfo | null> => {
    // Clear any stale bytes, then wait for reader to push card data
    rxBuf.current = []
    rawRxBuf.current = []

    // Wait up to 2 seconds for reader to send something (push mode)
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100))
      const raw = rawRxBuf.current.slice()
      if (raw.length >= 2) {
        // FB FD = heartbeat "no card"
        const isBeat = raw[0] === 0xFB && raw[1] === 0xFD && raw.length <= 4
        if (!isBeat && raw.length >= 4) {
          const card = tryParseCardFrame(raw)
          if (card) return card
        }
        // Accumulate more bytes if we have something partial
        if (raw.length > 0 && !isBeat) continue
      }
    }
    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Polling — passive: watch incoming bytes from push-mode reader ─────────
  const togglePolling = useCallback(() => {
    if (polling) {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
      setPolling(false)
      addLog('Dừng quét', 'info')
      return
    }
    setPolling(true)
    addLog('Bắt đầu quét (passive)...', 'info')
    // Check rawRxBuf every 300ms — reader pushes data autonomously
    pollTimer.current = setInterval(() => {
      const raw = rawRxBuf.current.slice()
      if (raw.length < 2) return
      // FB FD = no card heartbeat — ignore
      if (raw[0] === 0xFB && raw[1] === 0xFD && raw.length <= 4) {
        rawRxBuf.current = []  // clear heartbeat, wait for next
        return
      }
      // Something else came in — might be card data
      if (raw.length >= 2) {
        const c = tryParseCardFrame(raw)
        rawRxBuf.current = []  // consumed
        if (c) {
          if (c.uid !== lastUid.current) {
            lastUid.current = c.uid
            cardRef.current = c
            setCard(c)
            addLog(`🔖 ${c.uidDisplay}  (${c.cardTypeName})`, 'ok')
          }
        } else if (raw.length >= 4) {
          // Unknown frame — log raw bytes for debugging
          const hex = raw.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')
          addLog(`RAW: ${hex}`, 'warn')
        }
        if (lastUid.current && raw.length <= 4) lastUid.current = null
      }
    }, 300)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, addLog])

  // ── Manual read card ──────────────────────────────────────────────────────
  const handleReadCard = useCallback(async () => {
    const c = await doReadCard()
    if (c) {
      lastUid.current = c.uid
      cardRef.current = c
      setCard(c)
      addLog(`🔖 ${c.uidDisplay}  (${c.cardTypeName})`, 'ok')
    } else {
      addLog('Không có thẻ hoặc đọc thất bại', 'warn')
    }
  }, [doReadCard, addLog])

  // ── Read block ────────────────────────────────────────────────────────────
  const handleReadBlock = useCallback(async () => {
    const currentCard = cardRef.current
    if (!currentCard) { addLog('Đọc thẻ trước khi thao tác block', 'warn'); return }
    setReading(true)
    try {
      const uidBytes = hexDecode(currentCard.uid, 4)
      const keyBytes = hexDecode(blockKey, 6)
      // cmd=0x30 [block, key_type, key(6B), uid(4B)]
      const resp = await sendCmd(0x30, [blockNum, keyType, ...keyBytes, ...uidBytes], 1500)
      if (!resp || resp[3] !== 0 || resp.length < 20) {
        addLog(`Đọc block ${blockNum} thất bại (status=${resp ? resp[3] : 'timeout'})`, 'err')
        return
      }
      const raw = Array.from(resp.slice(4, 20))
      setBlockData({
        block: blockNum,
        dataHex: hexEncode(raw),
        dataAscii: raw.map(b => b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.').join(''),
      })
      addLog(`Block ${blockNum}: ${hexEncode(raw)}`, 'ok')
    } catch (e) { addLog(`Lỗi: ${e}`, 'err') }
    finally { setReading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNum, blockKey, keyType, addLog])

  // ── Write block ───────────────────────────────────────────────────────────
  const handleWriteBlock = useCallback(async () => {
    const currentCard = cardRef.current
    if (!currentCard) { addLog('Đọc thẻ trước khi thao tác block', 'warn'); return }
    setWriting(true)
    try {
      const uidBytes  = hexDecode(currentCard.uid, 4)
      const keyBytes  = hexDecode(blockKey, 6)
      const dataBytes = hexDecode(writeData, 16)
      // cmd=0x31 [block, key_type, key(6B), uid(4B), data(16B)]
      const resp = await sendCmd(0x31, [blockNum, keyType, ...keyBytes, ...uidBytes, ...dataBytes], 1500)
      if (!resp || resp[3] !== 0) {
        addLog(`Ghi block ${blockNum} thất bại (status=${resp ? resp[3] : 'timeout'})`, 'err')
        return
      }
      addLog(`✅ Ghi block ${blockNum} thành công`, 'ok')
    } catch (e) { addLog(`Lỗi: ${e}`, 'err') }
    finally { setWriting(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNum, blockKey, keyType, writeData, addLog])

  // ── Log color ─────────────────────────────────────────────────────────────
  const logColor = (k: LogEntry['kind']) =>
    k === 'ok' ? '#16a34a' : k === 'err' ? '#dc2626' : k === 'warn' ? '#d97706' : '#6b7280'

  // ── Render ────────────────────────────────────────────────────────────────

  // Not supported
  if (supported === false) {
    return (
      <div className="p-6 flex items-start gap-3">
        <span className="text-2xl">🌐</span>
        <div>
          <p className="font-semibold text-gray-800">Trình duyệt chưa hỗ trợ Web Serial API</p>
          <p className="text-sm text-gray-500 mt-1">
            Tính năng RFID yêu cầu <strong>Google Chrome</strong> hoặc <strong>Microsoft Edge</strong> phiên bản 89+.
          </p>
          <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer"
             className="inline-block mt-3 px-4 py-2 rounded-lg text-sm font-medium text-white no-underline"
             style={{ background: '#4285f4' }}>
            Tải Chrome
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">

      {/* ── Connection bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {!connected ? (
          <>
            <select
              value={baudRate}
              onChange={e => setBaudRate(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white"
            >
              {[9600, 19200, 38400, 115200].map(b => (
                <option key={b} value={b}>{b} baud</option>
              ))}
            </select>
            <button
              onClick={handleConnect}
              disabled={connecting || supported === null}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#7c3aed' }}
            >
              {connecting ? '⏳ Đang kết nối...' : '🔌 Kết nối đầu đọc'}
            </button>
            <span className="text-xs text-gray-400">Trình duyệt sẽ hỏi chọn cổng COM</span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700
                             bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Đã kết nối @ {baudRate} baud
            </span>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 bg-red-50
                         border border-red-200 hover:bg-red-100"
            >
              Ngắt kết nối
            </button>
          </>
        )}
      </div>

      {connected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Left: Card reader ───────────────────────────────────────────── */}
          <div className="space-y-3">

            {/* Card status */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              {card ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🃏</span>
                    <span className="font-semibold text-gray-800">Thẻ đang đọc</span>
                  </div>
                  <div className="font-mono text-lg font-bold text-purple-700 tracking-widest">
                    {card.uidDisplay}
                  </div>
                  <div className="text-xs text-gray-500">{card.cardTypeName}</div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="text-2xl">📭</span>
                  <span className="text-sm">Chưa có thẻ</span>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleReadCard}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: '#7c3aed' }}
              >
                📡 Đọc thẻ
              </button>
              <button
                onClick={togglePolling}
                className="flex-1 py-2 rounded-lg text-sm font-semibold border"
                style={polling
                  ? { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }
                  : { background: '#f9fafb', color: '#374151', borderColor: '#d1d5db' }}
              >
                {polling ? '⏸ Dừng quét' : '🔄 Tự động quét'}
              </button>
            </div>

            {/* Block operations */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">Đọc / Ghi block</p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Block số</label>
                  <input
                    type="number" min={0} max={63} value={blockNum}
                    onChange={e => setBlockNum(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Key type</label>
                  <select value={keyType} onChange={e => setKeyType(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                    <option value={0}>Key A</option>
                    <option value={1}>Key B</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Key (hex, 6 bytes)</label>
                <input
                  type="text" value={blockKey} onChange={e => setBlockKey(e.target.value)}
                  placeholder="FFFFFFFFFFFF"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono"
                />
              </div>

              <button
                onClick={handleReadBlock} disabled={reading || !card}
                className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#2563eb' }}
              >
                {reading ? '⏳ Đang đọc...' : '📖 Đọc block'}
              </button>

              {blockData && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
                  <div className="text-xs text-gray-500">Block {blockData.block}</div>
                  <div className="font-mono text-xs text-gray-800 break-all">{blockData.dataHex}</div>
                  <div className="font-mono text-xs text-purple-700">{blockData.dataAscii}</div>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Dữ liệu ghi (hex, 16 bytes)</label>
                <input
                  type="text" value={writeData} onChange={e => setWriteData(e.target.value)}
                  placeholder="00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-mono"
                />
              </div>

              <button
                onClick={handleWriteBlock} disabled={writing || !card || !writeData}
                className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#dc2626' }}
              >
                {writing ? '⏳ Đang ghi...' : '✏️ Ghi block'}
              </button>
            </div>
          </div>

          {/* ── Right: Log + debug + block reference ───────────────────────── */}
          <div className="space-y-3">

            {/* Log header with debug toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Nhật ký</span>
              <button
                onClick={() => setDebugMode(d => !d)}
                className="text-xs px-2 py-0.5 rounded border"
                style={debugMode
                  ? { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }
                  : { background: '#f9fafb', color: '#6b7280', borderColor: '#d1d5db' }}
              >
                🔬 Debug {debugMode ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Activity log */}
            <div className="bg-gray-900 rounded-xl p-3 h-40 overflow-y-auto font-mono text-xs space-y-0.5">
              {log.length === 0 && (
                <div className="text-gray-500">Nhật ký hoạt động...</div>
              )}
              {log.map((e, i) => (
                <div key={i} style={{ color: logColor(e.kind) }}>
                  <span className="text-gray-600">{e.ts} </span>
                  {e.msg}
                </div>
              ))}
            </div>

            {/* Debug panel */}
            {debugMode && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-indigo-800">🔬 Debug — Raw bytes (RX)</p>
                  <button onClick={() => { rawRxBuf.current = []; setRawRx('') }}
                    className="text-[11px] text-indigo-500 hover:text-indigo-700">Xoá</button>
                </div>
                <div className="bg-gray-900 rounded-lg p-2 font-mono text-[11px] text-green-400 min-h-[40px] break-all">
                  {rawRx || <span className="text-gray-600">Đặt thẻ lên đầu đọc, nhấn &quot;Probe&quot; để xem reader trả về gì...</span>}
                </div>

                <button
                  onClick={handleProbe} disabled={probing}
                  className="w-full py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: '#6366f1' }}
                >
                  {probing ? '⏳ Đang probe...' : '🧪 Probe — Thử tất cả protocol variants'}
                </button>

                {probeLog.length > 0 && (
                  <div className="bg-gray-900 rounded-lg p-2 font-mono text-[11px] space-y-2 max-h-48 overflow-y-auto">
                    {probeLog.map((line, i) => (
                      <pre key={i} className="whitespace-pre-wrap"
                           style={{ color: line.includes('✅') ? '#4ade80' : line.startsWith('  RX:') && !line.includes('no response') ? '#fbbf24' : '#9ca3af' }}>
                        {line}
                      </pre>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-indigo-600">
                  Nếu reader trả về bytes → gửi kết quả RX cho kỹ thuật để xác định đúng protocol.
                </p>
              </div>
            )}

            {/* Mifare 1K sector reference */}
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">Mifare Classic 1K — cấu trúc sector</p>
              <div className="overflow-x-auto">
                <table className="text-[11px] w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-2 py-1 text-left">Sector</th>
                      <th className="border border-gray-200 px-2 py-1 text-left">Block</th>
                      <th className="border border-gray-200 px-2 py-1 text-left">Loại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[0,1,2,3].map(s => (
                      [0,1,2,3].map(b => {
                        const blk = s * 4 + b
                        const isTrailer = b === 3
                        const isMfg = blk === 0
                        return (
                          <tr key={blk} className={blk === blockNum ? 'bg-purple-50' : ''}>
                            <td className="border border-gray-200 px-2 py-0.5">{b === 0 ? s : ''}</td>
                            <td className="border border-gray-200 px-2 py-0.5 font-mono font-semibold">{blk}</td>
                            <td className="border border-gray-200 px-2 py-0.5"
                                style={{ color: isMfg ? '#dc2626' : isTrailer ? '#d97706' : '#374151' }}>
                              {isMfg ? 'Manufacturer (read-only)' : isTrailer ? 'Sector Trailer (key+AC)' : 'Data'}
                            </td>
                          </tr>
                        )
                      })
                    ))}
                    <tr>
                      <td colSpan={3} className="border border-gray-200 px-2 py-0.5 text-gray-400 italic">
                        ... sector 4–15 (block 16–63) tương tự
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
