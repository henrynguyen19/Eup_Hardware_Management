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

function makeCmd(cmd: number, data: number[] = []): Uint8Array {
  const payload = [data.length + 1, cmd, ...data]
  return new Uint8Array([0xAA, 0xBB, ...payload, xorBcc(payload)])
}

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

  const [log, setLog] = useState<LogEntry[]>([])

  // Refs (stable across renders, safe inside async loops)
  const portRef        = useRef<WebSerialPort | null>(null)
  const rxBuf          = useRef<number[]>([])
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
  function tryParseFrame() {
    const buf = rxBuf.current
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i] === 0xAA && buf[i + 1] === 0xBB) {
        if (buf.length < i + 3) return   // wait for LEN byte
        const len = buf[i + 2]
        const need = i + 3 + len + 1     // AA BB LEN [payload:len] BCC
        if (buf.length < need) return     // wait for more bytes
        const frame = new Uint8Array(buf.splice(0, need).slice(i))
        rxBuf.current = buf.slice(need - i)  // remaining bytes after frame
        const resolve = frameWaiters.current.shift()
        if (resolve) resolve(frame)
        return
      }
    }
    // Discard leading garbage (keep last byte in case it's 0xAA)
    if (buf.length > 128) {
      const aaIdx = buf.indexOf(0xAA)
      rxBuf.current = aaIdx >= 0 ? buf.slice(aaIdx) : []
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
          tryParseFrame()
        }
      }
    } catch { /* port closed */ }
    finally { reader.releaseLock() }
  }

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

  // ── Read card (internal) ──────────────────────────────────────────────────
  // Response frame: AA BB LEN STATUS UID(4B) [optional extras] BCC
  const doReadCard = useCallback(async (): Promise<CardInfo | null> => {
    // REQA
    let resp = await sendCmd(0x50, [0x26, 0x00], 600)
    if (!resp || resp[3] !== 0) {
      // WUPA (wake up halted card)
      resp = await sendCmd(0x50, [0x52, 0x00], 600)
    }
    if (!resp || resp[3] !== 0) return null
    // UID at frame[4..7] (4 bytes), card type at frame[8] if present
    if (resp.length < 8) return null
    const uidBytes = Array.from(resp.slice(4, 8))
    const uidHex = uidBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('')
    const cardType = resp.length > 8 ? resp[8] : 0x08
    return {
      uid: uidHex,
      uidDisplay: hexEncode(uidBytes),
      cardType,
      cardTypeName: CARD_TYPE_NAMES[cardType] ?? `0x${cardType.toString(16).toUpperCase()}`,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Polling ───────────────────────────────────────────────────────────────
  const togglePolling = useCallback(() => {
    if (polling) {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
      setPolling(false)
      addLog('Dừng quét', 'info')
      return
    }
    setPolling(true)
    addLog('Bắt đầu quét thẻ...', 'info')
    pollTimer.current = setInterval(async () => {
      const c = await doReadCard()
      if (c) {
        if (c.uid !== lastUid.current) {
          lastUid.current = c.uid
          cardRef.current = c
          setCard(c)
          addLog(`🔖 ${c.uidDisplay}  (${c.cardTypeName})`, 'ok')
        }
      } else {
        if (lastUid.current) lastUid.current = null
      }
    }, 900)
  }, [polling, doReadCard, addLog])

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

          {/* ── Right: Log + block reference ────────────────────────────────── */}
          <div className="space-y-3">

            {/* Activity log */}
            <div className="bg-gray-900 rounded-xl p-3 h-56 overflow-y-auto font-mono text-xs space-y-0.5">
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
