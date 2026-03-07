import React from "react";
import {
  AbsoluteFill,
  Img,
  Video as RemotionVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from "remotion";
import { CLIP_FADE_IN_FRAMES, CLIP_FADE_OUT_FRAMES } from "../constants";

export const ClipWithOverlay: React.FC<{
  src: string;
  overlayText?: string;
  fit?: "cover" | "contain";
  hasBakedText?: boolean;
}> = ({ src, overlayText, fit = "cover", hasBakedText }) => {
  const clipHasBakedText = hasBakedText || (src && (src.includes("quote_card") || src.includes("quote_reaction")));
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const isVideo = /\.(mp4|mov|m4v|webm)$/i.test(src);
  const fadeInOpacity = interpolate(frame, [0, CLIP_FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const fadeOutOpacity = interpolate(
    frame,
    [Math.max(0, durationInFrames - CLIP_FADE_OUT_FRAMES), durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const opacity = Math.min(fadeInOpacity, fadeOutOpacity);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0d12", opacity }}>
      {isVideo ? (
        <RemotionVideo
          src={staticFile(src)}
          muted
          loop
          delayRenderTimeoutInMilliseconds={90000}
          delayRenderRetries={2}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: fit
          }}
        />
      ) : (
        <Img
          src={staticFile(src)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: fit
          }}
        />
      )}
      {/* Black bar to cover baked-in text */}
      {clipHasBakedText ? (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "22%", background: "linear-gradient(180deg, #0b0d12 0%, #0b0d12 70%, rgba(11,13,18,0) 100%)", zIndex: 1 }} />
      ) : null}
      {overlayText ? (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(11,13,18,0.25) 0%, rgba(11,13,18,0.7) 70%, rgba(11,13,18,0.85) 100%)"
            }}
          />
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
              padding: "0 80px",
              textAlign: "center"
            }}
          >
            <div
              style={{
                color: "#f9fafb",
                fontFamily: "SF Pro Display, -apple-system, BlinkMacSystemFont, 'Noto Color Emoji', sans-serif",
                fontWeight: 800,
                fontSize: 92,
                letterSpacing: "-0.8px",
                lineHeight: 1.15,
                whiteSpace: "pre-line",
                textShadow: "0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)"
              }}
            >
              {overlayText}
            </div>
          </AbsoluteFill>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
