"""Owned workstation worker. Only bounded metadata leaves this process.

Requests and receipts persist before external work. A transport interruption
never resubmits a payment: get_task_result collects only the recorded run id.
"""
import base64
import hashlib
import ipaddress
import json
import mimetypes
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import fcntl
import shutil

os.umask(0o077)
ROOT = Path(sys.argv[1])
REQUEST = json.loads((ROOT / "request.json").read_text())
STATE = ROOT / "state.json"
MAX_BYTES = 256 * 1024 ** 2
WORK_BYTES = 1024 ** 3
DISK_HEADROOM = 512 * 1024 ** 2
LOCK = (ROOT / "worker.lock").open("a")
try:
    fcntl.flock(LOCK, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    raise SystemExit(0)
(ROOT / "worker.pid").write_text(str(os.getpid()))


def persist(path, value):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value))
    os.replace(temp, path)


def state(phase, **kwargs):
    previous = json.loads(STATE.read_text()) if STATE.exists() else {}
    previous.update(phase=phase, **kwargs)
    persist(STATE, previous)


def reserve_space():
    """Serialize reservations on this workstation before any paid submission."""
    with (ROOT.parent / ".capacity.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        future = 0
        own_bytes = 0
        for folder in ROOT.parent.iterdir():
            if not folder.is_dir() or folder.is_symlink():
                continue
            used = sum(file.stat().st_size for file in folder.rglob("*") if file.is_file() and not file.is_symlink())
            if folder == ROOT:
                own_bytes = used
            elif (folder / "space.json").exists():
                reservation = json.loads((folder / "space.json").read_text())
                future += max(0, int(reservation["bytes"]) - used)
        if shutil.disk_usage(ROOT.parent).free < DISK_HEADROOM + future + max(0, WORK_BYTES - own_bytes):
            raise ValueError("media_disk_space_required")
        persist(ROOT / "space.json", {"bytes": WORK_BYTES})


def release_space():
    (ROOT / "space.json").unlink(missing_ok=True)


def safe_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError("unsupported_media_url")
    if parsed.hostname not in REQUEST["allowedHosts"]:
        raise ValueError("unsupported_media_host")
    addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    if any(not ipaddress.ip_address(address[4][0]).is_global for address in addresses):
        raise ValueError("private_media_host")
    return url


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, url):
        safe_url(url)
        return super().redirect_request(req, fp, code, msg, headers, url)


def download(url, output):
    safe_url(url)
    opener = urllib.request.build_opener(SafeRedirect())
    request = urllib.request.Request(url, headers={"User-Agent": "RobynCreativeStudio/0.1 (https://robyn.academy)"})
    partial = output.with_suffix(".part")
    with opener.open(request, timeout=90) as response, partial.open("wb") as stream:
        if int(response.headers.get("Content-Length", "0")) > MAX_BYTES:
            raise ValueError("media_too_large")
        size = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValueError("media_too_large")
            stream.write(chunk)
    if not size:
        raise ValueError("media_empty")
    os.replace(partial, output)


class ManagedSpendRefused(Exception):
    pass


def rpc(name, arguments):
    token = os.environ.get("AGENT37_MANAGED_TOKEN", "")
    url = os.environ.get("AGENT37_PERFLO_MCP_URL", "")
    if not token or url != "https://api.agent37.com/mcp/perflo":
        raise ValueError("managed_perflo_unavailable")
    payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json, text/event-stream"})
    try:
        with urllib.request.urlopen(req, timeout=260) as response:
            raw = response.read(32 * 1024 * 1024).decode()
    except urllib.error.HTTPError as error:
        if name == "pay" and error.code == 402:
            try:
                refusal = json.loads(error.read(16384))
                reason = next((item for item in walk(refusal) if isinstance(item, str) and item in ("instance_budget_exhausted", "insufficient_balance")), None)
            except (ValueError, StopIteration):
                reason = None
            if reason:
                raise ManagedSpendRefused(reason) from None
        raise
    try:
        envelope = json.loads(raw)
    except json.JSONDecodeError:
        messages = [json.loads(line[5:].strip()) for line in raw.splitlines() if line.startswith("data:")]
        envelope = next(message for message in messages if message.get("id") == 1)
    if envelope.get("error"):
        raise ValueError("perflo_protocol_error")
    result = envelope.get("result", {})
    # Keep provider data on disk; never return inline media or tokens to Vercel.
    if result.get("isError"):
        persist(ROOT / "provider-error.json", result)
        raise ValueError("perflo_tool_error")
    if result.get("structuredContent") is not None:
        return result["structuredContent"]
    for content in result.get("content", []):
        if content.get("type") == "text":
            try:
                return json.loads(content["text"])
            except json.JSONDecodeError:
                pass
    raise ValueError("perflo_result_unrecognized")


