import type { Server, Socket } from "socket.io";
import { assignRoles } from "./game/roleAssignment.js";
import { checkWinner, resolveDayVote, resolveNightAttacks } from "./game/resolveRound.js";
import {
  NightAction,
  NightActionType,
  PHASE_DURATIONS_MS,
  Phase,
  Player,
  Role,
  Room,
  MAX_PLAYERS,
  MIN_PLAYERS,
  defaultAbilityState,
} from "./game/types.js";
import { createRoom, deleteRoom, getRoom, createSession, deleteSessionsByRoom, getSession } from "./rooms.js";

interface SocketData {
  roomCode?: string;
  isHost?: boolean;
}

function publicPlayers(room: Room) {
  return room.players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    hp: p.hp,
    alive: p.alive,
    // 보스는 02역할.md 기준으로 유일하게 공개된 역할이라 항상 role을 흘려보낸다.
    // 그 외 역할은 살아있는 동안은 비공개지만, 사망하면 다른 마피아류 게임처럼
    // 역할을 공개해서 남은 사람들이 토론에 활용할 수 있게 한다.
    role: p.role === "boss" || !p.alive ? p.role : undefined,
  }));
}

function emitState(io: Server, room: Room) {
  // player.js re-derives its own HP from the players array on phase_changed,
  // so state:players must arrive first or it reads the stale pre-round-start snapshot.
  io.to(room.code).emit("state:players", { players: publicPlayers(room) });
  io.to(room.code).emit("state:phase_changed", {
    phase: room.phase,
    round: room.round,
    phaseEndsAt: room.phaseEndsAt,
  });
  emitSubmissionProgress(io, room);
}

// 밤 행동/투표를 누가 이미 제출했는지(무엇을 냈는지는 제외) 계산한다.
function currentSubmittedIds(room: Room): string[] {
  if (room.phase === "night") return Object.keys(room.nightActions);
  if (room.phase === "day_vote") return Object.keys(room.dayVotes);
  return [];
}

// 방 전체에 제출 현황을 알려서, 호스트·참여자 화면 어디서든 볼 수 있게 한다.
// emitState()가 페이즈 시작 시점(액션/투표 초기화 직후)에도 호출되므로, 여기서 별도로
// 초기화하지 않아도 새 페이즈 시작 시 자동으로 빈 배열이 나간다.
function emitSubmissionProgress(io: Server, room: Room) {
  io.to(room.code).emit("state:submission_progress", { submittedIds: currentSubmittedIds(room) });
}

/**
 * 2라운드 이후 밤에 이 플레이어가 고를 수 있는 행동 목록을 계산한다
 * (04핵심메커니즘.md: 기본 공격은 전원 공통, 특수 능력은 게임당 1회 또는 쿨타임 제한).
 */
function nightOptionsFor(
  player: Player,
  round: number,
): { canAttack: boolean; specialActions: NightActionType[] } {
  if (!player.alive) return { canAttack: false, specialActions: [] };

  const specialActions: NightActionType[] = [];
  if (player.role === "boss" && !player.abilities.bossExecuteUsed) {
    specialActions.push("boss_execute");
  }
  if (player.role === "bodyguard") {
    const lastUsed = player.abilities.bodyguardShieldLastUsedRound;
    const onCooldown = lastUsed !== null && round - lastUsed < 2;
    if (!onCooldown) specialActions.push("bodyguard_shield");
    if (!player.abilities.bodyguardOathUsed) specialActions.push("bodyguard_oath");
  }
  if (player.role === "spy" && !player.abilities.spyDisruptUsed) {
    specialActions.push("spy_disrupt");
  }
  if (player.role === "traitor" && !player.abilities.traitorSmileUsed) {
    specialActions.push("traitor_smile");
  }
  return { canAttack: true, specialActions };
}

function emitNightOptions(io: Server, room: Room) {
  for (const player of room.players) {
    if (!player.alive) continue;
    io.to(player.id).emit("player:night_options", nightOptionsFor(player, room.round));
  }
}

