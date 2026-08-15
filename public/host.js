const socket = io();
let players = [];
let currentRoomCode = "";
let submittedIds = [];

const PHASE_ICON_MAP = {
  night: "night",
  day_reveal: "discussion",
  day_discussion: "discussion",
  day_vote: "vote",
};

const HOST_SESSION_KEYS = ["hostSessionId", "hostRoomCode", "hostSessionSavedAt"];

// 진행자 세션도 플레이어와 같은 이유로 탭 전용 sessionStorage를 우선 저장소로 쓴다
// (localStorage는 같은 브라우저의 모든 탭이 공유해서 서로 덮어쓴다).
function saveHostSession(sessionId, roomCode) {
  const values = [sessionId, roomCode, String(Date.now())];
  for (const store of [sessionStorage, localStorage]) {
    HOST_SESSION_KEYS.forEach((key, i) => store.setItem(key, values[i]));
  }
}

function readHostSession() {
  const store = sessionStorage.getItem("hostSessionId") ? sessionStorage : localStorage;
  return {
    sessionId: store.getItem("hostSessionId"),
    roomCode: store.getItem("hostRoomCode"),
    savedAt: Number(store.getItem("hostSessionSavedAt") || 0),
  };
}

function clearHostSession() {
  for (const store of [sessionStorage, localStorage]) {
    HOST_SESSION_KEYS.forEach((key) => store.removeItem(key));
  }
}

const createSection = document.getElementById("createSection");
const lobbySection = document.getElementById("lobbySection");
const gameControlSection = document.getElementById("gameControlSection");
const errorLabel = document.getElementById("errorLabel");
const showSlide = createSlideQueue("phaseSlide");

document.getElementById("createRoomBtn").addEventListener("click", () => {
  socket.emit("host:create_room", {}, (res) => {
    currentRoomCode = res.code;
    document.getElementById("roomCode").textContent = res.code;
    createSection.style.display = "none";
    lobbySection.style.display = "flex";
    // 플레이어와 마찬가지로 세션을 저장해둔다 — 진행자 소켓이 끊겼다 재연결돼도
    // (네트워크 끊김, 화면 꺼짐 등) 진행자 권한을 자동으로 되찾을 수 있게 한다.
    if (res.sessionId) saveHostSession(res.sessionId, res.code);
  });
});

// server:hello를 받은 뒤에 진행자 권한 복구를 시도한다. 서버 부팅 시각을 먼저 알아야
// 실패 이유를 정확히 안내할 수 있고, 소켓이 조용히 끊겼다 다시 붙을 때도 이 이벤트가
// 다시 오므로 그때마다 권한을 되찾는다.
socket.on("server:hello", ({ startedAt }) => {
  const { sessionId, roomCode, savedAt } = readHostSession();
  if (!sessionId || !roomCode) return;

  const serverRestarted = startedAt > savedAt;

  socket.emit("host:reconnect", { sessionId, roomCode }, (res) => {
    if (res.ok) {
      currentRoomCode = roomCode;
      document.getElementById("roomCode").textContent = roomCode;
      createSection.style.display = "none";
      lobbySection.style.display = "flex"; // 아직 로비 단계면 이대로, 게임 중이면 곧이어 오는 state:phase_changed가 gameControlSection으로 바꿔준다.
      errorLabel.textContent = "";
      return;
    }
    // 서버가 우리 세션보다 나중에 떴을 때만 세션을 버린다 — 일시적 실패로 지우면
    // 돌아갈 수 있었던 방까지 잃는다.
    if (serverRestarted) {
      clearHostSession();
      createSection.style.display = "flex";
      lobbySection.style.display = "none";
      document.getElementById("createErrorLabel").textContent =
        "서버가 재시작되어 이전 방이 사라졌습니다. 새 방을 만들어주세요.";
    }
  });
});

document.getElementById("startBtn").addEventListener("click", () => {
  socket.emit("host:start_game", {}, (res) => {
    if (res && !res.ok) errorLabel.textContent = res.error ?? "시작할 수 없습니다.";
  });
});

document.getElementById("advanceBtn").addEventListener("click", () => {
  socket.emit("host:advance_phase");
});

document.getElementById("extendBtn").addEventListener("click", () => {
  socket.emit("host:extend_phase", { extraMs: 60_000 });
});

function makePlayerCard(p) {
  const li = document.createElement("li");
  if (!p.alive) li.classList.add("dead");
  li.textContent = p.nickname;
  return li;
}

// 항상 위/아래로 균등 분배(홀수면 아래가 하나 더) — 모바일·데스크톱 공통.
// 각 줄은 중앙 정렬이라, 안에서 가운데 카드부터 바깥쪽으로 팝인 애니메이션이 퍼진다.
function renderLobbyGrid(players) {
  const top = document.getElementById("lobbyRowTop");
  const bottom = document.getElementById("lobbyRowBottom");
  top.innerHTML = "";
  bottom.innerHTML = "";

  const n = players.length;
  const topCount = Math.floor(n / 2);
  players.forEach((p, i) => {
    const row = i < topCount ? top : bottom;
    row.appendChild(makePlayerCard(p));
  });

  const STAGGER_MS = 90;
  for (const row of [top, bottom]) {
    const items = [...row.children];
    const center = (items.length - 1) / 2;
    items.forEach((li, idx) => {
      const distance = Math.abs(idx - center);
      li.style.animationDelay = `${distance * STAGGER_MS}ms`;
      li.classList.add("lobby-card-enter");
    });
  }
}

