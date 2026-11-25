#!/usr/bin/env python3
"""
rfid_bridge.py — Local HTTP bridge cho đầu đọc RFID
=======================================================================
Hỗ trợ cả Windows (COM port + rf_Reader.dll) và Ubuntu/Linux (/dev/ttyUSB*)

  Windows  → dùng rf_Reader.dll qua ctypes (Python 32-bit)
             hoặc dùng pyserial nếu không có DLL
  Ubuntu   → dùng pyserial trực tiếp (pip install pyserial)

Chạy HTTP server tại http://localhost:8765

Sử dụng:
  python rfid_bridge.py

Cài pyserial (nếu chưa có):
  pip install pyserial          # Linux/Ubuntu
  pip install pyserial          # Windows (nếu không dùng DLL)

API endpoints:
  GET  /status               — trạng thái bridge
  GET  /ports                — danh sách cổng serial có sẵn
  POST /port/open            — { "port": "COM3" | "/dev/ttyUSB0", "baud": 19200 }
  POST /port/close           — ngắt kết nối
  POST /card/read            — đọc UID thẻ
  POST /card/block/read      — { "block": 1, "key": "FFFFFFFFFFFF", "key_type": 0 }
  POST /card/block/write     — { "block": 1, "data": "00...", "key": "FFFFFFFFFFFF", "key_type": 0 }
"""

import sys
import os
import json
import threading
import struct
import platform
import subprocess
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

IS_WINDOWS = platform.system() == 'Windows'
IS_LINUX   = platform.system() == 'Linux'
IS_32BIT   = sys.maxsize <= 2**32

# ═══════════════════════════════════════════════════════════════════════════════
# AUTO-SETUP (chạy trước khi import bất cứ thứ gì)
# ═══════════════════════════════════════════════════════════════════════════════

def _auto_setup():
    """Tự động cài pyserial và cấp quyền serial port (Linux)."""

    # 1. Cài pyserial nếu chưa có
    try:
        import serial  # noqa
    except ImportError:
        print('📦 Đang cài pyserial...')
        try:
            subprocess.check_call(
                [sys.executable, '-m', 'pip', 'install', 'pyserial', '--quiet'],
                stdout=subprocess.DEVNULL,
            )
            print('✅ pyserial đã được cài xong')
        except Exception as e:
            print(f'❌ Không cài được pyserial: {e}')
            print('   Chạy thủ công: pip install pyserial')

    # 2. Linux: thêm user vào nhóm dialout để truy cập /dev/ttyUSB*
    if IS_LINUX:
        import grp, pwd
        username = os.environ.get('USER') or os.environ.get('LOGNAME') or ''
        try:
            dialout_members = grp.getgrnam('dialout').gr_mem
        except KeyError:
            dialout_members = []

        if username and username not in dialout_members:
            print(f'🔑 Thêm {username} vào nhóm dialout (cần sudo)...')
            ret = os.system(f'sudo usermod -aG dialout {username}')
            if ret == 0:
                print('✅ Đã thêm vào nhóm dialout.')
                print('   ⚠️  Cần logout và login lại 1 lần để có hiệu lực.')
            else:
                print('❌ Không thêm được — thử chạy thủ công:')
                print(f'   sudo usermod -aG dialout {username}')

_auto_setup()

BRIDGE_PORT = 8765

ALLOWED_ORIGINS = {
    'https://hardware.eup.net.vn',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost',
}

# ═══════════════════════════════════════════════════════════════════════════════
# BACKEND: Windows DLL (rf_Reader.dll)
# ═══════════════════════════════════════════════════════════════════════════════

import ctypes

SCRIPT_DIR = Path(__file__).parent
DLL_CANDIDATES = [
    SCRIPT_DIR / 'APP_CardIssue_2020-12-21_01' / 'APP_CardIssue_2020-12-21_01' / 'rf_Reader.dll',
    SCRIPT_DIR / 'rf_Reader.dll',
]

