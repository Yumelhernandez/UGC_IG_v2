import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig
} from "remotion";

type TexmiPlugProps = {
  responseText: string;
  secondOption?: string;
  previewMessages?: { from: "girl" | "boy"; text: string }[];
  appName?: string;
  appHeadline?: string;
  appCtaLabel?: string;
};

const GearIcon: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 15a3 3 0 100-6 3 3 0 000 6z"
      stroke="#9ca3af"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
      stroke="#9ca3af"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SparkleIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 18,
  color = "#fff"
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
  </svg>
);

const CopyIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect
      x="9"
      y="9"
      width="13"
      height="13"
      rx="2"
      stroke="#06b6d4"
      strokeWidth="2"
    />
    <path
      d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
      stroke="#06b6d4"
      strokeWidth="2"
    />
  </svg>
);

const GiftIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="8" width="18" height="14" rx="2" stroke="#9ca3af" strokeWidth="2" />
    <path d="M12 8v14M3 12h18" stroke="#9ca3af" strokeWidth="2" />
    <path
      d="M12 8c-2-3-6-3-6 0s4 0 6 0c2-3 6-3 6 0s-4 0-6 0"
      stroke="#9ca3af"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const TexmiPlug: React.FC<TexmiPlugProps> = ({
  responseText,
  secondOption,
  previewMessages,
  appName = "Texmi",
  appHeadline = "FIX YOUR\nCONVERSATION",
  appCtaLabel = "Fix DM"
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const previewList = React.useMemo(() => {
    if (!previewMessages || previewMessages.length === 0) return [];
    return previewMessages.slice(-4).map((message) => ({
      ...message,
      text: message.text
        .replace(/[\r\n\u2028\u2029]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    }));
  }, [previewMessages]);

  const fadeIn = interpolate(frame, [0, Math.round(0.3 * fps)], [0, 1], {
    extrapolateRight: "clamp"
  });

  const previewAppear = interpolate(
    frame,
    [Math.round(0.3 * fps), Math.round(0.6 * fps)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const option1SlideUp = interpolate(
    frame,
    [Math.round(1.0 * fps), Math.round(1.4 * fps)],
    [40, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const option1Opacity = interpolate(
    frame,
    [Math.round(1.0 * fps), Math.round(1.3 * fps)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const option2SlideUp = interpolate(
    frame,
    [Math.round(1.3 * fps), Math.round(1.7 * fps)],
    [40, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const option2Opacity = interpolate(
    frame,
    [Math.round(1.3 * fps), Math.round(1.6 * fps)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const glowOpacity = interpolate(
    frame,
    [
      Math.round(1.4 * fps),
      Math.round(1.7 * fps),
      Math.round(2.1 * fps),
      Math.round(2.4 * fps)
    ],
    [0, 0.6, 0.6, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const shimmerProgress = interpolate(
    frame,
    [Math.round(0.6 * fps), Math.round(1.0 * fps)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const fallbackSecond = secondOption || "You really thought I wouldn't notice that?";

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0e1a",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* Subtle background glow */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(ellipse at 50% 30%, rgba(0,212,255,0.06) 0%, transparent 60%)",
          pointerEvents: "none"
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "60px 48px 40px",
          flex: 1,
          position: "relative",
          opacity: fadeIn
        }}
      >
        {/* Settings gear — top right */}
        <div
          style={{
            position: "absolute",
            top: 52,
            right: 48,
            width: 56,
            height: 56,
            borderRadius: "50%",
            backgroundColor: "#1a1f2e",
            border: "1px solid #2a2f3e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <GearIcon />
        </div>

        {/* App name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 80,
            marginBottom: 20
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #0891b2 0%, #10b981 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <SparkleIcon size={22} color="#fff" />
          </div>
          <span
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#f3f4f6",
              letterSpacing: -0.3
            }}
          >
            {appName}
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: "#00d4ff",
            lineHeight: 1.1,
            marginBottom: 24,
            letterSpacing: -0.5
          }}
        >
          {appHeadline.split("\n").map((line, i) => (
            <React.Fragment key={i}>{i > 0 && <br />}{line}</React.Fragment>
          ))}
        </div>

        {/* Screenshot Preview section */}
        <div
          style={{
            opacity: previewAppear,
            transform: `scale(${0.95 + previewAppear * 0.05})`
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#94a3b8",
              letterSpacing: 1.5,
              textTransform: "uppercase" as const,
              marginBottom: 16
            }}
          >
            SCREENSHOT PREVIEW
          </div>

          {/* Fake screenshot preview box */}
          <div
            style={{
              width: "100%",
              height: 240,
              borderRadius: 16,
              backgroundColor: "#111827",
              border: "1px solid #1e293b",
              overflow: "hidden",
              position: "relative",
              marginBottom: 8
            }}
          >
          {/* Chat preview */}
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            {previewList.length > 0
              ? previewList.map((message, index) => {
                  const isBoy = message.from === "boy";
                  const text =
                    message.text.length > 90
                      ? `${message.text.slice(0, 87)}...`
                      : message.text;
                  return (
                    <div
                      key={`${message.from}-${index}`}
                      style={{
                        display: "flex",
                        justifyContent: isBoy ? "flex-end" : "flex-start"
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "78%",
                          padding: "8px 12px",
                          borderRadius: 12,
                          backgroundColor: isBoy ? "#0ea5e9" : "#1f2937",
                          color: "#f8fafc",
                          fontSize: 13,
                          lineHeight: 1.35,
                          boxShadow: "0 2px 6px rgba(0,0,0,0.25)"
                        }}
                      >
                        {text || "..."}
                      </div>
                    </div>
                  );
                })
              : [
                  "55%",
                  "70%",
                  "45%",
                  "60%"
                ].map((width, index) => (
                  <div
                    key={`placeholder-${index}`}
                    style={{
                      width,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: "#1e293b",
                      marginLeft: index % 2 === 1 ? "auto" : undefined
                    }}
                  />
                ))}
          </div>

            {/* Shimmer overlay during "analyzing" */}
            {shimmerProgress < 1 && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `linear-gradient(90deg, transparent ${shimmerProgress * 100 - 30}%, rgba(0,212,255,0.08) ${shimmerProgress * 100}%, transparent ${shimmerProgress * 100 + 30}%)`,
                  pointerEvents: "none"
                }}
              />
            )}
          </div>

          {/* AI analyzing indicator */}
          {shimmerProgress < 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                marginTop: 8,
                marginBottom: 16,
                opacity: 1 - shimmerProgress
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, #a78bfa 0%, #c084fc 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <SparkleIcon size={18} color="#fff" />
              </div>
              <span
                style={{
                  fontSize: 16,
                  color: "#94a3b8",
                  fontWeight: 500
                }}
              >
                Analyzing...
              </span>
            </div>
          )}
        </div>

        {/* Suggested Replies section */}
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#94a3b8",
            letterSpacing: 1.5,
            textTransform: "uppercase" as const,
            marginTop: 20,
            marginBottom: 20,
            opacity: option1Opacity
          }}
        >
          SUGGESTED REPLIES
        </div>

        {/* Option 1 */}
        <div
          style={{
            opacity: option1Opacity,
            transform: `translateY(${option1SlideUp}px)`,
            position: "relative",
            marginBottom: 16
          }}
        >
          {/* Glow highlight on Option 1 */}
          <div
            style={{
              position: "absolute",
              inset: -2,
              borderRadius: 16,
              border: `2px solid rgba(6,182,212,${glowOpacity})`,
              boxShadow: `0 0 20px rgba(6,182,212,${glowOpacity * 0.3})`,
              pointerEvents: "none"
            }}
          />
          <div
            style={{
              backgroundColor: "#1e293b",
              borderRadius: 14,
              padding: "20px 24px"
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#06b6d4",
                textTransform: "uppercase" as const,
                letterSpacing: 1,
                marginBottom: 10
              }}
            >
              OPTION 1
            </div>
            <div
              style={{
                fontSize: 20,
                color: "#f3f4f6",
                lineHeight: 1.5,
                fontWeight: 400,
                marginBottom: 14
              }}
            >
              {responseText}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              <CopyIcon />
              <span
                style={{
                  fontSize: 15,
                  color: "#06b6d4",
                  fontWeight: 500
                }}
              >
                Copy
              </span>
            </div>
          </div>
        </div>

        {/* Option 2 */}
        <div
          style={{
            opacity: option2Opacity,
            transform: `translateY(${option2SlideUp}px)`,
            marginBottom: 20
          }}
        >
          <div
            style={{
              backgroundColor: "#1e293b",
              borderRadius: 14,
              padding: "20px 24px"
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#06b6d4",
                textTransform: "uppercase" as const,
                letterSpacing: 1,
                marginBottom: 10
              }}
            >
              OPTION 2
            </div>
            <div
              style={{
                fontSize: 20,
                color: "#f3f4f6",
                lineHeight: 1.5,
                fontWeight: 400,
                marginBottom: 14
              }}
            >
              {fallbackSecond}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              <CopyIcon />
              <span
                style={{
                  fontSize: 15,
                  color: "#06b6d4",
                  fontWeight: 500
                }}
              >
                Copy
              </span>
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Bottom buttons */}
        <div
          style={{
            display: "flex",
            gap: 16,
            paddingBottom: 20
          }}
        >
          <div
            style={{
              flex: 1,
              height: 64,
              borderRadius: 20,
              background: "linear-gradient(90deg, #0891b2 0%, #10b981 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10
            }}
          >
            <SparkleIcon size={20} color="#fff" />
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#fff"
              }}
            >
              {appCtaLabel}
            </span>
          </div>
          <div
            style={{
              flex: 1,
              height: 64,
              borderRadius: 20,
              backgroundColor: "#374151",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10
            }}
          >
            <GiftIcon />
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#d1d5db"
              }}
            >
              Bonus
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
