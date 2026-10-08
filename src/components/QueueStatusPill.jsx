import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, Layers, X } from "lucide-react";
import { api } from "../api";

export default function QueueStatusPill({ activeJob, onCompleted, onDismiss }) {
  const [jobData, setJobData] = useState(null);

  useEffect(() => {
    if (!activeJob) {
      setJobData(null);
      return;
    }

    let intervalId = null;

    const pollStatus = async () => {
      try {
        const res = await api.getUploadStatus(activeJob.noteId);
        setJobData(res);

        if (res.status === "ready" || res.status === "error") {
          clearInterval(intervalId);
          if (res.status === "ready" && onCompleted) {
            onCompleted(activeJob.noteId);
          }
        }
      } catch (err) {
        console.warn("[QUEUE POLL] Error:", err.message);
      }
    };

    pollStatus();
    intervalId = setInterval(pollStatus, 1500);

    return () => clearInterval(intervalId);
  }, [activeJob]);

  if (!activeJob || !jobData) return null;

  const isDone = jobData.status === "ready";
  const isErr = jobData.status === "error";

  return (
    <div className="floating-queue-pill">
      {isDone ? (
        <CheckCircle2 size={18} style={{ color: "#10b981" }} />
      ) : isErr ? (
        <AlertTriangle size={18} style={{ color: "#f43f5e" }} />
      ) : (
        <div className="spinner"></div>
      )}

      <div>
        <div style={{ fontSize: "0.8rem", color: "#fff" }}>
          {activeJob.title?.substring(0, 24)}...
        </div>
        <div style={{ fontSize: "0.7rem", color: isDone ? "#34d399" : "var(--accent-cyan)" }}>
          {jobData.stage || "Syncing in background..."}
        </div>
      </div>

      <button
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-dim)",
          cursor: "pointer",
          padding: "2px",
          display: "flex",
        }}
        onClick={onDismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}

