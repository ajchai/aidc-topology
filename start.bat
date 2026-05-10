@echo off
chcp 65001 >nul
echo ========================================
echo  智算拓扑生成器 - 本地服务器启动器
echo ========================================
echo.
echo 正在启动本地服务器，请勿关闭此窗口...
echo 访问地址: http://localhost:8080
echo.
echo 按 Ctrl+C 可停止服务器
echo ========================================
"C:\Program Files\Python314\python.exe" -m http.server 8080