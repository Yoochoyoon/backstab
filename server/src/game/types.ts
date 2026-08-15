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
  // 마지막으로 이 방에 무슨 일이 있었던 시각. 끝났거나 버려진 방을 청소하는 기준이 된다
  // (방이 메모리에만 있어서, 안 치우면 프로세스가 죽을 때까지 계속 쌓인다).
  lastActivityAt: number;
}

// 청소 기준. 게임이 끝난 방은 결과 화면을 한동안 볼 수 있게 두고,
// 진행 중인데 아무도 안 돌아오는 방은 훨씬 길게 기다렸다가 치운다.
export const FINISHED_ROOM_TTL_MS = 30 * 60 * 1000;
export const ABANDONED_ROOM_TTL_MS = 6 * 60 * 60 * 1000;

// 로비에서 연결이 끊긴 사람을 곧바로 방에서 빼지 않고 기다려주는 시간.
// 예전엔 즉시 제거해서, 방을 만든 사람이 폰 화면을 한 번 껐다 켜는 것만으로
// (혼자였다면) 방 자체가 사라지고 친구들에게 준 방 코드가 무효가 됐다.
export const LOBBY_DISCONNECT_GRACE_MS = 60 * 1000;

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
