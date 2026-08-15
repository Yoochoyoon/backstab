export type Role = "boss" | "bodyguard" | "spy" | "traitor";

export type Phase =
  | "lobby"
  | "night"
  | "day_reveal"
  | "day_discussion"
  | "day_vote"
  | "game_over";

export type NightActionType =
  | "attack"
  | "boss_execute"
  | "bodyguard_shield"
  | "bodyguard_oath"
  | "spy_disrupt"
  | "traitor_smile";

export type ShieldMode = "absorb" | "halve";

export interface NightAction {
  actionType: NightActionType;
  targetId?: string;
  shieldMode?: ShieldMode;
}

export interface PlayerAbilityState {
  bossExecuteUsed: boolean;
  bodyguardOathUsed: boolean;
  bodyguardShieldLastUsedRound: number | null;
  spyDisruptUsed: boolean;
  traitorSmileUsed: boolean;
}

export function defaultAbilityState(): PlayerAbilityState {
  return {
    bossExecuteUsed: false,
    bodyguardOathUsed: false,
    bodyguardShieldLastUsedRound: null,
    spyDisruptUsed: false,
    traitorSmileUsed: false,
  };
}

export interface Player {
  id: string;
  nickname: string;
  role: Role | null;
  hp: number;
  alive: boolean;
  abilities: PlayerAbilityState;
}

export interface DamageEntry {
  targetId: string;
  damage: number;
}

export interface ChatMessage {
  nickname: string;
  text: string;
  at: number;
}

export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  chatLog: ChatMessage[];
  round: number;
  phase: Phase;
  nightActions: Record<string, NightAction>;
  dayVotes: Record<string, string>;
  lastNightDamage: DamageEntry[];
  lastVoteResult: { targetId: string | null; tie: boolean } | null;
  voteAllowedTargetIds: string[] | null;
  voteIsRevote: boolean;
  winner: Role | null;
  phaseEndsAt: number | null;
  phaseTimer: NodeJS.Timeout | null;
}

export const MAX_HP: Record<Role, number> = {
  boss: 5,
  bodyguard: 4,
  spy: 4,
  traitor: 4,
};

export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 10;

export const ROLE_COMPOSITIONS: Record<number, Role[]> = {
  6: ["boss", "bodyguard", "bodyguard", "spy", "spy", "traitor"],
  7: ["boss", "bodyguard", "bodyguard", "spy", "spy", "spy", "traitor"],
  8: ["boss", "bodyguard", "bodyguard", "bodyguard", "spy", "spy", "spy", "traitor"],
  9: ["boss", "bodyguard", "bodyguard", "bodyguard", "spy", "spy", "spy", "spy", "traitor"],
  10: [
    "boss",
    "bodyguard",
    "bodyguard",
    "bodyguard",
    "bodyguard",
    "spy",
    "spy",
    "spy",
    "spy",
    "traitor",
  ],
};

export const PHASE_DURATIONS_MS: Partial<Record<Phase, number>> = {
  night: 2 * 60 * 1000,
  // 원래 결과 공개는 타이머 없이 진행자가 "토론 시작하기"를 눌러야만 넘어갔다
  // (다같이 TV를 보고 있다가 진행자가 판단해서 넘기는 오프라인 전제).
  // 온라인에선 진행자가 없거나 자리를 비울 수 있어 여기서 게임이 영구 정지하므로
  // 타이머를 준다. 진행자가 있으면 여전히 버튼으로 먼저 넘길 수 있다.
  day_reveal: 30 * 1000,
  day_discussion: 5 * 60 * 1000,
  day_vote: 2 * 60 * 1000,
};

export interface PlayerSession {
  sessionId: string;
  playerId: string;
  roomCode: string;
  createdAt: number;
}