dll            = None
dll_path_used  = None
dll_error      = None

if IS_WINDOWS:
    for c in DLL_CANDIDATES:
        if c.exists():
            try:
                dll = ctypes.CDLL(str(c))
                dll.rf_ComOpen.restype  = ctypes.c_int
                dll.rf_ComOpen.argtypes = [ctypes.c_int, ctypes.c_int]
                dll.rf_PortClose.restype  = ctypes.c_int
                dll.rf_PortClose.argtypes = [ctypes.c_int]
                dll.rf_ISO14443A_RequestAndSelectCard.restype  = ctypes.c_int
                dll.rf_ISO14443A_RequestAndSelectCard.argtypes = [
                    ctypes.c_int, ctypes.POINTER(ctypes.c_uint), ctypes.c_char_p]
                dll.rf_ISO14443A_WakeupAndSelectCard.restype  = ctypes.c_int
                dll.rf_ISO14443A_WakeupAndSelectCard.argtypes = [
                    ctypes.c_int, ctypes.POINTER(ctypes.c_uint), ctypes.c_char_p]
                dll.rf_M1_Read.restype  = ctypes.c_int
                dll.rf_M1_Read.argtypes = [
                    ctypes.c_int, ctypes.c_char_p, ctypes.c_ubyte,
                    ctypes.c_ubyte, ctypes.c_char_p, ctypes.c_char_p]
                dll.rf_M1_Write.restype  = ctypes.c_int
                dll.rf_M1_Write.argtypes = [
                    ctypes.c_int, ctypes.c_char_p, ctypes.c_ubyte,
                    ctypes.c_ubyte, ctypes.c_char_p, ctypes.c_char_p]
                dll_path_used = str(c)
                print(f'✅ DLL: {c}')
                break
            except Exception as e:
                dll_error = str(e)

# ═══════════════════════════════════════════════════════════════════════════════
# BACKEND: pyserial (Windows fallback + Linux primary)
# ═══════════════════════════════════════════════════════════════════════════════

try:
    import serial
    import serial.tools.list_ports
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False
    print('⚠️  pyserial chưa cài — chạy: pip install pyserial')

# Protocol constants (RF-Reader binary protocol, common in Chinese RFID readers)
# Frame: STX[AA] STX[BB] LEN CMD DATA... BCC
# BCC = XOR của tất cả bytes từ LEN đến cuối DATA

def _bcc(data: bytes) -> int:
    r = 0
    for b in data:
        r ^= b
    return r

def _make_cmd(cmd: int, data: bytes = b'') -> bytes:
    payload = bytes([len(data) + 1, cmd]) + data
    return b'\xAA\xBB' + payload + bytes([_bcc(payload)])

def _read_response(ser, timeout=1.0) -> bytes | None:
    """Đọc 1 frame response từ serial port"""
    ser.timeout = timeout
    # Đợi header AA BB
    buf = b''
    for _ in range(100):
        b = ser.read(1)
        if not b:
            return None
        buf += b
        if len(buf) >= 2 and buf[-2:] == b'\xAA\xBB':
            break
    else:
        return None
    # Đọc LEN
    lb = ser.read(1)
    if not lb:
        return None
    length = lb[0]
    # Đọc LEN bytes data + 1 byte BCC
    rest = ser.read(length + 1)
    if len(rest) < length + 1:
        return None
    return lb + rest  # [LEN][CMD|STATUS][DATA...][BCC]

CARD_TYPE_NAMES = {
    0x08: 'Mifare 1K', 0x18: 'Mifare 4K',
    0x44: 'Mifare UltraLight', 0x01: 'ISO14443A', 0x28: 'Mifare 2K',
}

# ═══════════════════════════════════════════════════════════════════════════════
# STATE
# ═══════════════════════════════════════════════════════════════════════════════

