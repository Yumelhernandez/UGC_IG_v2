import React from "react";

export const PhoneFrame: React.FC<
  React.PropsWithChildren<{ showFrame?: boolean; showStatusBar?: boolean }>
> = ({ children, showFrame = true, showStatusBar = true }) => {
  const frameStyles = showFrame
    ? {
        width: 900,
        height: 1600,
        borderRadius: 52,
        backgroundColor: "#0b0d12",
        border: "10px solid #0f1118",
        boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        padding: 26,
        position: "relative" as const,
        overflow: "hidden"
      }
    : {
        width: "100%",
        height: "100%",
        borderRadius: 0,
        backgroundColor: "#0b0d12",
        border: "none",
        boxShadow: "none",
        padding: 0,
        position: "relative" as const,
        overflow: "hidden"
      };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#0b0d12",
        fontFamily:
          "\"SF Pro Text\", \"SF Pro Display\", -apple-system, \"Helvetica Neue\", \"Avenir Next\", sans-serif"
      }}
    >
      <div style={frameStyles}>
        {showStatusBar ? (
          <div
            style={{
              height: 42,
              marginBottom: 12,
              padding: "0 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "#e5e7eb",
              fontSize: 18,
              fontWeight: 600
            }}
          >
            <span style={{ letterSpacing: "-0.3px" }}>7:08</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Cellular signal bars */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 16 }}>
                <div style={{ width: 3.5, height: 5, borderRadius: 0.5, backgroundColor: "#e5e7eb" }} />
                <div style={{ width: 3.5, height: 7.5, borderRadius: 0.5, backgroundColor: "#e5e7eb" }} />
                <div style={{ width: 3.5, height: 10, borderRadius: 0.5, backgroundColor: "#e5e7eb" }} />
                <div style={{ width: 3.5, height: 12.5, borderRadius: 0.5, backgroundColor: "#e5e7eb" }} />
              </div>
              {/* WiFi icon */}
              <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                <path d="M10 14C10.8284 14 11.5 13.3284 11.5 12.5C11.5 11.6716 10.8284 11 10 11C9.17157 11 8.5 11.6716 8.5 12.5C8.5 13.3284 9.17157 14 10 14Z" fill="#e5e7eb"/>
                <path d="M10 8.5C11.933 8.5 13.683 9.317 14.9 10.6L13.5 12C12.583 11.083 11.367 10.5 10 10.5C8.633 10.5 7.417 11.083 6.5 12L5.1 10.6C6.317 9.317 8.067 8.5 10 8.5Z" fill="#e5e7eb"/>
                <path d="M10 5C13.183 5 15.967 6.317 18 8.35L16.6 9.75C14.883 8.033 12.567 7 10 7C7.433 7 5.117 8.033 3.4 9.75L2 8.35C4.033 6.317 6.817 5 10 5Z" fill="#e5e7eb"/>
              </svg>
              {/* Battery icon */}
              <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
                <div
                  style={{
                    width: 28,
                    height: 13,
                    borderRadius: 3.5,
                    border: "1.5px solid #e5e7eb",
                    padding: 1.5,
                    display: "flex",
                    alignItems: "center"
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 2,
                      backgroundColor: "#e5e7eb"
                    }}
                  />
                </div>
                <div
                  style={{
                    width: 2,
                    height: 5,
                    borderRadius: "0 1px 1px 0",
                    backgroundColor: "#e5e7eb",
                    opacity: 0.4
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
};
