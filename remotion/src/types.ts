export type Message = {
  from: "girl" | "boy";
  text: string;
  type_at: number;
  response_type?: "challenge" | "dismissal" | "test" | "tease" | "concession" | "condition" | "close";
};

export type ConversationFormat = "A" | "B" | "C" | "D";

export type BeatPlan = {
  inciting_incident: string;
  first_reaction: string;
  escalation_turn: string;
  hook?: string;
  test?: string;
  escalation?: string;
  shift?: string;
  close?: string;
  shareable_moment: string;
  pre_close_tension: string;
  required_markers?: string[];
  resolution_type: string;
};

export type VideoScript = {
  video_id: string;
  meta: {
    theme: string;
    duration_s: number;
    spice_tier: "low" | "medium" | "high";
    controversy_tier: "safe" | "spicy" | "edge";
    format?: ConversationFormat;
    format_variant?: "short" | "long";
    arc_type?: "number_exchange" | "rejection" | "plot_twist" | "cliffhanger";
    girl_archetype?: string;
    conversation_mode?: "cumulative" | "pair_isolated";
    app_insert_policy?: "off" | "optional" | "required";
    use_beat_conditioned_overlays?: boolean;
    qa_overrides?: {
      first_gap_reason?: string;
    };
    timing_seed?: string;
    in_between_assets?: string[];
    stinger_assets?: string[];
    audio_track?: string;
    beat_plan?: BeatPlan;
  };
  beat_plan?: BeatPlan;
  beats?: {
    pushback_index?: number;
    reveal_index?: number;
    win_index?: number;
    shareable_index?: number;
    reveal_line?: string;
  };
  hook?: {
    mode?: "media" | "reply";
    asset?: string;
    headline?: string;
    subtitle?: string;
  };
  stinger?: {
    after_first?: string;
  };
  story: {
    username: string;
    age: number;
    caption: string;
    asset: string;
    avatar?: string;
  };
  reply: {
    from: "boy" | "girl";
    text: string;
  };
  persona: {
    boy: { name: string; age: number };
    girl: { name: string; age: number; tone?: string };
  };
  plug_line?: string;
  messages: Message[];
};
