import React from "react";

export const MessageInput: React.FC = () => {
  return (
    <div
      style={{
        padding: "14px 16px 20px",
        borderTop: "1px solid #1f232b",
        backgroundColor: "#0b0d12",
        display: "flex",
        alignItems: "center",
        gap: 14
      }}
    >
      {/* Blue camera icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          backgroundColor: "#0095f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <svg width="20" height="18" viewBox="0 0 24 20" fill="none">
          <path
            d="M3 5C3 3.89543 3.89543 3 5 3H19C20.1046 3 21 3.89543 21 5V15C21 16.1046 20.1046 17 19 17H5C3.89543 17 3 16.1046 3 15V5Z"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="10" r="3" stroke="#ffffff" strokeWidth="2" />
        </svg>
      </div>
      {/* Message input */}
      <div
        style={{
          flex: 1,
          height: 44,
          borderRadius: 22,
          border: "1px solid #262c37",
          backgroundColor: "#0f1218",
          color: "#6b7280",
          padding: "0 18px",
          display: "flex",
          alignItems: "center",
          fontSize: 17
        }}
      >
        Message...
      </div>
      {/* Right icons */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Microphone */}
        <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
          <rect x="7" y="2" width="6" height="10" rx="3" stroke="#e5e7eb" strokeWidth="1.8" />
          <path d="M4 10C4 13.3137 6.68629 16 10 16C13.3137 16 16 13.3137 16 10" stroke="#e5e7eb" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="10" y1="16" x2="10" y2="20" stroke="#e5e7eb" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="7" y1="20" x2="13" y2="20" stroke="#e5e7eb" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {/* Gallery/Image */}
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="2" y="2" width="18" height="18" rx="3" stroke="#e5e7eb" strokeWidth="1.8" />
          <circle cx="7.5" cy="7.5" r="2" stroke="#e5e7eb" strokeWidth="1.6" />
          <path d="M2 15L7 10L12 15M12 12L14 10L20 16" stroke="#e5e7eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {/* Sticker/Plus */}
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="9" stroke="#e5e7eb" strokeWidth="1.8" />
          <path d="M11 7V15M7 11H15" stroke="#e5e7eb" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
};
