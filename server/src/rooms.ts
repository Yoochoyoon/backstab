import { randomUUID } from "crypto";
import { Room, PlayerSession } from "./game/types.js";

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
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function deleteRoom(code: string): void {
  const room = rooms.get(code);
  if (room?.phaseTimer) clearTimeout(room.phaseTimer);
  rooms.delete(code);
}
