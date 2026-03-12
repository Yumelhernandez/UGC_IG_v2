import type { VideoScript } from "../types";
import {
  BEAT_GRID_S,
  CLIP_MAX_COUNT,
  CLIP_MAX_DURATION_S,
  CLIP_MIN_COUNT,
  CLIP_MIN_DURATION_S,
  CLIP_OVERLAYS_HIGH,
  CLIP_OVERLAYS_BEAT_CLOSE,
  CLIP_OVERLAYS_BEAT_ESCALATION,
  CLIP_OVERLAYS_BEAT_PUSHBACK,
  CLIP_OVERLAYS_BEAT_SHIFT,
  CLIP_OVERLAYS_LOW,
  CLIP_OVERLAYS_MEDIUM,
  CLIP_TARGET_EVERY_N_MESSAGES,
  FIRST_SHOT_DURATION_S,
  FORMAT_C_MESSAGE_SHOT_DURATION_S,
  FORMAT_C_MESSAGE_SHOT_MAX_S,
  FORMAT_C_MESSAGE_SHOT_MIN_S,
  IN_BETWEEN_MAX_COUNT,
  IN_BETWEEN_MIN_COUNT,
  MESSAGE_SHOT_DURATION_S,
  MESSAGE_SHOT_MAX_S,
  MESSAGE_SHOT_MIN_S,
  STINGER_ONE_DURATION_S,
  STINGER_ONE_GIF,
  TEXMI_PLUG_DURATION_S
} from "../constants";
import { buildPairShotLayout } from "./pairLayout";

type Pause = {
  startFrame: number;
  durationInFrames: number;
  src: string;
  fit: "cover" | "contain";
  kind: "stinger" | "in-between" | "texmi-plug";
  overlayText?: string;
};

type PauseSpec = Omit<Pause, "startFrame"> & { afterShotIndex: number };

type ConversationPlan = {
  shotStartFrames: number[];
  shotDurationsInFrames: number[];
  pauses: Pause[];
  totalConversationFrames: number;
  firstShotFrames: number;
  /** For Format B/C/D: the pair index of the solo pushback girl shot (undefined if none). */
  pushbackSoloMessageIndex?: number;
  /** For Texmi formats: the message index to show as the suggested response. */
  texmiSuggestedMessageIndex?: number;
  /** For Texmi formats: the last message index shown in the preview when the plug fires. */
  texmiPreviewEndMessageIndex?: number;
};

