"""Download the official, revision-pinned OpenCV models and verify their hashes."""
from pathlib import Path
import hashlib
import urllib.request
ROOT = Path(__file__).parent / "models"
REVISION = "47534e27c9851bb1128ccc0102f1145e27f23f98"
MODELS = [
    ("face_detection_yunet/face_detection_yunet_2023mar.onnx", "yunet.onnx", "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"),
    ("face_recognition_sface/face_recognition_sface_2021dec.onnx", "sface.onnx", "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"),
]
if __name__ == "__main__":
    ROOT.mkdir(exist_ok=True)
    for upstream, name, checksum in MODELS:
        target = ROOT / name
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == checksum:
            continue
        url = f"https://media.githubusercontent.com/media/opencv/opencv_zoo/{REVISION}/models/{upstream}"
        data = urllib.request.urlopen(url, timeout=60).read(50000000)
        if hashlib.sha256(data).hexdigest() != checksum:
            raise RuntimeError(f"Checksum mismatch: {name}")
        target.write_bytes(data)
        license_url = f"https://raw.githubusercontent.com/opencv/opencv_zoo/{REVISION}/models/{upstream.split('/')[0]}/LICENSE"
        (ROOT / f"{name}.LICENSE").write_bytes(urllib.request.urlopen(license_url, timeout=60).read())
        print(f"Verified {name}", flush=True)
