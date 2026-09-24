#!/usr/bin/env bash
# Verifier throwaway: live API evidence on a real socket (port 8290) with a temp DB.
set -u
ROOT=/Users/angel.difo/Library/CloudStorage/OneDrive-Hg/Desktop/HG-Catalyst-Projects/hg-gaant-chart
PORT=${GV_PORT:-8290}; B=http://localhost:$PORT; W=${GV_DIR:-/tmp/gver/live}; mkdir -p $W; rm -f $W/*.db
start() { (cd $ROOT/backend && GANTT_DB_PATH=$1 nohup uv run uvicorn app.main:app --port $PORT >$W/api.log 2>&1 & echo $! >$W/api.pid)
  for i in $(seq 1 80); do curl -sf $B/health >/dev/null && return; sleep 0.25; done; echo "SERVER DID NOT START"; }
stop() { pkill -P $(cat $W/api.pid) 2>/dev/null; kill $(cat $W/api.pid) 2>/dev/null
  for i in $(seq 1 40); do lsof -nP -tiTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 || return; sleep 0.25; done; lsof -nP -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null; }
J='content-type: application/json'
post() { curl -s -X POST "$B$1" -H "$J" -d "$2" -w ' [%{http_code}]\n'; }
patch() { curl -s -X PATCH "$B$1" -H "$J" -d "$2" -w ' [%{http_code}]\n'; }
dates() { curl -s $B/api/projects/$1 | jq -c '[.tasks[]|{n:.name,s:.start,e:.end,d:.duration}]'; }

start $W/v.db
echo "== AC1/AC34 create + dup + limits"
post /api/projects '{"name":"Launch"}'
post /api/projects '{"name":"launch"}'
post /api/projects '{"name":"   "}'
post /api/projects "{\"name\":\"$(printf 'x%.0s' $(seq 1 101))\"}"
P=$(curl -s $B/api/projects | jq '.[0].id')
patch /api/projects/$P '{"name":"LAUNCH"}'
patch /api/projects/$P '{"name":"Launch"}'
echo "== AC3/AC27 create"
T=$(curl -s -X POST $B/api/projects/$P/tasks -H "$J" -d '{"name":"Design","start":"2026-10-05","duration":3}')
echo "$T" | jq -c '.project.tasks[0]|{start,end,duration}'
curl -s -X POST $B/api/projects/$P/tasks -H "$J" -d '{"name":"Wknd","start":"2026-10-09","duration":3}' | jq -c '.project.tasks[1]|{start,end,duration}'
echo "== AC12 fixture in project Chain"
Q=$(curl -s -X POST $B/api/projects -H "$J" -d '{"name":"Chain"}' | jq .id)
A=$(curl -s -X POST $B/api/projects/$Q/tasks -H "$J" -d '{"name":"A","start":"2026-10-05","duration":3}' | jq .created_id)
BB=$(curl -s -X POST $B/api/projects/$Q/tasks -H "$J" -d '{"name":"B","start":"2026-10-08","duration":2}' | jq .created_id)
C=$(curl -s -X POST $B/api/projects/$Q/tasks -H "$J" -d '{"name":"C","start":"2026-10-10","duration":1}' | jq .created_id)
curl -s -X POST $B/api/projects/$Q/dependencies -H "$J" -d "{\"predecessor_id\":$A,\"successor_id\":$BB}" -o /dev/null -w 'dep A>B [%{http_code}]\n'
curl -s -X POST $B/api/projects/$Q/dependencies -H "$J" -d "{\"predecessor_id\":$BB,\"successor_id\":$C}" -o /dev/null -w 'dep B>C [%{http_code}]\n'
echo "before:"; dates $Q
echo "AC11: C->A, A->A, dup A->B"
post /api/projects/$Q/dependencies "{\"predecessor_id\":$C,\"successor_id\":$A}"
post /api/projects/$Q/dependencies "{\"predecessor_id\":$A,\"successor_id\":$A}"
post /api/projects/$Q/dependencies "{\"predecessor_id\":$A,\"successor_id\":$BB}"
curl -s $B/api/projects/$Q | jq -c '{dep_count:(.dependencies|length)}'
echo "AC36 stale-tab snapshot (tab 2 view) taken now:"; dates $Q
echo "AC12: PATCH A end=2026-10-09"
curl -s -X PATCH $B/api/tasks/$A -H "$J" -d '{"end":"2026-10-09"}' | jq -c '{changed:.changed_task_ids, tasks:[.project.tasks[]|{n:.name,s:.start,e:.end,d:.duration}], end:.project.schedule.project_end, crit:.project.schedule.critical_task_ids}'
echo "AC36: tab 2 (stale) PATCH B start=2026-10-08"
curl -s -X PATCH $B/api/tasks/$BB -H "$J" -d '{"start":"2026-10-08"}' | jq -c '{changed:.changed_task_ids, tasks:[.project.tasks[]|{n:.name,s:.start,e:.end}]}'
echo "AC28/AC32: B start=2026-10-06 (clamp) after resetting A end to 10-07"
curl -s -X PATCH $B/api/tasks/$A -H "$J" -d '{"end":"2026-10-07"}' | jq -c '[.project.tasks[]|{n:.name,s:.start,e:.end}]'
echo "  (AC29 push-only: A shrank back, B/C unchanged above)"
curl -s -X PATCH $B/api/tasks/$BB -H "$J" -d '{"start":"2026-10-06"}' -w '\n' | jq -c '{B:(.project.tasks[]|select(.name=="B")|{start,end,duration})}'
echo "== AC5/AC40/AC8/AC33 rejections (task A), each followed by unchanged check"
BEFORE=$(curl -s $B/api/projects/$Q | jq -c '.tasks')
for body in '{"end":"2026-10-01"}' '{"duration":3.5}' '{"duration":"3"}' '{"duration":0}' '{"start":"2026-02-30"}' '{"start":"2026-2-5"}' '{"name":"  "}' '{"duration":3651}' '{"start":"1999-12-31"}' '{"percent_complete":101}' '{"percent_complete":40.5}' '{"end":"2026-10-09","duration":5}' '{"colour":"x"}'; do
  printf '%-40s ' "$body"; curl -s -X PATCH $B/api/tasks/$A -H "$J" -d "$body" -w ' [%{http_code}]\n' | jq -rc '.error.code + " | " + .error.message' 2>/dev/null || true
