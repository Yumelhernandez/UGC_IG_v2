import React from "react";

export const ReplySticker: React.FC<{ reply: string }> = ({ reply }) => {
  return (
    <div
      style={{
        width: "72%",
        margin: "12px auto 0",
        padding: "12px 16px",
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.88)",
        color: "#0b0d12",
        fontSize: 20,
        lineHeight: 1.3,
        boxShadow: "0 10px 20px rgba(0,0,0,0.25)"
      }}
    >
      <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 6 }}>Replying to your story</div>
      <div style={{ whiteSpace: "pre-line" }}>{reply}</div>
    </div>
  );
};