function emitSpyReveal(io: Server, room: Room) {
  const spies = room.players.filter((p) => p.role === "spy");
  for (const spy of spies) {
    io.to(spy.id).emit("player:spy_reveal", {
      teammates: spies.filter((s) => s.id !== spy.id).map((s) => s.nickname),
    });
  }
}

function clearPhaseTimer(room: Room) {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
}

function scheduleTimedPhase(io: Server, room: Room, phase: Phase, onExpire: () => void) {
  const duration = PHASE_DURATIONS_MS[phase];
  room.phase = phase;
  room.phaseEndsAt = duration ? Date.now() + duration : null;
  clearPhaseTimer(room);
  if (duration) {
    room.phaseTimer = setTimeout(() => {
      onExpire();
    }, duration);
  }
  emitState(io, room);
}

function endGame(io: Server, room: Room, winner: Role) {
  clearPhaseTimer(room);
  room.phase = "game_over";
  room.winner = winner;
  room.phaseEndsAt = null;
  io.to(room.code).emit("state:game_over", { winner, players: publicPlayers(room) });
  emitState(io, room);
}

function startNightPhase(io: Server, room: Room) {
  room.nightActions = {};
  scheduleTimedPhase(io, room, "night", () => resolveNight(io, room));
  if (room.round === 1) {
    // 03라운드진행.md: 1라운드 밤은 스파이 정체 확인 전용 정찰 라운드 - 공격/능력 불가.
    emitSpyReveal(io, room);
  } else {
    emitNightOptions(io, room);
  }
}

function resolveNight(io: Server, room: Room) {
  let damageLog: ReturnType<typeof resolveNightAttacks>["damageLog"] = [];
  if (room.round === 1) {
    // 정찰 라운드: 전투 없음, 플레이어 상태 그대로 유지.
  } else {
    const result = resolveNightAttacks(room.players, room.nightActions, room.round);
    room.players = result.updatedPlayers;
    damageLog = result.damageLog;
  }
  room.lastNightDamage = damageLog;

  const winner = checkWinner(room.players);
  if (winner) {
    endGame(io, room, winner);
    return;
  }

  clearPhaseTimer(room);
  room.phase = "day_reveal";
  room.phaseEndsAt = null;
  io.to(room.code).emit("state:night_result", {
    damageLog,
    players: publicPlayers(room),
  });
  emitState(io, room);
}

function startDiscussionPhase(io: Server, room: Room) {
  scheduleTimedPhase(io, room, "day_discussion", () => startVotePhase(io, room));
}

function startVotePhase(io: Server, room: Room) {
  room.dayVotes = {};
  scheduleTimedPhase(io, room, "day_vote", () => resolveVote(io, room));
}

function resolveVote(io: Server, room: Room) {
  const { updatedPlayers, damageLog, topTargetId, tiedTargetIds } = resolveDayVote(
    room.players,
    room.dayVotes,
  );

  if (tiedTargetIds.length > 1) {
    if (room.voteIsRevote) {
      // 재투표도 동점: 데미지 없이 다음 라운드로
      room.voteIsRevote = false;
      room.voteAllowedTargetIds = null;
      room.lastVoteResult = { targetId: null, tie: true };
      io.to(room.code).emit("state:vote_result", {
        damageLog: [],
        topTargetId: null,
        tie: true,
        finalTie: true,
        players: publicPlayers(room),
      });
      advanceToNextRound(io, room);
      return;
    }
    room.voteIsRevote = true;
    room.voteAllowedTargetIds = tiedTargetIds;
    io.to(room.code).emit("state:vote_result", {
      damageLog: [],
      topTargetId: null,
      tie: true,
      finalTie: false,
      tiedTargetIds,
      players: publicPlayers(room),
    });
    startVotePhase(io, room);
    return;
  }

  room.players = updatedPlayers;
  room.voteIsRevote = false;
  room.voteAllowedTargetIds = null;
  room.lastVoteResult = { targetId: topTargetId, tie: false };
  io.to(room.code).emit("state:vote_result", {
    damageLog,
    topTargetId,
    tie: false,
    players: publicPlayers(room),
  });

  const winner = checkWinner(room.players);
  if (winner) {
    endGame(io, room, winner);
    return;
  }
  advanceToNextRound(io, room);
}

