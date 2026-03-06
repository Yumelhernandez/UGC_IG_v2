# PRD V2 Assumption Audit (Question Everything)
Date: 2026-02-09
Scope: readiness check before implementation
Project: /Users/yumelhernandez/UGC_Two_IG

## 1) Data Confidence Audit (before any decision)
- Viral dataset size is strong (107 videos), but extraction completeness is not full.
- In `/Users/yumelhernandez/UGC_Two_IG/viral_patterns.json`:
- `no_hook`: 52/107
- `no_first_response`: 53/107
- `no_messages`: 18/107
- `no_clips`: 21/107
- Implication: any rule based only on `hook_line`/`first_response` has medium confidence, not high confidence.
- Action: tag all assumptions with confidence level and avoid hard-coding thresholds from incomplete fields unless cross-validated with raw mp4 checks.

## 2) Assumption-by-Assumption Stress Test
## 2.1 Hook + Tone
| Assumption | Status | Evidence | Implementation Decision |
|---|---|---|---|
| Viral hooks are mostly explicit/sexual | **Rejected** | Unique hook set: ~15% sexual-suggestive; majority is playful/absurd or witty | Use controversy mix, not all-in explicit. |
| Viral hooks are mostly question format | **Partial** | `?` in ~37.7% hooks | Keep both question and statement hooks. |
| “DM-first” opening is mandatory | **Partial** | In videos with messages+clips, first clip happens before first response ~85.5%; before second message ~72.1% | Require DM incident visible first, but allow early clip before first response. |
| Generic title hooks can still win | **Rejected** | Viral hook uniqueness is very high (53 unique of 55 observed); generic “how to/win in dms” is not representative | Penalize generic title families hard. |
| Your current openers match viral controversy | **Rejected** | Generated openers (2026-02-13/14): 0% sexual/risk markers vs viral hooks ~16.4% sexual, ~5.5% risk | Add calibrated controversy tiering. |

## 2.2 Girl/Boy Language and Response Dynamics
| Assumption | Status | Evidence | Implementation Decision |
|---|---|---|---|
| Girl first response should be witty roast | **Partial/Leaning Rejected** | Viral first responses median ~3-4 words, <=5 words ~77.8%; many are confusion/shock/short reaction | First response should usually be short reaction; witty comeback should be less frequent. |
| Girl first response should always be 1-5 words | **Partial** | High prevalence but not universal | Use soft target distribution: ~75-80% <=5, allow exceptions. |
| Boy should mostly make statements, not questions | **Rejected** | Viral boy question rate ~17.6%; generated recent ~5.9% | Increase boy question/challenge frequency. |
| Two-girl ending is best practice | **Unknown/Leaning Rejected** | Current pipeline has this in almost all recent scripts; viral corpus does not show this as dominant requirement | Remove as fixed template; allow multiple ending shapes by arc. |
| Phrase reuse at current level is acceptable | **Rejected** | Cross-date repeats are high (`and what about it`, `ok?`, `let me take you out this week`, etc.) vs viral high uniqueness | Add strict anti-repeat memory and n-gram novelty gates. |

## 2.3 Controversy Calibration
| Assumption | Status | Evidence | Implementation Decision |
|---|---|---|---|
| Maximum controversy should be default | **Rejected** | Viral mix includes provocative hooks but majority are non-explicit playful lines | Implement `controversy_tier` with target mix. |
| Safety-neutral lines are enough for virality | **Rejected** | Current outputs are cleaner than viral style and likely under-polarized | Increase controlled risk language within policy-safe bounds. |
| All videos should use same controversy level | **Rejected** | Viral set shows broad spread from mild to high | Use tiered distribution in batch generation. |

## 2.4 Segment Structure + Rhythm
| Assumption | Status | Evidence | Implementation Decision |
|---|---|---|---|
| First conversational gap must be <=2.4s | **Unknown** | Viral timestamps in extracted set are coarse; first girl->next boy mean ~5.18s in extraction, while your pair-render mode changes perceived pacing | Do not hard-lock 2.4s yet; evaluate perceived gap from rendered frames, then set threshold. |
| Current pair-isolated conversation view is fine | **Rejected** | Manual render review shows context fragmentation; viral references preserve cumulative readability | Move Format B to cumulative thread display. |
| Clip every 2-3 messages is enough by itself | **Rejected** | Viral clips act as commentary; current clips are often semantically generic | Condition clip choice/overlay on narrative beat. |
| Overlay text is always required | **Partial** | Not all viral clips need overlay, but many do | Require overlay for specific beat types, optional for others. |

