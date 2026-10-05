"""Independent julia-q24/v1 implementation from Kernel 001's prose and vectors.

Standard library only. No JavaScript imports, subprocesses, or worker results as
an oracle. The Node adapter authenticates crossings; this process checks maths.
"""

import base64
import hashlib
import json
from pathlib import Path
import platform
import sys

Q = 1 << 24
SAFE_INTEGER = (1 << 53) - 1


def require(condition, error):
    if not condition:
        raise ValueError(error)


def keys(value, expected, error):
    require(type(value) is dict and set(value) == set(expected), error)


def integer(value, minimum, maximum, error):
    # bool is a subclass of int in Python; it is not a job number.
    require(type(value) is int and minimum <= value <= maximum, error)


def validate_job(job):
    keys(job, ["schema", "algorithm", "seed", "width", "height", "iterations",
               "bounds", "parameters"], "INVALID_JOB_FIELDS")
    require(job["schema"] == "useful-work.render-job/v1", "UNSUPPORTED_JOB_SCHEMA")
    require(job["algorithm"] == "julia-q24/v1", "UNSUPPORTED_ALGORITHM")
    integer(job["seed"], 0, (1 << 32) - 1, "INVALID_SEED")
    integer(job["width"], 1, 512, "INVALID_WIDTH")
    integer(job["height"], 1, 512, "INVALID_HEIGHT")
    integer(job["iterations"], 1, 4096, "INVALID_ITERATIONS")
    require(job["width"] * job["height"] * job["iterations"] <= 5_000_000,
            "WORK_LIMIT_EXCEEDED")
    bounds = job["bounds"]
    keys(bounds, ["min_real_q", "max_real_q", "min_imag_q", "max_imag_q"],
         "INVALID_BOUNDS_FIELDS")
    for value in bounds.values():
        integer(value, -4 * Q, 4 * Q, "INVALID_BOUND")
    require(bounds["min_real_q"] < bounds["max_real_q"] and
            bounds["min_imag_q"] < bounds["max_imag_q"], "EMPTY_BOUNDS")
    keys(job["parameters"], ["c_real_q", "c_imag_q"], "INVALID_PARAMETER_FIELDS")
    for value in job["parameters"].values():
        integer(value, -2 * Q, 2 * Q, "INVALID_PARAMETER")


