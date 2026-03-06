import React from "react";
import { AbsoluteFill, Img, Video as RemotionVideo, staticFile } from "remotion";

type IntroCardProps = {
  asset?: string;
  headline: string;
  subtitle?: string;
  fit?: "cover" | "contain";
};

export const IntroCard: React.FC<IntroCardProps> = ({
  asset,
  headline,
  subtitle,
  fit = "cover"
}) => {
  const isVideo = asset ? /\.(mp4|mov|m4v|webm)$/i.test(asset) : false;
  const mediaStyle = {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: fit
  };
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0d12" }}>
      {asset ? (
        isVideo ? (
          <RemotionVideo
            src={staticFile(asset)}
            muted
            loop
            delayRenderTimeoutInMilliseconds={90000}
            delayRenderRetries={2}
            style={mediaStyle}
          />
        ) : (
          <Img src={staticFile(asset)} style={mediaStyle} />
        )
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(11,13,18,0.25) 0%, rgba(11,13,18,0.7) 70%, rgba(11,13,18,0.85) 100%)"
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 80px",
          color: "#f9fafb",
          gap: 8
        }}
      >
        <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: "-0.8px", whiteSpace: "pre-line" }}>
          {headline}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 56, fontWeight: 700, color: "#cbd5f5", whiteSpace: "pre-line" }}>
            {subtitle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