## 2.5 App/Tool Inserts (Texmi/AURA-like segment)
| Assumption | Status | Evidence | Implementation Decision |
|---|---|---|---|
| App insert should be in every video | **Rejected** | Viral analysis shows AURA/AI-tool-like pattern in ~26/107 videos (~24%) | Make app insert optional frequency, not universal. |
| App insert can appear early without cost | **Unknown/Leaning Rejected** | Early inserts can break narrative lock-in | Place after core tension is established (mid/late). |
| Your current plug language is equivalent to viral | **Rejected** | Viral tool reveals feel like twist/utility proof; current plug often feels templated | Redesign plug as context-sensitive reveal, not static ad card. |

## 2.6 Arc Strategy
| Assumption | Status | Evidence | Implementation Decision |
|---|---|---|---|
| Arc labels currently reflect real narrative diversity | **Rejected** | Recent batches: non-number arcs still include number-drop endings (e.g., 4/5 on 2026-02-14 mismatch) | Add hard arc-behavior integrity gate. |
| Equal arc distribution is best | **Unknown** | Viral observed arcs: number_exchange dominant (61%), rejection 20%, plot_twist very low in extraction | Keep diversity for experimentation, but don’t force unrealistic parity in production. |
| Cliffhanger should still resolve with number | **Rejected** | Contradicts cliffhanger semantics and novelty goal | Enforce unresolved ending for cliffhanger. |

## 2.7 Selection and QA
| Assumption | Status | Evidence | Implementation Decision |
|---|---|---|---|
| Existing QA pass implies viral readiness | **Rejected** | Structural QA can pass with arc mismatch, repetition, and narrative weakness | Add viral-mechanics QA layer. |
| Current candidate scoring captures novelty enough | **Rejected** | Hook/line repetition still high in generated sets | Add cross-batch lexical diversity penalties. |
| Timing-only metrics are enough | **Rejected** | Semantic beat-fit and arc integrity are missing | Add semantic checks and beat-map requirements. |

## 3) Required Changes to Make Plan Truly Implementable
## 3.1 Add confidence tags to PRD requirements
- `high_confidence` from robust evidence (e.g., uniqueness, arc mismatch currently observed).
- `medium_confidence` from partial extraction fields.
- `experimental` when dataset is ambiguous.

## 3.2 Replace hard assumptions with distributions
- `controversy_tier_distribution`: calibrated (example starting point `safe:0.45`, `spicy:0.40`, `edge:0.15`).
- `first_girl_response_len_distribution`: target around viral profile (majority <=5, not forced 100%).
- `app_insert_frequency`: around `0.2-0.35` until metrics justify change.

## 3.3 Enforce arc integrity immediately
- In `/Users/yumelhernandez/UGC_Two_IG/tools/lib/qa.js`:
- Fail when `rejection|plot_twist|cliffhanger` includes explicit number exchange close.
- Add per-arc ending validators.

## 3.4 Fix phrase repetition structurally
- Add rolling memory store of recent hooks and high-salience lines (14-30 days).
- Penalize near-duplicate closers and repeated girl reaction patterns.

## 3.5 Rework rendering sequence assumptions
- Keep DM incident visible first.
- Allow early cutaway before first response if it comments on the hook.
- Replace pair-isolated display with cumulative thread continuity in Format B.

## 4) Concrete “Ready-to-Implement” Spec Updates
1. Add `meta.controversy_tier` and track it through generation + QA + selection.
2. Add `meta.beat_plan` with explicit semantic beats, not just arc label.
3. Add `qa:arc_integrity` and `qa:novelty_memory` gates.
4. Add `selection:semantic_fit_score` for clip-overlay-to-beat alignment.
5. Add `render:conversation_mode` default `cumulative` for Format B.
6. Add `render:app_insert_policy` (`off|optional|required`) with default `optional`.

## 5) What Is Still Unknown (must be tested, not assumed)
- Exact optimal first-gap threshold after cumulative rendering change.
- Optimal controversy mix for your account safety + performance.
- Whether app inserts increase or decrease completion in your audience segment.
- Whether rejection/plot-twist arcs outperform number_exchange on shares in your page context.

## 6) Decision Log (Recommended Defaults)
- Use `number_exchange` as plurality arc, not monopoly.
- Make `rejection` and `cliffhanger` truly distinct behaviorally.
- Keep controversy calibrated, not maximal.
- Prioritize novelty via anti-repeat memory over adding more templates.
- Treat this as a measured system with weekly coefficient updates from actual platform metrics.