_lock = threading.Lock()
_state: dict = {
    'mode':          None,    # 'dll' | 'serial'
    'handle':        -1,      # DLL handle
    'serial':        None,    # serial.Serial object
    'port_name':     None,    # 'COM3' | '/dev/ttyUSB0'
    'baud':          19200,
    'last_uid_hex':  None,
    'last_tag_type': None,
}

# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS: liệt kê cổng có sẵn
# ═══════════════════════════════════════════════════════════════════════════════

def list_available_ports() -> list[str]:
    ports = []
    if HAS_SERIAL:
        for p in serial.tools.list_ports.comports():
            ports.append(p.device)
    elif IS_WINDOWS:
        # Fallback: thử COM1–COM20
        import winreg
        try:
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'HARDWARE\DEVICEMAP\SERIALCOMM')
            i = 0
            while True:
                try:
                    _, val, _ = winreg.EnumValue(key, i)
                    ports.append(val)
                    i += 1
                except OSError:
                    break
        except Exception:
            pass
    elif IS_LINUX:
        import glob
        for pattern in ['/dev/ttyUSB*', '/dev/ttyACM*', '/dev/ttyS*']:
            ports.extend(sorted(glob.glob(pattern)))
    return ports

def _port_str_to_dll_num(port_str: str) -> int | None:
    """'COM3' → 3,  'COM12' → 12,  '/dev/...' → None"""
    s = port_str.upper().strip()
    if s.startswith('COM'):
        try:
            return int(s[3:])
        except ValueError:
            return None
    return None

# ═══════════════════════════════════════════════════════════════════════════════
# API
# ═══════════════════════════════════════════════════════════════════════════════

def api_status() -> dict:
    with _lock:
        connected = (_state['mode'] == 'dll'    and _state['handle'] >= 0) or \
                    (_state['mode'] == 'serial'  and _state['serial'] is not None and _state['serial'].is_open)
        return {
            'ok':           True,
            'os':           platform.system(),            # 'Windows' | 'Linux' | 'Darwin'
            'dll_loaded':   dll is not None,
            'dll_path':     dll_path_used,
            'dll_error':    dll_error,
            'pyserial':     HAS_SERIAL,
            'connected':    connected,
            'mode':         _state['mode'],
            'port_name':    _state['port_name'],
            'baud':         _state['baud'],
            'python_bits':  '32' if IS_32BIT else '64',
        }


def api_list_ports() -> dict:
    return {'ok': True, 'ports': list_available_ports(), 'os': platform.system()}


def api_open(port_str: str, baud: int = 19200) -> dict:
    with _lock:
        # Đóng kết nối cũ
        _do_close()

        # Thử DLL trước (Windows, COM port, Python 32-bit)
        dll_num = _port_str_to_dll_num(port_str)
        if dll is not None and dll_num is not None:
            h = dll.rf_ComOpen(dll_num, baud)
            if h >= 0:
                _state['mode']      = 'dll'
                _state['handle']    = h
                _state['port_name'] = port_str.upper()
                _state['baud']      = baud
                return {'ok': True, 'mode': 'dll', 'port': port_str.upper(), 'baud': baud}
            # DLL thất bại → thử pyserial

        # Dùng pyserial (Linux hoặc Windows fallback)
        if not HAS_SERIAL:
            return {'ok': False, 'error': 'Không có rf_Reader.dll và pyserial chưa cài.\nChạy: pip install pyserial'}

        # Chuyển "COM3" → "\\.\COM3" trên Windows để pyserial nhận đúng
        port_device = port_str
        if IS_WINDOWS and port_str.upper().startswith('COM'):
            num = _port_str_to_dll_num(port_str)
            if num and num >= 10:
                port_device = f'\\\\.\\COM{num}'

        try:
            ser = serial.Serial(port_device, baudrate=baud, bytesize=8,
                                parity='N', stopbits=1, timeout=1.0)
            _state['mode']      = 'serial'
            _state['serial']    = ser
            _state['port_name'] = port_str
            _state['baud']      = baud
            return {'ok': True, 'mode': 'serial', 'port': port_str, 'baud': baud}
        except Exception as e:
            return {'ok': False, 'error': str(e)}


