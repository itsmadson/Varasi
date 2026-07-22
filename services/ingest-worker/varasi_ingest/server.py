"""HTTP surface for ingestion, so rasters can be added from the dashboard.

POST /ingest runs a metadata-first ingest of one source into a collection and
returns counts. The control-plane proxies to this service.
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .config import Settings
from .pipeline import ingest_source

app = FastAPI(title="Varasi Ingest", version="0.1.0")


class IngestRequest(BaseModel):
    uri: str
    collection: str
    datetime: Optional[str] = None
    properties: Optional[dict] = None
    with_thumbnail: bool = True


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "varasi-ingest"}


@app.post("/ingest")
def ingest(req: IngestRequest) -> dict[str, object]:
    if not req.uri or not req.collection:
        raise HTTPException(status_code=400, detail="uri and collection required")
    try:
        res = ingest_source(
            req.uri,
            req.collection,
            cfg=Settings(),
            datetime_str=req.datetime,
            properties=req.properties,
            with_thumbnail=req.with_thumbnail,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"ingest failed: {exc}")
    return {
        "collection": res.collection,
        "ingested": res.ingested,
        "failed": res.failed,
        "errors": res.errors[:5],
    }
