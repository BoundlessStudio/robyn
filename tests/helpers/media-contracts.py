"""Exercise the real vendor-body builder and payment/recovery boundary."""
import ast
import base64
import json
import os
import tempfile
from pathlib import Path

source = Path(__file__).parents[2] / "src/studio/media-worker.py"
module = ast.parse(source.read_text(encoding="utf-8"))
definitions = ast.Module(body=[item for item in module.body if isinstance(item, ast.FunctionDef) or isinstance(item, ast.ClassDef) and item.name == "ManagedSpendRefused"], type_ignores=[])
with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    ns = {"json":json,"os":os,"base64":base64,"ROOT":root,"STATE":root/"state.json","MAX_BYTES":256*1024**2}
    exec(compile(definitions,str(source),"exec"),ns)
    build = ns["generation_body"]
    assert build({"service":"blockrun-ai-api-v1-audio-sound-effects","prompt":"Rain"}) == {"text":"Rain","duration_seconds":5,"response_format":"mp3"}
    assert build({"service":"paysponge-gemini-image","prompt":"A robin"}) == {"contents":[{"parts":[{"text":"A robin"}]}]}
    assert build({"service":"blockrun-image-edit","prompt":"Recolor"}) == {"prompt":"Recolor","model":"google/nano-banana","size":"1024x1024"}
    assert build({"service":"blockrun-tts","prompt":"Hello"}) == {"input":"Hello","voice":"sarah","model":"elevenlabs/flash-v2.5","response_format":"mp3","speed":1}
    assert build({"service":"blockrun-image-gen","prompt":"A robin"})["size"] == "1024x1024"
    assert build({"service":"treza-video","prompt":"A river"}) == {"prompt":"A river","model":"minimax-h3","seconds":5,"aspectRatio":"16:9"}
    for spec in [
        {"service":"unreviewed","prompt":"Hello"},
        {"service":"blockrun-ai-api-v1-audio-sound-effects","prompt":"x"*1001},
        {"service":"blockrun-image-gen","prompt":"Hello","settings":{"model":"google/nano-banana","size":"512x512"}},
        {"service":"blockrun-image-edit","prompt":"Hello","settings":{"image":"https://untrusted.test"}},
        {"service":"treza-video","prompt":"Hello","settings":{"seconds":90}},
    ]:
        try:
            build(spec)
            raise AssertionError("Invalid provider request must be rejected")
        except ValueError as error:
            assert str(error)=="media_request_contract_changed"
    calls=[]
    ns["REQUEST"]={"jobId":"exact-operation","generation":{"service":"blockrun-ai-api-v1-audio-sound-effects","prompt":"Rain","maxCostMicros":53501}}
    def rpc(name,args):
        calls.append((name,args))
        if name=="list_services":return {"vendors":[{"slug":"blockrun-ai-api-v1-audio-sound-effects","payable":True,"price":{"currency":"USD","amount":"0.053501"}}]}
        assert name=="pay" and args["input"]=={"text":"Rain","duration_seconds":5,"response_format":"mp3"}
        assert args["idempotencyKey"]=="robyn-media-exact-operation"
        assert args["maxCharge"]=={"amount":"0.053501","currency":"USD"}
        return {"chargeIsFinal":True,"charged":{"currency":"USD","amount":"0.0535"},"data":[{"url":"data:audio/wav;base64,"+base64.b64encode(b"test output").decode()}]}
    ns["rpc"]=rpc
    assert ns["generate"](root/"original") is True
    assert (root/"original").read_bytes()==b"test output"
    ns["rpc"]=lambda *_: (_ for _ in ()).throw(AssertionError("Saved receipt must not call provider again"))
    assert ns["generate"](root/"original") is True
    assert [call[0] for call in calls]==["list_services","pay"]
    assert json.loads((root/"state.json").read_text())["actualMicros"]==53500
print("media request contracts and same-receipt recovery passed")
