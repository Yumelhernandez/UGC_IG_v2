import React from "react";
import { Img, staticFile } from "remotion";
import type { VideoScript } from "../types";

export const StoryCard: React.FC<{ story: VideoScript["story"] }> = ({ story }) => {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#000000",
        color: "#ffffff",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* Progress bars at top */}
      <div style={{ display: "flex", gap: 6, padding: "10px 8px 6px", position: "relative", zIndex: 10 }}>
        <div style={{ flex: 1, height: 2.5, borderRadius: 999, backgroundColor: "rgba(255,255,255,1)" }} />
        <div style={{ flex: 1, height: 2.5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.35)" }} />
      </div>

      {/* Header with avatar and username */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 12px 8px", position: "relative", zIndex: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            padding: 2,
            background: "linear-gradient(140deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5)"
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              backgroundColor: "#000000",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {story.avatar ? (
              <Img
                src={staticFile(story.avatar)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover"
                }}
              />
            ) : (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#60a5fa",
                  textTransform: "uppercase"
                }}
              >
                {story.username.charAt(0)}
              </div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{story.username}</div>
        <div style={{ fontSize: 14, opacity: 0.7 }}>2h</div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.9 }}>
          <circle cx="12" cy="5" r="1.5" fill="white" />
          <circle cx="12" cy="12" r="1.5" fill="white" />
          <circle cx="12" cy="19" r="1.5" fill="white" />
        </svg>
      </div>

      {/* Full-screen story image */}
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {story.asset && (
          <Img
            src={staticFile(story.asset)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover"
            }}
          />
        )}
        {/* Caption overlay if present */}
        {story.caption && (
          <div
            style={{
              position: "absolute",
              bottom: 80,
              left: 20,
              right: 20,
              fontSize: 32,
              fontWeight: 600,
              textAlign: "center",
              color: "#ffffff",
              textShadow: "0 2px 8px rgba(0,0,0,0.5)",
              zIndex: 5
            }}
          >
            {story.caption}
          </div>
        )}
      </div>

      {/* Bottom message input and icons */}
      <div style={{ padding: "0 12px 28px", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Camera icon */}
          <div>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M4 9C4 7.89543 4.89543 7 6 7H22C23.1046 7 24 7.89543 24 9V21C24 22.1046 23.1046 23 22 23H6C4.89543 23 4 22.1046 4 21V9Z"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="14" cy="15" r="3.5" stroke="white" strokeWidth="2" />
              <path d="M9 7L10.5 4H17.5L19 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Message input */}
          <div
            style={{
              flex: 1,
              border: "2px solid rgba(255,255,255,1)",
              borderRadius: 999,
              padding: "11px 18px",
              backgroundColor: "transparent"
            }}
          >
            <div style={{ fontSize: 15, color: "rgba(255,255,255,1)", fontWeight: 500 }}>Send message</div>
          </div>

          {/* Heart icon */}
          <div>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M14 24.85l-1.65-1.5C6.9 18.36 3 14.78 3 10.5 3 7.42 5.42 5 8.5 5c1.74 0 3.41.81 4.5 2.09C14.09 5.81 15.76 5 17.5 5 20.58 5 23 7.42 23 10.5c0 4.28-3.9 7.86-9.35 12.85L14 24.85z"
                stroke="white"
                strokeWidth="2"
                fill="none"
              />
            </svg>
          </div>

          {/* Send icon */}
          <div>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M25 3L13.5 14.5M25 3l-8 22-4.5-10.5L3 10l22-7z"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
