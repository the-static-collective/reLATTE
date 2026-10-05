"""Kernel 004 from the prose wire contract: one Merkle-native result identity.

Independent hashlib/JCS/tree/proof implementation; mathematics is the existing
independent Python Q24 implementation. No JavaScript or worker imports.
"""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import sys

MATH_PATH = Path(__file__).with_name("julia_q24.py")
spec = importlib.util.spec_from_file_location("useful_work_independent_math", MATH_PATH)
math = importlib.util.module_from_spec(spec)
spec.loader.exec_module(math)
PREFIX = "useful-work-merkle-result-v1:"


def digest(value):
    math.require(type(value) is str and len(value) == 64 and
                 all(c in "0123456789abcdef" for c in value), "INVALID_DIGEST")
    return value


def hash_node(domain, *parts):
    return hashlib.sha256(domain.encode("ascii") + b"".join(parts)).hexdigest()


def pixel(index, count):
    return hash_node("UsefulWork-NativePixel-v1|", math.canonical_bytes({"index": index, "count": count}))


def padding(index):
    return hash_node("UsefulWork-NativePadding-v1|", math.canonical_bytes({"index": index}))


def parent(left, right):
    return hash_node("UsefulWork-NativeNode-v1|", bytes.fromhex(left), bytes.fromhex(right))


def header(value):
    math.keys(value, ["schema", "algorithm", "job_spec_hash", "width", "height", "counts_root"], "INVALID_RESULT_HEADER_FIELDS")
    math.require(value["schema"] == "useful-work.merkle-result/v1" and
                 value["algorithm"] == "sha256-jcs-pixel-tree/v1", "UNSUPPORTED_MERKLE_RESULT")
    digest(value["job_spec_hash"])
    digest(value["counts_root"])
    math.integer(value["width"], 1, 512, "INVALID_RESULT_WIDTH")
    math.integer(value["height"], 1, 512, "INVALID_RESULT_HEIGHT")
    return value


def identity(value):
    return PREFIX + hash_node("UsefulWork-MerkleResult-v1|", math.canonical_bytes(header(value)))


def tree(job, counts):
    math.validate_job(job)
    population = job["width"] * job["height"]
    math.require(type(counts) is list and len(counts) == population, "INVALID_RESULT_COUNT")
    for count in counts:
        math.integer(count, 0, job["iterations"], "INVALID_ESCAPE_COUNT")
    size = 1 << (population - 1).bit_length()
    levels = [[pixel(i, counts[i]) if i < population else padding(i) for i in range(size)]]
    while len(levels[-1]) > 1:
        previous = levels[-1]
        levels.append([parent(previous[i], previous[i+1]) for i in range(0, len(previous), 2)])
    result = dict(schema="useful-work.merkle-result/v1", algorithm="sha256-jcs-pixel-tree/v1",
                  job_spec_hash=math.sha(math.canonical_bytes(job)), width=job["width"],
                  height=job["height"], counts_root=levels[-1][0])
    artifact = dict(schema="useful-work.merkle-artifact/v1", result=result, escape_counts=counts)
    return dict(artifact=artifact, result_id=identity(result)), levels


def proof(levels, index):
    siblings = []
    for level in levels[:-1]:
        siblings.append(level[index ^ 1])
        index //= 2
    return siblings


def membership(result, result_id, index, count, siblings):
    header(result)
    math.require(identity(result) == result_id, "RESULT_IDENTITY_MISMATCH")
    population = result["width"] * result["height"]
    math.integer(index, 0, population - 1, "INVALID_SAMPLE_INDEX")
    math.integer(count, 0, 4096, "INVALID_ESCAPE_COUNT")
    math.require(type(siblings) is list and len(siblings) == (population-1).bit_length(), "INVALID_PROOF_DEPTH")
    node = pixel(index, count)
    for sibling in siblings:
        digest(sibling)
        node = parent(sibling, node) if index & 1 else parent(node, sibling)
        index >>= 1
    return node == result["counts_root"]