def _do_close():
    """Phải gọi trong _lock"""
    if _state['mode'] == 'dll' and _state['handle'] >= 0 and dll:
        dll.rf_PortClose(_state['handle'])
        _state['handle'] = -1
    if _state['mode'] == 'serial' and _state['serial']:
        try:
            _state['serial'].close()
        except Exception:
            pass
        _state['serial'] = None
    _state['mode']          = None
    _state['port_name']     = None
    _state['last_uid_hex']  = None
    _state['last_tag_type'] = None


def api_close() -> dict:
    with _lock:
        _do_close()
    return {'ok': True}


def api_read_card() -> dict:
    with _lock:
        mode = _state['mode']

    if mode == 'dll':
        return _read_card_dll()
    elif mode == 'serial':
        return _read_card_serial()
    else:
        return {'ok': False, 'error': 'Chưa kết nối cổng'}


def _read_card_dll() -> dict:
    with _lock:
        h = _state['handle']
    if h < 0 or dll is None:
        return {'ok': False, 'error': 'DLL chưa kết nối'}
    tag_type = ctypes.c_uint(0)
    uid_buf  = ctypes.create_string_buffer(10)
    ret = dll.rf_ISO14443A_RequestAndSelectCard(h, ctypes.byref(tag_type), uid_buf)
    if ret != 0:
        ret = dll.rf_ISO14443A_WakeupAndSelectCard(h, ctypes.byref(tag_type), uid_buf)
    if ret != 0:
        return {'ok': False, 'no_card': True, 'code': ret}
    uid_bytes = uid_buf.raw[:4]
    uid_hex   = uid_bytes.hex().upper()
    ttype     = tag_type.value
    with _lock:
        _state['last_uid_hex']  = uid_hex
        _state['last_tag_type'] = ttype
    return _card_result(uid_hex, ttype)


def _read_card_serial() -> dict:
    """
    Giao thức RF binary protocol (phổ biến với đầu đọc Chinese RFID):
      REQA:   AA BB 03 50 26 00 BCC  → response có UID
      WUPA:   AA BB 03 50 52 00 BCC  → wake up halted card
    """
    with _lock:
        ser = _state['serial']
    if not ser or not ser.is_open:
        return {'ok': False, 'error': 'Cổng serial đã đóng'}
    try:
        # Thử REQA trước
        ser.reset_input_buffer()
        ser.write(_make_cmd(0x50, b'\x26\x00'))
        resp = _read_response(ser, timeout=0.5)
        if resp is None or resp[1] != 0:
            # Thử WUPA (wake up halted card)
            ser.reset_input_buffer()
            ser.write(_make_cmd(0x50, b'\x52\x00'))
            resp = _read_response(ser, timeout=0.5)
        if resp is None or resp[1] != 0:
            return {'ok': False, 'no_card': True}
        # UID thường nằm ở bytes 2..5 của response
        if len(resp) < 6:
            return {'ok': False, 'no_card': True}
        uid_bytes = resp[2:6]
        uid_hex   = uid_bytes.hex().upper()
        ttype     = 0x08  # Giả định Mifare 1K; cần parse ATQA để chính xác hơn
        with _lock:
            _state['last_uid_hex']  = uid_hex
            _state['last_tag_type'] = ttype
        return _card_result(uid_hex, ttype)
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def _card_result(uid_hex: str, ttype: int) -> dict:
    return {
        'ok':             True,
        'uid':            uid_hex,
        'uid_display':    ' '.join(uid_hex[i:i+2] for i in range(0, len(uid_hex), 2)),
        'uid_bytes':      [int(uid_hex[i:i+2], 16) for i in range(0, len(uid_hex), 2)],
        'card_type':      ttype,
        'card_type_name': CARD_TYPE_NAMES.get(ttype, f'Unknown (0x{ttype:02X})'),
    }