// 이름 뒤에 붙는 "(사망 · 스파이)" / "(경호원)" 같은 꼬리표.
// 서버가 role을 안 준 살아있는 참가자는 아무것도 붙지 않는다.
function statusLabel(p) {
  const roleText = p.role ? ROLE_NAMES[p.role] ?? p.role : "";
  if (!p.alive) return ` (사망${roleText ? " · " + roleText : ""})`;
  return roleText ? ` (${roleText})` : "";
}

function renderGrid() {
  const grid = document.getElementById("playerGrid");
  grid.innerHTML = "";
  // 보스는 별도 보스 카드에 이름/HP가 이미 떠 있으니 참가자 HP 모니터에서는 제외한다.
  const nonBossPlayers = players.filter((p) => p.role !== "boss");
  const playerCount = nonBossPlayers.length || MIN_PLAYERS;
  grid.style.setProperty("--player-count", playerCount);
  grid.style.setProperty("--player-count-half", Math.ceil(playerCount / 2));
  for (const p of nonBossPlayers) {
    const div = document.createElement("div");
    div.className = "hp-monitor-card";
    if (p.alive) div.classList.add("is-alive");
    if (!p.alive) div.classList.add("is-dead");
    const maxHp = getMaxHpForRole(p.role);
    const initial = p.nickname.charAt(0).toUpperCase();
    // 밤 행동/투표 제출 여부 — 누가 이미 제출했고 누가 안 했는지 한눈에 보이게 배지로 표시한다.
    const submitted = p.alive && submittedIds.includes(p.id);
    // 캐릭터 사진 자리 — 지금은 이니셜 플레이스홀더, 나중에 실제 캐릭터 이미지로 교체 예정
    // 역할은 서버가 흘려보낼 때만 표시된다: 사망자는 남은 사람들의 토론에 도움이 되도록
    // 게임 도중에도 공개되고, 게임이 끝나면 살아남은 사람 역할까지 전부 공개된다.
    div.innerHTML = `${submitted ? '<span class="hp-monitor-card__submit-badge">✓ 제출완료</span>' : ""}<div class="hp-monitor-card__avatar">${initial}</div>
      <div class="hp-monitor-card__body">
        <div class="hp-monitor-card__name">${p.nickname}${statusLabel(p)}</div>
        <div class="hp-monitor-card__hp-text">HP ${p.hp}/${maxHp}</div>
        <div class="hp-monitor-card__pips"></div>
      </div>`;
    renderPipBar(div.querySelector(".hp-monitor-card__pips"), p.hp, maxHp, "hp-pip--red");
    grid.appendChild(div);
  }
}

function nameOf(id) {
  return players.find((p) => p.id === id)?.nickname ?? "???";
}

function showResult(title, damageLog, note) {
  const lines = damageLog.map((d) => `<span class="result-item">${nameOf(d.targetId)} -${d.damage}</span>`);
  document.getElementById("resultLog").innerHTML =
    `<span class="result-title">${title}</span>` +
    (lines.join("") || `<span class="result-item">${note || "이번엔 아무 일도 없었습니다."}</span>`);
}

socket.on("state:players", ({ players: ps }) => {
  players = ps;
  renderLobbyGrid(players);
  renderGrid();

  // Boss HP critical status check + pip bar
  const boss = players.find(p => p.role === "boss");
  const bossBanner = document.getElementById("bossBanner");
  if (boss && bossBanner) {
    if (boss.hp <= 1) {
      bossBanner.classList.add("is-critical");
    } else {
      bossBanner.classList.remove("is-critical");
    }
    bossBanner.classList.toggle("is-submitted", boss.alive && submittedIds.includes(boss.id));
    const bossMaxHp = getMaxHpForRole("boss");
    document.getElementById("bossHpText").textContent = `HP ${boss.hp}/${bossMaxHp}`;
    renderPipBar(document.getElementById("bossHpPips"), boss.hp, bossMaxHp, "hp-pip--yellow");
  }

  const validCount = players.length >= MIN_PLAYERS && players.length <= MAX_PLAYERS;
  document.getElementById("startBtn").disabled = !validCount;
  document.getElementById("startBtn").textContent = validCount
    ? "시작"
    : `시작 (${players.length}/${MIN_PLAYERS}~${MAX_PLAYERS}명)`;
});

// 밤 행동/투표 제출 현황 — 누가 제출했고 누가 안 했는지 참가자 카드/보스 카드에 배지로 표시한다.
socket.on("state:submission_progress", ({ submittedIds: ids }) => {
  submittedIds = ids;
  renderGrid();
  const boss = players.find((p) => p.role === "boss");
  const bossBanner = document.getElementById("bossBanner");
  if (boss && bossBanner) {
    bossBanner.classList.toggle("is-submitted", boss.alive && submittedIds.includes(boss.id));
  }
});

