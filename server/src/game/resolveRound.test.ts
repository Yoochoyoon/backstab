import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkWinner,
  resolveJudgement,
  resolveNightAttacks,
  tallyDayVote,
} from "./resolveRound.js";
import { NightAction, Player, defaultAbilityState } from "./types.js";

function makePlayer(overrides: Partial<Player>): Player {
  return {
    id: "p1",
    nickname: "nick",
    avatar: null,
    role: "spy",
    hp: 4,
    alive: true,
    abilities: defaultAbilityState(),
    ...overrides,
  };
}

function attack(targetId: string): NightAction {
  return { actionType: "attack", targetId };
}

test("resolveNightAttacks sums damage when multiple attackers target the same player", () => {
  const players = [
    makePlayer({ id: "spy1", role: "spy" }),
    makePlayer({ id: "spy2", role: "spy" }),
    makePlayer({ id: "spy3", role: "spy" }),
    makePlayer({ id: "boss", role: "boss", hp: 5 }),
  ];
  const { updatedPlayers, damageLog } = resolveNightAttacks(
    players,
    { spy1: attack("boss"), spy2: attack("boss"), spy3: attack("boss") },
    2,
  );
  const boss = updatedPlayers.find((p) => p.id === "boss")!;
  assert.equal(boss.hp, 2);
  assert.equal(boss.alive, true);
  assert.deepEqual(damageLog, [{ targetId: "boss", damage: 3 }]);
});

test("resolveNightAttacks marks a player dead when HP drops to 0 or below", () => {
  const players = [
    makePlayer({ id: "spy1", role: "spy" }),
    makePlayer({ id: "bodyguard1", role: "bodyguard", hp: 1 }),
  ];
  const { updatedPlayers } = resolveNightAttacks(players, { spy1: attack("bodyguard1") }, 2);
  const bg = updatedPlayers.find((p) => p.id === "bodyguard1")!;
  assert.equal(bg.hp, 0);
  assert.equal(bg.alive, false);
});

test("resolveNightAttacks ignores targets submitted by dead attackers", () => {
  const players = [
    makePlayer({ id: "spy1", role: "spy", alive: false }),
    makePlayer({ id: "boss", role: "boss", hp: 5 }),
  ];
  const { updatedPlayers } = resolveNightAttacks(players, { spy1: attack("boss") }, 2);
  assert.equal(updatedPlayers.find((p) => p.id === "boss")!.hp, 5);
});

test("boss_execute deals double damage and can only be used once per game", () => {
  const players = [
    makePlayer({ id: "boss", role: "boss", hp: 5 }),
    makePlayer({ id: "spy1", role: "spy" }),
  ];
  const round2 = resolveNightAttacks(players, { boss: { actionType: "boss_execute", targetId: "spy1" } }, 2);
  const spyAfterRound2 = round2.updatedPlayers.find((p) => p.id === "spy1")!;
  assert.equal(spyAfterRound2.hp, 2); // 4 - 2
  const bossAfterRound2 = round2.updatedPlayers.find((p) => p.id === "boss")!;
  assert.equal(bossAfterRound2.abilities.bossExecuteUsed, true);

  const round3 = resolveNightAttacks(
    round2.updatedPlayers,
    { boss: { actionType: "boss_execute", targetId: "spy1" } },
    3,
  );
  const spyAfterRound3 = round3.updatedPlayers.find((p) => p.id === "spy1")!;
  assert.equal(spyAfterRound3.hp, 2); // 2회차 시도는 무시되어 데미지 없음
});

test("bodyguard_shield absorb mode redirects all damage from the target to the bodyguard", () => {
  const players = [
    makePlayer({ id: "spy1", role: "spy" }),
    makePlayer({ id: "spy2", role: "spy" }),
    makePlayer({ id: "boss", role: "boss", hp: 5 }),
    makePlayer({ id: "bg1", role: "bodyguard", hp: 4 }),
  ];
  const { updatedPlayers } = resolveNightAttacks(
    players,
    {
      spy1: attack("boss"),
      spy2: attack("boss"),
      bg1: { actionType: "bodyguard_shield", targetId: "boss", shieldMode: "absorb" },
    },
    2,
  );
  assert.equal(updatedPlayers.find((p) => p.id === "boss")!.hp, 5); // 무피해
  assert.equal(updatedPlayers.find((p) => p.id === "bg1")!.hp, 2); // 4 - 2 흡수
});