def api_read_block(block: int, key_hex: str = 'FFFFFFFFFFFF', key_type: int = 0) -> dict:
    with _lock:
        mode    = _state['mode']
        uid_hex = _state['last_uid_hex']
    if not uid_hex:
        return {'ok': False, 'error': 'Chưa đọc thẻ — gọi /card/read trước'}

    if mode == 'dll':
        return _read_block_dll(block, uid_hex, key_hex, key_type)
    elif mode == 'serial':
        return _read_block_serial(block, uid_hex, key_hex, key_type)
    return {'ok': False, 'error': 'Chưa kết nối'}


def _read_block_dll(block: int, uid_hex: str, key_hex: str, key_type: int) -> dict:
    with _lock:
        h = _state['handle']
    try:
        uid_bytes = bytes.fromhex(uid_hex)
        key_bytes = bytes.fromhex(key_hex.replace(' ', ''))[:6]
        data_buf  = ctypes.create_string_buffer(16)
        ret = dll.rf_M1_Read(h, uid_bytes, ctypes.c_ubyte(block),
                             ctypes.c_ubyte(key_type), key_bytes, data_buf)
        if ret != 0:
            return {'ok': False, 'error': f'Đọc block {block} thất bại (code={ret})'}
        return _block_result(block, data_buf.raw[:16])
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def _read_block_serial(block: int, uid_hex: str, key_hex: str, key_type: int) -> dict:
    """M1 Read: AA BB [LEN] 30 [block] [key_type] [key 6B] [uid 4B] BCC"""
    with _lock:
        ser = _state['serial']
    try:
        uid_bytes = bytes.fromhex(uid_hex)
        key_bytes = bytes.fromhex(key_hex.replace(' ', ''))[:6]
        data      = bytes([block, key_type]) + key_bytes + uid_bytes
        ser.reset_input_buffer()
        ser.write(_make_cmd(0x30, data))
        resp = _read_response(ser, timeout=1.0)
        if resp is None or resp[1] != 0 or len(resp) < 18:
            return {'ok': False, 'error': f'Đọc block {block} thất bại'}
        return _block_result(block, resp[2:18])
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def _block_result(block: int, raw: bytes) -> dict:
    data_hex = raw.hex().upper()
    return {
        'ok':          True,
        'block':       block,
        'data_hex':    ' '.join(data_hex[i:i+2] for i in range(0, len(data_hex), 2)),
        'data_hex_raw': data_hex,
        'data_ascii':  ''.join(chr(b) if 0x20 <= b < 0x7F else '.' for b in raw),
    }


def api_write_block(block: int, data_hex: str, key_hex: str = 'FFFFFFFFFFFF', key_type: int = 0) -> dict:
    with _lock:
        mode    = _state['mode']
        uid_hex = _state['last_uid_hex']
    if not uid_hex:
        return {'ok': False, 'error': 'Chưa đọc thẻ — gọi /card/read trước'}

    if mode == 'dll':
        return _write_block_dll(block, uid_hex, data_hex, key_hex, key_type)
    elif mode == 'serial':
        return _write_block_serial(block, uid_hex, data_hex, key_hex, key_type)
    return {'ok': False, 'error': 'Chưa kết nối'}


