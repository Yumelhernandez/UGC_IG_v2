import React from "react";
import { Img, staticFile } from "remotion";

export const StoryReplyCard: React.FC<{
  replyText: string;
  storyCaption: string;
  storyAsset?: string;
  showReplyText?: boolean;
  align?: "right" | "center" | "center-right";
  cardWidth?: number;
  containerWidth?: number | string;
}> = ({
  replyText,
  storyCaption,
  storyAsset,
  showReplyText = true,
  align = "right",
  cardWidth = 440,
  containerWidth
}) => {
  const isCentered = align === "center" || align === "center-right";
  const isCenterRight = align === "center-right";
  const wrapperWidth = containerWidth ?? (isCentered ? cardWidth : "100%");
  const wrapperAlign = containerWidth ? "flex-end" : isCentered ? "center" : "stretch";
  return (
    <div
      style={{
        width: wrapperWidth,
        alignSelf: wrapperAlign,
        display: "flex",
        flexDirection: "column",
        gap: 10
      }}
    >
      <div
        style={{
          alignSelf: isCenterRight ? "flex-end" : isCentered ? "center" : "flex-end",
          fontSize: 24,
          fontWeight: 600,
          color: "#cbd5f5",
          textAlign: isCenterRight ? "right" : isCentered ? "center" : "right",
          letterSpacing: "-0.2px"
        }}
      >
        You replied to their story
      </div>
      <div
        style={{
          alignSelf: isCenterRight ? "flex-end" : isCentered ? "center" : "flex-end",
          width: cardWidth,
          height: 360,
          borderRadius: 16,
          overflow: "hidden",
          background: "linear-gradient(135deg, #2b2f3a, #151820)",
          border: "1px solid #1f232b",
          position: "relative"
        }}
      >
        {storyAsset ? (
          <Img
            src={staticFile(storyAsset)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover"
            }}
            alt="Story"
          />
        ) : null}
      </div>
      {showReplyText ? (
        <div
          style={{
            display: "flex",
            justifyContent: isCenterRight ? "flex-end" : isCentered ? "center" : "flex-end"
          }}
        >
          <div
            style={{
              maxWidth: "90%",
              background: "linear-gradient(135deg, #7638fa, #d300c5)",
              color: "#ffffff",
              borderRadius: 22,
              padding: "14px 26px",
              fontSize: 38,
              fontWeight: 400,
              textAlign: "left",
              lineHeight: 1.25,
              whiteSpace: "pre-line"
            }}
          >
            {replyText}
          </div>
        </div>
      ) : null}
    </div>
  );
};
