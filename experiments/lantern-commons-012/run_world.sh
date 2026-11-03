#!/usr/bin/env bash
# LANTERN-012. Only operates on a freshly checked out, verified sandbox SAVE.
# Environment: STAGE reserve|harvest|heir, PARENT_ARCHIVE, VERSION.
set -euo pipefail
: "${STAGE:?}" "${PARENT_ARCHIVE:?}" "${VERSION:?}"
case "$STAGE:$VERSION" in
  reserve:0.1.4|harvest:0.1.4|heir:0.1.5) ;;
  *) echo "UNDECLARED_BRANCH_VERSION" >&2; exit 2 ;;
esac
[[ -s "$PARENT_ARCHIVE" ]] || { echo "MISSING_SOURCE_CARTRIDGE" >&2; exit 2; }

python3 experiments/lantern-commons-010/world_cartridge.py verify "$PARENT_ARCHIVE"
mkdir -p work/lantern/server
python3 experiments/lantern-commons-010/world_cartridge.py checkout \
  "$PARENT_ARCHIVE" work/lantern/server/world

ORIGINAL_ID="$(python3 - "$PARENT_ARCHIVE" <<'PY'
import sys,importlib.util
spec=importlib.util.spec_from_file_location('wc','experiments/lantern-commons-010/world_cartridge.py')
wc=importlib.util.module_from_spec(spec);spec.loader.exec_module(wc)
m,_=wc.inspect(sys.argv[1])
expected='dd1a1004b02d7fbb17fe868a788178b6d2ce07aebed4080dbafd77fa8e57287d'
if m['minecraft_java_version']!='26.1.1' or m['world_seed']!='314159265':
    raise ValueError('UNTRUSTED_GAME_ENGINE_OR_SEED')
if m['cartridge_id']==expected and m['branch']=='silo_heir' and m['version']=='0.1.3':
    pass
elif m['branch']=='harvest' and m['version']=='0.1.4' and len(m['parent']['cartridge_id'])==64:
    if m['parent']['cartridge_id']!=expected:
        raise ValueError('HEIR_PARENT_NOT_REAL_011_DESCENDANT')
else:raise ValueError('UNAPPROVED_CARTRIDGE_ANCESTRY')
print(m['cartridge_id'])
PY
)"
if [[ "$STAGE" == "heir" ]]; then
  python3 - "$PARENT_ARCHIVE" <<'PY'
import sys,importlib.util
spec=importlib.util.spec_from_file_location('wc','experiments/lantern-commons-010/world_cartridge.py')
wc=importlib.util.module_from_spec(spec);spec.loader.exec_module(wc)
m,_=wc.inspect(sys.argv[1])
if m['branch']!='harvest' or m['version']!='0.1.4':
    raise ValueError('HEIR_MUST_USE_ACTUAL_HARVEST_SNAPSHOT')
PY
else
  [[ "$ORIGINAL_ID" == "dd1a1004b02d7fbb17fe868a788178b6d2ce07aebed4080dbafd77fa8e57287d" ]]
fi

python3 experiments/lantern-commons-011/ci_server.py official --parent "$PARENT_ARCHIVE"
python3 experiments/lantern-commons-011/ci_server.py config --parent "$PARENT_ARCHIVE"
python3 experiments/lantern-commons-012/ci_overlay.py --parent "$PARENT_ARCHIVE"

(
  cd work/lantern/server
  java -Xms1G -Xmx2G -jar server.jar nogui >server.log 2>&1 &
  echo $! >server.pid
)
cleanup() {
  node --input-type=module - <<'JS' || true
import {Rcon} from 'rcon-client';
try {
 const c=await Rcon.connect({host:'127.0.0.1',port:25575,password:'lantern-ci-only'});
 await c.send('save-all flush'); await c.send('stop'); c.end();
} catch(e) {console.error('Minecraft stop status',String(e));}
JS
  for i in $(seq 1 40); do
    if ! kill -0 "$(cat work/lantern/server/server.pid)" 2>/dev/null; then break; fi
    sleep 1
  done
}
trap cleanup EXIT
for i in $(seq 1 120); do
  if grep -q 'Done (' work/lantern/server/server.log; then
    echo 'VERIFIED_PARENT_MINECRAFT_WORLD_BOOTED'
    break
  fi
  if ! kill -0 "$(cat work/lantern/server/server.pid)" 2>/dev/null; then
    tail -n 90 work/lantern/server/server.log
    exit 1
  fi
  sleep 1
done
grep -q 'Done (' work/lantern/server/server.log || { tail -n 90 work/lantern/server/server.log; exit 1; }
export LANTERN_012_STAGE="$STAGE"
export LANTERN_012_PARENT_ID="$ORIGINAL_ID"
export LANTERN_012_SEED="314159265"
export MC_RCON_PASSWORD="lantern-ci-only"
node experiments/lantern-commons-012/live_first_harvest.mjs
cleanup
trap - EXIT
sleep 1
OBS_SHA="$(sha256sum work/first-harvest/game-observation.json | cut -d' ' -f1)"
SRC_SHA="$(printf '%s' "$GITHUB_SHA" | sha256sum | cut -d' ' -f1)"
JAR_SHA="$(python3 -c "import json; print(json.load(open('work/lantern/server-meta.json'))['jar_sha1'])")"
python3 experiments/lantern-commons-010/world_cartridge.py pack \
  --world work/lantern/server/world \
  --out "work/first-harvest/$STAGE-v$VERSION.zip" \
  --parent "$PARENT_ARCHIVE" \
  --version "$VERSION" --branch "$STAGE" --seed 314159265 \
  --mojang-sha1 "$JAR_SHA" --source-sha256 "$SRC_SHA" \
  --observation-sha256 "$OBS_SHA" --action "FIRST_HARVEST_012_$STAGE"
python3 experiments/lantern-commons-010/world_cartridge.py verify \
  "work/first-harvest/$STAGE-v$VERSION.zip"
echo "REAL_SAVED_WORLD_CARTRIDGE_SEALED=$STAGE-v$VERSION PARENT=$ORIGINAL_ID"
