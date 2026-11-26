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
// Push-mode reader protocol (confirmed from hardware):
//   FB FD [00?]        → heartbeat "no card" (2–3 bytes)
//   FB F5 [UID×4]      → card present push frame (6 bytes, UID = bytes [2..5])
// Command-response protocol (block read/write):
//   TX: [STX×2] [LEN] [CMD] [DATA…] [BCC]
//   RX: [STX×2] [LEN] [STATUS] [DATA…] [BCC]  (STATUS=0 means success)

function xorBcc(bytes: number[]): number {
  return bytes.reduce((r, b) => r ^ b, 0)
}

function makeCmd(cmd: number, data: number[] = []): Uint8Array {
  const payload = [data.length + 1, cmd, ...data]
  return new Uint8Array([0xAA, 0xBB, ...payload, xorBcc(payload)])
}

/** Decode hex string → number[]. Pads/trims to `len` bytes. */
function hexDecode(hex: string, len: number): number[] {
  const h = hex.replace(/\s/g, '').toLowerCase().padEnd(len * 2, '0').slice(0, len * 2)
  return Array.from({ length: len }, (_, i) => parseInt(h.slice(i * 2, i * 2 + 2), 16) || 0)
}

/** number[] → spaced uppercase hex string */
function hexEncode(bytes: Iterable<number>): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

/** Encode ASCII string → 16-byte null-padded block data */
function encodeBlock16(text: string): number[] {
  const bytes = Array.from(text.slice(0, 16)).map(c => c.charCodeAt(0) & 0xFF)
  while (bytes.length < 16) bytes.push(0)
  return bytes
}

/** Decode 16-byte block data → printable ASCII string */
function decodeBlock16(raw: number[]): string {
  return raw
    .filter(b => b >= 0x20 && b < 0x7F)
    .map(b => String.fromCharCode(b))
    .join('')
    .trim()
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
  dataHex: string
  dataAscii: string
}

type LogEntry = { ts: string; msg: string; kind: 'info' | 'ok' | 'err' | 'warn' }

// ── Thẻ Lái Xe — block layout (từ CardIssue.exe / QCVN 06) ───────────────────
// Mifare Classic 1K, Key A = FF FF FF FF FF FF (factory default)
//   Block 0:           Manufacturer (UID, read-only)
//   Block 1:           Reserved / unused
//   Block startBlock:  Số GPLX (ASCII 16 bytes, null-padded) — default block 2
//   Block 3:           Sector 0 Trailer — SKIP
//   Block startBlock+2: Họ tên (ASCII 16 bytes, null-padded)   — default block 4
//   Block 7:           Sector 1 Trailer — SKIP
// CardIssue.exe confirmed: Default Start Block = "02", Key A = "FFFFFFFFFFFF"
const DEFAULT_START_BLOCK = 0
const QCVN06_DEFAULT_KEY  = 'FFFFFFFFFFFF'

// ── Bridge API (rfid_bridge.py running locally) ───────────────────────────────
const BRIDGE_URL = 'http://localhost:8765'

