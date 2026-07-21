"""Varasi AI worker — change-detection inference over COG pairs."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException

from .algorithms import list_algorithms
from .config import get_settings
from .detect import run_detection
from .schemas import DetectRequest, DetectResponse

app = FastAPI(title="Varasi AI Worker", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict[str, object]:
    return {"status": "ok", "service": "varasi-ai", "algorithms": list_algorithms()}


@app.get("/algorithms")
def algorithms() -> dict[str, list[str]]:
    return {"algorithms": list_algorithms()}


@app.post("/detect", response_model=DetectResponse)
def detect(req: DetectRequest) -> DetectResponse:
    try:
        return run_detection(req, get_settings())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # upstream read / model errors
        raise HTTPException(status_code=502, detail=f"detection failed: {exc}")
