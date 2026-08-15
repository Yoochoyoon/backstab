export type Role = "boss" | "bodyguard" | "spy" | "traitor";

export type Phase =
  | "lobby"
  | "night"
  // 밤이 끝나면 곧바로 토론으로 간다. 예전엔 사이에 "결과 공개" 단계가 있었지만
  // 진행자가 버튼을 눌러줘야만 넘어가는 데다, 밤 결과는 결과 슬라이드와
  // 토론 내내 남는 결과 패널로 이미 충분히 보인다.
  | "day_discussion"
  | "day_vote"
  // 지목 투표에서 한 명이 정해진 뒤, 그 사람을 실제로 칠지 찬반으로 정하는 심판 단계.
  | "day_judgement"
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
  // 찬반 심판 대상자와 표. true=찬성(치자), false=반대(살리자).
  judgementTargetId: string | null;
  judgementVotes: Record<string, boolean>;
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
  day_discussion: 5 * 60 * 1000,
  day_vote: 2 * 60 * 1000,
  // 지목된 사람의 변론과 찬반 결정만 하면 되므로 지목 투표보다 짧게 잡는다.
  day_judgement: 60 * 1000,
};

export interface PlayerSession {
  sessionId: string;
  playerId: string;
  roomCode: string;
  createdAt: number;
}
