from __future__ import annotations

import asyncio
import os
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, HttpUrl
from yt_dlp import YoutubeDL


STORAGE_ROOT = Path("/storage") if Path("/storage").exists() else Path(__file__).resolve().parents[2] / "storage"
UPLOADS_DIR = STORAGE_ROOT / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
URL_IMPORTS_DIR = STORAGE_ROOT / "url-imports"
URL_IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
BACKEND_PUBLIC_URL = os.getenv("BACKEND_PUBLIC_URL", "http://localhost:8000").rstrip("/")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Job:
    id: str
    status: str
    source_type: Literal["upload", "url"]
    source_ref: str
    ownership_confirmed: bool
    stream_url: str | None = None
    error_message: str | None = None
    created_at: str = field(default_factory=now_iso)
    updated_at: str = field(default_factory=now_iso)


class CreateUrlJobRequest(BaseModel):
    url: HttpUrl
    ownershipConfirmed: bool


class JobResponse(BaseModel):
    id: str
    status: str
    sourceType: Literal["upload", "url"]
    sourceRef: str
    ownershipConfirmed: bool
    streamUrl: str | None
    errorMessage: str | None
    createdAt: str
    updatedAt: str


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}

    def list(self) -> list[Job]:
        return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    def get(self, job_id: str) -> Job:
        job = self._jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        return job

    def create(self, *, source_type: Literal["upload", "url"], source_ref: str, ownership_confirmed: bool) -> Job:
        job = Job(
            id=str(uuid4()),
            status="queued",
            source_type=source_type,
            source_ref=source_ref,
            ownership_confirmed=ownership_confirmed,
        )
        self._jobs[job.id] = job
        return job

    def update_status(
        self,
        job_id: str,
        status: str,
        stream_url: str | None = None,
        error_message: str | None = None,
    ) -> None:
        job = self.get(job_id)
        job.status = status
        if stream_url is not None:
            job.stream_url = stream_url
        if error_message is not None:
            job.error_message = error_message
        job.updated_at = now_iso()


store = JobStore()

app = FastAPI(title="Mono2StereoVR API", version="0.1.0")
app.mount("/storage", StaticFiles(directory=STORAGE_ROOT), name="storage")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def to_response(job: Job) -> JobResponse:
    return JobResponse(
        id=job.id,
        status=job.status,
        sourceType=job.source_type,
        sourceRef=job.source_ref,
        ownershipConfirmed=job.ownership_confirmed,
        streamUrl=job.stream_url,
        errorMessage=job.error_message,
        createdAt=job.created_at,
        updatedAt=job.updated_at,
    )


def download_video_from_url(job_id: str, url: str) -> Path:
    job_dir = URL_IMPORTS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    outtmpl = str(job_dir / "%(id)s.%(ext)s")
    ydl_opts = {
        "outtmpl": outtmpl,
        "format": "bv*[height<=2160]+ba/b[height<=2160]/best",
        "merge_output_format": "mp4",
        "quiet": True,
        "noprogress": True,
        "nocheckcertificate": True,
    }

    with YoutubeDL(ydl_opts) as ydl:
        ydl.extract_info(url, download=True)

    candidates = sorted(
        [path for path in job_dir.glob("*") if path.is_file()],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        raise RuntimeError("No downloadable media file was produced from the URL")

    return candidates[0]


async def simulate_processing(job_id: str, stream_url: str | None = None) -> None:
    phases = [
        "downloading" if stream_url is None else "extracting",
        "depth_estimation",
        "stereo_synthesis",
        "encoding",
        "complete",
    ]

    for phase in phases:
        await asyncio.sleep(1.5)
        if phase == "complete":
            store.update_status(job_id, phase, stream_url=stream_url)
        else:
            store.update_status(job_id, phase)


async def process_url_job(job_id: str, url: str) -> None:
    try:
        store.update_status(job_id, "downloading")
        downloaded_file = await asyncio.to_thread(download_video_from_url, job_id, url)

        store.update_status(job_id, "depth_estimation")
        await asyncio.sleep(1.5)

        store.update_status(job_id, "stereo_synthesis")
        await asyncio.sleep(1.5)

        store.update_status(job_id, "encoding")
        await asyncio.sleep(1.0)

        stream_url = f"{BACKEND_PUBLIC_URL}/storage/url-imports/{job_id}/{downloaded_file.name}"
        store.update_status(job_id, "complete", stream_url=stream_url)
    except Exception as exc:
        store.update_status(job_id, "failed", error_message=str(exc))


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/ingest/url", response_model=JobResponse)
async def ingest_url(payload: CreateUrlJobRequest, background_tasks: BackgroundTasks) -> JobResponse:
    url = str(payload.url)
    if "youtube.com" in url or "youtu.be" in url:
        if not payload.ownershipConfirmed:
            raise HTTPException(status_code=400, detail="Ownership confirmation is required for YouTube URLs")

    if "vimeo.com" not in url and "youtube.com" not in url and "youtu.be" not in url:
        raise HTTPException(status_code=400, detail="Only YouTube or Vimeo URLs are accepted")

    job = store.create(source_type="url", source_ref=url, ownership_confirmed=payload.ownershipConfirmed)
    background_tasks.add_task(process_url_job, job.id, url)
    return to_response(job)


@app.post("/api/v1/upload", response_model=JobResponse)
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)) -> JobResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    job = store.create(source_type="upload", source_ref=file.filename, ownership_confirmed=True)

    suffix = Path(file.filename).suffix or ".mp4"
    output_path = UPLOADS_DIR / f"{job.id}{suffix}"

    with output_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    stream_url = f"{BACKEND_PUBLIC_URL}/storage/uploads/{output_path.name}"
    background_tasks.add_task(simulate_processing, job.id, stream_url)

    return to_response(job)


@app.get("/api/v1/jobs", response_model=list[JobResponse])
async def list_jobs() -> list[JobResponse]:
    return [to_response(job) for job in store.list()]


@app.get("/api/v1/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    try:
        job = store.get(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Job not found") from exc

    return to_response(job)
