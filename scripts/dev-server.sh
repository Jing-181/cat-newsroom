#!/bin/sh
# 开发服务器管理：start / stop / restart / status
#
#   sh scripts/dev-server.sh start [端口]   # 默认 5176，后台运行、日志落盘，关掉终端也不会被杀
#   sh scripts/dev-server.sh stop
#   sh scripts/dev-server.sh status
#
# 等价 npm 脚本：npm run dev:start / dev:stop / dev:status
set -u

PORT="${2:-5176}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT/.dev-server.pid"
LOG_FILE="$ROOT/.dev-server.log"

pid() { [ -f "$PID_FILE" ] && cat "$PID_FILE"; }
running() { p="$(pid)"; [ -n "${p:-}" ] && kill -0 "$p" 2>/dev/null; }
listener() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $1" "$2}'; }

case "${1:-}" in
  start)
    if running; then
      echo "已在运行：PID $(pid)，地址 http://localhost:$PORT/"
      exit 0
    fi
    if [ -n "$(listener)" ]; then
      echo "端口 $PORT 已被占用（$(listener)），换个端口：sh scripts/dev-server.sh start 5180"
      exit 1
    fi
    cd "$ROOT" || exit 1
    # 开发服务器要读 src/public/ 下的同步脚本副本，先刷新一次
    node scripts/copy-supabase-sync.mjs || exit 1
    # 直接跑 vite 的入口，不经过 npx：npx 会多包一层进程，pid 记错了停不干净
    nohup node "$ROOT/node_modules/vite/bin/vite.js" --config vite.config.js --port "$PORT" --strictPort >"$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 2
    if running && [ -n "$(listener)" ]; then
      echo "已启动：http://localhost:$PORT/"
      echo "PID $(pid)（写进 $PID_FILE，脚本下次能停掉它）"
      echo "日志：$LOG_FILE"
    else
      echo "启动失败。日志末尾："
      tail -20 "$LOG_FILE" 2>/dev/null
      rm -f "$PID_FILE"
      exit 1
    fi
    ;;
  stop)
    if ! running; then
      rm -f "$PID_FILE"
      if [ -n "$(listener)" ]; then
        echo "没有我记着的进程，但端口 $PORT 被占了（$(listener)）"
      else
        echo "没有在运行的开发服务器"
      fi
      exit 0
    fi
    p="$(pid)"
    kill "$p" 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$p" 2>/dev/null || break
      sleep 0.5
    done
    kill -0 "$p" 2>/dev/null && kill -9 "$p" 2>/dev/null
    rm -f "$PID_FILE"
    if [ -n "$(listener)" ]; then
      echo "已杀 PID $p，但端口 $PORT 还被占着（$(listener)），可能还有旧进程：lsof -nP -iTCP:$PORT -sTCP:LISTEN"
    else
      echo "已停止（PID $p），端口 $PORT 已释放"
    fi
    ;;
  restart)
    "$0" stop
    "$0" start "$PORT"
    ;;
  status)
    if running; then
      echo "运行中：PID $(pid)，地址 http://localhost:$PORT/"
      echo "日志末尾："
      tail -5 "$LOG_FILE" 2>/dev/null
    elif [ -n "$(listener)" ]; then
      echo "没在跑（无 PID 记录），但端口 $PORT 被占着：$(listener)"
    else
      echo "未运行"
    fi
    ;;
  *)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