function advanceToNextRound(io: Server, room: Room) {
  room.round += 1;
  startNightPhase(io, room);
}

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    const data = socket.data as SocketData;

    socket.on(
      "host:create_room",
      (_payload, callback: (res: { code: string; sessionId: string }) => void) => {
        const room = createRoom(socket.id);
        data.roomCode = room.code;
        data.isHost = true;
        socket.join(room.code);
        // 플레이어와 마찬가지로 세션을 발급해둔다 — 없으면 진행자 소켓이 한 번이라도
        // 끊겼다 재연결됐을 때(네트워크 끊김, 화면 꺼짐 등) 새 연결은 진행자 권한이
        // 전혀 없어서 다음 단계 진행/시작 등 모든 진행자 명령이 조용히 무시된다.
        const sessionId = createSession("__host__", room.code);
        callback({ code: room.code, sessionId });
        emitState(io, room);
      },
    );

    socket.on(
      "host:reconnect",
      (
        payload: { sessionId: string; roomCode: string },
        callback: (res: { ok: boolean; error?: string }) => void,
      ) => {
        const session = getSession(payload.sessionId);
        if (!session || session.playerId !== "__host__") {
          return callback({ ok: false, error: "세션을 찾을 수 없습니다." });
        }
        if (session.roomCode !== payload.roomCode) {
          return callback({ ok: false, error: "방 코드가 일치하지 않습니다." });
        }
        const room = getRoom(session.roomCode);
        if (!room) return callback({ ok: false, error: "방을 찾을 수 없습니다." });

        data.roomCode = room.code;
        data.isHost = true;
        socket.join(room.code);
        callback({ ok: true });
        // 현재 상태를 방 전체(재연결한 진행자 포함)에 다시 뿌려서 화면을 복원시킨다.
        emitState(io, room);
        // public:boss_revealed는 게임 시작 시 딱 한 번만 나가는 이벤트라, 그 이후에
        // 진행자가 재연결하면 새 소켓은 이걸 못 받아서 보스 배너가 영영 안 뜬다.
        if (room.phase !== "lobby") {
          const boss = room.players.find((p) => p.role === "boss");
          if (boss) {
            io.to(room.code).emit("public:boss_revealed", { nickname: boss.nickname });
          }
        }
        // 게임이 이미 끝난 상태로 재연결했다면 승자 문구도 다시 보내야
        // winnerLabel이 빈 채로 남지 않는다.
        if (room.winner) {
          io.to(room.code).emit("state:game_over", { winner: room.winner, players: publicPlayers(room) });
        }
      },
    );

    socket.on(
      "viewer:join_room",
      (payload: { code: string }, callback: (res: { ok: boolean; error?: string }) => void) => {
        const room = getRoom(payload.code ?? "");
        if (!room) return callback({ ok: false, error: "존재하지 않는 방 코드입니다." });
        data.roomCode = room.code;
        socket.join(room.code);
        callback({ ok: true });
        emitState(io, room);
      },
    );

    socket.on(
      "player:join_room",
      (
        payload: { code: string; nickname: string },
        callback: (res: { ok: boolean; error?: string; playerId?: string; sessionId?: string }) => void,
      ) => {
        const room = getRoom(payload.code ?? "");
        if (!room) return callback({ ok: false, error: "존재하지 않는 방 코드입니다." });
        if (room.phase !== "lobby") return callback({ ok: false, error: "이미 시작된 게임입니다." });
        if (room.players.length >= MAX_PLAYERS) return callback({ ok: false, error: `방이 가득 찼습니다 (최대 ${MAX_PLAYERS}명).` });
        const nickname = (payload.nickname ?? "").trim();
        if (!nickname) return callback({ ok: false, error: "닉네임을 입력해주세요." });
        if (nickname.length > 7) return callback({ ok: false, error: "닉네임은 최대 7자입니다." });
        if (room.players.some((p) => p.nickname === nickname)) {
          return callback({ ok: false, error: "이미 사용 중인 닉네임입니다." });
        }

        room.players.push({
          id: socket.id,
          nickname,
          role: null,
          hp: 0,
          alive: true,
          abilities: defaultAbilityState(),
        });
        data.roomCode = room.code;
        socket.join(room.code);
        const sessionId = createSession(socket.id, room.code);
        callback({ ok: true, playerId: socket.id, sessionId });
        emitState(io, room);
      },
    );

    socket.on(
      "player:reconnect",
      (
        payload: { sessionId: string; roomCode: string },
        callback: (res: { ok: boolean; error?: string }) => void,
      ) => {
        const session = getSession(payload.sessionId);
        if (!session) return callback({ ok: false, error: "세션을 찾을 수 없습니다." });
        if (session.roomCode !== payload.roomCode) {
          return callback({ ok: false, error: "방 코드가 일치하지 않습니다." });
        }

        const room = getRoom(session.roomCode);
        if (!room) return callback({ ok: false, error: "방을 찾을 수 없습니다." });
        if (room.phase === "lobby") {
          return callback({ ok: false, error: "게임이 아직 시작되지 않았습니다." });
        }

        const player = room.players.find((p) => p.id === session.playerId);
        if (!player) return callback({ ok: false, error: "플레이어를 찾을 수 없습니다." });

        // 기존 socket 연결 대체.
        // player.id/session.playerId를 새 socket.id로 갱신하지 않으면, 이후
        // io.to(player.id).emit(...)이나 room.players.find(p => p.id === socket.id) 같은
        // id 기반 조회가 전부 예전(끊어진) id를 가리킨 채로 남아 재접속한 플레이어는
        // 밤 행동/투표 제출도, 스킬 옵션 수신도 조용히 실패하게 된다.
        player.id = socket.id;
        session.playerId = socket.id;
        data.roomCode = room.code;
        socket.join(room.code);

        callback({ ok: true });
        // 재연결한 플레이어에게만 현재 상태 전송.
        // players는 publicPlayers()로 보내 다른 플레이어의 비공개 역할이 새어나가지
        // 않게 하고(예전엔 room.players를 그대로 보내서 전원의 역할이 노출됐었다),
        // 본인 역할은 myRole/myHp로 따로 보낸다.
        io.to(socket.id).emit("state:full_sync", {
          players: publicPlayers(room),
          myRole: player.role,
          myHp: player.hp,
          round: room.round,
          phase: room.phase,
          submittedIds: currentSubmittedIds(room),
          voteAllowedTargetIds: room.voteAllowedTargetIds,
          phaseEndsAt: room.phaseEndsAt,
        });
      },
    );

    socket.on(
      "host:start_game",
      (_payload, callback?: (res: { ok: boolean; error?: string }) => void) => {
        const room = data.roomCode ? getRoom(data.roomCode) : undefined;
        if (!room || !data.isHost) return callback?.({ ok: false, error: "진행자만 시작할 수 있습니다." });
        if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
          return callback?.({
            ok: false,
            error: `${MIN_PLAYERS}~${MAX_PLAYERS}명이 모여야 시작할 수 있습니다 (현재 ${room.players.length}명).`,
          });
        }
        room.players = assignRoles(room.players);
        room.round = 1;

        for (const player of room.players) {
          io.to(player.id).emit("player:role_assigned", { role: player.role, hp: player.hp });
        }
        const boss = room.players.find((p) => p.role === "boss");
        io.to(room.code).emit("public:boss_revealed", { nickname: boss?.nickname });

        startNightPhase(io, room);
        callback?.({ ok: true });
      },
    );

    socket.on(
      "player:submit_night_action",
      (payload: { actionType: NightActionType; targetId?: string; shieldMode?: "absorb" | "halve" }) => {
        const room = data.roomCode ? getRoom(data.roomCode) : undefined;
        if (!room || room.phase !== "night" || room.round === 1) return;
        const player = room.players.find((p) => p.id === socket.id);
        if (!player || !player.alive) return;
        const action: NightAction = { actionType: payload.actionType };
        if (payload.targetId) action.targetId = payload.targetId;
        if (payload.shieldMode) action.shieldMode = payload.shieldMode;
        room.nightActions[socket.id] = action;
        emitSubmissionProgress(io, room);
      },
    );

    // 스파이끼리 밤 행동 대상을 실시간으로(제출 전이라도) 조율할 수 있게, 지금 고르고 있는
    // 대상을 같은 팀 스파이에게만 귓속말로 알려준다. 다른 역할에게는 절대 보내지 않는다.
    socket.on("player:preview_night_target", (payload: { targetId?: string }) => {
      const room = data.roomCode ? getRoom(data.roomCode) : undefined;
      if (!room || room.phase !== "night" || room.round === 1) return;
      const sender = room.players.find((p) => p.id === socket.id);
      if (!sender || !sender.alive || sender.role !== "spy") return;
      const targetPlayer = payload.targetId
        ? room.players.find((p) => p.id === payload.targetId)
        : undefined;
      const teammates = room.players.filter((p) => p.role === "spy" && p.id !== sender.id);
      for (const teammate of teammates) {
        io.to(teammate.id).emit("spy:teammate_preview", {
          fromNickname: sender.nickname,
          targetNickname: targetPlayer?.nickname ?? null,
        });
      }
    });

    socket.on("player:submit_vote", (payload: { targetId: string }) => {
      const room = data.roomCode ? getRoom(data.roomCode) : undefined;
      if (!room || room.phase !== "day_vote") return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player || !player.alive) return;
      if (room.voteAllowedTargetIds && !room.voteAllowedTargetIds.includes(payload.targetId)) return;
      room.dayVotes[socket.id] = payload.targetId;
      emitSubmissionProgress(io, room);
    });

    socket.on("host:advance_phase", () => {
      const room = data.roomCode ? getRoom(data.roomCode) : undefined;
      if (!room || !data.isHost) return;
      if (room.phase === "night") resolveNight(io, room);
      else if (room.phase === "day_reveal") startDiscussionPhase(io, room);
      else if (room.phase === "day_discussion") startVotePhase(io, room);
      else if (room.phase === "day_vote") resolveVote(io, room);
    });

    socket.on("host:extend_phase", (payload: { extraMs?: number }) => {
      const room = data.roomCode ? getRoom(data.roomCode) : undefined;
      if (!room || !data.isHost || !room.phaseEndsAt) return;
      const extra = payload.extraMs ?? 60_000;
      room.phaseEndsAt += extra;
      clearPhaseTimer(room);
      const remaining = room.phaseEndsAt - Date.now();
      const phase = room.phase;
      room.phaseTimer = setTimeout(() => {
        if (phase === "night") resolveNight(io, room);
        else if (phase === "day_discussion") startVotePhase(io, room);
        else if (phase === "day_vote") resolveVote(io, room);
      }, Math.max(remaining, 0));
      emitState(io, room);
    });

    socket.on("disconnect", () => {
      const roomCode = data.roomCode;
      if (!roomCode) return;

      const room = getRoom(roomCode);
      if (!room) return;

      // 게임 진행 중이면 플레이어 유지 (재연결 대기)
      // 로비 상태면 플레이어 제거
      if (room.phase === "lobby") {
        room.players = room.players.filter((p) => p.id !== socket.id);
        emitState(io, room);

        // 로비에서 모든 플레이어가 나가면 방 삭제
        if (room.players.length === 0) {
          deleteSessionsByRoom(room.code);
          deleteRoom(room.code);
        }
      }
      // 게임 진행 중: 플레이어 유지 (sessionId로 복귀 가능)
    });
  });
}