test("bodyguard_shield halve mode rounds damage down for the target and leaves the bodyguard unharmed", () => {
  const players = [
    makePlayer({ id: "spy1", role: "spy" }),
    makePlayer({ id: "spy2", role: "spy" }),
    makePlayer({ id: "spy3", role: "spy" }),
    makePlayer({ id: "boss", role: "boss", hp: 5 }),
    makePlayer({ id: "bg1", role: "bodyguard", hp: 4 }),
  ];
  const { updatedPlayers } = resolveNightAttacks(
    players,
    {
      spy1: attack("boss"),
      spy2: attack("boss"),
      spy3: attack("boss"),
      bg1: { actionType: "bodyguard_shield", targetId: "boss", shieldMode: "halve" },
    },
    2,
  );
  assert.equal(updatedPlayers.find((p) => p.id === "boss")!.hp, 4); // 3데미지 -> 절반(내림) 1
  assert.equal(updatedPlayers.find((p) => p.id === "bg1")!.hp, 4); // 조직원 무피해
});

test("bodyguard_shield has a 1-round cooldown after use", () => {
  const players = [
    makePlayer({ id: "spy1", role: "spy" }),
    makePlayer({ id: "boss", role: "boss", hp: 5 }),
    makePlayer({ id: "bg1", role: "bodyguard", hp: 4 }),
  ];
  const round2 = resolveNightAttacks(
    players,
    { spy1: attack("boss"), bg1: { actionType: "bodyguard_shield", targetId: "boss", shieldMode: "absorb" } },
    2,
  );
  assert.equal(round2.updatedPlayers.find((p) => p.id === "boss")!.hp, 5);

  // 쿨타임 중(3라운드) 재사용 시도 -> 무시되어 보스가 그대로 피해를 입음
  const round3 = resolveNightAttacks(
    round2.updatedPlayers,
    { spy1: attack("boss"), bg1: { actionType: "bodyguard_shield", targetId: "boss", shieldMode: "absorb" } },
    3,
  );
  assert.equal(round3.updatedPlayers.find((p) => p.id === "boss")!.hp, 4);

  // 쿨타임이 끝난 4라운드엔 다시 사용 가능
  const round4 = resolveNightAttacks(
    round3.updatedPlayers,
    { spy1: attack("boss"), bg1: { actionType: "bodyguard_shield", targetId: "boss", shieldMode: "absorb" } },
    4,
  );
  assert.equal(round4.updatedPlayers.find((p) => p.id === "boss")!.hp, 4);
});

test("bodyguard_oath nullifies damage to self this round and can only be used once per game", () => {
  const players = [
    makePlayer({ id: "spy1", role: "spy" }),
    makePlayer({ id: "bg1", role: "bodyguard", hp: 4 }),
  ];
  const round2 = resolveNightAttacks(
    players,
    { spy1: attack("bg1"), bg1: { actionType: "bodyguard_oath" } },
    2,
  );
  assert.equal(round2.updatedPlayers.find((p) => p.id === "bg1")!.hp, 4);
  assert.equal(round2.updatedPlayers.find((p) => p.id === "bg1")!.abilities.bodyguardOathUsed, true);

  const round3 = resolveNightAttacks(
    round2.updatedPlayers,
    { spy1: attack("bg1"), bg1: { actionType: "bodyguard_oath" } },
    3,
  );
  assert.equal(round3.updatedPlayers.find((p) => p.id === "bg1")!.hp, 3); // 재사용 불가 -> 정상 피해
});

test("spy_disrupt silences the target's entire night action and can only be used once per spy", () => {
  const players = [
    makePlayer({ id: "spy1", role: "spy" }),
    makePlayer({ id: "boss", role: "boss", hp: 5 }),
  ];
  const { updatedPlayers, damageLog } = resolveNightAttacks(
    players,
    {
      spy1: { actionType: "spy_disrupt", targetId: "boss" },
      boss: attack("spy1"), // 침묵당해 무효화되어야 함
    },
    2,
  );
  assert.equal(updatedPlayers.find((p) => p.id === "spy1")!.hp, 4); // 보스의 공격이 무효화됨
  assert.deepEqual(damageLog, []);
  assert.equal(updatedPlayers.find((p) => p.id === "spy1")!.abilities.spyDisruptUsed, true);
});

