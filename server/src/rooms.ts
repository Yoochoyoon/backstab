import { randomUUID } from "crypto";
import {
  ABANDONED_ROOM_TTL_MS,
  FINISHED_ROOM_TTL_MS,
  PlayerSession,
  Room,
} from "./game/types.js";

const rooms = new Map<string, Room>();
const sessions = new Map<string, PlayerSession>();

export function createSession(playerId: string, roomCode: string): string {
  const sessionId = randomUUID();
  sessions.set(sessionId, { sessionId, playerId, roomCode, createdAt: Date.now() });
  return sessionId;
}

export function getSession(sessionId: string): PlayerSession | undefined {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function deleteSessionsByRoom(roomCode: string): void {
  for (const [sessionId, session] of sessions.entries()) {
    if (session.roomCode === roomCode) {
      sessions.delete(sessionId);
    }
  }
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O, 1/I 제외

function generateRoomCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 4 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
    ).join("");
  } while (rooms.has(code));
  return code;
}

export function createRoom(hostId: string): Room {
  const code = generateRoomCode();
  const room: Room = {
    code,
    hostId,
    players: [],
    chatLog: [],
    round: 0,
    phase: "lobby",
    nightActions: {},
    dayVotes: {},
    lastNightDamage: [],
    lastVoteResult: null,
    voteAllowedTargetIds: null,
    voteIsRevote: false,
    judgementTargetId: null,
    judgementVotes: {},
    winner: null,
    phaseEndsAt: null,
    phaseTimer: null,
    lastActivityAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function touchRoom(room: Room): void {
  room.lastActivityAt = Date.now();
}

/**
 * 재접속으로 플레이어의 소켓 id가 바뀔 때, 그 id를 키·값으로 쓰고 있는 방 상태를 전부 옮긴다.
 *
 * 방 상태 곳곳이 소켓 id를 그대로 식별자로 쓰고 있어서, player.id만 갈아끼우면
 * 이미 제출한 밤 행동·투표가 주인 없는 키로 남아 조용히 버려지고, 심판 대상 id가
 * 어긋나 처단이 가결돼도 아무 데미지가 안 들어간다(실제 플레이에서 둘 다 재현됨).
 */
export function remapPlayerId(room: Room, oldId: string, newId: string): void {
  if (oldId === newId) return;

  // 제출한 사람(키) 기준
  if (room.nightActions[oldId]) {
    room.nightActions[newId] = room.nightActions[oldId];
    delete room.nightActions[oldId];
  }
  if (room.dayVotes[oldId]) {
    room.dayVotes[newId] = room.dayVotes[oldId];
    delete room.dayVotes[oldId];
  }
  if (room.judgementVotes[oldId] !== undefined) {
    room.judgementVotes[newId] = room.judgementVotes[oldId];
    delete room.judgementVotes[oldId];
  }

  // 지목당한 사람(값) 기준
  for (const action of Object.values(room.nightActions)) {
    if (action.targetId === oldId) action.targetId = newId;
  }
  for (const [voterId, targetId] of Object.entries(room.dayVotes)) {
    if (targetId === oldId) room.dayVotes[voterId] = newId;
  }
  if (room.judgementTargetId === oldId) room.judgementTargetId = newId;
  if (room.voteAllowedTargetIds) {
    room.voteAllowedTargetIds = room.voteAllowedTargetIds.map((id) => (id === oldId ? newId : id));
  }
  if (room.lastVoteResult?.targetId === oldId) room.lastVoteResult.targetId = newId;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function deleteRoom(code: string): void {
  const room = rooms.get(code);
  if (room?.phaseTimer) clearTimeout(room.phaseTimer);
  rooms.delete(code);
}

/**
 * 이 방을 지금 치워도 되는지 판단한다.
 * 게임이 끝난 방은 짧게, 진행 중인데 아무도 안 돌아오는 방은 길게 기다린다
 * (진행 중인 방을 성급히 치우면 잠깐 끊긴 사람이 돌아올 자리가 사라진다).
 */
export function isRoomExpired(room: Room, now: number): boolean {
  const idleMs = now - room.lastActivityAt;
  if (room.phase === "game_over") return idleMs > FINISHED_ROOM_TTL_MS;
  return idleMs > ABANDONED_ROOM_TTL_MS;
}

/**
 * 끝났거나 버려진 방과, 그 방에 딸린 세션을 정리한다.
 * 방/세션이 전부 메모리 Map에만 있어서 이게 없으면 프로세스가 살아있는 내내 쌓이기만 한다.
 * 치운 방 코드 목록을 돌려준다(로그·테스트용).
 */
export function cleanupExpiredRooms(now: number = Date.now()): string[] {
  const removed: string[] = [];
  for (const room of [...rooms.values()]) {
    if (!isRoomExpired(room, now)) continue;
    deleteSessionsByRoom(room.code);
    deleteRoom(room.code);
    removed.push(room.code);
  }
  // 방이 이미 사라졌는데 남아있는 고아 세션도 같이 정리한다
  // (예: 로비에서 전원이 나가 방이 삭제되던 경로).
  for (const [sessionId, session] of sessions.entries()) {
    if (!rooms.has(session.roomCode)) sessions.delete(sessionId);
  }
  return removed;
}

// 테스트에서 상태를 격리하기 위한 헬퍼 — 운영 코드에서는 쓰지 않는다.
export function __resetStoreForTest(): void {
  for (const room of rooms.values()) {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
  }
  rooms.clear();
  sessions.clear();
}