done
curl -s -o /dev/null -w '' $B/health
AFTER=$(curl -s $B/api/projects/$Q | jq -c '.tasks'); [ "$BEFORE" = "$AFTER" ] && echo "tasks unchanged after all rejections: YES" || echo "tasks CHANGED: NO"
echo "== AC40 cascade past 2099-12-31"
Z=$(curl -s -X POST $B/api/projects -H "$J" -d '{"name":"Edge"}' | jq .id)
ZA=$(curl -s -X POST $B/api/projects/$Z/tasks -H "$J" -d '{"name":"ZA","start":"2099-12-20","duration":3}' | jq .created_id)
ZB=$(curl -s -X POST $B/api/projects/$Z/tasks -H "$J" -d '{"name":"ZB","start":"2099-12-23","duration":8}' | jq .created_id)
curl -s -X POST $B/api/projects/$Z/dependencies -H "$J" -d "{\"predecessor_id\":$ZA,\"successor_id\":$ZB}" -o /dev/null -w 'dep [%{http_code}]\n'
patch /api/tasks/$ZA '{"end":"2099-12-25"}' | cut -c1-200
dates $Z
echo "== AC39 milestone rule"
M=$(curl -s -X POST $B/api/projects -H "$J" -d '{"name":"Ms"}' | jq .id)
MA=$(curl -s -X POST $B/api/projects/$M/tasks -H "$J" -d '{"name":"A","start":"2026-10-05","duration":5}' | jq .created_id)
MM=$(curl -s -X POST $B/api/projects/$M/tasks -H "$J" -d '{"name":"M","start":"2026-10-09","is_milestone":true}' | jq .created_id)
MC=$(curl -s -X POST $B/api/projects/$M/tasks -H "$J" -d '{"name":"C","start":"2026-10-10","duration":2}' | jq .created_id)
curl -s -X POST $B/api/projects/$M/dependencies -H "$J" -d "{\"predecessor_id\":$MA,\"successor_id\":$MM}" -o /dev/null -w 'dep A>M [%{http_code}]\n'
curl -s -X POST $B/api/projects/$M/dependencies -H "$J" -d "{\"predecessor_id\":$MM,\"successor_id\":$MC}" -o /dev/null -w 'dep M>C [%{http_code}]\n'
curl -s -X PATCH $B/api/tasks/$MM -H "$J" -d '{"start":"2026-10-08"}' | jq -c '[.project.tasks[]|{n:.name,s:.start,e:.end,d:.duration}]'
patch /api/tasks/$MM '{"duration":2}' | cut -c1-160
curl -s -X PATCH $B/api/tasks/$MA -H "$J" -d '{"end":"2026-10-12"}' | jq -c '[.project.tasks[]|{n:.name,s:.start,e:.end,d:.duration}]'
echo "== AC9 cross-project assignee"
PX=$(curl -s -X POST $B/api/projects/$P/people -H "$J" -d '{"name":"Ana"}' | jq .created_id)
patch /api/tasks/$A "{\"assignee_id\":$PX}" | cut -c1-200
echo "== AC20 persistence: assign, milestone, progress in project Launch, then restart"
DT=$(curl -s $B/api/projects/$P | jq '.tasks[0].id')
curl -s -X PATCH $B/api/tasks/$DT -H "$J" -d "{\"assignee_id\":$PX,\"percent_complete\":40}" -o /dev/null -w 'assign+40%% [%{http_code}]\n'
curl -s $B/api/projects > $W/before_list.json
for id in $(jq '.[].id' $W/before_list.json); do curl -s $B/api/projects/$id; echo; done > $W/before.json
stop; echo "server stopped; port $PORT listening? $(lsof -nP -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null || echo no)"
start $W/v.db
for id in $(jq '.[].id' $W/before_list.json); do curl -s $B/api/projects/$id; echo; done > $W/after.json
cmp $W/before.json $W/after.json && echo "AC20: all project details identical after restart ($(wc -c < $W/after.json) bytes, $(jq -s length $W/after.json) projects)"
jq -c 'select(.name=="Launch")|{people, t0:.tasks[0]}' $W/after.json
echo "== AC21/AC22 export, import into fresh DB, re-export"
curl -s -D $W/hdr.txt $B/api/projects/$Q/export -o $W/a.json; grep -i content-disposition $W/hdr.txt
curl -s $B/api/projects/$P/export -o $W/pa.json
stop; start $W/fresh.db
curl -s $B/api/projects | jq -c '{projects_in_fresh_db:length}'
NEW=$(curl -s -X POST $B/api/import -H "$J" --data-binary @$W/pa.json | jq .id)
curl -s $B/api/projects/$NEW/export -o $W/pb.json
cmp $W/pa.json $W/pb.json && echo "AC22: byte-identical ($(wc -c < $W/pa.json) bytes)"
echo "== AC24 suffixes"
for i in 1 2; do curl -s -X POST $B/api/import -H "$J" --data-binary @$W/pa.json | jq -r .name; done
echo "== AC23 bad files"
jq '.tasks[0].start="2026-10-01"' $W/a.json > $W/bad_early.json 2>/dev/null
jq '.version=2' $W/pa.json > $W/bad_ver.json
printf '{"format":' > $W/bad_malformed.json
for f in bad_early bad_ver bad_malformed; do printf '%-14s ' $f; curl -s -X POST $B/api/import -H "$J" --data-binary @$W/$f.json -w ' [%{http_code}]\n'; done
curl -s $B/api/projects | jq -c '{projects_after_bad_imports:length}'
stop; echo "final: port $PORT listening? $(lsof -nP -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null || echo no)"
