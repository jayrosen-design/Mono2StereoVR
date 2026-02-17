"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Player360 from "@/components/Player360";

type Job = {
  id: string;
  status: string;
  sourceType: "upload" | "url";
  sourceRef: string;
  ownershipConfirmed: boolean;
  streamUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function PlayerPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stereoEnabled, setStereoEnabled] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [regularUiVisible, setRegularUiVisible] = useState(true);
  const [cardboardMode, setCardboardMode] = useState(false);
  const [cardboardUiVisible, setCardboardUiVisible] = useState(true);
  const [commandSignals, setCommandSignals] = useState({
    left: 0,
    right: 0,
    up: 0,
    down: 0,
    gyro: 0,
    recenter: 0,
  });

  function signal(action: "left" | "right" | "up" | "down" | "gyro" | "recenter") {
    setCommandSignals((prev) => ({ ...prev, [action]: prev[action] + 1 }));
  }

  async function toggleCardboardMode() {
    const nextValue = !cardboardMode;
    setCardboardMode(nextValue);
    setCardboardUiVisible(true);

    if (nextValue) {
      setStereoEnabled(true);
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
      }
      return;
    }

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
      }
    }
  }

  const cardboardButtonStyle: CSSProperties = {
    background: "rgba(22, 27, 34, 0.55)",
    border: "1px solid rgba(139, 148, 158, 0.35)",
    backdropFilter: "blur(3px)",
  };

  const regularButtonStyle: CSSProperties = {
    background: "rgba(22, 27, 34, 0.6)",
    border: "1px solid rgba(139, 148, 158, 0.35)",
  };

  useEffect(() => {
    if (!jobId) return;

    let canceled = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/jobs/${jobId}`);
        if (!res.ok) {
          throw new Error("Job not found");
        }
        const data = (await res.json()) as Job;
        if (!canceled) setJob(data);
      } catch (err) {
        if (!canceled) setError(err instanceof Error ? err.message : "Failed to load job");
      }
    }

    load();
    const interval = setInterval(load, 3000);
    return () => {
      canceled = true;
      clearInterval(interval);
    };
  }, [jobId]);

  if (cardboardMode) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#000",
        }}
      >
        <div style={{ width: "100vw", height: "100vh" }}>
          <Player360
            src={job?.streamUrl ?? undefined}
            stereoEnabled
            fillContainer
            commandSignals={commandSignals}
            fitMode="cover"
          />
        </div>

        {cardboardUiVisible ? (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              flexWrap: "wrap",
              zIndex: 2,
            }}
          >
            <button className="secondary" style={cardboardButtonStyle} onClick={toggleCardboardMode}>
              Exit Cardboard
            </button>
            <button style={cardboardButtonStyle} onClick={() => signal("recenter")}>
              Recenter
            </button>
            <button className="secondary" style={cardboardButtonStyle} onClick={() => signal("gyro")}>
              Enable Gyro
            </button>
            <button
              className="secondary"
              style={cardboardButtonStyle}
              onClick={() => setCardboardUiVisible(false)}
            >
              Hide UI
            </button>
            <span className="muted" style={{ color: "#fff" }}>
              {job ? `Status: ${job.status}` : "Loading job..."}
            </span>
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              zIndex: 2,
            }}
          >
            <button style={cardboardButtonStyle} onClick={() => setCardboardUiVisible(true)}>
              Show UI
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ width: "100vw", height: "100%" }}>
          <Player360
            src={job?.streamUrl ?? undefined}
            stereoEnabled={stereoEnabled}
            fillContainer
            commandSignals={commandSignals}
            fitMode="cover"
          />
        </div>
      </div>

      {regularUiVisible ? (
        <div
          style={{
            borderTop: "1px solid #30363d",
            background: "rgba(0, 0, 0, 0.55)",
            backdropFilter: "blur(3px)",
            padding: "0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
            alignItems: "center",
          }}
        >
          <div className="row" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            <Link href="/" className="muted" style={{ color: "#fff" }}>
              ← Back
            </Link>
            <button className="secondary" style={regularButtonStyle} onClick={() => setStereoEnabled((prev) => !prev)}>
              {stereoEnabled ? "Disable Stereo" : "Enable Stereo"}
            </button>
            <button style={regularButtonStyle} onClick={toggleCardboardMode}>Cardboard</button>
            <button className="secondary" style={regularButtonStyle} onClick={() => setControlsVisible((prev) => !prev)}>
              {controlsVisible ? "Hide Controls" : "Show Controls"}
            </button>
            <button className="secondary" style={regularButtonStyle} onClick={() => signal("recenter")}>
              Recenter View
            </button>
            <button style={regularButtonStyle} onClick={() => signal("gyro")}>Enable Gyro</button>
            <button className="secondary" style={regularButtonStyle} onClick={() => setRegularUiVisible(false)}>
              Hide UI
            </button>
          </div>

          {controlsVisible ? (
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="secondary" style={regularButtonStyle} onClick={() => signal("left")}>
                ←
              </button>
              <button className="secondary" style={regularButtonStyle} onClick={() => signal("up")}>
                ↑
              </button>
              <button className="secondary" style={regularButtonStyle} onClick={() => signal("down")}>
                ↓
              </button>
              <button className="secondary" style={regularButtonStyle} onClick={() => signal("right")}>
                →
              </button>
            </div>
          ) : null}

          <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            <span className="muted" style={{ color: "#fff" }}>
              {job ? `Status: ${job.status}` : "Loading job..."}
            </span>
            {job?.errorMessage ? <span style={{ color: "#ff7b72" }}>{job.errorMessage}</span> : null}
            {error && <span style={{ color: "#ff7b72" }}>{error}</span>}
          </div>
        </div>
      ) : (
        <div
          style={{
            position: "fixed",
            left: 12,
            bottom: 12,
            zIndex: 2,
          }}
        >
          <button style={regularButtonStyle} onClick={() => setRegularUiVisible(true)}>
            Show UI
          </button>
        </div>
      )}
    </div>
  );
}
