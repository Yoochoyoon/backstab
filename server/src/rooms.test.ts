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
} from "./rooms.js";

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