async function bridgeFetch(path: string, body?: object): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(2000),
    })
    return await res.json()
  } catch { return null }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RFIDReaderTab() {
  // Bridge mode
  const [bridgeAvailable, setBridgeAvailable] = useState<boolean | null>(null)
  const [bridgePorts,     setBridgePorts]     = useState<string[]>([])
  const [bridgePort,      setBridgePort]      = useState('')
  const [bridgeConnected, setBridgeConnected] = useState(false)
  const bridgePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Web Serial connection
  const [supported,   setSupported]   = useState<boolean | null>(null)
  const [connected,   setConnected]   = useState(false)
  const [connecting,  setConnecting]  = useState(false)
  const [baudRate,    setBaudRate]    = useState(19200)

  // Work Mode — mirrors CardIssue.exe "Work Mode" group box
  const [workMode,    setWorkMode]    = useState<'Reader' | 'Writer'>('Reader')
  const [startBlock,  setStartBlock]  = useState(DEFAULT_START_BLOCK)
  const [settingMode, setSettingMode] = useState(false)

  // Card state
  const [card,     setCard]     = useState<CardInfo | null>(null)
  const [polling,  setPolling]  = useState(false)

  // Driver card data inputs — mirrors CardIssue.exe "Licens Number" and "Name" fields
  const [soGPLX,       setSoGPLX]       = useState('')
  const [hoTen,        setHoTen]        = useState('')
  const [gettingCard,  setGettingCard]  = useState(false)
  const [settingCard,  setSettingCard]  = useState(false)

  // Advanced: single block R/W (developer tool)
  const [blockNum,   setBlockNum]   = useState(1)
  const [blockKey,   setBlockKey]   = useState(QCVN06_DEFAULT_KEY)
  const [keyType,    setKeyType]    = useState(0)
  const [blockData,  setBlockData]  = useState<BlockData | null>(null)
  const [readingBlk, setReadingBlk] = useState(false)
  const [writeData,  setWriteData]  = useState('')
  const [writingBlk, setWritingBlk] = useState(false)

  // Debug
  const [debugMode, setDebugMode] = useState(false)
  const [rawRx,     setRawRx]     = useState('')
  const [dumpLog,   setDumpLog]   = useState<string[]>([])
  const [dumping,   setDumping]   = useState(false)
  const [probing,   setProbing]   = useState(false)
  const [probeLog,  setProbeLog]  = useState<string[]>([])

  // Log
  const [log, setLog] = useState<LogEntry[]>([])

  // Refs
  const portRef        = useRef<WebSerialPort | null>(null)
  const rxBuf          = useRef<number[]>([])
  const rawRxBuf       = useRef<number[]>([])
  const frameWaiters   = useRef<Array<(f: Uint8Array | null) => void>>([])
  const readLoopActive = useRef(false)
  const pollTimer      = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastUid        = useRef<string | null>(null)
  const cardRef        = useRef<CardInfo | null>(null)

  // ── Browser support ───────────────────────────────────────────────────────
  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && 'serial' in navigator)
  }, [])

  // ── Logging ───────────────────────────────────────────────────────────────
  const addLog = useCallback((msg: string, kind: LogEntry['kind'] = 'info') => {
    const entry: LogEntry = { ts: new Date().toLocaleTimeString('vi-VN'), msg, kind }
    setLog(prev => [entry, ...prev].slice(0, 80))
  }, [])

  // ── Frame parser ──────────────────────────────────────────────────────────
  // Reader pushes frames autonomously; we also receive responses to TX commands.
  // Confirmed STX values seen in the wild: 0xFB and 0xBB (same frame structure)
  function tryParseFrame() {
    const buf = rxBuf.current
    for (let i = 0; i < buf.length - 1; i++) {
      // {FB|BB} FD — heartbeat (no card): 2–3 bytes
      if ((buf[i] === 0xFB || buf[i] === 0xBB) && buf[i + 1] === 0xFD) {
        const frameEnd = (buf[i + 2] === 0x00) ? i + 3 : i + 2
        if (buf.length < frameEnd) return
        const frame = new Uint8Array(buf.slice(i, frameEnd))
        rxBuf.current = buf.slice(frameEnd)
        frameWaiters.current.shift()?.(frame)
        return
      }
      // {FB|BB} F5 [xx] — card present push frame (3 bytes confirmed in hardware)
      // Note: some readers also send 6-byte version with UID appended; accept both
      if ((buf[i] === 0xFB || buf[i] === 0xBB) && buf[i + 1] === 0xF5) {
        if (buf.length < i + 3) return   // need at least 3 bytes
        // If 6+ bytes available treat bytes [2..5] as UID, otherwise 3-byte frame
        const frameLen = buf.length >= i + 6 ? 6 : 3
        const frame = new Uint8Array(buf.slice(i, i + frameLen))
        rxBuf.current = buf.slice(i + frameLen)
        frameWaiters.current.shift()?.(frame)
        return
      }
      // AA BB [LEN] [CMD/STATUS] [DATA…] [BCC] — command-response
      if (buf[i] === 0xAA && buf[i + 1] === 0xBB) {
        if (buf.length < i + 3) return
        const len = buf[i + 2]
        if (len === 0) {
          const frame = new Uint8Array(buf.slice(i, i + 3))
          rxBuf.current = buf.slice(i + 3)
          frameWaiters.current.shift()?.(frame)
          return
        }
        const need = i + 3 + len + 1
        if (buf.length < need) return
        const frame = new Uint8Array(buf.slice(i, need))
        rxBuf.current = buf.slice(need)
        frameWaiters.current.shift()?.(frame)
        return
      }
    }
    // Discard leading garbage
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
      frameWaiters.current.push(frame => { clearTimeout(timer); resolve(frame) })
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
          rawRxBuf.current.push(...Array.from(value))
          if (rawRxBuf.current.length > 256) rawRxBuf.current = rawRxBuf.current.slice(-256)
          setRawRx(rawRxBuf.current.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '))
          tryParseFrame()
        }
      }
    } catch { /* port closed */ }
    finally { reader.releaseLock() }
  }

  // ── Send a command and wait for one frame response ────────────────────────
  async function sendCmd(cmd: number, data: number[] = [], timeoutMs = 1500): Promise<Uint8Array | null> {
    if (!portRef.current) return null
    const writer = portRef.current.writable.getWriter()
    try { await writer.write(makeCmd(cmd, data)) }
    finally { writer.releaseLock() }
    return waitForFrame(timeoutMs)
  }

  // ── Manual TX ─────────────────────────────────────────────────────────────
  const [manualTx, setManualTx] = useState('')
  const [manualTxResult, setManualTxResult] = useState('')
  const handleManualTx = useCallback(async () => {
    if (!portRef.current || !manualTx.trim()) return
    const bytes = manualTx.trim().split(/[\s,]+/).map(h => parseInt(h, 16)).filter(n => !isNaN(n))
    if (!bytes.length) return
    rawRxBuf.current = []
    setManualTxResult('⏳ Chờ...')
    const writer = portRef.current.writable.getWriter()
    try { await writer.write(new Uint8Array(bytes)) }
    finally { writer.releaseLock() }
    await new Promise(r => setTimeout(r, 800))
    const rx = rawRxBuf.current.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')
    setManualTxResult(rx || '(no response)')
    addLog(`TX: ${bytes.map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ')} → RX: ${rx || 'none'}`, rx ? 'ok' : 'warn')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualTx, addLog])

  // ── Probe all protocol variants ───────────────────────────────────────────
  // Frame format candidates based on rf_Reader.dll disassembly:
  //   Internal buffer: [block_lo][block_hi][?][?][TYPE][CMD][key_type][key×6]
  //   TYPE 0x10=RF, 0x20=ISO14443A, 0x21=Mifare M1
  //   CMD  0x01=RFOn, 0x11=RequestAndSelect, 0x03=M1Read
  // Push frames from reader: FB/BB F5 [cardType] → card present
  //                          BB FD [xx]           → no card
  const PROBE_VARIANTS = [
    // ── DLL-derived: raw TYPE+CMD (no header) ─────────────────────────────
    { label: '[DLL] RF On  → 10 01 (raw)',        bytes: [0x10,0x01] },
    { label: '[DLL] RF On  → 10 01 11 (+XOR)',    bytes: [0x10,0x01,0x11] },
    { label: '[DLL] REQA   → 20 11 (raw)',         bytes: [0x20,0x11] },
    { label: '[DLL] REQA   → 20 11 31 (+XOR)',     bytes: [0x20,0x11,0x31] },
    // ── DLL-derived: BB [LEN] [TYPE] [CMD] [XOR] ──────────────────────────
    { label: '[DLL] BB hdr: RF On',               bytes: [0xBB,0x02,0x10,0x01,0x13] },
    { label: '[DLL] BB hdr: REQA',                bytes: [0xBB,0x02,0x20,0x11,0x33] },
    // ── DLL-derived: FB [LEN] [TYPE] [CMD] [XOR] ──────────────────────────
    { label: '[DLL] FB hdr: RF On',               bytes: [0xFB,0x02,0x10,0x01,0xE8] },
    { label: '[DLL] FB hdr: REQA',                bytes: [0xFB,0x02,0x20,0x11,0xC8] },
    // ── AA BB format (original assumption) ────────────────────────────────
    { label: '[AA BB] RF On',                     bytes: [0xAA,0xBB,0x02,0x10,0x01,0x13] },
    { label: '[AA BB] REQA',                      bytes: [0xAA,0xBB,0x02,0x20,0x11,0x33] },
    // ── ISO 14443 raw REQA ────────────────────────────────────────────────
    { label: 'Raw 0x26 (bare REQA)',               bytes: [0x26] },
    // ── CardIssue-style heartbeat mirror ──────────────────────────────────
    { label: 'BB FD 00 (mirror no-card frame)',    bytes: [0xBB,0xFD,0x00] },
    { label: 'FB FD 00 (mirror no-card frame)',    bytes: [0xFB,0xFD,0x00] },
  ]

  const handleProbe = useCallback(async () => {
    if (!portRef.current) return
    setProbing(true)
    setProbeLog([])
    rawRxBuf.current = []
    setRawRx('')
    const results: string[] = []
    for (const v of PROBE_VARIANTS) {
      rxBuf.current = []
      rawRxBuf.current = []
      const writer = portRef.current.writable.getWriter()
      const sent = v.bytes.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')
      try { await writer.write(new Uint8Array(v.bytes)) }
      finally { writer.releaseLock() }
      await new Promise(r => setTimeout(r, 700))
      const received = rawRxBuf.current.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')
      const result = `${v.label}\n  TX: ${sent}\n  RX: ${received || '(no response)'}`
      results.push(result)
      if (received && received !== 'BB FD' && received !== 'FB FD') {
        results.push('  ✅ Có phản hồi khác heartbeat!'); setProbeLog([...results]); break
      }
      setProbeLog([...results])
    }
    if (!results.some(r => r.includes('✅'))) {
      results.push('--- Không tìm thấy protocol. Dùng Procmon để capture bytes ---\n' +
        '  1. Chạy CardIssue.exe → bấm Kết nối\n' +
        '  2. Mở Procmon → Filter → Process Name = CardIssue.exe, Op = WriteFile\n' +
        '  3. Bấm Get trong CardIssue → xem bytes trong Event Detail > Detail tab')
      setProbeLog([...results])
    }
    setProbing(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Connect ───────────────────────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!navigator.serial) return
    setConnecting(true)
    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate })
      portRef.current = port
      rxBuf.current = []
      rawRxBuf.current = []
      frameWaiters.current = []
      startReadLoop(port)
      setConnected(true)
      addLog(`Đã kết nối @ ${baudRate} baud`, 'ok')
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      if (!msg.includes('No port selected') && !msg.includes('cancelled'))
        addLog(`Lỗi kết nối: ${msg}`, 'err')
    } finally { setConnecting(false) }
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
    setSoGPLX(''); setHoTen('')
    lastUid.current = null
    addLog('Đã ngắt kết nối', 'warn')
  }, [addLog])

  // Auto-start polling when connected (Web Serial)
  useEffect(() => {
    if (connected && !polling) {
      togglePolling()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  // ── Bridge: check availability on mount ───────────────────────────────────
  useEffect(() => {
    bridgeFetch('/status').then(d => {
      const ok = d?.ok === true
      setBridgeAvailable(ok)
      if (ok) {
        bridgeFetch('/ports').then(r => {
          const ports = (r?.ports as string[]) || []
          setBridgePorts(ports)
          if (ports.length > 0) setBridgePort(ports[0])
        })
      }
    })
  }, [])

  // ── Bridge: connect ───────────────────────────────────────────────────────
  const handleBridgeConnect = useCallback(async () => {
    if (!bridgePort) return
    setConnecting(true)
    const r = await bridgeFetch('/port/open', { port: bridgePort, baud: baudRate })
    setConnecting(false)
    if (r?.ok) {
      setBridgeConnected(true)
      addLog(`[Bridge] Đã kết nối ${bridgePort} @ ${baudRate} baud`, 'ok')
      // Start bridge polling for card presence
      if (bridgePollRef.current) clearInterval(bridgePollRef.current)
      bridgePollRef.current = setInterval(async () => {
        const res = await bridgeFetch('/card/read')
        if (res?.ok) {
          const uid = String(res.uid ?? '')
          if (uid && uid !== lastUid.current) {
            lastUid.current = uid
            const c: CardInfo = {
              uid,
              uidDisplay: String(res.uid_display ?? uid),
              cardType: Number(res.card_type ?? 0x08),
              cardTypeName: String(res.card_type_name ?? 'Mifare'),
            }
            cardRef.current = c
            setCard(c); setSoGPLX(''); setHoTen('')
            addLog(`🔖 ${c.uidDisplay}  (${c.cardTypeName}) — đọc GPLX...`, 'ok')
            setTimeout(() => handleBridgeGetData(), 300)
          }
        } else if (res?.no_card && lastUid.current) {
          lastUid.current = null; cardRef.current = null
          setCard(null); setSoGPLX(''); setHoTen('')
        }
      }, 600)
    } else {
      addLog(`[Bridge] Lỗi kết nối: ${r?.error ?? 'timeout'}`, 'err')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgePort, baudRate, addLog])

  // ── Bridge: disconnect ────────────────────────────────────────────────────
  const handleBridgeDisconnect = useCallback(async () => {
    if (bridgePollRef.current) { clearInterval(bridgePollRef.current); bridgePollRef.current = null }
    await bridgeFetch('/port/close')
    setBridgeConnected(false)
    setCard(null); cardRef.current = null; lastUid.current = null
    setSoGPLX(''); setHoTen('')
    addLog('[Bridge] Đã ngắt kết nối', 'warn')
  }, [addLog])

  // ── Bridge: Get card data (read blocks) ──────────────────────────────────
  const handleBridgeGetData = useCallback(async () => {
    setGettingCard(true)
    try {
      const [r1, r2] = await Promise.all([
        bridgeFetch('/card/block/read', { block: startBlock,     key: QCVN06_DEFAULT_KEY }),
        bridgeFetch('/card/block/read', { block: startBlock + 2, key: QCVN06_DEFAULT_KEY }),
      ])
      const decode = (d: Record<string, unknown> | null) =>
        d?.ok ? String(d.data_ascii ?? '').replace(/\./g, ' ').trim() : ''
      const gplx = decode(r1); const name = decode(r2)
      if (gplx || name) {
        setSoGPLX(gplx); setHoTen(name)
        addLog(`👤 ${name || '—'}  |  GPLX: ${gplx || '—'}`, 'ok')
      } else {
        addLog('[Bridge] Không đọc được dữ liệu block', 'warn')
      }
    } catch (e) { addLog(`[Bridge] Lỗi: ${e}`, 'err') }
    finally { setGettingCard(false) }
  }, [startBlock, addLog])

  // ── Bridge: Set card data (write blocks) ─────────────────────────────────
  const handleBridgeSetData = useCallback(async () => {
    if (!soGPLX && !hoTen) { addLog('Nhập dữ liệu trước khi ghi', 'warn'); return }
    setSettingCard(true)
    try {
      const enc = (s: string) => Array.from(s.slice(0, 16).padEnd(16, '\x00')).map(c => c.charCodeAt(0).toString(16).padStart(2,'0')).join('')
      const results: string[] = []
      if (soGPLX) {
        const r = await bridgeFetch('/card/block/write', { block: startBlock, key: QCVN06_DEFAULT_KEY, data: enc(soGPLX) })
        results.push(r?.ok ? '✅ Ghi GPLX OK' : `❌ GPLX: ${r?.error ?? 'lỗi'}`)
      }
      if (hoTen) {
        const r = await bridgeFetch('/card/block/write', { block: startBlock + 2, key: QCVN06_DEFAULT_KEY, data: enc(hoTen) })
        results.push(r?.ok ? '✅ Ghi Họ tên OK' : `❌ Họ tên: ${r?.error ?? 'lỗi'}`)
      }
      results.forEach(msg => addLog(`[Bridge] ${msg}`, msg.startsWith('✅') ? 'ok' : 'err'))
    } catch (e) { addLog(`[Bridge] Lỗi ghi: ${e}`, 'err') }
    finally { setSettingCard(false) }
  }, [soGPLX, hoTen, startBlock, addLog])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      readLoopActive.current = false
      if (pollTimer.current) clearInterval(pollTimer.current)
      portRef.current?.close().catch(() => {})
    }
  }, [])

  // ── Parse push frame → CardInfo ───────────────────────────────────────────
  // Frame formats confirmed from hardware:
  //   3-byte: FB/BB F5 [status]        — card present, no UID in frame
  //   6-byte: FB/BB F5 [B0 B1 B2 B3]  — card present + UID (some readers)
  function tryParseCardFrame(raw: number[]): CardInfo | null {
    if (raw.length < 3) return null
    if ((raw[0] === 0xFB || raw[0] === 0xBB) && raw[1] === 0xF5) {
      if (raw.length >= 6) {
        // 6-byte format: UID bytes 2..5
        const uidBytes = raw.slice(2, 6)
        const cardType = 0x08
        const uidHex = uidBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('')
        return {
          uid: uidHex,
          uidDisplay: hexEncode(uidBytes),
          cardType,
          cardTypeName: CARD_TYPE_NAMES[cardType] ?? `Mifare Classic`,
        }
      } else {
        // 3-byte format: no UID, use status byte as identifier
        const statusByte = raw[2]
        const cardTypeHex = statusByte.toString(16).toUpperCase().padStart(2, '0')
        return {
          uid: `CARD_${cardTypeHex}`,   // placeholder — no UID in frame
          uidDisplay: `?? ?? ?? ${cardTypeHex}`,
          cardType: statusByte,
          cardTypeName: CARD_TYPE_NAMES[statusByte] ?? `Type 0x${cardTypeHex}`,
        }
      }
    }
    return null
  }

  // ── Polling — passive: watch push-mode frames ─────────────────────────────
  const togglePolling = useCallback(() => {
    if (polling) {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
      setPolling(false)
      addLog('Dừng quét', 'info')
      return
    }
    setPolling(true)
    addLog('Bắt đầu quét tự động...', 'info')
    pollTimer.current = setInterval(() => {
      const raw = rawRxBuf.current.slice()
      if (raw.length < 2) return

      if ((raw[0] === 0xFB || raw[0] === 0xBB) && raw[1] === 0xFD) {
        rawRxBuf.current = []
        if (lastUid.current) {
          lastUid.current = null; cardRef.current = null
          setCard(null); setSoGPLX(''); setHoTen('')
        }
        return
      }

      if ((raw[0] === 0xFB || raw[0] === 0xBB) && raw[1] === 0xF5) {
        if (raw.length < 3) return   // need at least 3 bytes
        const frameLen = raw.length >= 6 ? 6 : 3
        const c = tryParseCardFrame(raw)
        rawRxBuf.current = raw.slice(frameLen)
        if (c && c.uid !== lastUid.current) {
          lastUid.current = c.uid; cardRef.current = c
          setCard(c); setSoGPLX(''); setHoTen('')
          addLog(`🔖 ${c.uidDisplay}  (${c.cardTypeName}) — đang đọc GPLX...`, 'ok')
          // Auto-read driver info when card is detected
          setTimeout(() => handleGetCardAuto(c), 200)
        }
        return
      }

      const hex = raw.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')
      rawRxBuf.current = []
      if (raw.length >= 3) addLog(`RAW: ${hex}`, 'warn')
    }, 150)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, addLog])

  // ── Work Mode Get/Set (UI-only — reader operates in push mode regardless) ──
  // The reader always auto-pushes UID frames; Work Mode only affects whether
  // the web UI shows "Get" only (Reader) or also "Set" (Writer).
  // CardIssue.exe's Get/Set Work Mode calls rf_GetWorkMode/rf_SetWorkMode in
  // rf_Reader.dll — the exact DLL serial command is unknown so we don't send it.
  const handleGetWorkMode = useCallback(() => {
    addLog(`Work Mode hiện tại: ${workMode}, Start Block: ${startBlock}`, 'info')
  }, [workMode, startBlock, addLog])

  const handleSetWorkMode = useCallback(() => {
    addLog(`Đã chọn Work Mode: ${workMode}, Start Block: ${startBlock}`, 'ok')
  }, [workMode, startBlock, addLog])

  // ── Auto-read when card detected (called from polling with card object) ───
  const handleGetCardAuto = useCallback(async (currentCard: CardInfo) => {
    setGettingCard(true)
    try {
      const uidBytes = currentCard.uid.startsWith('CARD_')
        ? [0, 0, 0, 0]  // 3-byte frame: no UID, send zeros
        : hexDecode(currentCard.uid, 4)
      const keyBytes = hexDecode(QCVN06_DEFAULT_KEY, 6)
      const blkGPLX  = startBlock
      const blkHoTen = startBlock + 2

      const [r1, r2] = await Promise.all([
        sendCmd(0x30, [blkGPLX,  0, ...keyBytes, ...uidBytes], 1500),
        sendCmd(0x30, [blkHoTen, 0, ...keyBytes, ...uidBytes], 1500),
      ])

      const decode = (resp: Uint8Array | null): string => {
        if (!resp || resp.length < 20 || resp[3] !== 0) return ''
        return decodeBlock16(Array.from(resp.slice(4, 20)))
      }

      const gplx = decode(r1)
      const name = decode(r2)
      if (gplx || name) {
        setSoGPLX(gplx); setHoTen(name)
        addLog(`👤 ${name || '—'}  |  GPLX: ${gplx || '—'}`, 'ok')
      } else {
        addLog('Đọc block thất bại — nhấn Get để thử lại', 'warn')
      }
    } catch { /* ignore */ }
    finally { setGettingCard(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startBlock, addLog])

  // ── Get (đọc thẻ) — mirrors CardIssue.exe "Get" button in card data section ──
  // Reads Số GPLX (block=startBlock) and Họ tên (block=startBlock+2)
  const handleGetCard = useCallback(async () => {
    const currentCard = cardRef.current
    if (!currentCard) {
      addLog('Chưa nhận UID — đặt thẻ lên đầu đọc rồi nhấn Quét', 'warn'); return
    }
    setGettingCard(true)
    try {
      const uidBytes = currentCard.uid.startsWith('CARD_')
        ? [0, 0, 0, 0]  // 3-byte push frame had no UID — send zeros
        : hexDecode(currentCard.uid, 4)
      const keyBytes = hexDecode(QCVN06_DEFAULT_KEY, 6)
      const blkGPLX  = startBlock
      const blkHoTen = startBlock + 2   // skip sector trailer at startBlock+1

      const [r1, r2] = await Promise.all([
        sendCmd(0x30, [blkGPLX,  0 /* Key A */, ...keyBytes, ...uidBytes], 1500),
        sendCmd(0x30, [blkHoTen, 0 /* Key A */, ...keyBytes, ...uidBytes], 1500),
      ])

      const decode = (resp: Uint8Array | null, label: string): string => {
        if (!resp || resp.length < 20) {
          addLog(`${label}: không nhận được dữ liệu (timeout)`, 'warn'); return ''
        }
        if (resp[3] !== 0) {
          addLog(`${label}: xác thực key thất bại (status=0x${resp[3].toString(16)})`, 'err'); return ''
        }
        return decodeBlock16(Array.from(resp.slice(4, 20)))
      }

      const gplx = decode(r1, 'Số GPLX')
      const name = decode(r2, 'Họ tên')
      setSoGPLX(gplx)
      setHoTen(name)
      if (gplx || name) {
        addLog(`👤 ${name || '—'}  |  GPLX: ${gplx || '—'}`, 'ok')
      } else {
        addLog('Không đọc được dữ liệu — kiểm tra key và block layout', 'warn')
      }
    } catch (e) { addLog(`Lỗi đọc thẻ: ${e}`, 'err') }
    finally { setGettingCard(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startBlock, addLog])

  // ── Set (ghi thẻ) — mirrors CardIssue.exe "Set" button in card data section ──
  // Writes Số GPLX and Họ tên to card blocks
  const handleSetCard = useCallback(async () => {
    const currentCard = cardRef.current
    if (!currentCard) {
      addLog('Chưa nhận UID — đặt thẻ lên đầu đọc rồi nhấn Quét', 'warn'); return
    }
    if (!soGPLX && !hoTen) {
      addLog('Nhập Số GPLX hoặc Họ tên trước khi ghi', 'warn'); return
    }
    setSettingCard(true)
    try {
      const uidBytes = hexDecode(currentCard.uid, 4)
      const keyBytes = hexDecode(QCVN06_DEFAULT_KEY, 6)
      const blkGPLX  = startBlock
      const blkHoTen = startBlock + 2

      const promises: Promise<Uint8Array | null>[] = []
      const labels: string[] = []

      if (soGPLX) {
        promises.push(sendCmd(0x31, [blkGPLX, 0, ...keyBytes, ...uidBytes, ...encodeBlock16(soGPLX)], 2000))
        labels.push('Số GPLX')
      }
      if (hoTen) {
        promises.push(sendCmd(0x31, [blkHoTen, 0, ...keyBytes, ...uidBytes, ...encodeBlock16(hoTen)], 2000))
        labels.push('Họ tên')
      }

      const resps = await Promise.all(promises)
      resps.forEach((resp, idx) => {
        if (!resp || resp[3] !== 0) {
          addLog(`Ghi ${labels[idx]} thất bại (status=${resp ? resp[3] : 'timeout'})`, 'err')
        } else {
          addLog(`✅ Ghi ${labels[idx]} thành công`, 'ok')
        }
      })
    } catch (e) { addLog(`Lỗi ghi thẻ: ${e}`, 'err') }
    finally { setSettingCard(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soGPLX, hoTen, startBlock, addLog])

  // ── Single block read (advanced) ──────────────────────────────────────────
  const handleReadBlock = useCallback(async () => {
    const currentCard = cardRef.current
    if (!currentCard) { addLog('Cần có thẻ trước', 'warn'); return }
    setReadingBlk(true)
    try {
      const uidBytes = hexDecode(currentCard.uid, 4)
      const keyBytes = hexDecode(blockKey, 6)
      const resp = await sendCmd(0x30, [blockNum, keyType, ...keyBytes, ...uidBytes], 1500)
      if (!resp || resp.length < 20 || resp[3] !== 0) {
        addLog(`Đọc block ${blockNum} thất bại (status=${resp ? resp[3] : 'timeout'})`, 'err'); return
      }
      const raw = Array.from(resp.slice(4, 20))
      setBlockData({
        block: blockNum,
        dataHex: hexEncode(raw),
        dataAscii: raw.map(b => b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.').join(''),
      })
      addLog(`Block ${blockNum}: ${hexEncode(raw)}`, 'ok')
    } catch (e) { addLog(`Lỗi: ${e}`, 'err') }
    finally { setReadingBlk(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNum, blockKey, keyType, addLog])

  // ── Single block write (advanced) ─────────────────────────────────────────
  const handleWriteBlock = useCallback(async () => {
    const currentCard = cardRef.current
    if (!currentCard) { addLog('Cần có thẻ trước', 'warn'); return }
    setWritingBlk(true)
    try {
      const uidBytes  = hexDecode(currentCard.uid, 4)
      const keyBytes  = hexDecode(blockKey, 6)
      const dataBytes = hexDecode(writeData, 16)
      const resp = await sendCmd(0x31, [blockNum, keyType, ...keyBytes, ...uidBytes, ...dataBytes], 2000)
      if (!resp || resp[3] !== 0) {
        addLog(`Ghi block ${blockNum} thất bại (status=${resp ? resp[3] : 'timeout'})`, 'err'); return
      }
      addLog(`✅ Ghi block ${blockNum} thành công`, 'ok')
    } catch (e) { addLog(`Lỗi: ${e}`, 'err') }
    finally { setWritingBlk(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNum, blockKey, keyType, writeData, addLog])

  // ── Block dump (debug) ────────────────────────────────────────────────────
  const handleBlockDump = useCallback(async () => {
    const currentCard = cardRef.current
    if (!currentCard) { addLog('Cần có thẻ trước', 'warn'); return }
    setDumping(true); setDumpLog([])
    const uidBytes = hexDecode(currentCard.uid, 4)
    const keyBytes = hexDecode(blockKey, 6)
    const lines: string[] = []
    for (let blk = 0; blk < 64; blk++) {
      const sector = Math.floor(blk / 4)
      const isTrailer = blk % 4 === 3
      try {
        const resp = await sendCmd(0x30, [blk, keyType, ...keyBytes, ...uidBytes], 1200)
        if (!resp || resp.length < 20) {
          lines.push(`[${blk.toString().padStart(2,'0')} S${sector}] ✗ timeout`)
        } else if (resp[3] !== 0) {
          lines.push(`[${blk.toString().padStart(2,'0')} S${sector}] ✗ auth error`)
        } else {
          const raw = Array.from(resp.slice(4, 20))
          const hex = raw.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ')
          const ascii = raw.map(b => b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.').join('')
          const tag = isTrailer ? ' [TRAILER]' : (blk === startBlock ? ' ◀GPLX' : blk === startBlock + 2 ? ' ◀Name' : '')
          lines.push(`[${blk.toString().padStart(2,'0')} S${sector}${tag}] ${hex}  |${ascii}|`)
        }
      } catch { lines.push(`[${blk.toString().padStart(2,'0')}] exception`) }
      setDumpLog([...lines])
    }
    setDumping(false)
    addLog(`Block dump: ${lines.filter(l => !l.includes('✗')).length}/64 đọc được`, 'ok')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockKey, keyType, startBlock, addLog])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const logColor = (k: LogEntry['kind']) =>
    k === 'ok' ? '#16a34a' : k === 'err' ? '#dc2626' : k === 'warn' ? '#d97706' : '#6b7280'

  const btnBase = 'px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors'
  const btnPrimary = `${btnBase} text-white`
  const btnOutline = `${btnBase} border`

  // ── Not supported ─────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-3 max-w-2xl">

      {/* ══ 1. PORT / CONNECTION ══════════════════════════════════════════════
           Mirrors: Port ComboBox + Refresh + Connect/Disconnect buttons        */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500 font-medium mr-1">Port:</span>
          <select
            value={baudRate}
            onChange={e => setBaudRate(Number(e.target.value))}
            disabled={connected}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700 bg-white disabled:bg-gray-50"
          >
            {[9600, 19200, 38400, 115200].map(b => (
              <option key={b} value={b}>{b} baud</option>
            ))}
          </select>

          {!connected ? (
            <>
              <button
                onClick={handleConnect}
                disabled={connecting || supported === null}
                className={btnPrimary}
                style={{ background: '#7c3aed' }}
              >
                {connecting ? '⏳ Đang kết nối...' : 'Connect'}
              </button>
              <span className="text-xs text-gray-400">Trình duyệt sẽ hỏi chọn cổng COM</span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700
                               bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Connected @ {baudRate} baud
              </span>
              <button
                onClick={handleDisconnect}
                className={btnOutline}
                style={{ color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2' }}
              >
                Disconnect
              </button>
              <button
                onClick={togglePolling}
                className={btnOutline}
                style={polling
                  ? { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }
                  : { background: '#f9fafb', color: '#374151', borderColor: '#d1d5db' }}
              >
                {polling ? '⏸ Dừng quét' : '🔄 Tự động quét'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ══ BRIDGE MODE ══════════════════════════════════════════════════════
           rfid_bridge.py bridge — works even when Web Serial protocol fails   */}
      <div className={`border rounded-xl p-3 ${
        bridgeConnected
          ? 'bg-emerald-50 border-emerald-300'
          : bridgeAvailable
            ? 'bg-blue-50 border-blue-200'
            : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wide ${
            bridgeConnected ? 'text-emerald-700' : bridgeAvailable ? 'text-blue-700' : 'text-amber-700'
          }`}>
            🔌 Bridge Mode (rfid_bridge.py)
          </span>

          {bridgeAvailable === null && (
            <span className="text-xs text-gray-400">Đang kiểm tra...</span>
          )}

          {bridgeAvailable === false && (
            <span className="text-xs text-amber-700">
              Chưa chạy — mở terminal: <code className="bg-amber-100 px-1 rounded">python rfid_bridge.py</code>
              {' '}(trong thư mục <code className="bg-amber-100 px-1 rounded">public/rfid/</code>)
            </span>
          )}

          {bridgeAvailable && !bridgeConnected && (
            <>
              <select
                value={bridgePort}
                onChange={e => setBridgePort(e.target.value)}
                className="border border-blue-300 rounded-lg px-2 py-1 text-sm bg-white"
              >
                {bridgePorts.length === 0 && <option value="">Không có port</option>}
                {bridgePorts.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button
                onClick={handleBridgeConnect}
                disabled={connecting || !bridgePort}
                className={btnPrimary}
                style={{ background: '#0ea5e9' }}
              >
                {connecting ? '⏳...' : 'Kết nối Bridge'}
              </button>
              <span className="text-xs text-blue-500">Bridge sẵn sàng ✓</span>
            </>
          )}

          {bridgeConnected && (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Bridge kết nối qua {bridgePort}
              </span>
              <button
                onClick={handleBridgeDisconnect}
                className={btnOutline}
                style={{ color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2' }}
              >
                Ngắt Bridge
              </button>
            </>
          )}
        </div>
      </div>

      {(connected || bridgeConnected) && (
        <>
          {/* ══ 2. WORK MODE ═══════════════════════════════════════════════════
               Mirrors: Work Mode GroupBox (Writer/Reader radio + Start Block combo
               + Get/Set buttons — IDs 1003,1004,1007,1005,1006)              */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Work Mode</p>
            <div className="flex flex-wrap items-center gap-4">
              {/* Radio: Writer / Reader */}
              <div className="flex items-center gap-4">
                {(['Reader', 'Writer'] as const).map(mode => (
                  <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="workMode"
                      value={mode}
                      checked={workMode === mode}
                      onChange={() => setWorkMode(mode)}
                      className="accent-purple-600"
                    />
                    <span className="text-sm font-medium text-gray-700">{mode}</span>
                  </label>
                ))}
              </div>

              {/* Start Block */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Start Block:</span>
                <select
                  value={startBlock}
                  onChange={e => setStartBlock(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm font-mono bg-white w-16"
                >
                  {[0, 1, 2, 4, 8].map(b => (
                    <option key={b} value={b}>{b.toString().padStart(2, '0')}</option>
                  ))}
                </select>
              </div>

              {/* Get / Set */}
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={handleGetWorkMode}
                  disabled={settingMode}
                  className={btnOutline}
                  style={{ color: '#374151', borderColor: '#d1d5db', background: '#f9fafb' }}
                >
                  Get
                </button>
                <button
                  onClick={handleSetWorkMode}
                  disabled={settingMode}
                  className={btnPrimary}
                  style={{ background: '#7c3aed' }}
                >
                  Set
                </button>
              </div>
            </div>
          </div>

          {/* ══ 3. CARD DATA ══════════════════════════════════════════════════
               Mirrors: Licens Number (ID=1008) + Name (ID=1009) inputs
               + Get (ID=1011) + Set (ID=1010) buttons                        */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Card Data — Thẻ Lái Xe (QCVN 06)</p>
              {/* UID badge */}
              {card && (
                <span className="font-mono text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-0.5">
                  🔖 {card.uidDisplay}
                </span>
              )}
            </div>

            {/* Card status */}
            {!card ? (
              <div className="flex items-center gap-2 py-2 text-gray-400">
                <span className="text-xl">📭</span>
                <span className="text-sm">Chưa có thẻ — đặt thẻ lên đầu đọc</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Licens Number */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Licens Number: <span className="text-gray-400">(Block {startBlock})</span>
                  </label>
                  <input
                    type="text"
                    value={soGPLX}
                    onChange={e => setSoGPLX(e.target.value)}
                    placeholder="Số giấy phép lái xe"
                    maxLength={16}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-300"
                    readOnly={workMode === 'Reader'}
                  />
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Name: <span className="text-gray-400">(Block {startBlock + 2})</span>
                  </label>
                  <input
                    type="text"
                    value={hoTen}
                    onChange={e => setHoTen(e.target.value)}
                    placeholder="Họ và tên lái xe"
                    maxLength={16}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                    readOnly={workMode === 'Reader'}
                  />
                </div>

                {/* Get / Set */}
                <div className="flex gap-2 justify-end items-center">
                  {bridgeConnected && (
                    <span className="text-xs text-emerald-600 mr-auto">🔌 Bridge mode</span>
                  )}
                  <button
                    onClick={bridgeConnected ? handleBridgeGetData : handleGetCard}
                    disabled={gettingCard || settingCard}
                    className={btnOutline}
                    style={{ color: '#374151', borderColor: '#d1d5db', background: '#f9fafb' }}
                  >
                    {gettingCard ? '⏳ Đang đọc...' : 'Get'}
                  </button>
                  {workMode === 'Writer' && (
                    <button
                      onClick={bridgeConnected ? handleBridgeSetData : handleSetCard}
                      disabled={settingCard || gettingCard}
                      className={btnPrimary}
                      style={{ background: '#dc2626' }}
                    >
                      {settingCard ? '⏳ Đang ghi...' : 'Set'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ══ 4. LOG ════════════════════════════════════════════════════════
               Mirrors: Multiline Edit (ID=1012) at the bottom of CardIssue.exe */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Log</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setLog([])}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Xoá
                </button>
                <button
                  onClick={() => setDebugMode(d => !d)}
                  className={`text-xs px-2 py-0.5 rounded border ${debugMode
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : 'bg-gray-50 text-gray-500 border-gray-300'}`}
                >
                  🔬 Debug {debugMode ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="bg-gray-900 rounded-lg p-3 h-36 overflow-y-auto font-mono text-xs space-y-0.5">
              {log.length === 0 && <div className="text-gray-600">Nhật ký hoạt động...</div>}
              {log.map((e, i) => (
                <div key={i} style={{ color: logColor(e.kind) }}>
                  <span className="text-gray-600">{e.ts} </span>{e.msg}
                </div>
              ))}
            </div>
          </div>

          {/* ══ 5. DEBUG / ADVANCED ═══════════════════════════════════════════
               Developer tools: raw bytes, probe, single block R/W, dump       */}
          {debugMode && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-indigo-800">🔬 Advanced / Debug</p>

              {/* Raw RX bytes */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-indigo-700">Raw bytes (RX)</span>
                  <button onClick={() => { rawRxBuf.current = []; setRawRx('') }}
                    className="text-[11px] text-indigo-500 hover:text-indigo-700">Xoá</button>
                </div>
                <div className="bg-gray-900 rounded-lg p-2 font-mono text-[11px] text-green-400 min-h-[32px] break-all">
                  {rawRx || <span className="text-gray-600">Chưa có dữ liệu...</span>}
                </div>
              </div>

              {/* Manual TX */}
              <div className="border border-indigo-200 rounded-lg p-2 space-y-1.5">
                <p className="text-[11px] font-semibold text-indigo-800">📡 Gửi lệnh thủ công (hex)</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualTx}
                    onChange={e => setManualTx(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleManualTx()}
                    placeholder="BB 02 10 01 13"
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                  />
                  <button onClick={handleManualTx} disabled={!manualTx.trim() || !connected}
                    className={`${btnPrimary} px-3 py-1 text-xs`} style={{ background: '#7c3aed' }}>
                    Gửi
                  </button>
                </div>
                {manualTxResult && (
                  <div className="bg-gray-900 rounded p-1.5 font-mono text-[11px] text-green-400 break-all">
                    RX: {manualTxResult}
                  </div>
                )}
                <div className="text-[10px] text-indigo-600 space-y-0.5">
                  <div>Từ DLL analysis: RF On = <code className="bg-indigo-100 px-0.5">10 01 11</code> | REQA = <code className="bg-indigo-100 px-0.5">20 11 31</code></div>
                  <div>M1 Read blk0 Key A FFFFFF = <code className="bg-indigo-100 px-0.5">21 03 00 00 00 FF FF FF FF FF FF [xor]</code></div>
                </div>
              </div>

              {/* Probe */}
              <button
                onClick={handleProbe} disabled={probing}
                className={`${btnPrimary} w-full py-1.5 text-xs`}
                style={{ background: '#6366f1' }}
              >
                {probing ? '⏳ Đang probe...' : '🧪 Probe — thử tất cả protocol variants (DLL-based)'}
              </button>
              {probeLog.length > 0 && (
                <div className="bg-gray-900 rounded-lg p-2 font-mono text-[11px] max-h-40 overflow-y-auto">
                  {probeLog.map((line, i) => (
                    <pre key={i} className="whitespace-pre-wrap"
                         style={{ color: line.includes('✅') ? '#4ade80' : line.startsWith('  RX:') && !line.includes('no response') ? '#fbbf24' : '#9ca3af' }}>
                      {line}
                    </pre>
                  ))}
                </div>
              )}

              {/* Single block R/W */}
              <div className="border-t border-indigo-200 pt-3 space-y-2">
                <p className="text-[11px] font-semibold text-indigo-800">📖 Đọc / Ghi block đơn</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1 block">Block</label>
                    <input type="number" min={0} max={63} value={blockNum}
                      onChange={e => setBlockNum(Number(e.target.value))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono" />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1 block">Key type</label>
                    <select value={keyType} onChange={e => setKeyType(Number(e.target.value))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-white">
                      <option value={0}>Key A</option>
                      <option value={1}>Key B</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1 block">Key (hex)</label>
                    <input type="text" value={blockKey} onChange={e => setBlockKey(e.target.value)}
                      placeholder="FFFFFFFFFFFF"
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleReadBlock} disabled={readingBlk || !card}
                    className={`${btnPrimary} flex-1 py-1.5 text-xs`} style={{ background: '#2563eb' }}>
                    {readingBlk ? '⏳' : '📖 Đọc block'}
                  </button>
                </div>
                {blockData && (
                  <div className="bg-gray-900 rounded p-2 font-mono text-[11px] space-y-0.5">
                    <div className="text-gray-500">Block {blockData.block}</div>
                    <div className="text-green-400 break-all">{blockData.dataHex}</div>
                    <div className="text-purple-400">{blockData.dataAscii}</div>
                  </div>
                )}
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">Ghi dữ liệu (hex, 16 bytes)</label>
                  <input type="text" value={writeData} onChange={e => setWriteData(e.target.value)}
                    placeholder="00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono" />
                </div>
                <button onClick={handleWriteBlock} disabled={writingBlk || !card || !writeData}
                  className={`${btnPrimary} w-full py-1.5 text-xs`} style={{ background: '#dc2626' }}>
                  {writingBlk ? '⏳' : '✏️ Ghi block'}
                </button>
              </div>

              {/* Block dump */}
              {card && (
                <div className="border-t border-indigo-200 pt-3 space-y-2">
                  <p className="text-[11px] font-semibold text-indigo-800">🗂 Block Dump — tất cả 64 blocks</p>
                  <button onClick={handleBlockDump} disabled={dumping}
                    className={`${btnPrimary} w-full py-1.5 text-xs`} style={{ background: '#0f766e' }}>
                    {dumping ? '⏳ Đang dump...' : '🗂 Đọc tất cả 64 blocks'}
                  </button>
                  {dumpLog.length > 0 && (
                    <div className="bg-gray-900 rounded p-2 font-mono text-[11px] max-h-56 overflow-y-auto space-y-0.5">
                      {dumpLog.map((line, i) => (
                        <div key={i} style={{
                          color: line.includes('TRAILER') ? '#d97706'
                               : line.includes('◀') ? '#60a5fa'
                               : line.includes('✗') ? '#6b7280'
                               : '#4ade80'
                        }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
