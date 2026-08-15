import { DamageEntry, MAX_HP, NightAction, Player, Role } from "./types.js";

function clonePlayers(players: Player[]): Player[] {
  return players.map((p) => ({ ...p, abilities: { ...p.abilities } }));
}

function applyDamage(players: Player[], damageByTarget: Map<string, number>): {
  updatedPlayers: Player[];
  damageLog: DamageEntry[];
} {
  const updatedPlayers = clonePlayers(players);
  const damageLog: DamageEntry[] = [];
  for (const [targetId, damage] of damageByTarget) {
    if (damage <= 0) continue;
    const target = updatedPlayers.find((p) => p.id === targetId);
    if (!target || !target.alive) continue;
    target.hp -= damage;
    damageLog.push({ targetId, damage });
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
    }
  }
  return { updatedPlayers, damageLog };
}

const BASE_DAMAGE = 1;
const BOOSTED_DAMAGE = 2; // 긴급 처형(보스), 흑막의 미소(배신자) 적용 시 기본 공격 대신 사용

/**
 * 밤 페이즈 해석 (2라운드 이후 전용 — 1라운드 정찰 라운드는 socketHandlers에서 별도 처리).
 * 04핵심메커니즘.md 기준 처리 순서: 교란 작전(봉쇄) -> 방어/보호 -> 공격(합산) -> 회복/부가효과.
 */
export function resolveNightAttacks(
  players: Player[],
  actions: Record<string, NightAction>,
  round: number,
): { updatedPlayers: Player[]; damageLog: DamageEntry[] } {
  const working = clonePlayers(players);
  const byId = new Map(working.map((p) => [p.id, p]));

  // 0단계: 교란 작전 - 침묵당한 대상은 이번 라운드 자신의 행동이 전부 무효화된다.
  const silenced = new Set<string>();
  for (const [attackerId, action] of Object.entries(actions)) {
    if (action.actionType !== "spy_disrupt") continue;
    const attacker = byId.get(attackerId);
    if (!attacker || !attacker.alive || attacker.role !== "spy") continue;
    if (attacker.abilities.spyDisruptUsed) continue;
    if (!action.targetId) continue;
    attacker.abilities.spyDisruptUsed = true;
    silenced.add(action.targetId);
  }

  // 1단계: 방어/보호 효과 (육탄 방어, 충성심 서약)
  const selfDamageNullified = new Set<string>();
  const shieldByTarget = new Map<string, { mode: "absorb" | "halve"; bodyguardId: string }>();
  for (const [attackerId, action] of Object.entries(actions)) {
    if (silenced.has(attackerId)) continue;
    const attacker = byId.get(attackerId);
    if (!attacker || !attacker.alive || attacker.role !== "bodyguard") continue;

    if (action.actionType === "bodyguard_oath") {
      if (attacker.abilities.bodyguardOathUsed) continue;
      attacker.abilities.bodyguardOathUsed = true;
      selfDamageNullified.add(attackerId);
    } else if (action.actionType === "bodyguard_shield") {
      if (!action.targetId || !action.shieldMode) continue;
      const lastUsed = attacker.abilities.bodyguardShieldLastUsedRound;
      const onCooldown = lastUsed !== null && round - lastUsed < 2;
      if (onCooldown) continue;
      attacker.abilities.bodyguardShieldLastUsedRound = round;
      shieldByTarget.set(action.targetId, { mode: action.shieldMode, bodyguardId: attackerId });
    }
  }

  // 2단계: 공격 적용 (기본 공격 + 긴급 처형/흑막의 미소로 증폭된 공격) - 같은 대상 지목 시 합산
  const rawDamageByTarget = new Map<string, number>();
  const smileUserIds: string[] = [];
  for (const [attackerId, action] of Object.entries(actions)) {
    if (silenced.has(attackerId)) continue;
    const attacker = byId.get(attackerId);
    if (!attacker || !attacker.alive || !action.targetId) continue;

    if (action.actionType === "attack") {
      rawDamageByTarget.set(action.targetId, (rawDamageByTarget.get(action.targetId) ?? 0) + BASE_DAMAGE);
    } else if (action.actionType === "boss_execute") {
      if (attacker.role !== "boss" || attacker.abilities.bossExecuteUsed) continue;
      attacker.abilities.bossExecuteUsed = true;
      rawDamageByTarget.set(action.targetId, (rawDamageByTarget.get(action.targetId) ?? 0) + BOOSTED_DAMAGE);
    } else if (action.actionType === "traitor_smile") {
      if (attacker.role !== "traitor" || attacker.abilities.traitorSmileUsed) continue;
      attacker.abilities.traitorSmileUsed = true;
      smileUserIds.push(attackerId);
      rawDamageByTarget.set(action.targetId, (rawDamageByTarget.get(action.targetId) ?? 0) + BOOSTED_DAMAGE);
    }
  }

  // 3단계: 방어 효과를 반영해 최종 데미지 산출 (육탄 방어 흡수/경감, 충성심 서약 무효화)
  const finalDamageByTarget = new Map<string, number>();
  const addFinalDamage = (id: string, amount: number) => {
    finalDamageByTarget.set(id, (finalDamageByTarget.get(id) ?? 0) + amount);
  };
  for (const [targetId, rawDamage] of rawDamageByTarget) {
    let targetDamage = rawDamage;
    const shield = shieldByTarget.get(targetId);
    if (shield) {
      if (shield.mode === "absorb") {
        addFinalDamage(shield.bodyguardId, targetDamage);
        targetDamage = 0;
      } else {
        targetDamage = Math.floor(targetDamage / 2);
      }
    }
    if (selfDamageNullified.has(targetId)) targetDamage = 0;
    addFinalDamage(targetId, targetDamage);
  }

  const aliveBefore = new Map(players.map((p) => [p.id, p.alive]));
  const { updatedPlayers, damageLog } = applyDamage(working, finalDamageByTarget);

  // 4단계: 회복/부가효과 - 흑막의 미소 (이번 라운드 사망자가 발생할 때마다 HP+2, 상한까지)
  if (smileUserIds.length > 0) {
    const deathCount = updatedPlayers.filter((p) => aliveBefore.get(p.id) === true && !p.alive).length;
    if (deathCount > 0) {
      for (const traitorId of smileUserIds) {
        const traitor = updatedPlayers.find((p) => p.id === traitorId);
        if (!traitor || !traitor.alive || !traitor.role) continue;
        const cap = MAX_HP[traitor.role];
        traitor.hp = Math.min(cap, traitor.hp + 2 * deathCount);
      }
    }
  }

  return { updatedPlayers, damageLog };
}

