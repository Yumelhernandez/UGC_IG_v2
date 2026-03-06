import React from "react";
import { Img, staticFile } from "remotion";

const FONT_FAMILY =
  "\"SF Pro Text\", \"SF Pro Display\", -apple-system, \"Helvetica Neue\", \"Avenir Next\", sans-serif";
// Competitor-matched: bubbles are significantly larger than our previous 33px
const FONT_SIZE = 44;
const FONT_WEIGHT = 400;
const LINE_HEIGHT = 1.28;
const BUBBLE_PADDING_X = 28;
const BUBBLE_PADDING_Y = 18;
const BASE_RADIUS = 26;
const TIGHT_RADIUS = 8;
const OUTGOING_GRADIENT = "linear-gradient(135deg, #7638fa, #d300c5)";
const INCOMING_COLOR = "#2b2f36";
const INCOMING_TEXT = "#ffffff";

const resolveMaxWidth = (value: string, containerWidth?: number) => {
  if (!containerWidth) return null;
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    const percent = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(percent) ? (percent / 100) * containerWidth : null;
  }
  if (trimmed.endsWith("px")) {
    const pixels = Number.parseFloat(trimmed.slice(0, -2));
    return Number.isFinite(pixels) ? pixels : null;
  }
  const numeric = Number.parseFloat(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
};

const createTextMeasurer = (font: string, fallbackSize: number) => {
  if (typeof document === "undefined") {
    return (text: string) => text.length * fallbackSize * 0.6;
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return (text: string) => text.length * fallbackSize * 0.6;
  }
  context.font = font;
  return (text: string) => context.measureText(text).width;
};

const breakLongWord = (word: string, maxWidth: number, measure: (text: string) => number) => {
  const parts: string[] = [];
  let current = "";
  for (const char of word) {
    const next = current + char;
    if (measure(next) <= maxWidth || current === "") {
      current = next;
      continue;
    }
    parts.push(current);
    current = char;
  }
  if (current) parts.push(current);
  return parts.length ? parts : [word];
};

const wrapTextLines = (text: string, maxWidth: number, measure: (text: string) => number) => {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (measure(next) <= maxWidth || current === "") {
      current = next;
      continue;
    }
    lines.push(current);
    if (measure(word) <= maxWidth) {
      current = word;
      continue;
    }
    const broken = breakLongWord(word, maxWidth, measure);
    lines.push(...broken.slice(0, -1));
    current = broken[broken.length - 1] ?? "";
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
};

type TextSegment = { text: string; strike: boolean };

const splitSensitiveSegments = (text: string): TextSegment[] => {
  if (!text) return [];
  const pattern = /(\+?\d[\d\s().-]{5,}\d)/g;
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7) {
      continue;
    }
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), strike: false });
    }
    segments.push({ text: raw, strike: true });
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), strike: false });
  }
  return segments.length ? segments : [{ text, strike: false }];
};

