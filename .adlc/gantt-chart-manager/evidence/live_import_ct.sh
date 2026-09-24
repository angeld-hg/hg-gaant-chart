#!/usr/bin/env bash
# Verifier throwaway (run 2): CR2 / AC23-AC24 import Content-Type gate and D16 trim, live on a real socket.
set -u
ROOT=/Users/angel.difo/Library/CloudStorage/OneDrive-Hg/Desktop/HG-Catalyst-Projects/hg-gaant-chart
PORT=${GV_PORT:-8320}; B=http://localhost:$PORT; W=${GV_DIR:-/tmp/gver2/live}; J='content-type: application/json'
mkdir -p $W; rm -f $W/ct.db
(cd $ROOT/backend && GANTT_DB_PATH=$W/ct.db nohup uv run uvicorn app.main:app --port $PORT >$W/api3.log 2>&1 & echo $! >$W/api.pid)
for i in $(seq 1 80); do curl -sf $B/health >/dev/null && break; sleep 0.25; done
P=$(curl -s -X POST $B/api/projects -H "$J" -d '{"name":"Launch"}' | jq .id)
curl -s -X POST $B/api/projects/$P/tasks -H "$J" -d '{"name":"A","start":"2026-10-05","duration":3}' -o /dev/null
curl -s $B/api/projects/$P/export -o $W/ct.json
for ct in 'text/plain' 'application/x-www-form-urlencoded' 'multipart/form-data; boundary=x' ''; do
  printf 'content-type %-34s ' "'$ct'"
  if [ -z "$ct" ]; then curl -s -X POST $B/api/import -H 'content-type:' --data-binary @$W/ct.json -w ' [%{http_code}]\n'
  else curl -s -X POST $B/api/import -H "content-type: $ct" --data-binary @$W/ct.json -w ' [%{http_code}]\n'; fi
done
curl -s $B/api/projects | jq -c '{project_count_after_rejected:length}'
printf 'content-type %-34s ' "'application/json; charset=utf-8'"
curl -s -X POST $B/api/import -H 'content-type: application/json; charset=utf-8' --data-binary @$W/ct.json | jq -c '{name}'
echo "== D16: 100-char name ending 'x...x yy' shortened for suffix"
N98="$(printf 'x%.0s' $(seq 1 95)) abc"   # 99 chars; the cut for " (2)" (4 chars) keeps 96 = 95 x + space -> trimmed
curl -s -X POST $B/api/projects -H "$J" -d "{\"name\":\"$N98\"}" -o /dev/null -w 'create long [%{http_code}]\n'
L=$(curl -s $B/api/projects | jq --arg n "$N98" '.[]|select(.name==$n)|.id')
curl -s $B/api/projects/$L/export -o $W/long.json
curl -s -X POST $B/api/import -H "$J" --data-binary @$W/long.json | jq -r '"imported name len=\(.name|length) tail=[\(.name[-8:])]"'
pkill -P $(cat $W/api.pid) 2>/dev/null; kill $(cat $W/api.pid) 2>/dev/null
for i in $(seq 1 40); do lsof -nP -tiTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 0.25; done
echo "port $PORT listening? $(lsof -nP -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null || echo no)"
