import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoScript } from "./types";
import { PhoneFrame } from "./components/PhoneFrame";
import { ConversationTimeline } from "./components/ConversationTimeline";
import { IntroCard } from "./components/IntroCard";
import { GifStinger } from "./components/GifStinger";
import { ClipWithOverlay } from "./components/ClipWithOverlay";
import { TexmiPlug } from "./components/TexmiPlug";
import {
  INTRO_GIF,
  INTRO_HEADLINE,
  INTRO_DURATION_S,
  INTRO_REPLY_HEADLINE,
  INTRO_SUBTITLE,
  HOOK_HEADLINES,
  HOOK_SUBTITLES,
  WIN_CELEBRATION_ASSETS,
  WIN_CELEBRATION_DURATION_S
} from "./constants";
import { addPausesToFrame, applyPausesToFrame, getConversationPlan } from "./utils/timing";

const PUSHBACK_PATTERNS = [
  /\?\?/,
  /\bwhy\b/,
  /\bwhat\b/,
  /\bwho\b/,
  /\band\?/,
  /\bwdym\b/,
  /\bwym\b/,
  /\bhuh\b/,
  /\bfor real\b/,
  /\bfr\b/,
  /\bserious\b/,
  /\byou (?:sure|serious)\b/,
  /\bcan'?t be\b/,
  /\bnah\b/
];

const resolvePushbackIndex = (script: VideoScript) => {
  const candidate = script.beats && script.beats.pushback_index;
  if (Number.isFinite(candidate)) {
    return Math.max(0, Math.min(script.messages.length - 1, candidate as number));
  }
  for (let i = 0; i < script.messages.length; i += 1) {
    const message = script.messages[i];
    if (message.from !== "girl") continue;
    const trimmed = message.text.trim().toLowerCase();
    if (trimmed && PUSHBACK_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      return i;
    }
  }
  return -1;
};

const findFirstGirlIndex = (messages: VideoScript["messages"]) =>
  messages.findIndex((message) => message.from === "girl");