def _write_block_dll(block: int, uid_hex: str, data_hex: str, key_hex: str, key_type: int) -> dict:
    with _lock:
        h = _state['handle']
    try:
        uid_bytes  = bytes.fromhex(uid_hex)
        key_bytes  = bytes.fromhex(key_hex.replace(' ', ''))[:6]
        data_bytes = (bytes.fromhex(data_hex.replace(' ', '')) + b'\x00' * 16)[:16]
        ret = dll.rf_M1_Write(h, uid_bytes, ctypes.c_ubyte(block),
                              ctypes.c_ubyte(key_type), key_bytes, data_bytes)
        if ret != 0:
            return {'ok': False, 'error': f'Ghi block {block} thất bại (code={ret})'}
        return {'ok': True, 'block': block, 'written': data_bytes.hex().upper()}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def _write_block_serial(block: int, uid_hex: str, data_hex: str, key_hex: str, key_type: int) -> dict:
    """M1 Write: AA BB [LEN] 31 [block] [key_type] [key 6B] [uid 4B] [data 16B] BCC"""
    with _lock:
        ser = _state['serial']
    try:
        uid_bytes  = bytes.fromhex(uid_hex)
        key_bytes  = bytes.fromhex(key_hex.replace(' ', ''))[:6]
        data_bytes = (bytes.fromhex(data_hex.replace(' ', '')) + b'\x00' * 16)[:16]
        payload    = bytes([block, key_type]) + key_bytes + uid_bytes + data_bytes
        ser.reset_input_buffer()
        ser.write(_make_cmd(0x31, payload))
        resp = _read_response(ser, timeout=1.0)
        if resp is None or resp[1] != 0:
            return {'ok': False, 'error': f'Ghi block {block} thất bại'}
        return {'ok': True, 'block': block, 'written': data_bytes.hex().upper()}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# HTTP HANDLER
# ═══════════════════════════════════════════════════════════════════════════════

class RFIDHandler(BaseHTTPRequestHandler):

    def _cors(self):
        origin = self.headers.get('Origin', '')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
        elif not origin:
            self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        try:
            length = int(self.headers.get('Content-Length', 0))
            return json.loads(self.rfile.read(length)) if length else {}
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/status':
            self._json(api_status())
        elif path == '/ports':
            self._json(api_list_ports())
        else:
            self._json({'error': 'Not found'}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        body = self._body()
        routes = {
            '/port/open':        lambda: api_open(
                str(body.get('port', 'COM1')), int(body.get('baud', 19200))),
            '/port/close':       lambda: api_close(),
            '/card/read':        lambda: api_read_card(),
            '/card/block/read':  lambda: api_read_block(
                int(body.get('block', 1)),
                str(body.get('key', 'FFFFFFFFFFFF')),
                int(body.get('key_type', 0))),
            '/card/block/write': lambda: api_write_block(
                int(body.get('block', 1)),
                str(body.get('data', '00' * 16)),
                str(body.get('key', 'FFFFFFFFFFFF')),
                int(body.get('key_type', 0))),
        }
        fn = routes.get(path)
        if fn:
            try:
                self._json(fn())
            except Exception as e:
                self._json({'ok': False, 'error': str(e)}, 500)
        else:
            self._json({'error': 'Not found'}, 404)

    def log_message(self, fmt, *args):
        if args and str(args[0]).startswith('POST'):
            print(f'  → {fmt % args}')


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print()
    print('🔖 RFID Bridge v1.1')
    print(f'   OS:     {platform.system()} {platform.machine()}')
    print(f'   Python: {sys.version.split()[0]} ({"32-bit" if IS_32BIT else "64-bit"})')
    if IS_WINDOWS:
        if dll:
            print(f'   DLL:    ✅ {dll_path_used}')
        else:
            print(f'   DLL:    ❌ {dll_error or "Không tìm thấy"} → sẽ dùng pyserial')
    else:
        print(f'   DLL:    N/A (chỉ hỗ trợ Windows)')
    print(f'   Serial: {"✅ pyserial" if HAS_SERIAL else "❌ chưa cài — pip install pyserial"}')

    # Liệt kê cổng có sẵn
    ports = list_available_ports()
    if ports:
        print(f'   Cổng:   {", ".join(ports[:6])}{"..." if len(ports) > 6 else ""}')
    else:
        print(f'   Cổng:   (chưa phát hiện)')
    print()
    print(f'🌐 Server: http://localhost:{BRIDGE_PORT}')
    print('   Nhấn Ctrl+C để dừng.')
    print()

    server = HTTPServer(('127.0.0.1', BRIDGE_PORT), RFIDHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n👋 Bridge đã dừng.')
        with _lock:
            _do_close()
