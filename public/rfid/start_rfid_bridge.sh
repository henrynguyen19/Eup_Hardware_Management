#!/bin/bash
# RFID Bridge launcher — Ubuntu/Linux
# Double-click trong file manager hoặc chạy: bash start_rfid_bridge.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "=========================================="
echo "  RFID Bridge - EUP Hardware Management"
echo "=========================================="
echo ""

# Tìm python
PYTHON=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        PYTHON="$cmd"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo "[LỖI] Không tìm thấy Python!"
    echo "  Cài Python: sudo apt install python3 python3-pip"
    read -p "Nhấn Enter để thoát..."
    exit 1
fi

echo "[OK] Dùng: $PYTHON ($($PYTHON --version 2>&1))"

# rfid_bridge.py sẽ tự cài pyserial và thêm quyền dialout
$PYTHON rfid_bridge.py
