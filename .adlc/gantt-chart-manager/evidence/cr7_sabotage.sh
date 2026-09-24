#!/usr/bin/env bash
# Verifier throwaway (run 3): prove the CR7 store tests can fail. Exports HEAD's frontend to /tmp,
# makes renameProject skip the write queue (the pre-CR7 behaviour), and runs the CR7 tests there.
set -u
ROOT=/Users/angel.difo/Library/CloudStorage/OneDrive-Hg/Desktop/HG-Catalyst-Projects/hg-gaant-chart
T=${GV_DIR:-/tmp/gver3}/cr7; rm -rf $T; mkdir -p $T
git -C $ROOT archive HEAD frontend | tar -x -C $T
ln -s $ROOT/frontend/node_modules $T/frontend/node_modules
F=$T/frontend/src/state/store.tsx
perl -0pi -e 's/renameProject: \(run\) =>\n\s*enqueue\(run, \(project\) => dispatch\(\{ type: "project-renamed", project \}\)\),/renameProject: async (run) => { try { const project = await run(); dispatch({ type: "project-renamed", project }); return { ok: true }; } catch (e) { return fail(e); } },/' $F
grep -n "renameProject: async" $F >/dev/null && echo "sabotage applied (rename bypasses queue)" || { echo "SABOTAGE NOT APPLIED"; exit 1; }
cd $T/frontend && npx vitest run src/state/store.test.ts -t "CR7" 2>&1 | grep -E "✓|×|FAIL|AssertionError|Expected|Received|Tests" | head -20
