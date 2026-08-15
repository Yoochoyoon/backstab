import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  ABANDONED_ROOM_TTL_MS,
  FINISHED_ROOM_TTL_MS,
} from "./game/types.js";
import {
  __resetStoreForTest,
  cleanupExpiredRooms,
  createRoom,
  createSession,
  getRoom,
  getSession,
  isRoomExpired,
  remapPlayerId,
} from "./rooms.js";
import { addPlayer } from "./socketHandlers.js";

beforeEach(() => {
  __resetStoreForTest();
});

test("방금 만든 방은 청소 대상이 아니다", () => {
  const room = createRoom("host1");
  assert.equal(isRoomExpired(room, Date.now()), false);
});

test("끝난 방은 FINISHED_ROOM_TTL_MS가 지나면 청소 대상이 된다", () => {
  const room = createRoom("host1");
  room.phase = "game_over";
  const now = room.lastActivityAt + FINISHED_ROOM_TTL_MS + 1;

  assert.equal(isRoomExpired(room, now), true);
  // 경계 바로 안쪽에서는 아직 살아있어야 한다.
  assert.equal(isRoomExpired(room, room.lastActivityAt + FINISHED_ROOM_TTL_MS - 1), false);
});

test("진행 중인 방은 끝난 방보다 훨씬 오래 기다렸다가 청소한다", () => {
  const room = createRoom("host1");
  room.phase = "day_discussion";

  // 끝난 방이면 벌써 치웠을 시점인데, 진행 중이면 아직 남아있어야 한다
  // (잠깐 끊긴 사람이 돌아올 자리를 성급히 없애지 않기 위함).
  assert.equal(isRoomExpired(room, room.lastActivityAt + FINISHED_ROOM_TTL_MS + 1), false);
  assert.equal(isRoomExpired(room, room.lastActivityAt + ABANDONED_ROOM_TTL_MS + 1), true);
});

test("cleanupExpiredRooms는 만료된 방과 그 방의 세션을 같이 지운다", () => {
  const stale = createRoom("hostStale");
  stale.phase = "game_over";
  const staleSession = createSession("p1", stale.code);

  const fresh = createRoom("hostFresh");
  const freshSession = createSession("p2", fresh.code);

  const removed = cleanupExpiredRooms(stale.lastActivityAt + FINISHED_ROOM_TTL_MS + 1);

  assert.deepEqual(removed, [stale.code]);
  assert.equal(getRoom(stale.code), undefined);
  assert.equal(getSession(staleSession), undefined);

  // 살아있는 방과 그 세션은 그대로 남아야 한다.
  assert.ok(getRoom(fresh.code));
  assert.ok(getSession(freshSession));
});

test("방이 사라진 뒤 남은 고아 세션도 정리된다", () => {
  const room = createRoom("host1");
  const sessionId = createSession("p1", room.code);
  // 로비에서 전원이 나가 방만 삭제되고 세션이 남는 경로를 흉내낸다.
  __resetStoreForTest();
  const orphanRoom = createRoom("host2");
  const orphan = createSession("p9", "ZZZZ"); // 존재하지 않는 방 코드

  cleanupExpiredRooms(Date.now());

  assert.equal(getSession(orphan), undefined);
  assert.ok(getRoom(orphanRoom.code), "살아있는 방은 그대로 있어야 한다");
  assert.equal(getSession(sessionId), undefined, "리셋된 세션은 남아있지 않다");
});

test("방 코드는 대소문자 구분 없이 조회된다", () => {
  const room = createRoom("host1");
  assert.equal(getRoom(room.code.toLowerCase())?.code, room.code);
});

// 같은 소켓이 다른 닉네임으로 두 번 입장하면 id가 같은 Player가 둘 생겨서,
// 한 명을 지목해도 두 카드가 선택되고 투표 현황이 두 명에게 찍혔다(실제 플레이에서 확인).
test("같은 소켓은 한 방에서 한 자리만 차지한다", () => {
  const room = createRoom("host1");

  assert.equal(addPlayer(room, "sock1", "봇1", null), true);
  assert.equal(addPlayer(room, "sock1", "봇8", null), false, "닉네임이 달라도 같은 소켓이면 거부한다");

  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].nickname, "봇1", "첫 입장이 그대로 유지된다");
});

test("서로 다른 소켓은 정상적으로 각자 입장한다", () => {
  const room = createRoom("host1");

  assert.equal(addPlayer(room, "sock1", "봇1", null), true);
  assert.equal(addPlayer(room, "sock2", "봇2", null), true);

  assert.deepEqual(
    room.players.map((p) => p.id),
    ["sock1", "sock2"],
  );
});

test("재접속으로 id가 바뀌어도 이미 제출한 밤 행동이 유지된다", () => {
  const room = createRoom("h");
  room.nightActions = { old: { actionType: "attack", targetId: "victim" } };

  remapPlayerId(room, "old", "new");

  assert.equal(room.nightActions.old, undefined);
  assert.deepEqual(room.nightActions.new, { actionType: "attack", targetId: "victim" });
});

test("재접속한 사람을 지목하고 있던 밤 행동의 대상 id도 따라 바뀐다", () => {
  const room = createRoom("h");
  room.nightActions = { attacker: { actionType: "attack", targetId: "old" } };

  remapPlayerId(room, "old", "new");

  assert.equal(room.nightActions.attacker.targetId, "new");
});

test("재접속으로 id가 바뀌어도 이미 던진 표가 유지되고, 그 사람에게 간 표도 따라온다", () => {
  const room = createRoom("h");
  room.dayVotes = { old: "someone", voterA: "old", voterB: "other" };

  remapPlayerId(room, "old", "new");

  assert.equal(room.dayVotes.old, undefined);
  assert.equal(room.dayVotes.new, "someone", "본인이 던진 표가 살아있어야 한다");
  assert.equal(room.dayVotes.voterA, "new", "그 사람에게 간 표도 새 id를 가리켜야 한다");
  assert.equal(room.dayVotes.voterB, "other");
});

test("심판 대상이 재접속하면 대상 id가 갱신된다 (가결돼도 데미지가 안 들어가던 버그)", () => {
  const room = createRoom("h");
  room.judgementTargetId = "old";
  room.judgementVotes = { old: false, voter: true };

  remapPlayerId(room, "old", "new");

  assert.equal(room.judgementTargetId, "new");
  assert.equal(room.judgementVotes.old, undefined);
  assert.equal(room.judgementVotes.new, false, "대상 본인이 던진 반대표가 살아있어야 한다");
});

test("재투표 동점자 목록에 있던 id도 갱신된다", () => {
  const room = createRoom("h");
  room.voteAllowedTargetIds = ["old", "other"];
  room.lastVoteResult = { targetId: "old", tie: false };

  remapPlayerId(room, "old", "new");

  assert.deepEqual(room.voteAllowedTargetIds, ["new", "other"]);
  assert.equal(room.lastVoteResult.targetId, "new");
});

test("id가 그대로면 아무것도 바꾸지 않는다", () => {
  const room = createRoom("h");
  room.nightActions = { same: { actionType: "attack", targetId: "same" } };

  remapPlayerId(room, "same", "same");

  assert.deepEqual(room.nightActions.same, { actionType: "attack", targetId: "same" });
});
