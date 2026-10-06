"""Independent world containers, connected only by HTTP and public bootstrap cards.

This program starts/stops execution surfaces and injects network faults. It never
reads private world volumes or commands trade decisions. Each daemon advances its
own protocol and signs its own local cut. Private volumes are retained for reuse.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

REPO = Path(__file__).resolve().parents[2]
ROLES = ["A", "B", "C", "D", "adapter"]
DOCKER = ["docker", "--host=unix:///var/run/docker.sock"]
ENV = os.environ.copy()
for selector in ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]:
    ENV.pop(selector, None)


def docker(*args, check=True):
    result = subprocess.run(DOCKER + list(args), env=ENV, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr[-4000:])
    return (result.stdout + (result.stderr if args and args[0] == "logs" else "")).strip()


def main():
    out = Path(sys.argv[1]).resolve(); out.mkdir()
    prefix = "relatte-wire-" + uuid.uuid4().hex[:10]
    image = "relatte-wire-002:local"
    print("Building isolated world image", flush=True)
    docker("build", "-f", str(REPO / "examples/useful-work-field-002/Dockerfile"), "-t", image, str(REPO))
    bootstrap = out / "public-bootstrap"; bootstrap.mkdir(); bootstrap.chmod(0o755)
    job = json.loads((REPO / "examples/useful-work-001/julia-001.json").read_text())
    (bootstrap / "job.json").write_text(json.dumps(job))
    cards = {}; volumes = {}; names = {}; containers = []
    network = prefix + "-network"
    docker("network", "create", "--internal", network)
    try:
        for i, role in enumerate(ROLES):
            volumes[role] = prefix + "-" + role + "-private"
            names[role] = prefix + "-" + role
            docker("volume", "create", volumes[role])
            raw = docker("run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                         "--tmpfs", "/tmp:rw,noexec,size=16m", "--user", f"{11001+i}:{11001+i}",
                         "--mount", f"type=volume,src={volumes[role]},dst=/state", image,
                         "node", "--experimental-strip-types", "src/useful_work/cli_field_002.ts", "init", role, "/state/world")
            cards[role] = json.loads(raw)
        (bootstrap / "peers.json").write_text(json.dumps(cards))
        proxy_name = prefix + "-wire"
        endpoints = {r: f"http://{proxy_name}:8080/{r}" for r in ROLES}
        (bootstrap / "endpoints.json").write_text(json.dumps(endpoints))
        proxy_volume = prefix + "-proxy-public"
        docker("volume", "create", proxy_volume)
        proxy = dict(root="/state/network", run_id="field-wire-002", port=8080, bind_host="0.0.0.0",
                     upstreams={r: f"http://{names[r]}:8080" for r in ROLES}, latency_ms=40,
                     reorder_delay_ms=1500, partition_ms=4000, late_delay_ms=6000, timeout_ms=10000)
        (bootstrap / "proxy.json").write_text(json.dumps(proxy))
        for public_file in bootstrap.iterdir(): public_file.chmod(0o644)
        docker("run", "-d", "--name", proxy_name, "--network", network, "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
               "--tmpfs", "/tmp:rw,noexec,size=16m", "--user", "11010:11010", "--mount", f"type=volume,src={proxy_volume},dst=/state",
               "--mount", f"type=bind,src={bootstrap},dst=/bootstrap,readonly", image,
               "node", "--experimental-strip-types", "examples/useful-work-field-002/fault_proxy.ts", "/bootstrap/proxy.json")
        containers.append(proxy_name)
        for i, role in enumerate(ROLES):
            # Only public cards and endpoint declarations enter the bootstrap mount.
            config = dict(run_id="field-wire-002", role=role, root="/state/world", bind_host="0.0.0.0", port=8080, peers=cards,
                          endpoints=endpoints, service_endpoint=endpoints["A"] + "/native", network_interface="eth0",
                          issue_window_ms=20000, response_window_ms=10000, starts_after_ms=5000, retry_ms=300, timeout_ms=10000,
                          unavailable_ms=45000, late_window_ms=3000, run_timeout_ms=180000, job_spec=job,
                          surface=dict(surface_id=names[role], description="Distinct Docker PID/mount/network/UTS namespaces, non-root UID and private volume; shared kernel.", physical_machine_attested=False))
            (bootstrap / (role + ".json")).write_text(json.dumps(config))
            (bootstrap / (role + ".json")).chmod(0o644)
            # The local config points to its own volume; the public bootstrap is read-only.
            docker("run", "-d", "--name", names[role], "--hostname", names[role], "--network", network, "--read-only", "--cap-drop", "ALL",
                   "--security-opt", "no-new-privileges", "--tmpfs", "/tmp:rw,noexec,size=16m", "--user", f"{11001+i}:{11001+i}",
                   "--mount", f"type=volume,src={volumes[role]},dst=/state", "--mount", f"type=bind,src={bootstrap},dst=/bootstrap,readonly",
                   image, "node", "--experimental-strip-types", "src/useful_work/cli_field_002.ts", "serve", "/bootstrap/" + role + ".json")
            containers.append(names[role])
        diagnostics = {}
        for role in ROLES:
            raw = docker("exec", names[role], "node", "-e", "const fs=require('fs');process.stdout.write(JSON.stringify({uid:process.getuid(),hostname:require('os').hostname(),namespaces:Object.fromEntries(['pid','mnt','net','uts'].map(n=>[n,fs.readlinkSync('/proc/self/ns/'+n)])),other_world_volume_present:fs.existsSync('/state/other-world')}));")
            diagnostics[role] = json.loads(raw)
        for namespace in ["pid", "mnt", "net", "uts"]:
            assert len({d["namespaces"][namespace] for d in diagnostics.values()}) == 5
        assert len({d["uid"] for d in diagnostics.values()}) == 5
        (out / "execution-surfaces.json").write_text(json.dumps(dict(container_prefix=prefix, network=network, private_volumes=volumes, observations=diagnostics, shared_kernel=True), indent=2))
        print("Five isolated world surfaces are advancing their own trade over bridge-network HTTP.", flush=True)
        started = time.monotonic()
        while time.monotonic() - started < 230:
            statuses = {role: json.loads(docker("inspect", "--format", "{{json .State}}", names[role])) for role in ROLES}
            if all(not state["Running"] for state in statuses.values()):
                break
            time.sleep(1)
        for role in ROLES:
            (out / role).mkdir()
            (out / role / "process.log").write_text(docker("logs", names[role], check=False))
            docker("cp", names[role] + ":/state/world/public-local-view.json", str(out / role / "public-local-view.json"), check=False)
            docker("cp", names[role] + ":/state/world/status.json", str(out / role / "status.json"), check=False)
            docker("cp", names[role] + ":/state/world/cuts", str(out / role / "cuts"), check=False)
        docker("cp", proxy_name + ":/state/network", str(out / "network-exerciser"), check=False)
        assert all(not state["Running"] and state["ExitCode"] == 0 for state in statuses.values()), statuses
        for role in ROLES:
            subprocess.run(["node", "--experimental-strip-types", str(REPO / "src/useful_work/cli_field_002.ts"), "verify", str(out / role / "public-local-view.json")], check=True, stdout=subprocess.DEVNULL)
        print("All five local histories replay independently. No merged world history was constructed.", flush=True)
    finally:
        for role, name in names.items():
            local = out / role; local.mkdir(exist_ok=True)
            (local / "process.log").write_text(docker("logs", name, check=False))
            docker("cp", name + ":/state/world/public-local-view.json", str(local / "public-local-view.json"), check=False)
            docker("cp", name + ":/state/world/status.json", str(local / "status.json"), check=False)
        for name in reversed(containers):
            docker("rm", "-f", name, check=False)
        docker("network", "rm", network, check=False)
        print("Private world volumes retained:", json.dumps(volumes), flush=True)


if __name__ == "__main__":
    main()
