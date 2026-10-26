"""Execute the real worker functions in isolation on Windows and Linux."""
import ast
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace

source = Path(__file__).parents[2] / "src/studio/media-worker.py"
module = ast.parse(source.read_text(encoding="utf-8"))
# The Linux entrypoint owns fcntl/process setup. Exercise its actual functions
# with temporary storage and a fail-closed provider, without importing that setup.
definitions = ast.Module(body=[item for item in module.body if isinstance(item, (ast.FunctionDef, ast.ClassDef)) and not isinstance(item, ast.ClassDef)], type_ignores=[])
with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    calls = []
    ns = {"json": json, "os": os, "ROOT": root, "STATE": root / "state.json", "REQUEST": {"reconcileOnly": True}}
    exec(compile(definitions, str(source), "exec"), ns)
    def provider(name, args):
        assert name == "get_task_result", "financial recovery must never pay"
        assert args == {"id": "run_known"}
        calls.append(name)
        return {"runId": "run_known", "chargeIsFinal": True, "charged": {"amount": "0.42", "currency": "USD"}}
    ns["rpc"] = provider
    ns["settle"]()
    assert json.loads(ns["STATE"].read_text())["phase"] == "uncertain" and calls == []
    ns["REQUEST"]["providerJobId"] = "run_known"
    ns["settle"]()
    assert json.loads(ns["STATE"].read_text())["actualMicros"] == 420000
    assert calls == ["get_task_result"]
    ns["settle"]()
    assert calls == ["get_task_result"], "restart reuses the final receipt"
    assert not (root / "original").exists() and not (root / "submission.json").exists()
    assert ns["reported_cost"]({"chargeIsFinal":False,"charged":{"amount":"1","currency":"USD"}}) is None
    assert ns["reported_cost"]({"price":{"amount":"1","currency":"USD"}}) is None
    (root / "provider-receipt.json").write_text(json.dumps({"runId":"run_known","chargeIsFinal":False}))
    ns["settle"]()
    assert len(calls) == 2
    # Reservations include other jobs' not-yet-written bytes. Existing bytes
    # are already included in the filesystem's free-space report.
    ns.update(WORK_BYTES=1000, DISK_HEADROOM=500, fcntl=SimpleNamespace(LOCK_EX=1,flock=lambda *_:None), shutil=SimpleNamespace(disk_usage=lambda _:SimpleNamespace(free=2400)))
    other = root / "other"
    other.mkdir()
    (other / "space.json").write_text(json.dumps({"bytes":1000}))
    current = root / "current"
    current.mkdir()
    ns["ROOT"] = current
    try:
        ns["reserve_space"]()
        raise AssertionError("overlapping reservations exceeded disk capacity")
    except ValueError as error:
        assert str(error) == "media_disk_space_required"
    ns["shutil"] = SimpleNamespace(disk_usage=lambda _:SimpleNamespace(free=3000))
    ns["reserve_space"]()
    assert (current / "space.json").exists()
    ns["release_space"]()
    assert not (current / "space.json").exists()
    # Committed-copy cleanup never removes receipts or submission fences.
    ns["Path"] = Path
    ns["STATE"] = current / "state.json"
    ns["state"]("uploaded")
    (current / "original").write_bytes(b"saved source")
    (current / "provider-receipt.json").write_text("retained receipt")
    (current / "submission.json").write_text("retained payment fence")
    (current / "files.json").write_text(json.dumps([{"localFile":"original"}]))
    (current / "committed.json").write_text(json.dumps({"revisionId":"saved-revision","billingSettled":False}))
    try:
        ns["cleanup"]()
        raise AssertionError("unsettled payment copies must survive")
    except ValueError:
        assert (current / "original").exists()
    (current / "committed.json").write_text(json.dumps({"revisionId":"saved-revision","billingSettled":True}))
    ns["cleanup"]()
    ns["cleanup"]()
    assert not (current / "original").exists()
    assert (current / "provider-receipt.json").read_text() == "retained receipt"
    assert (current / "submission.json").exists()
    (current / "files.json").write_text(json.dumps([{"localFile":"provider-receipt.json"}]))
    try:
        ns["cleanup"]()
        raise AssertionError("manifest cannot authorize deleting evidence")
    except ValueError:
        assert (current / "provider-receipt.json").exists()
print("settlement, capacity and retention regressions passed")
