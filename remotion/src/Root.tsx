import { Composition, staticFile } from "remotion";
import { Video } from "./Video";
import type { VideoScript } from "./types";
import { INTRO_DURATION_S, WIN_CELEBRATION_DURATION_S } from "./constants";
import { getConversationPlan } from "./utils/timing";

// Load SF Pro fonts
const loadFonts = () => {
  const fonts = [
    { family: "SF Pro Text", weight: 400, file: "SF-Pro-Text-Regular.otf" },
    { family: "SF Pro Text", weight: 500, file: "SF-Pro-Text-Medium.otf" },
    { family: "SF Pro Text", weight: 600, file: "SF-Pro-Text-Semibold.otf" },
    { family: "SF Pro Display", weight: 400, file: "SF-Pro-Display-Regular.otf" },
    { family: "SF Pro Display", weight: 500, file: "SF-Pro-Display-Medium.otf" },
    { family: "SF Pro Display", weight: 600, file: "SF-Pro-Display-Semibold.otf" },
  ];

  fonts.forEach(({ family, weight, file }) => {
    const fontFace = new FontFace(
      family,
      `url(${staticFile(`fonts/${file}`)})`,
      { weight: weight.toString() }
    );
    fontFace.load().catch(() => {
      console.warn(`Failed to load font: ${file}`);
    });
    document.fonts.add(fontFace);
  });
};

// Load fonts when the module is imported
if (typeof document !== "undefined") {
  loadFonts();
}

const getConversationDurationInFrames = (script: VideoScript, fps: number) => {
  const arcType = (script.meta as { arc_type?: string }).arc_type || "number_exchange";
  const skipCelebration = arcType === "cliffhanger" || arcType === "rejection";
  const celebFrames = skipCelebration ? 0 : Math.round(WIN_CELEBRATION_DURATION_S * fps);
  return getConversationPlan(script, fps).totalConversationFrames + celebFrames;
};

const getIntroDurationInFrames = (_script: VideoScript, fps: number) => {
  // ALWAYS include intro — competitors never skip the sports hook opener
  return Math.round(INTRO_DURATION_S * fps);
};

export const RemotionRoot: React.FC = () => {
  const emptyScript: VideoScript = {
    video_id: "preview",
    meta: { theme: "preview", duration_s: 6, spice_tier: "low", format: "A" },
    story: {
      username: "preview",
      age: 21,
      caption: "preview",
      asset: ""
    },
    reply: { from: "boy", text: "preview" },
    persona: {
      boy: { name: "Preview", age: 21 },
      girl: { name: "Preview", age: 21 }
    },
    messages: []
  };
  return (
    <>
      <Composition
        id="StoryReply"
        component={Video}
        durationInFrames={
          getConversationDurationInFrames(emptyScript, 30) +
          getIntroDurationInFrames(emptyScript, 30)
        }
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ script: emptyScript }}
        calculateMetadata={({ props }) => {
          const typed = props as { script: VideoScript };
          return {
            durationInFrames:
              getConversationDurationInFrames(typed.script, 30) +
              getIntroDurationInFrames(typed.script, 30)
          };
        }}
      />
    </>
  );
};