test("traitor_smile deals boosted damage, heals per death this round (capped), and is single-use", () => {
  const players = [
    makePlayer({ id: "traitor1", role: "traitor", hp: 2 }),
    makePlayer({ id: "spy1", role: "spy", hp: 1 }),
  ];
  const { updatedPlayers } = resolveNightAttacks(
    players,
    { traitor1: { actionType: "traitor_smile", targetId: "spy1" } },
    2,
  );
  const spy = updatedPlayers.find((p) => p.id === "spy1")!;
  assert.equal(spy.alive, false); // 2데미지로 사망
  const traitor = updatedPlayers.find((p) => p.id === "traitor1")!;
  assert.equal(traitor.hp, 4); // 2 + 2(사망 1명) = 4, 상한(4)에서 클램프
  assert.equal(traitor.abilities.traitorSmileUsed, true);
});

test("tallyDayVote는 최다득표자만 가려내고 데미지는 주지 않는다", () => {
  const players = [makePlayer({ id: "a" }), makePlayer({ id: "b" }), makePlayer({ id: "c" })];
  const { topTargetId, tiedTargetIds } = tallyDayVote(players, { a: "c", b: "c" });
  assert.equal(topTargetId, "c");
  assert.deepEqual(tiedTargetIds, []);
  // 지목만으로는 아무도 다치지 않는다 — 데미지는 찬반 심판을 통과해야 들어간다.
  assert.equal(players.find((p) => p.id === "c")!.hp, 4);
});

test("tallyDayVote는 동점이면 동점자 목록만 반환한다", () => {
  const players = [makePlayer({ id: "a" }), makePlayer({ id: "b" }), makePlayer({ id: "c" })];
  const { topTargetId, tiedTargetIds } = tallyDayVote(players, { a: "b", c: "a" });
  assert.equal(topTargetId, null);
  assert.deepEqual(new Set(tiedTargetIds), new Set(["a", "b"]));
});

test("tallyDayVote는 사망자의 표를 세지 않는다", () => {
  const players = [
    makePlayer({ id: "a" }),
    makePlayer({ id: "dead", alive: false, hp: 0 }),
    makePlayer({ id: "c" }),
  ];
  const { topTargetId } = tallyDayVote(players, { dead: "a", c: "a" });
  assert.equal(topTargetId, "a");
});

test("찬반 심판: 찬성이 반대보다 많으면 가결되어 데미지 1", () => {
  const players = [makePlayer({ id: "a" }), makePlayer({ id: "b" }), makePlayer({ id: "t" })];
  const { updatedPlayers, approve, oppose, passed } = resolveJudgement(players, "t", {
    a: true,
    b: true,
    t: false,
  });
  assert.equal(approve, 2);
  assert.equal(oppose, 1);
  assert.equal(passed, true);
  assert.equal(updatedPlayers.find((p) => p.id === "t")!.hp, 3);
});

test("찬반 심판: 동수면 부결되어 아무도 다치지 않는다", () => {
  const players = [makePlayer({ id: "a" }), makePlayer({ id: "b" }), makePlayer({ id: "t" })];
  const { updatedPlayers, damageLog, passed } = resolveJudgement(players, "t", {
    a: true,
    b: false,
  });
  assert.equal(passed, false);
  assert.deepEqual(damageLog, []);
  assert.equal(updatedPlayers.find((p) => p.id === "t")!.hp, 4);
});

test("찬반 심판: 아무도 투표하지 않으면 부결", () => {
  const players = [makePlayer({ id: "a" }), makePlayer({ id: "t" })];
  const { passed, approve, oppose } = resolveJudgement(players, "t", {});
  assert.equal(passed, false);
  assert.equal(approve, 0);
  assert.equal(oppose, 0);
});

test("찬반 심판: 가결로 HP가 0이 되면 사망 처리된다", () => {
  const players = [makePlayer({ id: "a" }), makePlayer({ id: "t", hp: 1 })];
  const { updatedPlayers } = resolveJudgement(players, "t", { a: true });
  const target = updatedPlayers.find((p) => p.id === "t")!;
  assert.equal(target.hp, 0);
  assert.equal(target.alive, false);
});