/**
 * 낮 지목 투표 집계: 최다득표자가 누구인지만 가려낸다. 데미지는 여기서 주지 않는다 —
 * 지목된 사람은 곧바로 처형되는 게 아니라 찬반 심판(resolveJudgement)을 한 번 더 거친다.
 * 동점이면 topTargetId 없이 동점자 목록만 반환한다(03라운드진행.md: 동점자만 즉시 재투표).
 */
export function tallyDayVote(
  players: Player[],
  votes: Record<string, string>,
): { topTargetId: string | null; tiedTargetIds: string[] } {
  const voteCounts = new Map<string, number>();
  for (const [voterId, targetId] of Object.entries(votes)) {
    const voter = players.find((p) => p.id === voterId);
    if (!voter || !voter.alive) continue;
    voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
  }

  if (voteCounts.size === 0) return { topTargetId: null, tiedTargetIds: [] };

  const maxVotes = Math.max(...voteCounts.values());
  const tiedTargetIds = [...voteCounts.entries()]
    .filter(([, count]) => count === maxVotes)
    .map(([targetId]) => targetId);

  if (tiedTargetIds.length > 1) return { topTargetId: null, tiedTargetIds };
  return { topTargetId: tiedTargetIds[0], tiedTargetIds: [] };
}

/**
 * 찬반 심판 해석: 지목된 대상자를 실제로 칠지 말지 결정한다.
 * - 찬성이 반대보다 많아야 가결. 동수·기권(미제출)은 부결로 본다.
 * - 가결되면 고정 데미지 1 (03라운드진행.md의 낮 투표 데미지를 그대로 유지).
 * - 대상자 본인도 투표에 참여할 수 있다.
 */
export function resolveJudgement(
  players: Player[],
  targetId: string,
  judgementVotes: Record<string, boolean>,
  voteDamage = 1,
): {
  updatedPlayers: Player[];
  damageLog: DamageEntry[];
  approve: number;
  oppose: number;
  passed: boolean;
} {
  let approve = 0;
  let oppose = 0;
  for (const [voterId, isApprove] of Object.entries(judgementVotes)) {
    const voter = players.find((p) => p.id === voterId);
    if (!voter || !voter.alive) continue;
    if (isApprove) approve += 1;
    else oppose += 1;
  }

  const passed = approve > oppose;
  if (!passed) {
    return { updatedPlayers: clonePlayers(players), damageLog: [], approve, oppose, passed };
  }

  const { updatedPlayers, damageLog } = applyDamage(players, new Map([[targetId, voteDamage]]));
  return { updatedPlayers, damageLog, approve, oppose, passed };
}

/**
 * 승리조건 판정 (02역할.md 기준).
 * - 보스 사망 -> 스파이 즉시 승리
 * - 보스 생존 + 스파이/배신자 전멸 -> 보스(경호원 포함) 승리
 * - 생존자가 배신자 1명만 남음 -> 배신자 승리
 */
export function checkWinner(players: Player[]): Role | null {
  const boss = players.find((p) => p.role === "boss");
  if (!boss || !boss.alive) return "spy";

  const alive = players.filter((p) => p.alive);
  const spiesOrTraitorAlive = alive.some(
    (p) => p.role === "spy" || p.role === "traitor",
  );
  if (!spiesOrTraitorAlive) return "boss";

  if (alive.length === 1 && alive[0].role === "traitor") return "traitor";

  return null;
}
