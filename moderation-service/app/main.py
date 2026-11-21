import asyncio
import io
import os
import secrets
import tempfile
import warnings
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from nudenet import NudeDetector

MAX_IMAGE_BYTES = 10 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 25_000_000

API_KEY = os.getenv("API_KEY", "")

THRESHOLDS = {
    "FEMALE_BREAST_EXPOSED": float(os.getenv("THRESHOLD_BREAST", "0.30")),
    "MALE_BREAST_EXPOSED": float(os.getenv("THRESHOLD_BREAST", "0.30")),
    "FEMALE_GENITALIA_EXPOSED": float(os.getenv("THRESHOLD_GENITALIA", "0.30")),
    "MALE_GENITALIA_EXPOSED": float(os.getenv("THRESHOLD_GENITALIA", "0.30")),
    "BUTTOCKS_EXPOSED": float(os.getenv("THRESHOLD_BUTTOCKS", "0.40")),
    "ANUS_EXPOSED": float(os.getenv("THRESHOLD_ANUS", "0.45")),
}

detector = None
detection_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector

    if not API_KEY:
        raise RuntimeError("API_KEY must be configured.")

    detector = NudeDetector()
    yield
    detector = None


app = FastAPI(
    title="LovyDate Image Moderation",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "model": "NudeNet"}


@app.post("/v1/nudity/upload")
async def check_image(
    file: UploadFile = File(...),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
):
    if not x_api_key or not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized")

    data = await file.read(MAX_IMAGE_BYTES + 1)
    await file.close()

    if not data:
        raise HTTPException(status_code=400, detail="Empty image.")

    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 10 MB.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)

            with Image.open(io.BytesIO(data)) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"}:
                    raise HTTPException(
                        status_code=415,
                        detail="Unsupported image format.",
                    )
                image_format = image.format
                image.verify()

    except HTTPException:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError,
            Image.DecompressionBombWarning, OSError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid image.")

    suffix = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}[image_format]

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp.write(data)
            temp_path = temp.name

        async with detection_lock:
            detections = await asyncio.to_thread(detector.detect, temp_path)

        flagged = [
            item for item in detections
            if item.get("class") in THRESHOLDS
            and float(item.get("score", 0)) >= THRESHOLDS[item["class"]]
        ]

        regions = sorted({item["class"] for item in flagged})
        score = max(
            (float(item.get("score", 0)) for item in flagged),
            default=0.0,
        )

        return {
            "is_nude": bool(flagged),
            "nudity_score": round(score, 4),
            "detected_regions": regions,
        }

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Image moderation unavailable.",
        )
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)
