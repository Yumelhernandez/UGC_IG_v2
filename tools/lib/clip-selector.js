const path = require('path');

/**
 * Select B-roll clips that match the conversation's emotional arc.
 *
 * Uses beat_category from clip_metadata.json (enriched from clip_categories.json):
 *   pushback → girl pushes back, tension rises
 *   escalation → boy escalates, energy builds
 *   shift → girl starts to crack
 *   close → boy closes the deal, celebration
 *   general → versatile, any moment
 *
 * Also factors in: clip type (reaction vs quote_card), energy, has_baked_text.
 */
function selectClipsForConversation({ messages, beats, clipMetadata, inBetweenAssets, rng, count, arcType }) {
  // Fallback: random shuffle if no metadata
  if (!clipMetadata || !clipMetadata.length || !messages || !messages.length) {
    const shuffled = [...inBetweenAssets];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count || 6);
  }

  const pushbackIdx = beats && Number.isFinite(beats.pushback_index) ? beats.pushback_index : 0;
  const revealIdx = beats && Number.isFinite(beats.reveal_index) ? beats.reveal_index : Math.floor(messages.length * 0.5);
  const winIdx = beats && Number.isFinite(beats.win_index) ? beats.win_index : messages.length - 1;
  const numClips = count || Math.min(6, Math.max(3, Math.floor(messages.length / 2)));

  // Build clip slots based on conversation position
  const slots = [];
  for (let i = 0; i < numClips; i++) {
    const position = i / numClips;
    const msgIdx = Math.min(Math.floor(position * messages.length), messages.length - 1);
    const msg = messages[msgIdx];
    const text = (msg && msg.text || '').toLowerCase();

    let stage = 'general';
    let preferEnergy = 'medium';

    if (msgIdx <= pushbackIdx + 1) {
      stage = 'pushback';
      preferEnergy = 'high';
    } else if (msgIdx < revealIdx) {
      stage = 'escalation';
      preferEnergy = 'high';
    } else if (msgIdx < winIdx) {
      stage = 'shift';
      preferEnergy = 'medium';
    } else {
      stage = 'close';
      preferEnergy = 'high';
    }

    // Cliffhanger arcs: last clip should NOT be celebratory
    if (arcType === 'cliffhanger' && i === numClips - 1) {
      stage = 'general';
      preferEnergy = 'medium';
    }

    slots.push({ stage, preferEnergy, msgIdx, text });
  }

  // Filter clips to only those available on disk
  const availableSet = new Set(inBetweenAssets.map(a => path.basename(a).replace(/\.mp4$/i, '')));
  const availableClips = clipMetadata.filter(clip => {
    const fname = (clip.file || '').replace(/\.mp4$/i, '');
    return availableSet.has(fname) || inBetweenAssets.some(a => a.includes(clip.file));
  });

  const used = new Set();
  const selected = [];

  for (const slot of slots) {
    let bestClip = null;
    let bestScore = -1;

    for (const clip of availableClips) {
      if (used.has(clip.file)) continue;
      // HARD SKIP baked-text clips — they clash with our overlay text
      if (clip.has_baked_text) continue;

      let score = 0;

      // PRIMARY: beat_category match (strongest signal)
      if (clip.beat_category === slot.stage) score += 5;
      // Adjacent beat is OK (escalation clip for shift slot)
      if (clip.beat_category === 'general') score += 1;
      if (slot.stage === 'shift' && clip.beat_category === 'escalation') score += 2;
      if (slot.stage === 'escalation' && clip.beat_category === 'shift') score += 2;

      // SECONDARY: energy match
      if (clip.energy === slot.preferEnergy) score += 2;
      if (clip.energy === 'high' && slot.preferEnergy === 'high') score += 1; // bonus for high-high

      // TERTIARY: type preference (reactions > quote_cards for mid-convo)
      if (clip.type === 'reaction' || clip.type === 'gif_reaction') score += 1;
      // baked_text clips are hard-skipped above — no penalty needed

      // BONUS: enriched fields if they exist
      const emotion = (clip.emotion || '').toLowerCase();
      const bestMoment = (clip.best_moment || '').toLowerCase();
      if (bestMoment.includes(slot.stage)) score += 3;
      if (clip.description && clip.description.length > 30) score += 1;

      // Randomness to avoid always picking the same clips
      score += rng() * 1.5;

      if (score > bestScore) {
        bestScore = score;
        bestClip = clip;
      }
    }

    if (bestClip) {
      selected.push(bestClip.path || ('In between messages/' + bestClip.file));
      used.add(bestClip.file);
    } else {
      // Fallback: pick any unused clip
      const unused = inBetweenAssets.filter(a => !used.has(path.basename(a)));
      if (unused.length) {
        const pick = unused[Math.floor(rng() * unused.length)];
        selected.push(pick);
        used.add(path.basename(pick));
      }
    }
  }

  return selected;
}

module.exports = { selectClipsForConversation };
