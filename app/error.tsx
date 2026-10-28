"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App boundary error caught:", error);
    // If it's a chunk load failure caused by a deployment rollout, reload to fetch fresh bundles
    const msg = error?.message || "";
    if (
      msg.includes("Loading chunk") ||
      msg.includes("Failed to fetch") ||
      msg.includes("ChunkLoadError") ||
      msg.includes("undefined")
    ) {
      const lastReload = sessionStorage.getItem("last_auto_reload");
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem("last_auto_reload", String(now));
        window.location.reload();
      }
    }
  }, [error]);

  const handleHardReset = () => {
    try {
      if (typeof window !== "undefined") {
        sessionStorage.clear();
      }
    } catch {}
    window.location.reload();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#07080b",
        color: "#ffffff",
        padding: "20px",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "rgba(229,9,20,0.15)",
          display: "grid",
          placeItems: "center",
          color: "#ff3b45",
          marginBottom: "20px",
          boxShadow: "0 0 24px rgba(229,9,20,0.3)",
        }}
      >
        <RefreshCw size={26} />
      </div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 8px 0" }}>
        Application Refresh Needed
      </h1>
      <p style={{ fontSize: "14px", color: "#94a3b8", maxWidth: "440px", margin: "0 0 24px 0", lineHeight: 1.5 }}>
        A new version of The Viral Desk was published. Click below to load the fresh updates.
      </p>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => reset()}
          style={{
            background: "linear-gradient(135deg, #e50914, #ff3b45)",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            padding: "10px 20px",
            fontSize: "13px",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(229,9,20,0.4)",
          }}
        >
          Try Again
        </button>
        <button
          onClick={handleHardReset}
          style={{
            background: "#161822",
            color: "#cbd5e1",
            border: "1px solid #2a2e3f",
            borderRadius: "8px",
            padding: "10px 20px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reload Studio
        </button>
      </div>
    </div>
  );
}
