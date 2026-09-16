"""Private CPU face service. Does not persist images or infer personal attributes."""
import base64
import os
import secrets
import threading
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
LOCK = threading.Lock()
MODELS = Path(os.getenv("FACE_MODELS_DIR", Path(__file__).parent / "models"))
_detector = _recognizer = None

class Scan(BaseModel):
    frames: list[str] = Field(min_length=3, max_length=3)
    direction: Literal["left", "right"]

@app.middleware("http")
async def authenticate_and_bound(request: Request, call_next):
    from starlette.responses import JSONResponse
    secret = os.getenv("FACE_SERVICE_KEY", "")
    if len(secret) < 32:
        return JSONResponse({"error": "Service not configured"}, status_code=503)
    if not secrets.compare_digest(request.headers.get("authorization", ""), "Bearer " + secret):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    # Bound streamed payloads too; Content-Length is not trusted.
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 1800000:
            return JSONResponse({"error": "Request too large"}, status_code=413)
    request._body = bytes(body)
    return await call_next(request)

def models():
    global _detector, _recognizer
    if _detector is None:
        _detector = cv2.FaceDetectorYN.create(str(MODELS / "yunet.onnx"), "", (640, 480), 0.92, 0.3, 100)
        _recognizer = cv2.FaceRecognizerSF.create(str(MODELS / "sface.onnx"), "")
    return _detector, _recognizer

def decode(data: str):
    if not data.startswith("data:image/jpeg;base64,") or len(data) > 550000:
        raise ValueError("Invalid frame")
    binary = base64.b64decode(data.split(",", 1)[1], validate=True)
    if len(binary) > 400000:
        raise ValueError("Frame too large")
    # Inspect JPEG dimensions before allocating a potentially enormous decoded image.
    from PIL import Image
    import io
    with Image.open(io.BytesIO(binary)) as header:
        w, h = header.size
        if w < 240 or h < 180 or w > 1280 or h > 1280:
            raise ValueError("Invalid dimensions")
    image = cv2.imdecode(np.frombuffer(binary, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image")
    return image

def features(image):
    detector, recognizer = models()
    h, w = image.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(image)
    if faces is None or len(faces) != 1:
        raise ValueError("Exactly one face is required")
    face = faces[0]
    x, y, fw, fh = face[:4]
    if fw < 90 or fh < 90 or x < 0 or y < 0 or x + fw > w or y + fh > h:
        raise ValueError("Face must be clearly visible")
    crop = image[max(0, int(y)):int(y + fh), max(0, int(x)):int(x + fw)]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    if cv2.Laplacian(gray, cv2.CV_64F).var() < 30 or not 35 <= gray.mean() <= 225:
        raise ValueError("Use better lighting and keep still")
    aligned = recognizer.alignCrop(image, face)
    vector = recognizer.feature(aligned).flatten().astype(float)
    vector /= np.linalg.norm(vector)
    # YuNet: right eye, left eye, nose, mouth landmarks. Normalize nose position by eye separation.
    eyes = sorted([face[4:6], face[6:8]], key=lambda p: p[0])
    separation = float(eyes[1][0] - eyes[0][0])
    if separation < 20:
        raise ValueError("Face too small")
    yaw = float((face[8] - (eyes[0][0] + eyes[1][0]) / 2) / separation)
    return vector, yaw

@app.post("/v1/embedding")
def embedding(scan: Scan):
    try:
        with LOCK:
            rows = [features(decode(frame)) for frame in scan.frames]
        first, middle, last = rows
        if np.dot(first[0], middle[0]) < 0.5 or np.dot(first[0], last[0]) < 0.6:
            raise ValueError("Keep the same person in view")
        delta = middle[1] - first[1]
        expected = 1 if scan.direction == "left" else -1
        if delta * expected < 0.12 or abs(last[1] - first[1]) > 0.10 or abs(first[1]) > 0.25:
            raise ValueError("Head-turn check failed")
        vector = first[0] + last[0]
        vector /= np.linalg.norm(vector)
        return {"vector": vector.tolist(), "model": "sface-2021dec", "motionPassed": True}
    except (ValueError, cv2.error, OSError):
        raise HTTPException(422, "Face scan failed; use staff check-in") from None
