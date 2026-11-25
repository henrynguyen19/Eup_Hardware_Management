@echo off
title RFID Bridge — EUP Hardware
color 0A

echo.
echo  ==========================================
echo   RFID Bridge - EUP Hardware Management
echo  ==========================================
echo.

REM Thử Python 32-bit trước (cần cho rf_Reader.dll)
where py >nul 2>&1
if %ERRORLEVEL% == 0 (
    py -3-32 --version >nul 2>&1
    if %ERRORLEVEL% == 0 (
        echo [OK] Dung Python 32-bit cho rf_Reader.dll
        py -3-32 -m pip install pyserial --quiet 2>nul
        py -3-32 rfid_bridge.py
        goto :end
    )
)

REM Fallback: Python thường
where python >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [OK] Dung Python mac dinh
    python -m pip install pyserial --quiet 2>nul
    python rfid_bridge.py
    goto :end
)

where python3 >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [OK] Dung python3
    python3 -m pip install pyserial --quiet 2>nul
    python3 rfid_bridge.py
    goto :end
)

echo.
echo [LOI] Khong tim thay Python!
echo Tai Python tai: https://www.python.org/downloads/
echo (Chon ban "Windows installer (32-bit)" de dung rf_Reader.dll)
echo.

:end
pause
