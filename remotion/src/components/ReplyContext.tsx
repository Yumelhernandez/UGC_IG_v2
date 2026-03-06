import React from "react";

export const ReplyContext: React.FC<{ text: string }> = ({ text }) => {
  return (
    <div style={{ marginTop: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 6 }}>Replied to you</div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            width: 3,
            height: 36,
            borderRadius: 2,
            backgroundColor: "#2a2f3a"
          }}
        />
        <div style={{ fontSize: 18, color: "#e5e7eb" }}>{text}</div>
      </div>
    </div>
  );
};
