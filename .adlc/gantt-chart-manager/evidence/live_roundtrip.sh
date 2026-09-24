#!/usr/bin/env bash
# Verifier throwaway: round trip of projects with deps + milestone across two DBs; a true early-start import.
set -u
ROOT=/Users/angel.difo/Library/CloudStorage/OneDrive-Hg/Desktop/HG-Catalyst-Projects/hg-gaant-chart
PORT=8290; B=http://localhost:$PORT; W=/tmp/gver/live; J='content-type: application/json'
start() { (cd $ROOT/backend && GANTT_DB_PATH=$1 nohup uv run uvicorn app.main:app --port $PORT >$W/api2.log 2>&1 & echo $! >$W/api.pid)
  for i in $(seq 1 80); do curl -sf $B/health >/dev/null && return; sleep 0.25; done; echo "SERVER DID NOT START"; }
stop() { pkill -P $(cat $W/api.pid) 2>/dev/null; kill $(cat $W/api.pid) 2>/dev/null
  for i in $(seq 1 40); do lsof -nP -tiTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 || return; sleep 0.25; done; lsof -nP -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null; }
start $W/v.db
for n in Chain Ms; do id=$(curl -s $B/api/projects | jq --arg n $n '.[]|select(.name==$n)|.id'); curl -s $B/api/projects/$id/export -o $W/rt_$n.json; done
echo "Ms export:"; cat $W/rt_Ms.json
stop; rm -f $W/fresh2.db; start $W/fresh2.db
for n in Chain Ms; do NEW=$(curl -s -X POST $B/api/import -H "$J" --data-binary @$W/rt_$n.json | jq .id); curl -s $B/api/projects/$NEW/export -o $W/rt2_$n.json; cmp $W/rt_$n.json $W/rt2_$n.json && echo "$n: byte-identical after import into fresh DB"; done
# early start: C (t3) starts 10-10 but after the AC39 edit M is 10-12; make C start 10-12 (before allowed 10-13) keeping end=start+dur-1
jq '(.tasks[]|select(.name=="C")) |= (.start="2026-10-12" | .end="2026-10-13")' $W/rt_Ms.json > $W/bad_early2.json
N0=$(curl -s $B/api/projects | jq length)
curl -s -X POST $B/api/import -H "$J" --data-binary @$W/bad_early2.json -w ' [%{http_code}]\n'
echo "project count before=$N0 after=$(curl -s $B/api/projects | jq length)"
stop; echo "port $PORT listening? $(lsof -nP -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null || echo no)"