const hashSeed = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => {
  return () => {
    let t = seed + 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const createRng = (seed: string) => mulberry32(hashSeed(seed));

const randomBetween = (seed: string, min: number, max: number) => {
  const rng = mulberry32(hashSeed(seed));
  return min + (max - min) * rng();
};

const pickRandomInt = (rng: () => number, min: number, max: number) => {
  return min + Math.floor(rng() * (max - min + 1));
};

const shuffleInPlace = <T>(values: T[], rng: () => number) => {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
};

const snapToGrid = (frames: number, grid: number, min: number, max: number) => {
  if (grid <= 1) return Math.min(max, Math.max(min, frames));
  const snapped = Math.round(frames / grid) * grid;
  return Math.min(max, Math.max(min, snapped));
};

const resolveSeed = (script: VideoScript) => {
  if (script.meta.timing_seed !== undefined && script.meta.timing_seed !== null) {
    return String(script.meta.timing_seed);
  }
  return script.video_id || "video";
};

const getOverlayPool = (spiceTier: VideoScript["meta"]["spice_tier"]) => {
  if (spiceTier === "high") return CLIP_OVERLAYS_HIGH;
  if (spiceTier === "medium") return CLIP_OVERLAYS_MEDIUM;
  return CLIP_OVERLAYS_LOW;
};

const getBeatOverlayPool = (stage: "pushback" | "escalation" | "shift" | "close") => {
  if (stage === "pushback") return CLIP_OVERLAYS_BEAT_PUSHBACK;
  if (stage === "escalation") return CLIP_OVERLAYS_BEAT_ESCALATION;
  if (stage === "shift") return CLIP_OVERLAYS_BEAT_SHIFT;
  return CLIP_OVERLAYS_BEAT_CLOSE;
};

const pickOverlayForShot = ({
  script,
  rng,
  afterShotIndex,
  messageToShotIndex,
  shotCount
}: {
  script: VideoScript;
  rng: () => number;
  afterShotIndex: number;
  messageToShotIndex: number[];
  shotCount: number;
}) => {
  const useBeatOverlays = Boolean((script.meta as { use_beat_conditioned_overlays?: boolean }).use_beat_conditioned_overlays);
  if (!useBeatOverlays) {
    const overlays = getOverlayPool(script.meta.spice_tier);
    return overlays.length > 0 ? overlays[Math.floor(rng() * overlays.length)] : undefined;
  }
  const pushbackIdx =
    script.beats && Number.isFinite(script.beats.pushback_index) ? (script.beats.pushback_index as number) : -1;
  const revealIdx =
    script.beats && Number.isFinite(script.beats.reveal_index) ? (script.beats.reveal_index as number) : -1;
  const winIdx =
    script.beats && Number.isFinite(script.beats.win_index) ? (script.beats.win_index as number) : script.messages.length - 1;
  const pushbackShot =
    pushbackIdx >= 0
      ? Math.max(0, messageToShotIndex[pushbackIdx] ?? 0)
      : 0;
  const revealShot =
    revealIdx >= 0
      ? Math.max(0, messageToShotIndex[revealIdx] ?? 0)
      : Math.max(1, Math.floor(shotCount * 0.5));
  const winShot =
    winIdx >= 0
      ? Math.max(0, messageToShotIndex[winIdx] ?? Math.max(1, shotCount - 1))
      : Math.max(1, shotCount - 1);
  let stage: "pushback" | "escalation" | "shift" | "close" = "escalation";
  if (afterShotIndex <= pushbackShot + 1) stage = "pushback";
  else if (afterShotIndex < revealShot) stage = "escalation";
  else if (afterShotIndex < winShot) stage = "shift";
  else stage = "close";
  const pool = getBeatOverlayPool(stage);
  return pool[Math.floor(rng() * pool.length)];
};

const pickMandatoryOverlayForShot = ({
  script,
  rng,
  afterShotIndex,
  messageToShotIndex,
  shotCount
}: {
  script: VideoScript;
  rng: () => number;
  afterShotIndex: number;
  messageToShotIndex: number[];
  shotCount: number;
}) => {
  const picked = pickOverlayForShot({
    script,
    rng,
    afterShotIndex,
    messageToShotIndex,
    shotCount
  });
  if (picked && picked.trim().length > 0) return picked;
  const fallbackPool = getOverlayPool(script.meta.spice_tier);
  if (fallbackPool.length > 0) return fallbackPool[Math.floor(rng() * fallbackPool.length)];
  return "WATCH THIS";
};

// Ban low-resolution stinger clips that look terrible when upscaled to 1080x1920.
// These GIF-to-MP4 conversions (250x200, 252x190, etc.) flicker and pixelate.
const BANNED_STINGER_NAMES = [
  "Basketball Shooting GIF",
  "Barney Stinson Flirting GIF",
  "jack nicholson smile GIF",
  "Kobe Bryant Basketball GIF",
  "mine the revenant GIF",
  "So Excited Flirting GIF",
  "lets do it flirting GIF",
  "Im Ready Lets Go GIF",
  "Lets Go Undress GIF by Paxeros",
  "Come Here Lets Go GIF by The Late Late Show",
];
const isBannedStinger = (src: string) => {
  const normalized = src.replace(/\\/g, "/").toLowerCase();
  return BANNED_STINGER_NAMES.some(name => normalized.includes(name.toLowerCase()));
};

const shouldContainFit = (src: string) => {
  const normalized = src.replace(/\\/g, "/").toLowerCase();
  return normalized.startsWith("in between") || normalized.startsWith("after 1 message");
};

const assetKey = (src: string) => src.replace(/\\/g, "/").toLowerCase().trim();

const uniqueAssets = (assets: string[]) => {
  const seen = new Set<string>();
  const output: string[] = [];
  assets.forEach((asset) => {
    const key = assetKey(asset);
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(asset);
  });
  return output;
};

const isPushbackLine = (text: string) => {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  const patterns = [
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
  return patterns.some((pattern) => pattern.test(trimmed));
};

const findPushbackIndex = (messages: VideoScript["messages"]) => {
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message.from !== "girl") continue;
    if (isPushbackLine(message.text)) return i;
  }
  return -1;
};

const findFirstGirlIndex = (messages: VideoScript["messages"]) =>
  messages.findIndex((message) => message.from === "girl");

const resolvePushbackIndex = (script: VideoScript) => {
  const candidate = script.beats && script.beats.pushback_index;
  if (Number.isFinite(candidate)) {
    return Math.max(0, Math.min(script.messages.length - 1, candidate as number));
  }
  return findPushbackIndex(script.messages);
};

const resolveWinIndex = (script: VideoScript) => {
  const candidate = script.beats && script.beats.win_index;
  if (Number.isFinite(candidate)) {
    return Math.max(0, Math.min(script.messages.length - 1, candidate as number));
  }
  return Math.max(0, script.messages.length - 1);
};

export const getConversationPlan = (script: VideoScript, fps: number): ConversationPlan => {
  const isPairFormat = script.meta.format === "B" || script.meta.format === "C" || script.meta.format === "D";
  const isFormatC = script.meta.format === "C";
  const isFormatB = script.meta.format === "B";
  const isFormatD = script.meta.format === "D";
  const isTexmiFormat = isFormatB || isFormatC || isFormatD;
  const messageCount = script.messages.length;
  const typeAtFrames = script.messages.map((message) =>
    Number.isFinite(message.type_at) ? Math.max(0, Math.round(message.type_at * fps)) : null
  );
  const hasTypeAt = typeAtFrames.some((frame) => Number.isFinite(frame));
  // Keep pair shots as 2 messages; allow a single only at the pre-Texmi pushback beat.
  const allowSoloPushback = isFormatB || isFormatC || isFormatD;
  const formatCPushbackIndex = allowSoloPushback ? resolvePushbackIndex(script) : -1;
  const formatCFallbackIndex =
    allowSoloPushback && formatCPushbackIndex < 0
      ? findFirstGirlIndex(script.messages)
      : formatCPushbackIndex;
  const pushbackSoloMessageIndex =
    allowSoloPushback && formatCFallbackIndex >= 0 ? formatCFallbackIndex : undefined;
  const pairLayout = buildPairShotLayout({
    messageCount,
    soloMessageIndex: pushbackSoloMessageIndex
  });
  const shotCount = isPairFormat
    ? pairLayout.shots.length
    : messageCount;
  const baseSeed = resolveSeed(script);

  if (shotCount === 0) {
    const preRollFrames = Math.round(FIRST_SHOT_DURATION_S * fps);
    return {
      shotStartFrames: [],
      shotDurationsInFrames: [],
      pauses: [],
      totalConversationFrames: preRollFrames,
      firstShotFrames: preRollFrames
    };
  }

  const shotMinS = isFormatC ? FORMAT_C_MESSAGE_SHOT_MIN_S : MESSAGE_SHOT_MIN_S;
  const shotMaxS = isFormatC ? FORMAT_C_MESSAGE_SHOT_MAX_S : MESSAGE_SHOT_MAX_S;
  const shotDurationS = isFormatC ? FORMAT_C_MESSAGE_SHOT_DURATION_S : MESSAGE_SHOT_DURATION_S;
  // Format B should feel human-paced but consistent: roughly 2s per shot with slight drift.
  const pairShotTargetS = isFormatB ? 2.0 : shotDurationS;
  const pairShotMinS = isFormatB ? 1.8 : shotMinS;
  const pairShotMaxS = isFormatB ? 2.3 : shotMaxS;
  const minShotFrames = Math.max(1, Math.round(shotMinS * fps));
  const maxShotFrames = Math.max(minShotFrames, Math.round(shotMaxS * fps));
  const beatGridFrames = Math.max(1, Math.round(BEAT_GRID_S * fps));
  const pairShotGridFrames = isFormatB ? Math.max(1, Math.round(0.1 * fps)) : beatGridFrames;

  const storyHoldS = (script.meta as Record<string, unknown>).story_hold_s;
  const storyHoldFrames = typeof storyHoldS === "number" && storyHoldS > 0 ? Math.round(storyHoldS * fps) : 0;
  const preRollFrames = storyHoldFrames > 0
    ? storyHoldFrames
    : hasTypeAt ? 0 : isPairFormat ? 0 : Math.round(FIRST_SHOT_DURATION_S * fps);
  let shotStartFrames: number[] = [];
  let shotDurationsInFrames: number[] = [];

  if (hasTypeAt) {
    if (isPairFormat) {
      const starts: number[] = [];
      const durations: number[] = [];
      let cursor = storyHoldFrames;
      const rng = createRng(`${baseSeed}-pairshots`);
      for (let pairIndex = 0; pairIndex < shotCount; pairIndex += 1) {
        starts.push(cursor);
        const jitterRange = isFormatB ? 0.36 : 0.5;
        const jitter = (rng() - 0.5) * jitterRange;
        const durationS = pairShotTargetS + jitter;
        const rawFrames = Math.max(1, Math.round(durationS * fps));
        const clamped = snapToGrid(
          rawFrames,
          pairShotGridFrames,
          Math.max(1, Math.round(pairShotMinS * fps)),
          Math.max(1, Math.round(pairShotMaxS * fps))
        );
        durations.push(clamped);
        cursor += clamped;
      }
      shotStartFrames = starts;
      shotDurationsInFrames = durations;
    } else {
      shotStartFrames = typeAtFrames.map((frame, index) =>
        Number.isFinite(frame)
          ? (frame as number)
          : preRollFrames + index * minShotFrames
      );
    }

    let lastStart = 0;
    shotStartFrames = shotStartFrames.map((start) => {
      const next = Math.max(start, lastStart);
      lastStart = next;
      return next;
    });

    if (!isPairFormat) {
      shotDurationsInFrames = shotStartFrames.map((start, index) => {
        const next = shotStartFrames[index + 1];
        const raw = typeof next === "number" ? next - start : minShotFrames;
        return Math.max(minShotFrames, raw);
      });
    }
  } else {
    const fallbackMinFrames = Math.max(1, Math.round((isPairFormat ? pairShotMinS : shotMinS) * fps));
    const fallbackMaxFrames = Math.max(
      fallbackMinFrames,
      Math.round((isPairFormat ? pairShotMaxS : shotMaxS) * fps)
    );
    const fallbackGrid = isPairFormat ? pairShotGridFrames : beatGridFrames;
    shotDurationsInFrames = Array.from({ length: shotCount }, (_, index) => {
      const seed = `${baseSeed}-shot-${index}`;
      const minS = isPairFormat ? pairShotMinS : MESSAGE_SHOT_MIN_S;
      const maxS = isPairFormat ? pairShotMaxS : MESSAGE_SHOT_MAX_S;
      const durationS = randomBetween(seed, minS, maxS);
      const rawFrames = Math.max(1, Math.round(durationS * fps));
      return snapToGrid(rawFrames, fallbackGrid, fallbackMinFrames, fallbackMaxFrames);
    });

    shotStartFrames = [];
    let shotCursor = preRollFrames;
    for (const duration of shotDurationsInFrames) {
      shotStartFrames.push(shotCursor);
      shotCursor += duration;
    }
  }

  const pauseSpecs: PauseSpec[] = [];
  const pauseRng = createRng(`${baseSeed}-pause-overlays`);
  let texmiSuggestedMessageIndex: number | undefined;
  let texmiPreviewEndMessageIndex: number | undefined;
  if (isPairFormat) {
    const stingerAssets = script.meta.stinger_assets ?? [];
    let stingerOneSrc =
      stingerAssets.length > 0
        ? stingerAssets[0]
        : script.stinger && script.stinger.after_first
        ? script.stinger.after_first
        : STINGER_ONE_GIF;
    let stingerWinSrc = stingerAssets.length > 1 ? stingerAssets[1] : stingerOneSrc;
    if (isBannedStinger(stingerOneSrc)) {
      const fallback = stingerAssets.filter((asset) => !isBannedStinger(asset));
      stingerOneSrc =
        fallback.length > 0
          ? fallback[0]
          : STINGER_ONE_GIF;
    }
    if (isBannedStinger(stingerWinSrc)) {
      stingerWinSrc = stingerOneSrc;
    }
    const stingerOneFit = shouldContainFit(stingerOneSrc) ? "contain" : "cover";
    const stingerWinFit = shouldContainFit(stingerWinSrc) ? "contain" : "cover";
    // B/C/D use the pushback beat as the Texmi/stinger anchor.
    const pushbackIndex = allowSoloPushback ? formatCFallbackIndex : resolvePushbackIndex(script);
    const pushbackShotIndex =
      pushbackIndex >= 0 ? Math.max(0, pairLayout.messageToShotIndex[pushbackIndex] ?? 0) : 0;
    const appInsertPolicy = script.meta.app_insert_policy || "optional";
    const plugFrequency = 0.35;
    const plugRng = createRng(`${baseSeed}-texmi`);
    let shouldInsertPlug =
      isTexmiFormat &&
      (appInsertPolicy === "required" ||
        (appInsertPolicy !== "off" && plugRng() < plugFrequency));

    let firstPauseAfterShotIndex = pushbackShotIndex;
    if (shouldInsertPlug) {
      // Explicit plug positioning: texmi_after_message overrides auto-positioning.
      // The plug fires after the shot containing this message index,
      // and the first boy message after it becomes the suggestion.
      const explicitAfterMsg = (script.meta as Record<string, unknown>).texmi_after_message;
      const hasExplicitPlug = typeof explicitAfterMsg === "number" && explicitAfterMsg >= 0;

      const revealMessageIndex =
        script.beats && Number.isFinite(script.beats.reveal_index)
          ? (script.beats.reveal_index as number)
          : -1;
      const revealShotIndex =
        revealMessageIndex >= 0 ? Math.max(0, pairLayout.messageToShotIndex[revealMessageIndex] ?? -1) : -1;
      let afterShotIndex: number;
      if (hasExplicitPlug) {
        // Use explicit position: plug fires after the shot containing this message
        afterShotIndex = Math.max(0, pairLayout.messageToShotIndex[explicitAfterMsg as number] ?? 0);
      } else {
        // Auto-position: place plug at 50-60% through the conversation
        const midConversationShot = Math.max(1, Math.floor(shotCount * 0.55));
        afterShotIndex = Math.max(
          pushbackShotIndex + 1,
          Math.min(shotCount - 2, midConversationShot)
        );
        // Plug should come AFTER the reveal (when tension is highest), never before it
        if (revealShotIndex > afterShotIndex) {
          afterShotIndex = Math.min(shotCount - 2, revealShotIndex + 1);
        }
      }
      firstPauseAfterShotIndex = afterShotIndex;
      // Find last message visible at the new plug position.
      let endMessageIndex = pushbackIndex >= 0 ? pushbackIndex : 0;
      for (let i = 0; i < pairLayout.messageToShotIndex.length; i++) {
        if (pairLayout.messageToShotIndex[i] === afterShotIndex) endMessageIndex = i;
      }
      texmiPreviewEndMessageIndex = endMessageIndex;
      // Find first boy message after the plug position (becomes the suggested response).
      for (let i = endMessageIndex + 1; i < script.messages.length; i++) {
        if (script.messages[i].from === "boy") {
          texmiSuggestedMessageIndex = i;
          break;
        }
      }
      const suggestedShotIndex =
        texmiSuggestedMessageIndex != null
          ? (pairLayout.messageToShotIndex[texmiSuggestedMessageIndex] ?? -1)
          : -1;
      if (suggestedShotIndex <= afterShotIndex) {
        // Try earlier shot positions until sequencing is valid.
        let found = false;
        for (let tryIdx = afterShotIndex - 1; tryIdx >= pushbackShotIndex + 1; tryIdx--) {
          let tryEnd = pushbackIndex >= 0 ? pushbackIndex : 0;
          for (let i = 0; i < pairLayout.messageToShotIndex.length; i++) {
            if (pairLayout.messageToShotIndex[i] === tryIdx) tryEnd = i;
          }
          let trySuggested: number | undefined;
          for (let i = tryEnd + 1; i < script.messages.length; i++) {
            if (script.messages[i].from === "boy") { trySuggested = i; break; }
          }
          const trySuggestedShot =
            trySuggested != null ? (pairLayout.messageToShotIndex[trySuggested] ?? -1) : -1;
          if (trySuggestedShot > tryIdx) {
            afterShotIndex = tryIdx;
            firstPauseAfterShotIndex = tryIdx;
            texmiPreviewEndMessageIndex = tryEnd;
            texmiSuggestedMessageIndex = trySuggested;
            found = true;
            break;
          }
        }
        if (!found) {
          shouldInsertPlug = false;
          firstPauseAfterShotIndex = pushbackShotIndex;
          texmiPreviewEndMessageIndex = undefined;
          texmiSuggestedMessageIndex = undefined;
        }
      }
      if (shouldInsertPlug) {
        pauseSpecs.push({
          afterShotIndex,
          durationInFrames: Math.round(TEXMI_PLUG_DURATION_S * fps),
          src: "",
          fit: "cover",
          kind: "texmi-plug"
        });
      }
    }
    if (!shouldInsertPlug) {
      pauseSpecs.push({
        afterShotIndex: pushbackShotIndex,
        durationInFrames: Math.round(STINGER_ONE_DURATION_S * fps),
        src: stingerOneSrc,
        fit: stingerOneFit,
        kind: "stinger",
        overlayText: pickMandatoryOverlayForShot({
          script,
          rng: pauseRng,
          afterShotIndex: pushbackShotIndex,
          messageToShotIndex: pairLayout.messageToShotIndex,
          shotCount
        })
      });
    }
    const mediaPauseMinShotGap = isFormatB ? 1 : 1;
    const winIndex = resolveWinIndex(script);
    let winAfterShotIndex = Math.min(
      Math.max(0, shotCount - 1),
      Math.max(0, pairLayout.messageToShotIndex[winIndex] ?? (shotCount - 1))
    );
    if (
      winAfterShotIndex !== firstPauseAfterShotIndex &&
      Math.abs(winAfterShotIndex - firstPauseAfterShotIndex) >= mediaPauseMinShotGap
    ) {
      pauseSpecs.push({
        afterShotIndex: winAfterShotIndex,
        durationInFrames: Math.round(STINGER_ONE_DURATION_S * fps),
        src: stingerWinSrc,
        fit: stingerWinFit,
        kind: "stinger",
        overlayText: pickMandatoryOverlayForShot({
          script,
          rng: pauseRng,
          afterShotIndex: winAfterShotIndex,
          messageToShotIndex: pairLayout.messageToShotIndex,
          shotCount
        })
      });
    }

  }

  const inBetweenAssets = uniqueAssets(script.meta.in_between_assets ?? []);
  if (shotCount > 1 && inBetweenAssets.length > 0) {
    const reservedSlots = new Set<number>(
      pauseSpecs.filter((pause) => pause.kind === "stinger" || pause.kind === "texmi-plug").map((pause) => pause.afterShotIndex)
    );
    const mediaPauseMinShotGap = isFormatB ? 1 : 1;
    const possibleSlots: number[] = [];
    for (let i = 0; i < shotCount - 1; i += 1) {
      const tooCloseToReserved = Array.from(reservedSlots).some(
        (slot) => Math.abs(slot - i) < mediaPauseMinShotGap
      );
      if (!reservedSlots.has(i) && !tooCloseToReserved) possibleSlots.push(i);
    }
    if (possibleSlots.length > 0) {
      const rng = createRng(`${baseSeed}-between`);
      const fromCadence = Math.round(shotCount / CLIP_TARGET_EVERY_N_MESSAGES);
      const cadenceTarget = Math.min(CLIP_MAX_COUNT, Math.max(CLIP_MIN_COUNT, fromCadence));
      const countMin = Math.max(IN_BETWEEN_MIN_COUNT, cadenceTarget - 1);
      const countMax = Math.min(IN_BETWEEN_MAX_COUNT + 2, cadenceTarget + 1);
      // Competitor benchmark: even short videos need frequent B-roll to maintain pacing (~1 change every 2.3s)
      // Previous cap of 2 for short videos caused 9-second DM stretches with no visual break
      const shortConversationMax = shotCount <= 5 ? Math.max(3, countMax) : countMax;
      const desiredCount = Math.min(shortConversationMax, Math.max(countMin, pickRandomInt(rng, countMin, countMax)));
      const minRequiredForFormat = script.meta.format === "B" ? 3 : 1;
      const basePool = possibleSlots.length > 0
        ? possibleSlots
        : Array.from({ length: Math.max(0, shotCount - 1) }, (_, i) => i);
      // Reduced from Math.max(2, ...) to allow adjacent B-roll — competitors show clips every 1-2 shots
      const minGap = Math.max(1, mediaPauseMinShotGap);
      const shuffledBasePool = shuffleInPlace([...basePool], rng);
      const takenSlots = Array.from(reservedSlots);
      const finalSlots: number[] = [];
      const canUseSlot = (slot: number) => takenSlots.every((taken) => Math.abs(taken - slot) >= minGap);
      for (const slot of shuffledBasePool) {
        if (finalSlots.length >= desiredCount) break;
        if (!canUseSlot(slot)) continue;
        finalSlots.push(slot);
        takenSlots.push(slot);
      }
      if (finalSlots.length < minRequiredForFormat) {
        const fallbackPool = shuffleInPlace(
          Array.from({ length: Math.max(0, shotCount - 1) }, (_, i) => i),
          rng
        );
        for (const slot of fallbackPool) {
          if (finalSlots.length >= minRequiredForFormat) break;
          if (!canUseSlot(slot)) continue;
          finalSlots.push(slot);
          takenSlots.push(slot);
        }
      }
      const count = Math.min(finalSlots.length, inBetweenAssets.length);
      const clippedSlots = finalSlots.slice(0, count).sort((a, b) => a - b);
      if (count > 0) {
        const assets = [...inBetweenAssets];
        if (assets.length >= count) shuffleInPlace(assets, rng);
        clippedSlots.forEach((afterShotIndex, index) => {
          const asset =
            assets.length >= count
              ? assets[index]
              : inBetweenAssets[Math.floor(rng() * inBetweenAssets.length)];
          const durationS = CLIP_MIN_DURATION_S + rng() * (CLIP_MAX_DURATION_S - CLIP_MIN_DURATION_S);
          // ALWAYS add overlay text to in-between clips — competitors never show naked B-roll
          const overlayText = pickMandatoryOverlayForShot({
            script,
            rng: pauseRng,
            afterShotIndex,
            messageToShotIndex: isPairFormat ? pairLayout.messageToShotIndex : Array.from({ length: messageCount }, (_, i) => i),
            shotCount
          });
          pauseSpecs.push({
            afterShotIndex,
            durationInFrames: Math.max(1, Math.round(durationS * fps)),
            src: asset,
            fit: shouldContainFit(asset) ? "contain" : "cover",
            kind: "in-between",
            overlayText
          });
        });
      }
    }
  }

  // MANDATORY MID-VIDEO B-ROLL — ensures no >6s gap between visual changes
  // Placed AFTER all other clips to avoid slot collisions
  if (isPairFormat && shotCount >= 4) {
    const allUsedSlots = new Set(pauseSpecs.map((p) => p.afterShotIndex));
    // Find the largest gap between consecutive B-roll clips
    const sortedSlots = [...allUsedSlots].sort((a, b) => a - b);
    let largestGap = 0;
    let gapStart = 0;
    for (let i = 0; i < sortedSlots.length - 1; i++) {
      const gap = sortedSlots[i + 1] - sortedSlots[i];
      if (gap > largestGap) {
        largestGap = gap;
        gapStart = sortedSlots[i];
      }
    }
    // If there's a gap of 3+ shots with no B-roll, insert one at the midpoint
    if (largestGap >= 3) {
      const midSlot = gapStart + Math.floor(largestGap / 2);
      if (!allUsedSlots.has(midSlot) && midSlot < shotCount - 1) {
        const midRng = createRng(`${baseSeed}-midgap`);
        const midAssets = uniqueAssets(script.meta.in_between_assets ?? []);
        const midSrc = midAssets.length > 0
          ? midAssets[Math.floor(midRng() * midAssets.length)]
          : STINGER_ONE_GIF;
        pauseSpecs.push({
          afterShotIndex: midSlot,
          durationInFrames: Math.round(STINGER_ONE_DURATION_S * fps),
          src: midSrc,
          fit: shouldContainFit(midSrc) ? "contain" : "cover",
          kind: "in-between",
          overlayText: pickMandatoryOverlayForShot({
            script,
            rng: pauseRng,
            afterShotIndex: midSlot,
            messageToShotIndex: isPairFormat ? pairLayout.messageToShotIndex : Array.from({ length: messageCount }, (_, i) => i),
            shotCount
          })
        });
      }
    }
  }

  const pauseMap = new Map<number, PauseSpec[]>();
  pauseSpecs.forEach((pause) => {
    const list = pauseMap.get(pause.afterShotIndex) ?? [];
    list.push(pause);
    pauseMap.set(pause.afterShotIndex, list);
  });

  const pauses: Pause[] = [];
  let realCursor = shotStartFrames.length > 0 ? shotStartFrames[0] : preRollFrames;
  for (let i = 0; i < shotCount; i += 1) {
    realCursor += shotDurationsInFrames[i];
    const after = pauseMap.get(i);
    if (after && after.length > 0) {
      after
        .sort((a, b) => {
          const orderA = a.kind === "stinger" || a.kind === "texmi-plug" ? 0 : 1;
          const orderB = b.kind === "stinger" || b.kind === "texmi-plug" ? 0 : 1;
          return orderA - orderB;
        })
        .forEach((pause) => {
          pauses.push({ ...pause, startFrame: realCursor });
          realCursor += pause.durationInFrames;
        });
    }
  }

  if (isFormatB) {
    const minAllowed = Math.round(pairShotMinS * fps);
    const maxAllowed = Math.round(pairShotMaxS * fps);
    const invalidShot = shotDurationsInFrames.find((frames) => frames < minAllowed || frames > maxAllowed);
    if (invalidShot !== undefined) {
      throw new Error(
        `Format B shot duration out of bounds: ${invalidShot} frames (expected ${minAllowed}-${maxAllowed})`
      );
    }
    const mediaSlots = pauseSpecs
      .filter((pause) => pause.kind === "stinger" || pause.kind === "in-between")
      .map((pause) => pause.afterShotIndex)
      .sort((a, b) => a - b);
    for (let i = 1; i < mediaSlots.length; i += 1) {
      // Relaxed from 2 to 1 — competitors show B-roll on adjacent shots for faster pacing
      if (mediaSlots[i] - mediaSlots[i - 1] < 1) {
        throw new Error(
          `Format B media pauses too close: afterShotIndex ${mediaSlots[i - 1]} and ${mediaSlots[i]}`
        );
      }
    }
  }

  const desiredFrames = Number.isFinite(script.meta?.duration_s)
    ? Math.round(script.meta.duration_s * fps)
    : 0;
  // Pair formats: end exactly after the last shot+stinger to avoid lingering on the final pair
  const totalConversationFrames = isPairFormat
    ? realCursor
    : desiredFrames > realCursor ? desiredFrames : realCursor;

  return {
    shotStartFrames,
    shotDurationsInFrames,
    pauses,
    totalConversationFrames,
    firstShotFrames: isPairFormat ? (storyHoldFrames > 0 ? storyHoldFrames : shotDurationsInFrames[0]) : preRollFrames,
    pushbackSoloMessageIndex,
    texmiSuggestedMessageIndex,
    texmiPreviewEndMessageIndex
  };
};

export const applyPausesToFrame = (frame: number, pauses: Pause[]) => {
  let adjusted = frame;
  for (const pause of pauses) {
    const pauseEnd = pause.startFrame + pause.durationInFrames;
    if (frame >= pauseEnd) {
      adjusted -= pause.durationInFrames;
      continue;
    }
    if (frame >= pause.startFrame) {
      adjusted -= frame - pause.startFrame;
      break;
    }
  }
  return Math.max(0, adjusted);
};

export const addPausesToFrame = (frame: number, pauses: Pause[]) => {
  let adjusted = frame;
  for (const pause of pauses) {
    if (adjusted >= pause.startFrame) {
      adjusted += pause.durationInFrames;
    }
  }
  return Math.max(0, adjusted);
};
