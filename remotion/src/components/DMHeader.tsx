import React from "react";
import { Img, staticFile } from "remotion";

export const DMHeader: React.FC<{ name: string; username: string; avatar?: string }> = ({
  name,
  username,
  avatar
}) => {
  return (
    <div
      style={{
        height: 110,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #1f232b",
        backgroundColor: "#0b0d12"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 28, color: "#e5e7eb", fontWeight: 400, cursor: "pointer" }}>&lt;</div>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            padding: 2.5,
            background: "linear-gradient(140deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5)"
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              backgroundColor: "#0b0d12",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
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
                alt={name}
              />
            ) : (
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#60a5fa",
                  textTransform: "uppercase"
                }}
              >
                {name.charAt(0)}
              </div>
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#f9fafb" }}>{name}</div>
          <div style={{ fontSize: 15, color: "#9ca3af" }}>{username}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        {/* Phone call icon */}
        <div
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer"
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 5C3 3.89543 3.89543 3 5 3H8.27924C8.70967 3 9.09181 3.27543 9.22792 3.68377L10.7257 8.17721C10.8831 8.64932 10.6694 9.16531 10.2243 9.38787L7.96701 10.5165C9.06925 12.9612 11.0388 14.9308 13.4835 16.033L14.6121 13.7757C14.8347 13.3306 15.3507 13.1169 15.8228 13.2743L20.3162 14.7721C20.7246 14.9082 21 15.2903 21 15.7208V19C21 20.1046 20.1046 21 19 21H18C9.71573 21 3 14.2843 3 6V5Z"
              stroke="#e5e7eb"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        {/* Video call icon */}
        <div
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer"
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 10L19.5528 7.72361C20.2177 7.39116 21 7.87465 21 8.61803V15.382C21 16.1253 20.2177 16.6088 19.5528 16.2764L15 14M5 18H13C14.1046 18 15 17.1046 15 16V8C15 6.89543 14.1046 6 13 6H5C3.89543 6 3 6.89543 3 8V16C3 17.1046 3.89543 18 5 18Z"
              stroke="#e5e7eb"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        {/* Info icon */}
        <div
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer"
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 8.5H12.01M11 12H12V16H13M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z"
              stroke="#e5e7eb"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
