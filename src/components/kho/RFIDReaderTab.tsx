'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface BridgeStatus {
  ok: boolean
  os?: string            // 'Windows' | 'Linux' | 'Darwin'
  dll_loaded: boolean
  dll_error?: string | null
  pyserial: boolean
  connected: boolean
  mode?: string | null   // 'dll' | 'serial'
  port_name?: string | null
  baud?: number
  python_bits?: string
}

interface CardInfo {
  uid: string
  uid_display: string
  uid_bytes: number[]
  card_type: number
  card_type_name: string
}

interface BlockData {
  block: number
  data_hex: string
  data_hex_raw: string
  data_ascii: string
}

interface LogEntry {
  id: number
  time: string
  type: 'info' | 'success' | 'error' | 'card'
  msg: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const BRIDGE_URL = 'http://localhost:8765'
const POLL_INTERVAL_MS = 900
let logIdCounter = 0

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function RFIDReaderTab() {
  // Connection
  const [bridgeOnline, setBridgeOnline]       = useState<boolean | null>(null)
  const [bridgeStatus, setBridgeStatus]       = useState<BridgeStatus | null>(null)
  const [portName, setPortName]               = useState('')
  const [availPorts, setAvailPorts]           = useState<string[]>([])
  const [scanning, setScanning]               = useState(false)
  const [connecting, setConnecting]           = useState(false)

  // Card state
  const [card, setCard]                       = useState<CardInfo | null>(null)
  const [polling, setPolling]                 = useState(false)
  const [reading, setReading]                 = useState(false)

  // Block ops
  const [blockNum, setBlockNum]               = useState('1')
  const [blockKey, setBlockKey]               = useState('FFFFFFFFFFFF')
  const [keyType, setKeyType]                 = useState('0')
  const [blockData, setBlockData]             = useState<BlockData | null>(null)
  const [writeData, setWriteData]             = useState('')
  const [writing, setWriting]                 = useState(false)

  // Log
  const [log, setLog]                         = useState<LogEntry[]>([])

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevUidRef = useRef<string | null>(null)

  // ── Helpers ────────────────────────────────────────────────────────────────

  const addLog = useCallback((type: LogEntry['type'], msg: string) => {
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLog(prev => [{ id: ++logIdCounter, time, type, msg }, ...prev].slice(0, 80))
  }, [])

  async function bridgeFetch(path: string, body?: object): Promise<{ ok: boolean; [k: string]: unknown }> {
    try {
      const opts: RequestInit = body
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : { method: 'GET', signal: AbortSignal.timeout(3000) }
      const r = await fetch(`${BRIDGE_URL}${path}`, opts)
      return await r.json()
    } catch {
      return { ok: false, error: 'Không kết nối được bridge' }
    }
  }

  // ── Bridge status polling ──────────────────────────────────────────────────

  async function checkBridge() {
    try {
      const r = await fetch(`${BRIDGE_URL}/status`, { signal: AbortSignal.timeout(2000) })
      const j: BridgeStatus = await r.json()
      setBridgeOnline(true)
      setBridgeStatus(j)
      // Set default port hint based on OS
      if (!portName) {
        setPortName(j.os === 'Windows' ? 'COM3' : '/dev/ttyUSB0')
      }
    } catch {
      setBridgeOnline(false)
      setBridgeStatus(null)
    }
  }

  async function scanPorts() {
    setScanning(true)
    try {
      const r = await fetch(`${BRIDGE_URL}/ports`, { signal: AbortSignal.timeout(3000) })
      const j = await r.json()
      setAvailPorts(j.ports ?? [])
      if (j.ports?.length && !portName) setPortName(j.ports[0])
    } catch {}
    setScanning(false)
  }

  useEffect(() => {
    checkBridge()
    const t = setInterval(checkBridge, 5000)
    return () => clearInterval(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Port connect / disconnect ──────────────────────────────────────────────

  async function connectPort() {
    setConnecting(true)
    addLog('info', `Đang mở ${portName}...`)
    const j = await bridgeFetch('/port/open', { port: portName, baud: 19200 })
    if (j.ok) {
      addLog('success', `Đã kết nối ${portName} @ 19200 baud (${(j as { mode?: string }).mode ?? 'serial'})`)
      await checkBridge()
    } else {
      addLog('error', `Lỗi kết nối: ${j.error}`)
    }
    setConnecting(false)
  }

  async function disconnectPort() {
    stopPolling()
    await bridgeFetch('/port/close', {})
    setCard(null)
    setBlockData(null)
    prevUidRef.current = null
    addLog('info', 'Đã ngắt kết nối cổng COM')
    await checkBridge()
  }

  // ── Read card ──────────────────────────────────────────────────────────────

  async function readCard() {
    setReading(true)
    const j = await bridgeFetch('/card/read', {})
    if (j.ok) {
      const c = j as unknown as CardInfo
      setCard(c)
      prevUidRef.current = c.uid
      addLog('card', `Thẻ: ${c.uid_display}  (${c.card_type_name})`)
    } else if (!j.no_card) {
      addLog('error', `Đọc thẻ: ${j.error || 'Không có phản hồi'}`)
    }
    setReading(false)
  }

  // ── Auto polling ───────────────────────────────────────────────────────────

  function startPolling() {
    setPolling(true)
    addLog('info', 'Chế độ auto-read bật — đặt thẻ lên đầu đọc...')
    pollTimer.current = setInterval(async () => {
      const j = await bridgeFetch('/card/read', {})
      if (j.ok) {
        const c = j as unknown as CardInfo
        setCard(c)
        if (c.uid !== prevUidRef.current) {
          prevUidRef.current = c.uid
          addLog('card', `Thẻ mới: ${c.uid_display}  (${c.card_type_name})`)
        }
      }
    }, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
    setPolling(false)
  }

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current) }, [])

  // ── Block read ─────────────────────────────────────────────────────────────

  async function readBlock() {
    setReading(true)
    addLog('info', `Đọc block ${blockNum} (Key ${keyType === '0' ? 'A' : 'B'}: ${blockKey})...`)
    const j = await bridgeFetch('/card/block/read', {
      block: parseInt(blockNum),
      key: blockKey.replace(/\s/g, ''),
      key_type: parseInt(keyType),
    })
    if (j.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setBlockData(j as any)
      addLog('success', `Block ${blockNum}: ${(j as unknown as BlockData).data_hex}`)
    } else {
      addLog('error', `Block ${blockNum}: ${j.error}`)
    }
    setReading(false)
  }

  // ── Block write ────────────────────────────────────────────────────────────

  async function writeBlock() {
    setWriting(true)
    addLog('info', `Ghi block ${blockNum}...`)
    const j = await bridgeFetch('/card/block/write', {
      block: parseInt(blockNum),
      data: writeData.replace(/\s/g, '').padEnd(32, '0').slice(0, 32),
      key: blockKey.replace(/\s/g, ''),
      key_type: parseInt(keyType),
    })
    if (j.ok) {
      addLog('success', `Ghi block ${blockNum} thành công: ${(j as { written?: string }).written}`)
    } else {
      addLog('error', `Ghi block ${blockNum}: ${j.error}`)
    }
    setWriting(false)
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const connected = bridgeStatus?.connected ?? false
  const writeDataClean = writeData.replace(/\s/g, '')

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="p-4 space-y-4">

      {/* ── Bridge offline banner ── */}
      {bridgeOnline === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <span className="text-2xl shrink-0">⚠️</span>
          <div className="min-w-0 space-y-2">
            <p className="font-semibold text-amber-800 text-sm">RFID Bridge chưa chạy trên máy này</p>
            <p className="text-xs text-amber-700">Tải về và chạy bridge một lần — tự động cài đặt, không cần cấu hình.</p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <a
                href="/rfid/start_rfid_bridge.bat"
                download="start_rfid_bridge.bat"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white no-underline"
                style={{ background: '#1d6fd1' }}
              >
                ⬇️ Tải về (Windows .bat)
              </a>
              <a
                href="/rfid/start_rfid_bridge.sh"
                download="start_rfid_bridge.sh"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white no-underline"
                style={{ background: '#d97706' }}
              >
                ⬇️ Tải về (Linux .sh)
              </a>
              <a
                href="/rfid/rfid_bridge.py"
                download="rfid_bridge.py"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold no-underline"
                style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}
              >
                🐍 rfid_bridge.py
              </a>
            </div>
            <p className="text-[11px] text-amber-600">
              Windows: double-click file .bat · Linux: <code className="bg-amber-100 px-1 rounded font-mono">bash start_rfid_bridge.sh</code> · Bridge chạy ở localhost:8765
            </p>
          </div>
        </div>
      )}

      {/* ── 64-bit Python warning ── */}
      {bridgeOnline && bridgeStatus && bridgeStatus.python_bits?.includes('64') && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-xs text-orange-700 flex gap-2 items-center">
          <span>⚠️</span>
          <span>Bridge đang chạy Python 64-bit — rf_Reader.dll cần Python 32-bit. DLL có thể không load được.</span>
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Column 1: Connection + Card info ── */}
        <div className="space-y-4">

          {/* Connection card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                bridgeOnline === null ? 'bg-gray-300 animate-pulse' :
                !bridgeOnline         ? 'bg-red-400' :
                connected             ? 'bg-green-500' : 'bg-yellow-400'
              }`} />
              <h3 className="text-sm font-semibold text-gray-800">
                {bridgeOnline === null ? 'Đang kiểm tra...' :
                 !bridgeOnline         ? 'Bridge offline' :
                 connected             ? `Đã kết nối ${bridgeStatus?.port_name}` :
                                         'Bridge online'}
              </h3>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">
                Cổng serial
                <span className="ml-1 text-gray-400">
                  {bridgeStatus?.os === 'Windows' ? '(Windows: COM3, COM4...)' : '(Linux: /dev/ttyUSB0...)'}
                </span>
              </label>
              <div className="flex gap-1.5">
                {availPorts.length > 0 ? (
                  <select
                    value={portName}
                    onChange={e => setPortName(e.target.value)}
                    disabled={connected}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    {availPorts.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={portName}
                    onChange={e => setPortName(e.target.value)}
                    disabled={connected}
                    placeholder={bridgeStatus?.os === 'Windows' ? 'COM3' : '/dev/ttyUSB0'}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                )}
                <button
                  onClick={scanPorts}
                  disabled={!bridgeOnline || connected || scanning}
                  title="Quét cổng"
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40"
                >
                  {scanning ? '⏳' : '🔍'}
                </button>
              </div>
            </div>

            {!connected ? (
              <button
                onClick={connectPort}
                disabled={!bridgeOnline || connecting || bridgeOnline === null}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {connecting ? '⏳ Đang kết nối...' : '🔌 Kết nối đầu đọc'}
              </button>
            ) : (
              <button
                onClick={disconnectPort}
                className="w-full py-2 bg-gray-500 text-white rounded-lg text-sm font-semibold hover:bg-gray-600 transition-colors"
              >
                Ngắt kết nối
              </button>
            )}

            {bridgeStatus?.dll_error && (
              <p className="text-xs text-red-500 mt-2 bg-red-50 rounded p-2">{bridgeStatus.dll_error}</p>
            )}
          </div>

          {/* Card info */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">🔖 Thông tin thẻ</h3>
              <div className="flex gap-1.5">
                <button
                  onClick={readCard}
                  disabled={!connected || reading || polling}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {reading && !polling ? '⏳' : '📡 Đọc'}
                </button>
                <button
                  onClick={polling ? stopPolling : startPolling}
                  disabled={!connected}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                    polling
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                  }`}
                >
                  {polling ? '⏹ Dừng' : '▶ Auto'}
                </button>
              </div>
            </div>

            {card ? (
              <div className="space-y-2.5">
                <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                  <p className="text-xs text-green-600 font-medium mb-1">Card UID</p>
                  <p className="font-mono text-xl font-bold text-green-800 tracking-widest">
                    {card.uid_display}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-medium border border-blue-100">
                    {card.card_type_name}
                  </span>
                  <span className="bg-gray-50 text-gray-500 px-2.5 py-1 rounded-full text-xs font-mono border border-gray-200">
                    0x{card.card_type.toString(16).toUpperCase().padStart(2, '0')}
                  </span>
                  {polling && (
                    <span className="bg-green-50 text-green-600 px-2.5 py-1 rounded-full text-xs font-medium border border-green-100 animate-pulse">
                      ● Live
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="text-5xl opacity-20 mb-2">📡</div>
                <p className="text-xs text-gray-400">Đặt thẻ lên đầu đọc</p>
                <p className="text-xs text-gray-400">rồi nhấn <strong>Đọc</strong> hoặc bật <strong>Auto</strong></p>
              </div>
            )}
          </div>

        </div>

        {/* ── Column 2: Block operations ── */}
        <div className="space-y-4">

          {/* Block settings */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">⚙️ Cài đặt Block</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Số block <span className="text-gray-400">(Mifare 1K: 0–63)</span></label>
                <input
                  type="number" min="0" max="63"
                  value={blockNum}
                  onChange={e => setBlockNum(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Key (hex 6 bytes = 12 ký tự)</label>
                <input
                  type="text"
                  value={blockKey}
                  onChange={e => setBlockKey(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
                  placeholder="FFFFFFFFFFFF"
                  maxLength={12}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-blue-400"
                />
                <p className="text-xs text-gray-400 mt-0.5">Default Mifare: FFFFFFFFFFFF</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Key type</label>
                <div className="flex gap-2">
                  {[['0', 'Key A'], ['1', 'Key B']] as const}
                  {(['0', '1'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setKeyType(v)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        keyType === v
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {v === '0' ? 'Key A' : 'Key B'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Read block */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">📖 Đọc Block</h3>
              <button
                onClick={readBlock}
                disabled={!connected || !card || reading}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {reading ? '⏳' : 'Đọc'}
              </button>
            </div>
            {blockData ? (
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Hex <span className="text-gray-300">(block {blockData.block})</span></p>
                  <p className="font-mono text-xs bg-gray-50 border border-gray-100 p-2.5 rounded-lg break-all leading-relaxed">
                    {blockData.data_hex}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">ASCII</p>
                  <p className="font-mono text-xs bg-gray-50 border border-gray-100 p-2.5 rounded-lg">
                    {blockData.data_ascii}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">Chưa đọc block nào</p>
            )}
          </div>

          {/* Write block */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">✏️ Ghi Block</h3>
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Data hex (16 bytes = 32 ký tự)
                  <span className={`ml-2 ${writeDataClean.length === 32 ? 'text-green-500' : 'text-gray-400'}`}>
                    {writeDataClean.length}/32
                  </span>
                </label>
                <input
                  type="text"
                  value={writeData}
                  onChange={e => setWriteData(e.target.value.toUpperCase().replace(/[^0-9A-F\s]/g, ''))}
                  placeholder="00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-blue-400"
                />
              </div>
              <button
                onClick={writeBlock}
                disabled={!connected || !card || writing || writeDataClean.length !== 32}
                className="w-full py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:opacity-40 transition-colors"
              >
                {writing ? '⏳ Đang ghi...' : '⚠️ Ghi vào thẻ'}
              </button>
              <p className="text-xs text-gray-400 flex items-start gap-1">
                <span>⚠️</span>
                <span>Thao tác ghi không thể hoàn tác. Block 0 (Manufacturer), block sector trailer (3, 7, 11...) không ghi trực tiếp.</span>
              </p>
            </div>
          </div>

        </div>

        {/* ── Column 3: Log ── */}
        <div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">📋 Nhật ký thao tác</h3>
              <button
                onClick={() => setLog([])}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Xóa
              </button>
            </div>

            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {log.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">Chưa có thao tác nào</p>
              ) : (
                log.map(entry => (
                  <div
                    key={entry.id}
                    className={`flex gap-2 text-xs p-2 rounded-lg border ${
                      entry.type === 'error'   ? 'bg-red-50 text-red-700 border-red-100' :
                      entry.type === 'success' ? 'bg-green-50 text-green-700 border-green-100' :
                      entry.type === 'card'    ? 'bg-blue-50 text-blue-700 border-blue-100' :
                      'bg-gray-50 text-gray-600 border-gray-100'
                    }`}
                  >
                    <span className="font-mono opacity-50 shrink-0 text-[10px] mt-0.5">{entry.time}</span>
                    <span className="break-all">{entry.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick reference */}
          <div className="mt-3 bg-gray-50 rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-600 mb-1.5">Mifare 1K — cấu trúc sector</p>
            <div className="text-xs text-gray-500 space-y-0.5">
              <p><span className="font-mono bg-white px-1.5 rounded border border-gray-200">Block 0</span> Manufacturer (chỉ đọc)</p>
              <p><span className="font-mono bg-white px-1.5 rounded border border-gray-200">Block 1,2</span> Data (ghi được)</p>
              <p><span className="font-mono bg-white px-1.5 rounded border border-gray-200">Block 3</span> Sector trailer (key + access)</p>
              <p className="text-gray-400 mt-1">16 sectors × 4 blocks = 64 blocks tổng</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