socket.on("public:boss_revealed", ({ nickname }) => {
  document.getElementById("bossBanner").style.display = "flex";
  document.getElementById("bossName").textContent = nickname;
  document.getElementById("bossAvatar").textContent = nickname.charAt(0).toUpperCase();
});

socket.on("state:phase_changed", ({ phase, round, phaseEndsAt }) => {
  const gameShell = document.querySelector(".host-layout");
  if (gameShell) {
    gameShell.setAttribute("data-phase", phase);
  }

  document.querySelectorAll(".phase-icon").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.icon === PHASE_ICON_MAP[phase]);
  });

  errorLabel.textContent = "";
  document.getElementById("winnerLabel").style.display = "none";
  if (phase === "lobby") {
    document.getElementById("phaseLabel").textContent = "플레이어 입장 대기 중";
    document.getElementById("timerLabel").textContent = "";
    return;
  }
  lobbySection.style.display = "none";
  gameControlSection.style.display = "flex";
  document.getElementById("caseNumber").textContent = `#${currentRoomCode}`;
  if (phase === "game_over") {
    document.getElementById("phaseLabel").textContent = "게임 종료";
    document.getElementById("timerLabel").textContent = "";
    document.getElementById("winnerLabel").style.display = "block";
    return;
  }
  document.getElementById("phaseLabel").textContent = `${round}라운드 - ${PHASE_LABELS[phase]}`;
  startCountdown(phaseEndsAt, document.getElementById("timerLabel"));
  if (phase === "night" || phase === "day_discussion") {
    document.getElementById("resultLog").textContent = "";
  }

  // day_reveal은 night_result 슬라이드가 이미 그 내용을 보여주므로 따로 안내 슬라이드를 안 띄운다.
  if (phase === "night") {
    showSlide("🌙", "밤이 되었습니다", `${round}라운드 - 각자 행동을 선택하세요`);
  } else if (phase === "day_discussion") {
    showSlide("💬", "토론 시작", "누가 수상한지 이야기해보세요");
  } else if (phase === "day_vote") {
    showSlide("🗳️", "투표 시작", "의심되는 사람을 지목하세요");
  }
  const advanceBtn = document.getElementById("advanceBtn");
  const extendBtn = document.getElementById("extendBtn");
  // 페이즈 목록을 하드코딩하는 대신 서버가 준 phaseEndsAt으로 판단한다 — 타이머가 붙는
  // 페이즈가 늘어나도(예: day_reveal) 여기를 같이 고칠 필요가 없다.
  extendBtn.style.display = phaseEndsAt != null ? "block" : "none";
  advanceBtn.textContent = phase === "day_reveal" ? "토론 시작하기" : "다음 단계로";
});

socket.on("state:night_result", ({ damageLog, players: updatedPlayers }) => {
  showResult("🌙 밤 결과", damageLog);

  let sub;
  if (damageLog.length === 0) {
    sub = "이번 밤엔 아무 일도 없었습니다";
  } else {
    const deaths = (updatedPlayers || []).filter(
      (p) => !p.alive && damageLog.some((d) => d.targetId === p.id),
    );
    const lines = deaths.map((p) => `${p.nickname} 사망 (${ROLE_NAMES[p.role] ?? p.role})`);
    const survivedHits = damageLog.length - deaths.length;
    if (survivedHits > 0) lines.push(`그 외 ${survivedHits}명 피해`);
    sub = lines.join("\n");
  }
  showSlide("☀️", "밤 사이 벌어진 일", sub);
});

socket.on("state:vote_result", ({ damageLog, tie, finalTie, topTargetId, players: updatedPlayers }) => {
  showResult("🗳 투표 결과", damageLog, tie ? (finalTie ? "동점 - 데미지 없음" : "동점 - 재투표") : undefined);

  let sub;
  if (tie) {
    sub = finalTie ? "동점으로 이번 라운드는 피해 없이 종료됩니다" : "동점! 동점자끼리 재투표합니다";
  } else if (topTargetId) {
    const deadTarget = (updatedPlayers || []).find((p) => p.id === topTargetId && !p.alive);
    sub =
      `${nameOf(topTargetId)}가 최종 지목되었습니다` +
      (deadTarget ? `\n사망 (${ROLE_NAMES[deadTarget.role] ?? deadTarget.role})` : "");
  } else {
    sub = "아무도 지목되지 않았습니다";
  }
  showSlide("🗳️", "투표 결과", sub);
});

socket.on("state:game_over", ({ winner }) => {
  const gameShell = document.querySelector(".host-layout");
  if (gameShell) {
    gameShell.setAttribute("data-phase", "game_over");
  }

  const label = document.getElementById("winnerLabel");
  label.style.display = "block";
  label.textContent = WINNER_LABELS[winner] ?? winner;
});
