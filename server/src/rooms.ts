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
