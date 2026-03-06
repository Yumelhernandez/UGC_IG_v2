import React from "react";
import { Img, staticFile } from "remotion";

export const TypingIndicator: React.FC<{
  from: "girl" | "boy";
  frame: number;
  name?: string;
  avatar?: string;
}> = ({ from, frame, name, avatar }) => {
  const isBoy = from === "boy";
  const rowJustify = isBoy ? "flex-end" : "flex-start";
  const base = frame / 6;
  const dotOpacity = (offset: number) => 0.3 + 0.7 * Math.max(0, Math.sin(base + offset));
  const bubbleColor = isBoy ? "#8f3cf2" : "#2b2f36";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: rowJustify,
        gap: 8,
        width: "100%",
        marginBottom: 0
      }}
    >
      {/* Avatar for girl typing only */}
      {!isBoy && (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            flexShrink: 0,
            overflow: "hidden",
            backgroundColor: "#2a2f3a"
          }}
        >
          {avatar ? (
            <Img
              src={staticFile(avatar)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover"
              }}
              alt={name || "User"}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 600,
                color: "#60a5fa",
                textTransform: "uppercase"
              }}
            >
              {name?.charAt(0) || "?"}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          background: bubbleColor,
          color: "#f9fafb",
          borderRadius: 22,
          padding: "10px 18px",
          fontSize: 20,
          display: "flex",
          gap: 6
        }}
      >
        <span style={{ opacity: dotOpacity(0) }}>.</span>
        <span style={{ opacity: dotOpacity(1) }}>.</span>
        <span style={{ opacity: dotOpacity(2) }}>.</span>
      </div>
    </div>
  );
};
