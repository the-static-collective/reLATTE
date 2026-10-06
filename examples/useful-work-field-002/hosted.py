"""One GitHub-hosted runner owns one world. Public artifacts provide rendezvous,
not trade orchestration or merged state. World traffic uses real HTTPS tunnels.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import zipfile

ROLE = sys.argv[2]
REPO = Path(__file__).resolve().parents[2]
ROOT = Path(os.environ["RUNNER_TEMP"]) / ("wire002-" + ROLE)
PUBLIC = ROOT / "rendezvous"
ROLES = ["A", "B", "C", "D", "adapter"]
RUN = os.environ["GITHUB_RUN_ID"]
ATTEMPT = os.environ["GITHUB_RUN_ATTEMPT"]
ARTIFACT_PREFIX = "wire002-rendezvous-" + ATTEMPT + "-"
CLI = ["node", "--experimental-strip-types", str(REPO / "src/useful_work/cli_field_002.ts")]


def gh(path):
    return subprocess.check_output(["gh", "api", path])


def json_write(path, value):
    path.write_text(json.dumps(value, indent=2))


def bootstrap():
    ROOT.mkdir(); PUBLIC.mkdir()
    subprocess.run(CLI + ["init", ROLE, str(ROOT)], check=True, stdout=subprocess.DEVNULL)
    (PUBLIC / "public-card.json").write_bytes((ROOT / "public-card.json").read_bytes())
    release = json.loads(gh("repos/cloudflare/cloudflared/releases/tags/2026.10.0"))
    asset = next(a for a in release["assets"] if a["name"] == "cloudflared-linux-amd64")
    expected = asset.get("digest")
    if expected != "sha256:d33ff2d14475178d2012c2c56beba87389ac5ded27649519f198a7d3134a99db":
        raise RuntimeError("CLOUDFLARED_RELEASE_DIGEST_REQUIRED")
    binary = ROOT / "cloudflared"
    subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error", asset["browser_download_url"], "--output", str(binary)], check=True)
    assert "sha256:" + hashlib.sha256(binary.read_bytes()).hexdigest() == expected
    binary.chmod(0o700)
    log = ROOT / "tunnel.log"
    with log.open("w") as stream:
        child = subprocess.Popen([str(binary), "tunnel", "--no-autoupdate", "--protocol", "http2", "--url", "http://127.0.0.1:8080"],
                                 stdout=stream, stderr=stream, start_new_session=True,
                                 env={k: v for k, v in os.environ.items() if k not in ["GH_TOKEN", "GITHUB_TOKEN", "RUNNER_TRACKING_ID"]})
    json_write(ROOT / "tunnel-process.json", dict(pid=child.pid, release=release["tag_name"], digest=expected))
    for _ in range(120):
        text = log.read_text()
        match = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", text)
        if match:
            json_write(PUBLIC / "endpoint.json", dict(role=ROLE, endpoint=match.group(0)))
            boot_id=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
            assert re.fullmatch(r'[a-f0-9-]{36}',boot_id)
            json_write(PUBLIC / "surface.json", dict(surface_id=os.environ["RUNNER_NAME"], description="One separately scheduled GitHub-hosted runner VM for this role.",
                       role=ROLE, runner_name=os.environ["RUNNER_NAME"], hostname=os.uname().nodename, kernel_boot_id=boot_id,
                       workflow_run=RUN, run_attempt=ATTEMPT, physical_machine_attested=False))
            print("Public rendezvous ready for", ROLE, flush=True)
            return
        if child.poll() is not None:
            raise RuntimeError("HTTPS_TUNNEL_START_FAILED: " + text[-3000:])
        time.sleep(1)
    raise RuntimeError("HTTPS_TUNNEL_RENDEZVOUS_TIMEOUT")


def rendezvous():
    started = time.monotonic(); names = {ARTIFACT_PREFIX + r for r in ROLES}
    while time.monotonic() - started < 300:
        data = json.loads(gh("repos/" + os.environ["GITHUB_REPOSITORY"] + "/actions/runs/" + RUN + "/artifacts?per_page=100"))
        artifacts = {a["name"]: a for a in data["artifacts"] if a["name"] in names and not a["expired"]}
        if set(artifacts) == names:
            break
        time.sleep(3)
    else:
        raise RuntimeError("PEER_RENDEZVOUS_TIMEOUT")
    peers = {}; upstreams = {}; surfaces = {}
    for role in ROLES:
        raw = gh(artifacts[ARTIFACT_PREFIX + role]["archive_download_url"])
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            # Extract exactly public metadata; never restore peer state or keys.
            peers[role] = json.loads(archive.read("public-card.json"))
            endpoint = json.loads(archive.read("endpoint.json")); assert endpoint["role"] == role
            upstreams[role] = endpoint["endpoint"]
            surfaces[role] = json.loads(archive.read("surface.json"))
    assert len({s["runner_name"] for s in surfaces.values()}) == 5
    assert len({s["kernel_boot_id"] for s in surfaces.values()}) == 5
    interfaces = [p.name for p in Path("/sys/class/net").iterdir() if p.name != "lo"]
    run_id = "wire002-" + RUN + "-" + ATTEMPT
    proxy = dict(root=str(ROOT / "network-exerciser"), run_id=run_id, port=8081, upstreams=upstreams, bind_host="127.0.0.1",
                 latency_ms=120, reorder_delay_ms=2000, partition_ms=7000, late_delay_ms=9000, timeout_ms=15000)
    json_write(ROOT / "proxy.json", proxy)
    endpoints = {role: "http://127.0.0.1:8081/" + role for role in ROLES}
    config = dict(run_id=run_id, role=ROLE, root=str(ROOT), bind_host="127.0.0.1", port=8080, peers=peers, endpoints=endpoints,
                  service_endpoint=upstreams["A"] + "/native", network_interface=interfaces[0], issue_window_ms=45000,
                  response_window_ms=15000, starts_after_ms=12000, retry_ms=500, timeout_ms=15000,
                  unavailable_ms=100000, late_window_ms=5000, run_timeout_ms=300000, surface=surfaces[ROLE],
                  job_spec=json.loads((REPO / "examples/useful-work-001/julia-001.json").read_text()))
    json_write(ROOT / "config.json", config); json_write(ROOT / "public-surfaces.json", surfaces)
    print("Five distinct runner surfaces registered. This runner will advance only", ROLE, flush=True)
    print(json.dumps(dict(execution_surfaces=surfaces)),flush=True)


def serve():
    env = {k: v for k, v in os.environ.items() if k not in ["GH_TOKEN", "GITHUB_TOKEN"]}
    with (ROOT / "proxy-process.log").open("w") as stream:
        proxy = subprocess.Popen(["node", "--experimental-strip-types", str(REPO / "examples/useful-work-field-002/fault_proxy.ts"), str(ROOT / "proxy.json")], stdout=stream, stderr=stream, env=env)
    try:
        result = subprocess.run(CLI + ["serve", str(ROOT / "config.json")], env=env, timeout=430)
        result.check_returncode()
        subprocess.run(CLI + ["verify", str(ROOT / "public-local-view.json")], env=env, check=True, stdout=subprocess.DEVNULL)
        view=json.loads((ROOT / 'public-local-view.json').read_text())['view'];summary=view['summary'];domain=summary['domain']
        assert domain['acceptance']['choice']=='ACCEPT' and domain['acceptance']['B_value']==dict(numerator='12',denominator='1')
        assert domain['acceptance']['contradiction_count']==1 and domain['acceptance']['expired_service_slots']==[1]
        assert not summary['application_failures'] and not summary['pending_message_ids']
        if ROLE!='adapter':
            assert domain['dissent']['amount']==dict(numerator='5',denominator='1') and domain['settlement']['credit_ledger_changed']
        if ROLE in ['A','B','C']: assert domain['late_evidence']['choice']=='HOLD'
        if ROLE=='B':
            assert any(e['kind']=='PENDING' for e in view['events'])
            assert any(f['recipient']=='adapter' for f in summary['transport_failures'])
        if ROLE in ['C','adapter']: assert summary['duplicate_deliveries_observed']>=1
        if ROLE=='adapter':
            ledger=json.loads((ROOT/'ledger/state.json').read_text());assert ledger['balances']==dict(A='12',B='88') and len(ledger['entries'])==1
            assert any(f['recipient']=='C' for f in summary['transport_failures'])
        if ROLE=='D': assert sum(e['kind']=='START' for e in view['events'])==2 and len(list((ROOT/'cuts').glob('*.json')))==2
        report=dict(role=ROLE,view_id=view['view_id'],local_events=len(view['events']),duplicate_deliveries=summary['duplicate_deliveries_observed'],
                    failed_attempts=len(summary['transport_failures']),acceptance=domain['acceptance'],dissent=domain.get('dissent'),
                    settlement=domain.get('settlement'),late_evidence=domain.get('late_evidence'),global_reconstruction_required=False)
        print('FIELD_WIRE_002_LOCAL_RESULT '+json.dumps(report),flush=True)
        print("Local history replay passed for", ROLE, flush=True)
    finally:
        proxy.terminate()
        try: proxy.wait(timeout=10)
        except subprocess.TimeoutExpired: proxy.kill(); proxy.wait()


if sys.argv[1] == "bootstrap": bootstrap()
elif sys.argv[1] == "rendezvous": rendezvous()
elif sys.argv[1] == "serve": serve()
else: raise ValueError("bootstrap | rendezvous | serve <role>")