def walk(value):
    yield value
    if isinstance(value, dict):
        for item in value.values():
            yield from walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk(item)


def reported_cost(result):
    # A price quote or reserved ceiling is not an actual charge.
    if isinstance(result, dict) and result.get("chargeIsFinal") is False:
        return None
    from decimal import Decimal
    for item in walk(result):
        if not isinstance(item, dict):
            continue
        for key in ("actualCharge", "charged", "charge"):
            money = item.get(key)
            if isinstance(money, dict) and money.get("currency") == "USD" and "amount" in money:
                return int(Decimal(str(money["amount"])) * 1000000)
        usage = item.get("usage")
        if isinstance(usage, dict) and isinstance(usage.get("cost"), (str, int, float)):
            return int(Decimal(str(usage["cost"])) * 1000000)
    return None


def output_from(result, destination):
    def inline_bytes(encoded):
        if len(encoded) > (MAX_BYTES * 4 // 3 + 8):
            raise ValueError("media_too_large")
        decoded = base64.b64decode(encoded, validate=True)
        if not decoded or len(decoded) > MAX_BYTES:
            raise ValueError("media_empty" if not decoded else "media_too_large")
        partial = destination.with_suffix(".part")
        partial.write_bytes(decoded)
        os.replace(partial, destination)
    for item in walk(result):
        if not isinstance(item, dict):
            continue
        inline = item.get("inlineData")
        if isinstance(inline, dict) and inline.get("data"):
            inline_bytes(inline["data"])
            return True
        for key in ("videoUrl", "video_url", "audio_url", "image_url", "downloadUrl", "download_url", "video", "audio", "url"):
            url = item.get(key)
            if not isinstance(url, str):
                continue
            if url.startswith("data:"):
                head, encoded = url.split(",", 1)
                if ";base64" not in head:
                    raise ValueError("unsupported_inline_media")
                inline_bytes(encoded)
                return True
            if urllib.parse.urlsplit(url).hostname in REQUEST["allowedHosts"]:
                download(url, destination)
                return True
    return False


def generate(original):
    receipt = ROOT / "provider-receipt.json"
    if receipt.exists():
        state("running", paymentSubmitted=True)
        result = json.loads(receipt.read_text())
    elif REQUEST.get("providerJobId"):
        state("running", paymentSubmitted=True, providerJobId=REQUEST["providerJobId"])
        result = rpc("get_task_result", {"id": REQUEST["providerJobId"]})
        persist(receipt, result)
    elif (ROOT / "submission.json").exists() or REQUEST.get("reconcileOnly"):
        # We cannot distinguish a lost reply from an accepted payment. Preserve
        # the reservation and request identity for deliberate reconciliation.
        state("uncertain", paymentSubmitted=True, errorCode="payment_outcome_unknown")
        return False
    else:
        spec = REQUEST["generation"]
        catalog = rpc("list_services", {"query": spec["service"], "limit": 12})
        vendor = next((vendor for vendor in catalog.get("vendors", []) if isinstance(vendor, dict) and vendor.get("slug") == spec["service"] and vendor.get("payable")), None)
        if vendor is None:
            raise ValueError("perflo_service_unavailable")
        from decimal import Decimal
        if vendor.get("price", {}).get("currency") != "USD" or int(Decimal(vendor["price"]["amount"]) * 1000000) > spec["maxCostMicros"]:
            raise ValueError("perflo_price_exceeds_ceiling")
        body = dict(spec.get("settings", {}))
        if spec["service"] == "paysponge-gemini-image":
            body = {"contents": [{"parts": [{"text": spec["prompt"]}]}]}
        elif spec["service"] == "blockrun-tts":
            body["input"] = spec["prompt"]
        else:
            body["prompt"] = spec["prompt"]
        if spec["service"] == "blockrun-image-edit":
            source = ROOT / "edit-source"
            download(REQUEST["inputUrl"], source)
            if source.stat().st_size > 10 * 1024 ** 2:
                raise ValueError("edit_source_too_large")
            body["image"] = "data:" + REQUEST["inputMime"] + ";base64," + base64.b64encode(source.read_bytes()).decode()
        args = {"slug": spec["service"], "input": body, "maxCharge": {"amount": format(Decimal(spec["maxCostMicros"]) / 1000000, "f"), "currency": "USD"}, "idempotencyKey": "robyn-media-" + REQUEST["jobId"]}
        persist(ROOT / "submission.json", {"service": spec["service"], "idempotencyKey": args["idempotencyKey"]})
        state("submitting", paymentSubmitted=True)
        try:
            result = rpc("pay", args)
        except ManagedSpendRefused as error:
            # A documented pre-payment refusal is known zero cost. Preserve
            # evidence and finish this job; never retry pay in this operation.
            os.replace(ROOT / "submission.json", ROOT / "refused-submission.json")
            persist(ROOT / "provider-refusal.json", {"reason": str(error)})
            state("failed", paymentSubmitted=False, actualMicros=0, errorCode=str(error))
            return False
        persist(receipt, result)
    for _ in range(180):
        handle = next((item for item in walk(result) if isinstance(item, str) and item.startswith("run_") and len(item) < 160), None)
        model = next((item["model"] for item in walk(result) if isinstance(item, dict) and isinstance(item.get("model"), str) and len(item["model"]) < 160), None)
        if handle or model:
            state("running", errorCode=None, **({"providerJobId": handle} if handle else {}), **({"providerModel": model} if model else {}))
        if isinstance(result, dict) and handle:
            state("running", receipt={key: result[key] for key in ("runId", "transactionId", "slug", "status", "charged", "chargeIsFinal", "createdAt", "endedAt") if key in result})
        cost = reported_cost(result)
        if cost is not None:
            state("running", actualMicros=cost)
        if output_from(result, original):
            return True
        if isinstance(result, dict) and result.get("terminal") and result.get("delivery", {}).get("status") not in ("pending", "queued", "processing", "running"):
            state("uncertain", errorCode="provider_delivery_unrecognized")
            return False
        if not handle:
            state("uncertain", errorCode="provider_delivery_unrecognized")
            return False
        state("running", providerJobId=handle)
        time.sleep(10)
        result = rpc("get_task_result", {"id": handle})
        persist(receipt, result)
    state("uncertain", errorCode="provider_still_running")
    return False


def settle():
    """Read only the existing task/receipt. Never pay, download or upload."""
    receipt = ROOT / "provider-receipt.json"
    result = json.loads(receipt.read_text()) if receipt.exists() else {}
    handle = REQUEST.get("providerJobId") or next((item for item in walk(result) if isinstance(item, str) and item.startswith("run_") and len(item) < 160), None)
    cost = reported_cost(result)
    if cost is None and handle:
        result = rpc("get_task_result", {"id": handle})
        persist(receipt, result)
        cost = reported_cost(result)
    summary = {key: result[key] for key in ("runId", "transactionId", "slug", "status", "charged", "chargeIsFinal", "createdAt", "endedAt") if key in result} if isinstance(result, dict) else {}
    if cost is not None:
        state("settled", actualMicros=cost, paymentSubmitted=True, receipt=summary, errorCode=None)
    elif handle:
        state("settlement_pending", providerJobId=handle, paymentSubmitted=True, errorCode="payment_settlement_pending")
    else:
        state("uncertain", paymentSubmitted=True, errorCode="payment_outcome_unknown")


def upload():
    class NoStorageRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, url):
            raise ValueError("unsupported_storage_redirect")
    opener = urllib.request.build_opener(NoStorageRedirect())
    transfers = json.loads((ROOT / "transfers.json").read_text())
    manifest = json.loads((ROOT / "files.json").read_text())
    positions_file = ROOT / "upload-positions.json"
    positions = json.loads(positions_file.read_text()) if positions_file.exists() else {}
    origin = urllib.parse.urlsplit(transfers["resumableEndpoint"])
    if origin.scheme != "https" or origin.hostname not in transfers["allowedStorageHosts"] or origin.username or origin.password or origin.port not in (None, 443):
        raise ValueError("unsupported_storage_host")
    for transfer in transfers["transfers"]:
        if transfer["uploaded"]:
            continue
        file = next(file for file in manifest if file["path"] == transfer["path"])
        local = ROOT / file["localFile"]
        headers = {"Tus-Resumable": "1.0.0", "x-signature": transfer["token"], "apikey": transfers["publicApiKey"], "x-upsert": "false"}
        url = positions.get(transfer["storageKey"])
        if url and (urllib.parse.urlsplit(url).netloc != origin.netloc or urllib.parse.urlsplit(url).scheme != "https"):
            raise ValueError("unsupported_storage_host")
        offset = 0
        if url:
            try:
                with opener.open(urllib.request.Request(url, method="HEAD", headers=headers), timeout=60) as response:
                    offset = int(response.headers["Upload-Offset"])
            except urllib.error.HTTPError as error:
                if error.code not in (404, 410):
                    raise
                url = None
        if not url:
            metadata = {"bucketName": transfers["bucket"], "objectName": transfer["storageKey"], "contentType": transfer["mimeType"], "cacheControl": "3600"}
            create_headers = dict(headers, **{"Upload-Length": str(file["bytes"]), "Upload-Metadata": ",".join(key + " " + base64.b64encode(value.encode()).decode() for key, value in metadata.items())})
            with opener.open(urllib.request.Request(transfers["resumableEndpoint"], data=b"", method="POST", headers=create_headers), timeout=60) as response:
                url = urllib.parse.urljoin(transfers["resumableEndpoint"], response.headers["Location"])
            if urllib.parse.urlsplit(url).netloc != origin.netloc or urllib.parse.urlsplit(url).scheme != "https":
                raise ValueError("unsupported_storage_host")
            positions[transfer["storageKey"]] = url
            persist(positions_file, positions)
        if offset < 0 or offset > file["bytes"]:
            raise ValueError("invalid_upload_offset")
        with local.open("rb") as source:
            source.seek(offset)
            while offset < file["bytes"]:
                chunk = source.read(6 * 1024 * 1024)
                patch_headers = dict(headers, **{"Upload-Offset": str(offset), "Content-Type": "application/offset+octet-stream"})
                with opener.open(urllib.request.Request(url, data=chunk, method="PATCH", headers=patch_headers), timeout=90) as response:
                    next_offset = int(response.headers["Upload-Offset"])
                if next_offset != offset + len(chunk):
                    raise ValueError("invalid_upload_offset")
                offset = next_offset
        state("uploading")
    state("uploaded")