def canonical_bytes(value):
    """JCS for this closed ASCII-key, string-and-safe-integer math schema only.

    Deliberately not a general JCS implementation: metadata and envelopes are
    canonicalized/authenticated by the existing substrate boundary in Node.
    """
    if type(value) is dict:
        for key, child in value.items():
            require(type(key) is str and key.isascii(), "NON_ASCII_MATH_KEY")
            canonical_bytes(child)
    elif type(value) is list:
        for child in value:
            canonical_bytes(child)
    elif type(value) is int:
        integer(value, -SAFE_INTEGER, SAFE_INTEGER, "UNSAFE_INTEGER")
    else:
        require(type(value) is str and value.isascii(), "UNSUPPORTED_MATH_VALUE")
    return json.dumps(value, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def sha(value):
    return hashlib.sha256(value).hexdigest()


def truncate(numerator, denominator):
    magnitude = abs(numerator) // denominator
    return -magnitude if numerator < 0 else magnitude


def coordinate(low, high, index, size):
    return low + truncate((2 * index + 1) * (high - low), 2 * size)


def orbit_evidence(real, imaginary, constant, limit):
    for completed in range(limit):
        if real * real + imaginary * imaginary > 4 * Q * Q:
            return {"count": completed, "final_real_q": str(real), "final_imag_q": str(imaginary)}
        real, imaginary = (
            truncate(real * real - imaginary * imaginary, Q) + constant[0],
            truncate(2 * real * imaginary, Q) + constant[1],
        )
    return {"count": limit, "final_real_q": str(real), "final_imag_q": str(imaginary)}


def escape_steps(real, imaginary, constant, limit):
    return orbit_evidence(real, imaginary, constant, limit)["count"]


def sample_job(job_bytes, indices):
    job = load_json(job_bytes)
    validate_job(job)
    require(canonical_bytes(job) == job_bytes, "NON_CANONICAL_JOB")
    require(type(indices) is list and 1 <= len(indices) <= 64, "INVALID_SAMPLE_SET")
    for index in indices:
        integer(index, 0, job["width"] * job["height"] - 1, "INVALID_SAMPLE_INDEX")
    require(len(set(indices)) == len(indices), "DUPLICATE_SAMPLE_INDEX")
    seed = hashlib.sha256(("UsefulWork-JuliaSeed-v1|" + str(job["seed"])).encode()).digest()
    constant = tuple(job["parameters"][name] + int.from_bytes(seed[i:i + 4], "big") % 524289 - 262144
                     for name, i in (("c_real_q", 0), ("c_imag_q", 4)))
    bounds = job["bounds"]
    samples = []
    for index in indices:
        y, x = divmod(index, job["width"])
        real = coordinate(bounds["min_real_q"], bounds["max_real_q"], x, job["width"])
        imaginary = coordinate(bounds["min_imag_q"], bounds["max_imag_q"], y, job["height"])
        samples.append({"index": index, **orbit_evidence(real, imaginary, constant, job["iterations"])})
    return {"schema": "useful-work.python-samples/v1", "job_spec_hash": sha(job_bytes), "samples": samples}


def render(job):
    validate_job(job)
    digest = hashlib.sha256(
        ("UsefulWork-JuliaSeed-v1|" + str(job["seed"])).encode("utf-8")
    ).digest()
    offsets = tuple(int.from_bytes(digest[i:i + 4], "big") % 524289 - 262144
                    for i in (0, 4))
    constant = (job["parameters"]["c_real_q"] + offsets[0],
                job["parameters"]["c_imag_q"] + offsets[1])
    bounds = job["bounds"]
    real_axis = [coordinate(bounds["min_real_q"], bounds["max_real_q"], i,
                            job["width"]) for i in range(job["width"])]
    imaginary_axis = [coordinate(bounds["min_imag_q"], bounds["max_imag_q"], i,
                                 job["height"]) for i in range(job["height"])]
    result = {
        "schema": "useful-work.result/v1",
        "job_spec_hash": sha(canonical_bytes(job)),
        "width": job["width"], "height": job["height"],
        "escape_counts": [escape_steps(x, y, constant, job["iterations"])
                          for y in imaginary_axis for x in real_axis],
    }
    return result


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def load_json(data):
    try:
        return json.loads(data, object_pairs_hook=unique_object,
                          parse_constant=lambda _: (_ for _ in ()).throw(ValueError("NON_FINITE_NUMBER")))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("INVALID_JSON") from error


def verify(job_bytes, result_bytes):
    job = load_json(job_bytes)
    validate_job(job)
    require(canonical_bytes(job) == job_bytes, "NON_CANONICAL_JOB")
    candidate = load_json(result_bytes)
    keys(candidate, ["schema", "job_spec_hash", "width", "height", "escape_counts"],
         "INVALID_RESULT_FIELDS")
    require(candidate["schema"] == "useful-work.result/v1", "UNSUPPORTED_RESULT_SCHEMA")
    require(candidate["job_spec_hash"] == sha(job_bytes), "RESULT_JOB_MISMATCH")
    require(type(candidate["width"]) is int and candidate["width"] == job["width"] and
            type(candidate["height"]) is int and candidate["height"] == job["height"],
            "RESULT_DIMENSIONS_MISMATCH")
    counts = candidate["escape_counts"]
    require(type(counts) is list and len(counts) == job["width"] * job["height"],
            "INVALID_SAMPLE_COUNT")
    for value in counts:
        integer(value, 0, job["iterations"], "INVALID_ESCAPE_COUNT")
    require(canonical_bytes(candidate) == result_bytes, "NON_CANONICAL_RESULT")
    expected = render(job)
    first = next(({"index": i, "artifact_count": actual, "recomputed_count": wanted}
                  for i, (actual, wanted) in enumerate(zip(counts, expected["escape_counts"]))
                  if actual != wanted), None)
    return {
        "schema": "useful-work.python-computation/v1",
        "job_spec_hash": sha(job_bytes), "artifact_result_hash": sha(result_bytes),
        "recomputed_result_hash": sha(canonical_bytes(expected)),
        "matched": first is None, "first_mismatch": first,
    }


def main():
    require(len(sys.argv) == 2 and sys.argv[1] in ("render", "verify", "sample"),
            "Usage: julia_q24.py render|verify|sample < request.json")
    request = load_json(sys.stdin.buffer.read(16 * 1024 * 1024 + 1))
    if sys.argv[1] == "render":
        keys(request, ["jobs"], "INVALID_RENDER_REQUEST")
        require(type(request["jobs"]) is list and len(request["jobs"]) <= 256,
                "INVALID_JOB_BATCH")
        output = [{"result": result, "result_hash": sha(canonical_bytes(result))}
                  for result in (render(job) for job in request["jobs"])]
    elif sys.argv[1] == "verify":
        keys(request, ["job_base64", "result_base64"], "INVALID_VERIFY_REQUEST")
        output = verify(base64.b64decode(request["job_base64"], validate=True),
                        base64.b64decode(request["result_base64"], validate=True))
    else:
        keys(request, ["job_base64", "indices"], "INVALID_SAMPLE_REQUEST")
        output = sample_job(base64.b64decode(request["job_base64"], validate=True), request["indices"])
    if sys.argv[1] != "render":
        output["implementation"] = {
            "id": "useful-work/python-q24/v1", "runtime": "Python " + platform.python_version(),
            "source_sha256": sha(Path(__file__).read_bytes()),
        }
    print(json.dumps(output, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, TypeError, KeyError, OverflowError) as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
