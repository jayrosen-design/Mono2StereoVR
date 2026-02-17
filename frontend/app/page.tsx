"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function HomePage() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (file) return true;
    if (videoUrl.trim().length > 0) return disclaimerAccepted;
    return false;
  }, [file, videoUrl, disclaimerAccepted, loading]);

  async function createFromUrl(e: FormEvent) {
    e.preventDefault();
    if (!videoUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/ingest/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoUrl, ownershipConfirmed: disclaimerAccepted }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to create job from URL");
      }

      const job = await res.json();
      router.push(`/player/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function createFromUpload() {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/api/v1/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Upload failed");
      }

      const job = await res.json();
      router.push(`/player/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ textAlign: "center" }}>
      <img src="/banner.png" alt="Mono2StereoVR Banner" style={{ 
        width: "100%", 
        maxWidth: "800px", 
        borderRadius: "12px",
        border: "1px solid #00d9ff",
        boxShadow: "0 0 15px rgba(0, 217, 255, 0.3)",
        marginBottom: "2rem"
      }} />
      <p className="muted" style={{ fontSize: "1.1rem", marginBottom: "2rem" }}>Convert monoscopic 360° videos to stereoscopic VR</p>

      <div className="card">
        <h2>From URL (YouTube/Vimeo)</h2>
        <form onSubmit={createFromUrl}>
          <input
            type="url"
            placeholder="https://youtube.com/... or https://vimeo.com/..."
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
          />
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <input
              id="ownership"
              type="checkbox"
              checked={disclaimerAccepted}
              onChange={(e) => setDisclaimerAccepted(e.target.checked)}
            />
            <label htmlFor="ownership" className="muted">
              I confirm I own or have rights to process this content.
            </label>
          </div>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button type="submit" disabled={!canSubmit || !videoUrl.trim()}>
              {loading ? "Creating..." : "Create Job from URL"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>From File Upload</h2>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file && <p className="muted">Selected: {file.name}</p>}
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button onClick={createFromUpload} disabled={!canSubmit || !file}>
            {loading ? "Uploading..." : "Upload and Create Job"}
          </button>
        </div>
      </div>

      {error && <p style={{ color: "#ff7b72" }}>{error}</p>}
    </main>
  );
}
