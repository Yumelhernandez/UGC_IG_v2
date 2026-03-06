import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ConversationFormat, Message } from "../types";
import { FIRST_SHOT_DURATION_S, MESSAGE_SHOT_DURATION_S, PAIR_MESSAGE_OFFSET_PX } from "../constants";
import { buildPairShotLayout } from "../utils/pairLayout";
import { ChatBubble } from "./ChatBubble";
import { TypingIndicator } from "./TypingIndicator";
import { StoryReplyCard } from "./StoryReplyCard";

export const ConversationTimeline: React.FC<{
  messages: Message[];
  replyText: string;
  storyCaption: string;
  storyAsset?: string;
  replyFrom: "girl" | "boy";
  boyName?: string;
  boyAvatar?: string;
  girlName?: string;
  girlAvatar?: string;
  format?: ConversationFormat;
  conversationMode?: "cumulative" | "pair_isolated";
  frameOverride?: number;
  shotStartFrames?: number[];
  /** For Format B/C/D: message index to isolate into a solo pushback shot. */
  pushbackSoloMessageIndex?: number;
}> = ({
  messages,
  replyText,
  storyCaption,
  storyAsset,
  replyFrom,
  boyName,
  boyAvatar,
  girlName,
  girlAvatar,
  format = "A",
  conversationMode = "pair_isolated",
  frameOverride,
  shotStartFrames,
  pushbackSoloMessageIndex
}) => {
  const frame = frameOverride ?? useCurrentFrame();
  const { fps } = useVideoConfig();
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const [scrollOffset, setScrollOffset] = React.useState(0);
  const [messageAreaWidth, setMessageAreaWidth] = React.useState<number | null>(null);
  const isPairFormat = format === "B" || format === "C" || format === "D";
  const typeAtFrames = React.useMemo(
    () =>
      messages.map((message) =>
        Number.isFinite(message.type_at) ? Math.max(0, Math.round(message.type_at * fps)) : null
      ),
    [messages, fps]
  );
  const hasTypeAt = React.useMemo(
    () => typeAtFrames.some((value) => Number.isFinite(value)),
    [typeAtFrames]
  );
  const firstShotFrames = React.useMemo(() => Math.round(FIRST_SHOT_DURATION_S * fps), [fps]);
  const messageShotFrames = React.useMemo(
    () => Math.round(MESSAGE_SHOT_DURATION_S * fps),
    [fps]
  );
  const messageFramesFallback = React.useMemo(
    () => messages.map((_, index) => firstShotFrames + index * messageShotFrames),
    [messages, firstShotFrames, messageShotFrames]
  );
  const messageFrames =
    !isPairFormat && shotStartFrames && shotStartFrames.length > 0
      ? shotStartFrames
      : hasTypeAt
      ? typeAtFrames.map((value, index) =>
          Number.isFinite(value) ? (value as number) : messageFramesFallback[index]
        )
      : messageFramesFallback;
  const pairLayout = React.useMemo(
    () =>
      isPairFormat
        ? buildPairShotLayout({
            messageCount: messages.length,
            soloMessageIndex: pushbackSoloMessageIndex
          })
        : { shots: [], messageToShotIndex: [] },
    [isPairFormat, messages.length, pushbackSoloMessageIndex]
  );
  const pairs = React.useMemo(() => {
    if (!isPairFormat) return [];
    return pairLayout.shots.map((messageIndices) =>
      messageIndices.map((messageIndex) => messages[messageIndex])
    );
  }, [isPairFormat, pairLayout, messages]);
  const pairStartFramesFallback = React.useMemo(() => {
    if (!isPairFormat) return [];
    const starts: number[] = [];
    let cursor = 0;
    for (const pair of pairs) {
      starts.push(cursor);
      cursor += messageShotFrames;
    }
    return starts;
  }, [isPairFormat, pairs, messageShotFrames]);
  const pairStartFrames =
    isPairFormat && shotStartFrames && shotStartFrames.length > 0
      ? shotStartFrames
      : hasTypeAt
      ? pairStartFramesFallback
      : pairStartFramesFallback;
  const activePairIndex = React.useMemo(() => {
    if (!isPairFormat) return -1;
    let active = -1;
    for (let i = 0; i < pairStartFrames.length; i += 1) {
      if (frame >= pairStartFrames[i]) active = i;
    }
    return active;
  }, [frame, pairStartFrames, isPairFormat]);
  const showPairCumulative = isPairFormat && conversationMode === "cumulative";
  const visibleMessages = (() => {
    if (!isPairFormat || activePairIndex < 0) {
      return messages.filter((_, index) => frame >= messageFrames[index]);
    }
    if (!showPairCumulative) return pairs[activePairIndex] ?? [];
    return pairs.slice(0, activePairIndex + 1).flat();
  })();
  const visibleWithIndex = React.useMemo(() => {
    if (isPairFormat) {
      return (visibleMessages || []).map((msg) => ({
        msg,
        index: messages.indexOf(msg)
      }));
    }
    return messages
      .map((msg, index) => ({ msg, index }))
      .filter(({ index }) => frame >= messageFrames[index]);
  }, [isPairFormat, visibleMessages, messages, frame, messageFrames]);
  const isFirstPairFocus = isPairFormat && activePairIndex === 0;
  const centerMessageStack = isPairFormat;
  const showStoryCard = !isPairFormat || activePairIndex <= 0;
  const showTimestamp = !isPairFormat;

  const nextIndex = messageFrames.findIndex((start) => frame < start);
  const typingFrames = Math.round(0.4 * fps);
  let typingFrom: "girl" | "boy" | null = null;
  if (!isPairFormat && nextIndex !== -1 && frame >= messageFrames[nextIndex] - typingFrames) {
    typingFrom = messages[nextIndex].from === "girl" ? "girl" : null;
  }
  const lastVisible = visibleMessages[visibleMessages.length - 1];
  const typingSpacing = typingFrom
    ? lastVisible && lastVisible.from === typingFrom
      ? 6
      : 14
    : 0;
  const firstVisible = visibleMessages[0];
  const storyCardSpacing = showStoryCard ? 6 : 0;
  const messageListSpacing = firstVisible
    ? firstVisible.from === replyFrom
      ? 2
      : 8
    : 0;
  const pairVerticalOffset = isPairFormat ? PAIR_MESSAGE_OFFSET_PX : 0;
  const bFirstShotWidth = "65%";
  const bOtherShotWidth = "88%";
  const bLeftInset = isFirstPairFocus ? "auto" : undefined;
  const bRightInset = isFirstPairFocus ? 40 : 0;
  const bColumnStyle: React.CSSProperties = isPairFormat
    ? {
        width: isFirstPairFocus ? bFirstShotWidth : bOtherShotWidth,
        alignSelf: "center",
        marginLeft: bLeftInset,
        marginRight: bRightInset
      }
    : {};
  const activeMessageIndex = React.useMemo(() => {
    if (isPairFormat) return activePairIndex;
    let active = -1;
    for (let i = 0; i < messageFrames.length; i += 1) {
      if (frame >= messageFrames[i]) active = i;
    }
    return active;
  }, [isPairFormat, activePairIndex, frame, messageFrames]);
  const shouldMicroCut = activeMessageIndex >= 0 && activeMessageIndex % 3 === 0;
  const cutStart =
    isPairFormat && activePairIndex >= 0
      ? pairStartFrames[activePairIndex] ?? 0
      : activeMessageIndex >= 0
      ? messageFrames[activeMessageIndex]
      : 0;
  const cutProgress = shouldMicroCut
    ? interpolate(frame, [cutStart, cutStart + Math.round(0.2 * fps)], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      })
    : 0;
  const cutScale = 1;
  const cutX = 0;
  const cutY = 0;

  const messageStackStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    marginTop: messageListSpacing + storyCardSpacing,
    ...(isPairFormat ? { width: "100%", alignSelf: "stretch" } : bColumnStyle)
  };

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      const nextWidth = viewport.clientWidth;
      if (nextWidth && nextWidth !== messageAreaWidth) {
        setMessageAreaWidth(nextWidth);
      }
    }
    if (isPairFormat) {
      if (scrollOffset !== 0) setScrollOffset(0);
      return;
    }
    const list = listRef.current;
    if (!viewport || !list) return;
    const overflow = list.scrollHeight - viewport.clientHeight;
    const nextOffset = Math.max(0, overflow);
    if (Math.abs(nextOffset - scrollOffset) > 1) {
      setScrollOffset(nextOffset);
    }
  }, [isPairFormat, visibleMessages.length, typingFrom, scrollOffset, messageAreaWidth]);

  return (
    <div
      style={{
        padding: "16px 60px 18px",
        backgroundColor: "#0b0d12",
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 0
      }}
    >
      {showTimestamp ? (
        <div style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
          YESTERDAY 7:07 PM
        </div>
      ) : null}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: centerMessageStack ? "center" : "flex-start"
        }}
        ref={viewportRef}
      >
        <div
          ref={listRef}
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 0,
            transform: isPairFormat
              ? `translateY(-${pairVerticalOffset}px)`
              : `translateY(-${scrollOffset}px)`,
            willChange: "transform"
          }}
        >
          {showStoryCard ? (
            isPairFormat ? (
              <div style={bColumnStyle}>
                <StoryReplyCard
                  replyText={replyText}
                  storyCaption={storyCaption}
                  storyAsset={storyAsset}
                  showReplyText
                  align="right"
                  containerWidth="100%"
                  cardWidth={320}
                />
              </div>
            ) : (
              <StoryReplyCard
                replyText={replyText}
                storyCaption={storyCaption}
                storyAsset={storyAsset}
                showReplyText={!isPairFormat}
                align="right"
              />
            )
          ) : null}
          <div
            style={{
              ...messageStackStyle,
              transform: `translate3d(${cutX}px, ${cutY}px, 0) scale(${cutScale})`,
              transformOrigin: "center center"
            }}
          >
            {visibleWithIndex.map(({ msg, index }) => {
              const localIndex = visibleWithIndex.findIndex((item) => item.msg === msg);
              const prev = visibleWithIndex[localIndex - 1]?.msg;
              const next = visibleWithIndex[localIndex + 1]?.msg;
              const isFirstInGroup = !prev || prev.from !== msg.from;
              const isLastInGroup = !next || next.from !== msg.from;
              const isConsecutive = localIndex > 0 && prev?.from === msg.from;
              const spacing = localIndex === 0 ? 0 : isConsecutive ? 6 : 14;
              const pairShotIndex = index >= 0 ? pairLayout.messageToShotIndex[index] : -1;
              const startFrame = isPairFormat
                ? pairShotIndex >= 0
                  ? pairStartFrames[pairShotIndex] ?? frame
                  : frame
                : messageFrames[index] ?? frame;
              const popFrames = 6 + (index % 4);
              const appearProgress = interpolate(
                frame,
                [startFrame, startFrame + popFrames],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              return (
                <div
                  key={`${index}-${msg.type_at}`}
                  style={{ marginTop: spacing, width: "100%" }}
                >
                  <ChatBubble
                    from={msg.from}
                    text={msg.text}
                    avatar={msg.from === "girl" ? girlAvatar : undefined}
                    name={msg.from === "girl" ? girlName : undefined}
                    isFirstInGroup={isFirstInGroup}
                    isLastInGroup={isLastInGroup}
                    showAvatar={!isPairFormat}
                    maxWidth="88%"
                    containerWidth={messageAreaWidth ?? undefined}
                    appearProgress={appearProgress}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {typingFrom ? (
        <div style={{ marginTop: typingSpacing }}>
          <TypingIndicator from={typingFrom} frame={frame} name={girlName} avatar={girlAvatar} />
        </div>
      ) : null}
    </div>
  );
};