export const ChatBubble: React.FC<{
  from: "girl" | "boy";
  text: string;
  avatar?: string;
  name?: string;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  align?: "auto" | "center";
  showAvatar?: boolean;
  maxWidth?: string;
  containerWidth?: number;
  appearProgress?: number;
}> = ({
  from,
  text,
  avatar,
  name,
  isFirstInGroup = true,
  isLastInGroup = true,
  align = "auto",
  showAvatar = true,
  maxWidth = "85%",
  containerWidth,
  appearProgress = 1
}) => {
  const isBoy = from === "boy";
  const rowJustify = align === "center" ? "center" : isBoy ? "flex-end" : "flex-start";

  const displayText = text
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const computeFakeNumber = (value: string) => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const mid = String(100 + (hash % 900)).padStart(3, "0");
    const last = String(1000 + ((hash >> 8) % 9000)).padStart(4, "0");
    return `555 ${mid} ${last}`;
  };
  const shouldInjectNumber = (value: string) => {
    const lower = value.toLowerCase();
    if (!/\btext me\b/.test(lower)) return false;
    if (/\btext me\s+(your|ur|ya|the)\b/.test(lower)) return false;
    const digitCount = (lower.match(/\d/g) || []).length;
    if (digitCount >= 7) return false;
    return true;
  };
  const renderText = shouldInjectNumber(displayText)
    ? `${displayText} ${computeFakeNumber(displayText)}`
    : displayText;
  const resolvedMaxWidth = resolveMaxWidth(maxWidth, containerWidth);
  const maxContentWidth =
    resolvedMaxWidth && resolvedMaxWidth > BUBBLE_PADDING_X * 2
      ? resolvedMaxWidth - BUBBLE_PADDING_X * 2
      : null;
  const fontSpec = `${FONT_WEIGHT} ${FONT_SIZE}px ${FONT_FAMILY}`;
  const measureText = React.useMemo(
    () => createTextMeasurer(fontSpec, FONT_SIZE),
    [fontSpec]
  );
  const lines = React.useMemo(() => {
    if (!renderText) return [];
    if (!maxContentWidth) return [renderText];
    return wrapTextLines(renderText, maxContentWidth, measureText);
  }, [renderText, maxContentWidth, measureText]);
  const useManualWrap = Boolean(maxContentWidth);
  const bubbleMaxWidth = resolvedMaxWidth ?? maxWidth;
  const topTailRadius = isFirstInGroup ? BASE_RADIUS : TIGHT_RADIUS;
  const bottomTailRadius = isLastInGroup ? BASE_RADIUS : TIGHT_RADIUS;
  const topLeftRadius = isBoy ? BASE_RADIUS : topTailRadius;
  const topRightRadius = isBoy ? topTailRadius : BASE_RADIUS;
  const bottomLeftRadius = isBoy ? BASE_RADIUS : bottomTailRadius;
  const bottomRightRadius = isBoy ? bottomTailRadius : BASE_RADIUS;
  const shouldShowAvatar = !isBoy && showAvatar && isLastInGroup;
  const blurStyle: React.CSSProperties = {
    backgroundColor: "#0b0d12",
    borderRadius: 4,
    color: "transparent",
    padding: "0 4px",
    textDecoration: "line-through",
    textDecorationColor: "#6b7280",
    textDecorationThickness: "3px",
    filter: "blur(8px)",
    opacity: 0.5,
    userSelect: "none" as const
  };

  const renderSegments = (line: string) =>
    splitSensitiveSegments(line).map((segment, index) => (
      <span key={`${index}-${segment.text}`} style={segment.strike ? blurStyle : undefined}>
        {segment.text}
      </span>
    ));

  const eased = Math.min(1, Math.max(0, appearProgress));
  const scale = 1;
  const opacity = 1;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: rowJustify,
        width: "100%",
        gap: 8,
        marginBottom: 0,
        transform: `scale(${scale})`,
        opacity,
        transformOrigin: isBoy ? "right center" : "left center"
      }}
    >
      {/* Avatar for girl messages only */}
      {!isBoy && showAvatar ? (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            flexShrink: 0,
            overflow: "hidden",
            backgroundColor: "#2a2f3a",
            visibility: shouldShowAvatar ? "visible" : "hidden"
          }}
        >
          {avatar && shouldShowAvatar ? (
            <Img
              src={staticFile(avatar)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover"
              }}
              alt={name || "User"}
            />
          ) : shouldShowAvatar ? (
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
          ) : null}
        </div>
      ) : null}
      <div
        style={{
          display: "inline-block",
          background: isBoy ? OUTGOING_GRADIENT : INCOMING_COLOR,
          color: isBoy ? "#ffffff" : INCOMING_TEXT,
          borderRadius: BASE_RADIUS,
          borderTopRightRadius: topRightRadius,
          borderTopLeftRadius: topLeftRadius,
          borderBottomRightRadius: bottomRightRadius,
          borderBottomLeftRadius: bottomLeftRadius,
          padding: `${BUBBLE_PADDING_Y}px ${BUBBLE_PADDING_X}px`,
          maxWidth: bubbleMaxWidth,
          fontSize: FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          fontWeight: FONT_WEIGHT,
          fontFamily: FONT_FAMILY,
          whiteSpace: "normal",
          overflowWrap: "break-word",
          wordBreak: "break-word",
          textAlign: "left",
          textAlignLast: "left",
          textIndent: 0,
          direction: "ltr",
          unicodeBidi: "normal",
          boxSizing: "border-box"
        }}
      >
        {useManualWrap
          ? lines.map((line, index) => {
              const cleanLine = line.replace(/^\s+/, "");
              return (
                <div key={`${index}-${cleanLine}`} style={{ whiteSpace: "pre" }}>
                  {renderSegments(cleanLine)}
                </div>
              );
            })
          : renderSegments(renderText)}
      </div>
    </div>
  );
};
