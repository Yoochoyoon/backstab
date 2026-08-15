import {
  MAX_HP,
  MAX_PLAYERS,
  MIN_PLAYERS,
  Player,
  ROLE_COMPOSITIONS,
  defaultAbilityState,
} from "./types.js";

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function assignRoles(
  players: { id: string; nickname: string; avatar?: string | null }[],
): Player[] {
  const composition = ROLE_COMPOSITIONS[players.length];
  if (!composition) {
    throw new Error(
      `인원수는 ${MIN_PLAYERS}~${MAX_PLAYERS}명 사이여야 합니다 (현재 ${players.length}명)`,
    );
  }
  const roles = shuffle(composition);
  return players.map((player, index) => {
    const role = roles[index];
    return {
      id: player.id,
      nickname: player.nickname,
      // 역할 배정은 기존 플레이어 정보를 그대로 이어받는다(사진 포함).
      avatar: player.avatar ?? null,
      role,
      hp: MAX_HP[role],
      alive: true,
      abilities: defaultAbilityState(),
    };
  });
}
