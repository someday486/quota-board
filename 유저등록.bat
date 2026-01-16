@echo off
chcp 65001 > nul

echo ======================================
echo  유저 대량 등록 시작
echo ======================================
echo.

cd /d "%~dp0"

node scripts\bulk-create-users.mjs

echo.
echo ======================================
echo  작업 완료. 아무 키나 누르세요.
echo ======================================
pause