export const Video: React.FC<{ script: VideoScript }> = ({ script }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isPairFormat = script.meta.format === "B" || script.meta.format === "D";
  const isFormatC = script.meta.format === "C";
  const isFormatD = script.meta.format === "D";
  const isTexmiFormat =
    script.meta.format === "B" || script.meta.format === "C" || script.meta.format === "D";
  const isFullscreen = isPairFormat || isFormatC || isFormatD;
  // Micro-variation: slight zoom variation per video to prevent template detection
  // Competitors also have slight differences in framing between videos
  const videoSeed = script.video_id ? script.video_id.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0) : 0;
  const microZoom = 1.0 + (videoSeed % 5) * 0.008; // 1.000 to 1.032 — imperceptible but breaks pixel-level sameness
  const zoomScale = isFullscreen ? microZoom : 1.08;
  const hook = script.hook;
  // ALWAYS show a media hook intro — competitors never skip the sports clip opener.
  // Even "reply" mode hooks now get an intro to stop the scroll.
  const introAsset = hook && hook.asset ? hook.asset : INTRO_GIF;
  // Rotate hook headlines from the bank based on video_id for variety
  const hookSeed = script.video_id ? script.video_id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const introHeadline = hook && hook.headline
    ? hook.headline
    : HOOK_HEADLINES[hookSeed % HOOK_HEADLINES.length];
  const introSubtitle =
    hook && Object.prototype.hasOwnProperty.call(hook, "subtitle")
      ? hook.subtitle
      : HOOK_SUBTITLES[hookSeed % HOOK_SUBTITLES.length];
  const introFit = introAsset && introAsset.startsWith("Hooks/") ? "contain" : "cover";
  // ALWAYS render hook intro — never 0. This is the #1 scroll-stopping mechanic.
  const introDurationInFrames = Math.round(INTRO_DURATION_S * fps);
  const plan = React.useMemo(() => getConversationPlan(script, fps), [script, fps]);
  const conversationStart = introDurationInFrames;
  const rawConversationFrame = Math.max(0, frame - conversationStart);
  const conversationFrame = applyPausesToFrame(rawConversationFrame, plan.pauses);
  const firstGirlIndex = script.messages.findIndex((message) => message.from === "girl");
  const revealIndex = (() => {
    if (firstGirlIndex < 0) return -1;
    for (let i = firstGirlIndex + 1; i < script.messages.length; i += 1) {
      if (script.messages[i].from === "boy") return i;
    }
    return -1;
  })();
  const winIndex = script.messages.length - 1;
  const revealFrame =
    revealIndex >= 0 && Number.isFinite(script.messages[revealIndex].type_at)
      ? Math.round(script.messages[revealIndex].type_at * fps)
      : null;
  const winFrame =
    winIndex >= 0 && Number.isFinite(script.messages[winIndex].type_at)
      ? Math.round(script.messages[winIndex].type_at * fps)
      : null;
  const revealAudioFrame =
    revealFrame != null ? conversationStart + addPausesToFrame(revealFrame, plan.pauses) : null;
  const winAudioFrame =
    winFrame != null ? conversationStart + addPausesToFrame(winFrame, plan.pauses) : null;
  const pushbackIndex = React.useMemo(() => {
    if (!isTexmiFormat) return -1;
    const resolved = resolvePushbackIndex(script);
    if (resolved >= 0) return resolved;
    return findFirstGirlIndex(script.messages);
  }, [isTexmiFormat, script.messages, script.beats]);
  const plugResponseText = React.useMemo(() => {
    if (!isTexmiFormat) return "";
    // Use the plan's suggested message index (reflects the plug's new position).
    if (plan.texmiSuggestedMessageIndex != null) {
      return script.messages[plan.texmiSuggestedMessageIndex]?.text || "";
    }
    // Fallback for when no plug is inserted (app_insert_policy: "off", etc.)
    if (pushbackIndex < 0) {
      const firstBoy = script.messages.find((m: { from: string }) => m.from === "boy");
      return firstBoy?.text || script.reply?.text || "";
    }
    const immediateNext = script.messages[pushbackIndex + 1];
    if (immediateNext && immediateNext.from === "boy") {
      return immediateNext.text;
    }
    for (let i = pushbackIndex + 1; i < script.messages.length; i += 1) {
      if (script.messages[i].from === "boy") return script.messages[i].text;
    }
    return script.reply?.text || "";
  }, [isTexmiFormat, plan, pushbackIndex, script.messages, script.reply]);
  const plugPreviewMessages = React.useMemo(() => {
    if (!isTexmiFormat) return [];
    const preview: { from: "girl" | "boy"; text: string }[] = [];
    if (script.reply?.text) {
      preview.push({ from: script.reply.from, text: script.reply.text });
    }
    // Use the plan's end index (reflects the plug's new position), or fall back to pushback.
    const endIndex =
      plan.texmiPreviewEndMessageIndex != null
        ? plan.texmiPreviewEndMessageIndex
        : pushbackIndex >= 0
        ? pushbackIndex
        : Math.min(script.messages.length - 1, 1);
    if (endIndex >= 0) {
      preview.push(
        ...script.messages.slice(0, endIndex + 1).map((message) => ({
          from: message.from,
          text: message.text
        }))
      );
    }
    const maxPreviewCount = 4;
    return preview.length > maxPreviewCount
      ? preview.slice(preview.length - maxPreviewCount)
      : preview;
  }, [isTexmiFormat, plan, pushbackIndex, script.messages, script.reply]);
  const plugSecondOption = script.plug_line;
  const backgroundAudioSrc = script.meta.audio_track || "she_know_she_wants_it.mp4";
  const resolvedConversationMode =
    isTexmiFormat
      ? "pair_isolated"
      : script.meta.conversation_mode || "pair_isolated";
  // Micro-variation: slight background color shift per video (imperceptible to viewer, breaks pixel-level fingerprinting)
  const bgR = 11 + (videoSeed % 3);  // 11-13
  const bgG = 13 + (videoSeed % 3);  // 13-15
  const bgB = 18 + (videoSeed % 4);  // 18-21
  const bgColor = `rgb(${bgR},${bgG},${bgB})`;
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <Audio src={staticFile(backgroundAudioSrc)} volume={0.3} />
      {revealAudioFrame != null ? (
        <Sequence from={revealAudioFrame} durationInFrames={Math.round(0.4 * fps)}>
          <Audio src={staticFile("sfx_tap.wav")} volume={0.12} />
        </Sequence>
      ) : null}
      {winAudioFrame != null ? (
        <Sequence from={winAudioFrame} durationInFrames={Math.round(0.6 * fps)}>
          <Audio src={staticFile("sfx_whoosh.wav")} volume={0.12} />
        </Sequence>
      ) : null}
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${zoomScale})`,
          transformOrigin: "center center"
        }}
      >
        <PhoneFrame showFrame={!isFullscreen} showStatusBar={!isFullscreen}>
          <div style={{ marginTop: isFullscreen ? 0 : 18, height: "100%" }}>
            <div
              style={{
                borderRadius: isFullscreen ? 0 : 26,
                overflow: "hidden",
                backgroundColor: "#0b0d12",
                border: isFullscreen ? "none" : "1px solid #171b23",
                boxShadow: isFullscreen ? "none" : "0 20px 40px rgba(0,0,0,0.45)",
                display: "flex",
                flexDirection: "column",
                height: isFullscreen ? "100%" : 1200
              }}
            >
            {introDurationInFrames > 0 ? (
              <Sequence durationInFrames={introDurationInFrames}>
                <IntroCard
                  asset={introAsset}
                  headline={introHeadline}
                  subtitle={introSubtitle}
                  fit={introFit}
                />
              </Sequence>
            ) : null}
            <Sequence from={introDurationInFrames} layout="none">
              <ConversationTimeline
                messages={script.messages}
                replyText={script.reply.text}
                storyCaption={script.story.caption}
                storyAsset={script.story.asset}
                replyFrom={script.reply.from}
                boyName={script.persona.boy.name}
                boyAvatar={undefined}
                girlName={script.persona.girl.name}
                girlAvatar={script.story.asset}
                format={script.meta.format}
                conversationMode={resolvedConversationMode}
                frameOverride={conversationFrame}
                shotStartFrames={plan.shotStartFrames}
                pushbackSoloMessageIndex={plan.pushbackSoloMessageIndex}
              />
            </Sequence>
            {plan.pauses.map((pause, index) => (
              <Sequence
                key={`${pause.kind}-${index}-${pause.src}`}
                from={conversationStart + pause.startFrame}
                durationInFrames={pause.durationInFrames}
                layout="none"
              >
                {pause.kind === "texmi-plug" ? (
                  <TexmiPlug
                    responseText={plugResponseText}
                    secondOption={plugSecondOption}
                    previewMessages={plugPreviewMessages}
                  />
                ) : (
                  /* ALL clips (stingers + in-between) use ClipWithOverlay for narrative overlay text */
                  <ClipWithOverlay src={pause.src} fit={pause.fit} overlayText={pause.overlayText} />
                )}
              </Sequence>
            ))}
            {/* WIN CELEBRATION — only for arcs where the boy "wins" (not cliffhanger/rejection) */}
            {(() => {
              const arcType = (script.meta as { arc_type?: string }).arc_type || "number_exchange";
              const skipCelebration = arcType === "cliffhanger" || arcType === "rejection";
              if (skipCelebration) return null;
              const winCelebSeed = script.video_id ? script.video_id.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0) : 0;
              const winAsset = WIN_CELEBRATION_ASSETS[winCelebSeed % WIN_CELEBRATION_ASSETS.length];
              const lastPause = plan.pauses.length > 0 ? plan.pauses[plan.pauses.length - 1] : null;
              const lastPauseEnd = lastPause ? lastPause.startFrame + lastPause.durationInFrames : 0;
              const totalConvoFrames = plan.totalConversationFrames;
              const winStart = conversationStart + Math.max(totalConvoFrames, lastPauseEnd);
              const winDuration = Math.round(WIN_CELEBRATION_DURATION_S * fps);
              return (
                <Sequence from={winStart} durationInFrames={winDuration} layout="none">
                  <ClipWithOverlay src={winAsset} fit="cover" overlayText="that's the bag 🏆" />
                </Sequence>
              );
            })()}
            </div>
          </div>
        </PhoneFrame>
      </div>
    </AbsoluteFill>
  );
};