def cleanup():
    """Remove only regenerable local copies after server-confirmed commit.

    Receipts, submission fences and request identity survive cleanup forever
    until an operator applies a separate evidence-retention policy.
    """
    proof = json.loads((ROOT / "committed.json").read_text())
    current = json.loads(STATE.read_text())
    if not proof.get("revisionId") or not proof.get("billingSettled") or current.get("phase") not in ("uploaded", "settled", "cleaned"):
        raise ValueError("media_cleanup_not_ready")
    manifest = json.loads((ROOT / "files.json").read_text()) if (ROOT / "files.json").exists() else []
    names = {"original", "original.part", "preview.png", "editing.wav", "editing.mp4", "attribution.txt", "transfers.json", "upload-positions.json"}
    if any(file.get("localFile") not in names for file in manifest):
        raise ValueError("invalid_cleanup_path")
    for name in names:
        if not isinstance(name, str) or Path(name).name != name or name in (".", "..") or "/" in name or "\\" in name:
            raise ValueError("invalid_cleanup_path")
    freed = 0
    for name in names:
        file = ROOT / name
        if file.is_file() and not file.is_symlink():
            freed += file.stat().st_size
            file.unlink()
    state("cleaned", cleanedBytes=freed, errorCode=None)


def package():
    reserve_space()
    original = ROOT / "original"
    if REQUEST.get("reconcileOnly"):
        state("running", paymentSubmitted=True)
    if not original.exists():
        if REQUEST["operation"] == "generate":
            if not generate(original):
                return
        else:
            state("running")
            download(REQUEST["sourceUrl"], original)
    state("processing")
    if original.stat().st_size > MAX_BYTES:
        raise ValueError("media_too_large")
    sha1 = hashlib.sha1()
    with original.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            sha1.update(chunk)
    if REQUEST.get("sourceSha1") and sha1.hexdigest() != REQUEST["sourceSha1"]:
        raise ValueError("source_hash_mismatch")
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(original)], capture_output=True, check=True, timeout=90)
    info = json.loads(probe.stdout)
    duration = float(info.get("format", {}).get("duration") or 0)
    if not __import__("math").isfinite(duration) or duration > 600:
        raise ValueError("media_duration_exceeds_pilot_limit")
    streams = info.get("streams", [])
    kind = REQUEST["kind"]
    if not any(stream.get("codec_type") == ("video" if kind == "image" else kind) for stream in streams):
        raise ValueError("media_type_mismatch")
    formats = info.get("format", {}).get("format_name", "")
    codec = next((s.get("codec_name") for s in streams if s.get("codec_type") == "video"), "")
    if kind == "image":
        extensions = {"png": "png", "mjpeg": "jpg", "webp": "webp", "gif": "gif", "tiff": "tiff"}
        if codec not in extensions or not any(fmt in formats for fmt in ("png_pipe", "jpeg_pipe", "webp_pipe", "gif", "image2", "tiff_pipe")):
            raise ValueError("image_codec_unsupported")
        extension = extensions[codec]
    elif kind == "audio":
        if any(s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic") for s in streams):
            raise ValueError("media_type_mismatch")
        extension = next((ext for fmt, ext in [("wav", "wav"), ("mp3", "mp3"), ("flac", "flac"), ("ogg", "ogg"), ("mov", "m4a")] if fmt in formats), None)
        if not extension:
            raise ValueError("audio_codec_unsupported")
    else:
        extension = "webm" if "webm" in formats or "matroska" in formats else "ogv" if "ogg" in formats else "mp4" if "mov" in formats else None
        if not extension:
            raise ValueError("video_codec_unsupported")
    files = [(original, "original/source." + extension, "master", mimetypes.guess_type("source." + extension)[0] or kind + "/octet-stream")]
    if kind == "image":
        files.append((original, "export/source." + extension, "export", files[0][3]))
    preview = ROOT / "preview.png"
    filter_args = ["-filter_complex", "showwavespic=s=960x240:colors=0xd9fa42"] if kind == "audio" else ["-vf", "scale=960:640:force_original_aspect_ratio=decrease"]
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(original), *filter_args, "-frames:v", "1", str(preview)], check=True, capture_output=True, timeout=120)
    files.append((preview, "preview/preview.png", "preview", "image/png"))
    if kind == "audio":
        proxy = ROOT / "editing.wav"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(original), "-vn", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", "-fs", str(MAX_BYTES), str(proxy)], check=True, capture_output=True, timeout=600)
        if proxy.stat().st_size >= MAX_BYTES: raise ValueError("media_proxy_too_large")
        files.append((proxy, "export/editing.wav", "export", "audio/wav"))
    elif kind == "video":
        proxy = ROOT / "editing.mp4"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(original), "-vf", "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2", "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-c:a", "aac", "-fs", str(MAX_BYTES), "-movflags", "+faststart", str(proxy)], check=True, capture_output=True, timeout=900)
        if proxy.stat().st_size >= MAX_BYTES: raise ValueError("media_proxy_too_large")
        files.append((proxy, "export/editing.mp4", "export", "video/mp4"))
    rights = ROOT / "attribution.txt"
    rights.write_text(REQUEST.get("attribution", "Generated media; see the immutable revision provenance for provider and inputs.") + "\nEditing proxies/previews were derived for this project. Retain source credit and identify further changes on delivery.\n")
    files.append((rights, "rights/attribution.txt", "dependency", "text/plain"))
    manifest = []
    for file, relative, role, mime in files:
        digest = hashlib.sha256()
        with file.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        manifest.append({"path": relative, "role": role, "mimeType": mime, "bytes": file.stat().st_size, "sha256": digest.hexdigest(), "localFile": file.name})
    persist(ROOT / "files.json", manifest)
    state("processing", files=[{k: v for k, v in file.items() if k != "localFile"} for file in manifest], metadata={"format": formats, "duration": info.get("format", {}).get("duration")})


if __name__ == "__main__":
    try:
        mode = sys.argv[2] if len(sys.argv) > 2 else "process"
        cleanup() if mode == "cleanup" else settle() if mode == "settle" else upload() if mode == "upload" else package()
    except Exception as error:
        # Never serialize an exception body, request, command line or credential.
        code = str(error) if isinstance(error, ValueError) and str(error).replace("_", "").isalnum() else "media_processing_failed"
        submitted = bool((ROOT / "submission.json").exists() or (ROOT / "provider-receipt.json").exists() or REQUEST.get("reconcileOnly") or REQUEST.get("providerJobId"))
        state(json.loads(STATE.read_text()).get("phase", "uploaded") if mode == "cleanup" else "upload_paused" if len(sys.argv) > 2 and sys.argv[2] == "upload" else "uncertain" if submitted else "failed", paymentSubmitted=submitted, errorCode=code)
    finally:
        # Existing bytes remain accounted by the filesystem; only unused future
        # capacity is released. A restart must reserve again before processing.
        release_space()
