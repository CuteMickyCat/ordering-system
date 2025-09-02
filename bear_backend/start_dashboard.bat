@echo off
setlocal enableextensions enabledelayedexpansion

REM bat 捷徑放進 Windows 開機自動啟動（Win+R → shell:startup）
REM === 可調整參數 ===
set "PRINTER_NAME=YOUR_PRINTER_NAME_HERE" 
REM 換成店內出單機的名稱（控制台→裝置和印表機看到的精準名稱）
set "ADMIN_URL=https://food-ordering-v2-469414.web.app/admin/"
set "BACKEND_HEALTH=https://line-ordering-backend-199532894970.asia-east1.run.app/healthz"

REM 二擇一：設定 printer-bridge 路徑（exe 優先）
set "BRIDGE_EXE=%USERPROFILE%\Desktop\bear_backend\index.exe"
set "BRIDGE_JS=%USERPROFILE%\Desktop\bear_backend\index.js"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"

echo [1/4] 檢查網路連線...
ping -n 1 8.8.8.8 >nul
if errorlevel 1 (
  echo 無法連線到網際網路（Ping 8.8.8.8 失敗）
  echo 5 秒後關閉視窗...
  timeout /t 5 >nul
  exit /b 1
)
echo 網路連線正常。

REM 可選：檢查後端健康度（若失敗就顯示警告，但不擋流程）
where curl >nul 2>&1
if not errorlevel 1 (
  curl -s --max-time 5 "%BACKEND_HEALTH%" >nul 2>&1
  if errorlevel 1 (
    echo 警告：後端健康檢查失敗（略過，繼續）
  ) else (
    echo 後端健康檢查成功。
  )
) else (
  echo 未安裝 curl，略過後端健康檢查。
)

echo.
echo [2/4] 檢查列印伺服器（Spooler）...
sc query spooler | find /i "RUNNING" >nul
if errorlevel 1 (
  echo Print Spooler 未啟動，嘗試啟動中...
  net start spooler >nul 2>&1
)
sc query spooler | find /i "RUNNING" >nul
if errorlevel 1 (
  echo 無法啟動 Print Spooler，請手動檢查服務。
  echo 5 秒後關閉視窗...
  timeout /t 5 >nul
  exit /b 2
)
echo Print Spooler 正常運作。

echo.
echo 檢查印表機：%PRINTER_NAME% ...
REM 檢查印表機是否存在
wmic printer where "Name='%PRINTER_NAME%'" get Name /value | find "=" >nul
if errorlevel 1 (
  echo 找不到印表機 "%PRINTER_NAME%"。請確認名稱完全相同。
  echo 5 秒後關閉視窗...
  timeout /t 5 >nul
  exit /b 3
)

REM 檢查是否離線（WorkOffline）
for /f "tokens=1* delims== " %%A in ('wmic printer where "Name='%PRINTER_NAME%'" get WorkOffline /value ^| find "="') do set "WORKOFF=%%B"
if /i "!WORKOFF!"=="TRUE" (
  echo 印表機目前為離線狀態（WorkOffline=TRUE），請開機或連線印表機。
  echo 5 秒後關閉視窗...
  timeout /t 5 >nul
  exit /b 4
)
echo 印表機在線上。

REM 可選：印出測試頁（取消註解下一行）
REM rundll32 printui.dll,PrintUIEntry /k /n "%PRINTER_NAME%"

echo.
echo [3/4] 啟動/守護 printer-bridge...
set "BRIDGE_STARTED=0"

REM 優先使用 .exe 版本
if exist "%BRIDGE_EXE%" (
  tasklist /FI "IMAGENAME eq index.exe" | find /I "index.exe" >nul || (
    echo 啟動 printer-bridge.exe...
    start "" /min "%BRIDGE_EXE%"
    set "BRIDGE_STARTED=1"
  )
) else if exist "%BRIDGE_JS%" (
  for /f "tokens=*" %%P in ('wmic process where "name='node.exe'" get CommandLine ^| find /i "%BRIDGE_JS%"') do set "FOUND_NODE=1"
  if not defined FOUND_NODE (
    echo 啟動 node 版 printer-bridge...
    start "" /min "%NODE_EXE%" "%BRIDGE_JS%"
    set "BRIDGE_STARTED=1"
  )
) else (
  echo 找不到 printer-bridge 可執行檔或 JS（已略過）。
)

if "%BRIDGE_STARTED%"=="1" (
  echo 等待 bridge 啟動中...
  timeout /t 2 >nul
) else (
  echo printer-bridge 已在執行或已略過。
)

echo.
echo [4/4] 開啟後台網頁...
start "" "%ADMIN_URL%"

echo 完成。視窗將在 2 秒後自動關閉。
timeout /t 2 >nul
exit /b 0