test("찬반 심판: 사망자의 표는 세지 않는다", () => {
  const players = [
    makePlayer({ id: "dead", alive: false, hp: 0 }),
    makePlayer({ id: "a" }),
    makePlayer({ id: "t" }),
  ];
  // 사망자 2명이 찬성해도 세지 않으므로, 산 사람 1명의 반대만 남아 부결이어야 한다.
  const { passed } = resolveJudgement(players, "t", { dead: true, a: false });
  assert.equal(passed, false);
});

test("checkWinner: boss death means immediate spy win", () => {
  const players = [
    makePlayer({ id: "boss", role: "boss", hp: 0, alive: false }),
    makePlayer({ id: "spy1", role: "spy" }),
  ];
  assert.equal(checkWinner(players), "spy");
});

test("checkWinner: boss side wins once all spies and the traitor are eliminated", () => {
  const players = [
    makePlayer({ id: "boss", role: "boss", hp: 5 }),
    makePlayer({ id: "bg1", role: "bodyguard" }),
    makePlayer({ id: "spy1", role: "spy", alive: false, hp: 0 }),
    makePlayer({ id: "traitor1", role: "traitor", alive: false, hp: 0 }),
  ];
  assert.equal(checkWinner(players), "boss");
});

test("checkWinner: 보스와 배신자 단 둘만 남으면 배신자 승리", () => {
  const players = [
    makePlayer({ id: "boss", role: "boss", hp: 3 }),
    makePlayer({ id: "bg1", role: "bodyguard", alive: false, hp: 0 }),
    makePlayer({ id: "spy1", role: "spy", alive: false, hp: 0 }),
    makePlayer({ id: "traitor1", role: "traitor", hp: 4 }),
  ];
  assert.equal(checkWinner(players), "traitor");
});

// 조직원이 한 명이라도 남아 있으면 아직 "단 둘"이 아니다.
test("checkWinner: 보스·배신자 외에 생존자가 더 있으면 아직 미결", () => {
  const players = [
    makePlayer({ id: "boss", role: "boss", hp: 3 }),
    makePlayer({ id: "bg1", role: "bodyguard", hp: 4 }),
    makePlayer({ id: "spy1", role: "spy", alive: false, hp: 0 }),
    makePlayer({ id: "traitor1", role: "traitor", hp: 4 }),
  ];
  assert.equal(checkWinner(players), null);
});

test("checkWinner: 배신자가 살아있어도 보스가 죽으면 스파이 승리", () => {
  const players = [
    makePlayer({ id: "boss", role: "boss", alive: false, hp: 0 }),
    makePlayer({ id: "spy1", role: "spy", hp: 4 }),
    makePlayer({ id: "traitor1", role: "traitor", hp: 4 }),
  ];
  assert.equal(checkWinner(players), "spy");
});

// 배신자 승리는 보스 생존이 전제라, 보스가 죽으면 배신자는 이길 수 없다.
// 덕분에 승자가 안 나오는 교착 상태 자체가 생기지 않는다.
test("checkWinner: 보스가 죽으면 배신자만 남아도 스파이 승리", () => {
  const players = [
    makePlayer({ id: "boss", role: "boss", alive: false, hp: 0 }),
    makePlayer({ id: "spy1", role: "spy", alive: false, hp: 0 }),
    makePlayer({ id: "traitor1", role: "traitor", hp: 4 }),
  ];
  assert.equal(checkWinner(players), "spy");
});

test("checkWinner: 전원 사망해도 승자를 내고 끝난다 (무한 루프 방지)", () => {
  const players = [
    makePlayer({ id: "boss", role: "boss", alive: false, hp: 0 }),
    makePlayer({ id: "spy1", role: "spy", alive: false, hp: 0 }),
    makePlayer({ id: "traitor1", role: "traitor", alive: false, hp: 0 }),
  ];
  assert.equal(checkWinner(players), "spy");
});

test("checkWinner: returns null while the game is undecided", () => {
  const players = [
    makePlayer({ id: "boss", role: "boss", hp: 5 }),
    makePlayer({ id: "spy1", role: "spy" }),
    makePlayer({ id: "traitor1", role: "traitor" }),
  ];
  assert.equal(checkWinner(players), null);
});
