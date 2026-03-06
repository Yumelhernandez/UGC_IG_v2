export type PairShotLayout = {
  shots: number[][];
  messageToShotIndex: number[];
};

export const buildPairShotLayout = ({
  messageCount,
  soloPairIndex,
  soloMessageIndex
}: {
  messageCount: number;
  soloPairIndex?: number;
  soloMessageIndex?: number;
}): PairShotLayout => {
  const count = Math.max(0, messageCount);
  const messageToShotIndex = Array.from({ length: count }, () => -1);
  const shots: number[][] = [];
  let cursor = 0;
  let shotIndex = 0;
  let isolatedMessageIndex =
    Number.isInteger(soloMessageIndex) && (soloMessageIndex as number) >= 0 && (soloMessageIndex as number) < count
      ? (soloMessageIndex as number)
      : undefined;

  // Backward compatibility: preserve prior behavior when only soloPairIndex is supplied.
  if (isolatedMessageIndex === undefined && soloPairIndex !== undefined) {
    const pairIndex = Math.max(0, Math.floor(soloPairIndex));
    const candidate = pairIndex * 2;
    if (candidate < count) isolatedMessageIndex = candidate;
  }

  while (cursor < count) {
    if (isolatedMessageIndex !== undefined && cursor === isolatedMessageIndex) {
      shots.push([cursor]);
      messageToShotIndex[cursor] = shotIndex;
      cursor += 1;
      shotIndex += 1;
      continue;
    }

    const shot: number[] = [cursor];
    messageToShotIndex[cursor] = shotIndex;
    if (cursor + 1 < count) {
      shot.push(cursor + 1);
      messageToShotIndex[cursor + 1] = shotIndex;
    }
    shots.push(shot);
    cursor += 2;
    shotIndex += 1;
  }

  return { shots, messageToShotIndex };
};
