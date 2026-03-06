import React from "react";
import { AbsoluteFill, Img, Video as RemotionVideo, staticFile } from "remotion";

export const GifStinger: React.FC<{ src: string; fit?: "cover" | "contain" }> = ({
  src,
  fit = "cover"
}) => {
  const isVideo = /\.(mp4|mov|m4v|webm)$/i.test(src);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0d12" }}>
      {isVideo ? (
        <RemotionVideo
          src={staticFile(src)}
          muted
          loop
          delayRenderTimeoutInMilliseconds={90000}
          delayRenderRetries={2}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: fit
          }}
        />
      ) : (
        <Img
          src={staticFile(src)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: fit
          }}
        />
      )}
    </AbsoluteFill>
  );
};
