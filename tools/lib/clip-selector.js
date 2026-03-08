const path = require('path');

function selectClipsForConversation({ messages, beats, clipMetadata, inBetweenAssets, rng, count }) {
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

  const slots = [];
  for (let i = 0; i < numClips; i++) {
    const position = i / numClips;
    const msgIdx = Math.min(Math.floor(position * messages.length), messages.length - 1);
    const msg = messages[msgIdx];
    const text = (msg && msg.text || '').toLowerCase();

    let emotionNeeds = [];
    let stage = 'escalation';

    if (msgIdx <= pushbackIdx + 1) {
      stage = 'pushback';
      emotionNeeds = ['tense', 'confrontational', 'focused', 'pressure', 'intense', 'defensive'];
    } else if (msgIdx < revealIdx) {
      stage = 'escalation';
      emotionNeeds = ['determined', 'building', 'strategic', 'aggressive', 'confident', 'competitive'];
    } else if (msgIdx < winIdx) {
      stage = 'shift';
      emotionNeeds = ['impressed', 'surprised', 'cracking', 'turning', 'amused', 'knowing', 'satisfied'];
    } else {
      stage = 'close';
      emotionNeeds = ['victorious', 'celebrating', 'champion', 'triumphant', 'smooth'];
    }

    if (text.includes('pray') || text.includes('please')) emotionNeeds.push('praying', 'hoping');
    if (text.includes('\ud83d\udc80') || text.includes('what') || text.includes('excuse')) emotionNeeds.push('shocked', 'disbelief');
    if (text.includes('\ud83d\ude2d') || text.includes('lmao') || text.includes('smooth')) emotionNeeds.push('laughing', 'amused', 'impressed');
    if (text.includes('no') || text.includes('nah') || text.includes('pass')) emotionNeeds.push('defeated', 'rejected');

    slots.push({ stage, emotionNeeds, msgIdx });
  }

  const used = new Set();
  const selected = [];

  for (const slot of slots) {
    let bestClip = null;
    let bestScore = -1;

    for (const clip of clipMetadata) {
      if (!inBetweenAssets.some(a => a.includes(clip.file))) continue;
      if (used.has(clip.file)) continue;
      if ((clip.best_moment || '').includes('DO NOT USE')) continue;

      let score = 0;
      const emotion = (clip.emotion || '').toLowerCase();
      const bestMoment = (clip.best_moment || '').toLowerCase();

      if (bestMoment.includes(slot.stage)) score += 3;
      if (clip.beat_category === slot.stage) score += 2;

      for (const need of slot.emotionNeeds) {
        if (emotion.includes(need)) score += 2;
        if (bestMoment.includes(need)) score += 1;
      }

      if (clip.description && clip.description.length > 30) score += 1;
      score += rng() * 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestClip = clip;
      }
    }

    if (bestClip) {
      selected.push(bestClip.path || ('In between messages/' + bestClip.file));
      used.add(bestClip.file);
    } else {
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