def job_and_header(job_bytes, result):
    job = math.load_json(job_bytes)
    math.validate_job(job)
    math.require(math.canonical_bytes(job) == job_bytes, "NON_CANONICAL_JOB")
    header(result)
    math.require(result["job_spec_hash"] == math.sha(job_bytes) and
                 result["width"] == job["width"] and result["height"] == job["height"], "RESULT_JOB_MISMATCH")
    return job


def sample(request):
    math.keys(request, ["job_base64", "result_header", "result_id", "samples"], "INVALID_SAMPLE_REQUEST")
    job_bytes = base64.b64decode(request["job_base64"], validate=True)
    result = request["result_header"]
    job = job_and_header(job_bytes, result)
    samples = request["samples"]
    math.require(type(samples) is list and 1 <= len(samples) <= 64, "INVALID_SAMPLE_SET")
    indices = []
    for entry in samples:
        math.keys(entry, ["index", "committed_count", "proof"], "INVALID_SAMPLE_FIELDS")
        math.integer(entry["committed_count"], 0, job["iterations"], "INVALID_COMMITTED_COUNT")
        math.require(membership(result, request["result_id"], entry["index"], entry["committed_count"], entry["proof"]), "RESULT_PROOF_MISMATCH")
        indices.append(entry["index"])
    math.require(indices == sorted(set(indices)), "INVALID_SAMPLE_SET")
    checked = math.sample_job(job_bytes, indices)
    return dict(schema="useful-work.python-native-samples/v1", result_id=identity(result),
                job_spec_hash=math.sha(job_bytes), sampled_entries_bound_to_result_identity=True, samples=checked["samples"])


def verify(request):
    math.keys(request, ["job_base64", "artifact_base64", "result_id"], "INVALID_VERIFY_REQUEST")
    job_bytes = base64.b64decode(request["job_base64"], validate=True)
    artifact_bytes = base64.b64decode(request["artifact_base64"], validate=True)
    artifact = math.load_json(artifact_bytes)
    math.keys(artifact, ["schema", "result", "escape_counts"], "INVALID_MERKLE_ARTIFACT_FIELDS")
    math.require(artifact["schema"] == "useful-work.merkle-artifact/v1", "UNSUPPORTED_MERKLE_ARTIFACT")
    math.require(math.canonical_bytes(artifact) == artifact_bytes, "NON_CANONICAL_MERKLE_ARTIFACT")
    job = job_and_header(job_bytes, artifact["result"])
    math.require(identity(artifact["result"]) == request["result_id"], "RESULT_IDENTITY_MISMATCH")
    rebuilt, _ = tree(job, artifact["escape_counts"])
    math.require(rebuilt["result_id"] == request["result_id"], "RESULT_LEAVES_IDENTITY_MISMATCH")
    expected, _ = tree(job, math.render(job)["escape_counts"])
    return dict(schema="useful-work.python-native-full/v1", result_id=rebuilt["result_id"],
                result_identity_verified=True, computation_independently_verified=expected["result_id"] == rebuilt["result_id"],
                recomputed_result_id=expected["result_id"])


def main():
    math.require(len(sys.argv) == 2 and sys.argv[1] in ("render", "sample", "verify"), "Usage: merkle_result_v1.py render|sample|verify")
    raw = sys.stdin.buffer.read(16 * 1024 * 1024 + 1)
    math.require(len(raw) <= 16 * 1024 * 1024, "INPUT_SIZE_LIMIT")
    request = math.load_json(raw)
    if sys.argv[1] == "render":
        math.keys(request, ["jobs"], "INVALID_RENDER_REQUEST")
        math.require(type(request["jobs"]) is list and len(request["jobs"]) <= 256, "INVALID_JOB_BATCH")
        output = [tree(job, math.render(job)["escape_counts"])[0] for job in request["jobs"]]
    else:
        output = sample(request) if sys.argv[1] == "sample" else verify(request)
        output["implementation"] = dict(id="useful-work/python-merkle-q24/v1", runtime="Python " + platform.python_version(),
            source_sha256=hash_node("UsefulWork-NativeVerifierSource-v1|", Path(__file__).read_bytes(), MATH_PATH.read_bytes()))
    print(json.dumps(output, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, TypeError, KeyError, OverflowError) as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
