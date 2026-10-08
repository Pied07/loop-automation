import { ImageResponse } from "next/og";
import React from "react";

export async function generatePolaroidStoryCard(params: {
  thumbnailUrl: string;
  title: string;
}): Promise<Buffer> {
  const { thumbnailUrl, title } = params;
  const cleanTitle = (title || "VIRAL REEL").slice(0, 48);

  const element = (
    <div
      style={{
        width: 1080,
        height: 1920,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "110px 50px 130px 50px",
        backgroundColor: "#0d0e15",
        background: "linear-gradient(180deg, #1b1c2b 0%, #0d0e15 50%, #07070b 100%)",
        position: "relative",
      }}
    >
      {/* 1. Top Story Pill Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 36px",
          borderRadius: 50,
          backgroundColor: "rgba(255, 255, 255, 0.12)",
          border: "2px solid rgba(255, 255, 255, 0.25)",
          color: "#ffffff",
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: 3,
          textTransform: "uppercase",
        }}
      >
        ✨ NEW VIRAL REEL
      </div>

      {/* 2. Center Polaroid Photo Card (Casual Aesthetic Tilt) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: 840,
          padding: "26px 26px 42px 26px",
          backgroundColor: "#ffffff",
          borderRadius: 22,
          boxShadow: "0 35px 85px rgba(0, 0, 0, 0.9), 0 0 50px rgba(229, 9, 20, 0.3)",
          transform: "rotate(-2deg)",
        }}
      >
        {/* Inner Video Preview Frame */}
        <div
          style={{
            width: 788,
            height: 980,
            borderRadius: 14,
            overflow: "hidden",
            backgroundColor: "#161822",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt="Video thumbnail"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : null}

          {/* Centered Play Button Overlay */}
          <div
            style={{
              position: "absolute",
              width: 104,
              height: 104,
              borderRadius: 52,
              backgroundColor: "rgba(229, 9, 20, 0.9)",
              border: "3px solid #ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 35px rgba(229, 9, 20, 0.8)",
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderTop: "20px solid transparent",
                borderBottom: "20px solid transparent",
                borderLeft: "32px solid white",
                marginLeft: 8,
              }}
            />
          </div>
        </div>

        {/* Polaroid Bottom Margin Typography */}
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            marginTop: 26,
            paddingLeft: 12,
            paddingRight: 12,
          }}
        >
          <div
            style={{
              fontSize: 38,
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: -0.5,
              textTransform: "uppercase",
            }}
          >
            🔥 WATCH FULL REEL
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              color: "#64748b",
              marginTop: 6,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 760,
            }}
          >
            {cleanTitle}
          </div>
        </div>
      </div>

      {/* 3. Bottom Story Link Sticker (Instagram Native Style) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "24px 62px",
            borderRadius: 60,
            backgroundColor: "#ffffff",
            color: "#0f172a",
            fontSize: 36,
            fontWeight: 900,
            boxShadow: "0 18px 50px rgba(0, 0, 0, 0.75), 0 0 35px rgba(255, 255, 255, 0.35)",
            border: "2px solid rgba(255, 255, 255, 0.9)",
          }}
        >
          🔗 TAP TO SEE THE REEL 👆
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "rgba(255, 255, 255, 0.75)",
            letterSpacing: 1.5,
          }}
        >
          WATCH ON REELS & SHORTS
        </div>
      </div>
    </div>
  );

  const res = new ImageResponse(element, { width: 1080, height: 1920 });
  const arrBuf = await res.arrayBuffer();
  return Buffer.from(arrBuf);
}
