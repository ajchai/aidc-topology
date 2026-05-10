@echo off
chcp 65001 >nul
echo 正在终止旧的 8080 端口进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080"') do (
    taskkill /F /PID %%a 2>nul
    echo 已终止 PID %%a
)
echo 正在启动服务器...
cd /d D:\RuijieWorks\方案\拓扑图
start node server.js