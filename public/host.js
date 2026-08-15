const socket = io();
let players = [];
let currentRoomCode = "";
let submittedIds = [];
// 실시간 투표 현황. kind는 "vote"(지목) | "judgement"(찬반) | null.
let voteProgress = { kind: null, votes: [] };
// 시간 연장 시 같은 페이즈가 재전송돼도 전환 슬라이드가 다시 뜨지 않도록 추적한다.
let lastPhase = null;

const PHASE_ICON_MAP = {
  night: "night",
  day_discussion: "discussion",
  day_vote: "vote",
  // 심판도 투표의 연장이라 같은 아이콘을 켜둔다.
  day_judgement: "vote",
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

// 어느 화면에 있든 눌러서 나갈 수 있는 버튼. 방을 만든 적 없으면(랜딩 화면)
// 확인 없이 바로 새로고침만 하고, 방이 있었다면 한 번 확인한다 — 진행자가 나가면
// 방 전체가 진행자 없이 남기 때문에 실수로 누르는 걸 막는 게 더 중요하다.
document.getElementById("leaveGameBtn").addEventListener("click", () => {
  if (currentRoomCode && !confirm("게임에서 나가시겠습니까? 진행자가 나가면 방을 다시 열 수 없습니다.")) return;
  clearHostSession();
  socket.disconnect();
  location.reload();
});

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
    // 밤 행동/투표 제출 여부 — 누가 이미 제출했고 누가 안 했는지 한눈에 보이게 배지로 표시한다.
    const submitted = p.alive && submittedIds.includes(p.id);
    // 역할은 서버가 흘려보낼 때만 표시된다: 사망자는 남은 사람들의 토론에 도움이 되도록
    // 게임 도중에도 공개되고, 게임이 끝나면 살아남은 사람 역할까지 전부 공개된다.
    div.innerHTML = `${submitted ? '<span class="hp-monitor-card__submit-badge">✓ 제출완료</span>' : ""}<div class="hp-monitor-card__avatar">${avatarInnerHtml(p)}${voterChipsHtml(players, voteProgress, p.id)}</div>
      <div class="hp-monitor-card__body">
        <div class="hp-monitor-card__name">${escapeHtml(p.nickname)}${statusLabel(p)}</div>
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
    // 재접속 등으로 정보가 갱신될 수 있으니 사진도 매번 다시 그린다.
    document.getElementById("bossAvatar").innerHTML = avatarInnerHtml(boss);
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

// 낮 투표 실시간 공개 — 누가 누구를 찍었는지 TV 화면 카드 위에도 그대로 보여준다.
socket.on("state:vote_progress", (payload) => {
  voteProgress = payload || { kind: null, votes: [] };
  renderGrid();
  renderJudgementTally();
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
  // 보스 카드 사진도 참가자 카드와 같은 규칙으로 채운다(사진 없으면 첫 글자).
  const boss = players.find((p) => p.nickname === nickname);
  document.getElementById("bossAvatar").innerHTML = avatarInnerHtml(boss ?? { nickname });
});

socket.on("state:phase_changed", ({ phase, round, phaseEndsAt }) => {
  const phaseActuallyChanged = phase !== lastPhase;
  lastPhase = phase;
  const gameShell = document.querySelector(".host-layout");
  if (gameShell) {
    gameShell.setAttribute("data-phase", phase);
  }

  document.querySelectorAll(".phase-icon").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.icon === PHASE_ICON_MAP[phase]);
  });

  errorLabel.textContent = "";
  document.getElementById("winnerLabel").style.display = "none";
  // 심판이 끝난 뒤(또는 재접속으로 화면이 복원될 때) 포스터가 남아있지 않게 한다.
  // 심판 시작 이벤트가 오면 다시 켜진다.
  if (phase !== "day_judgement") {
    document.getElementById("judgementPoster").style.display = "none";
  }
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
    // textContent만 비우면 직전 페이즈의 카운트다운 인터벌이 계속 살아서 타이머를
    // 다시 써넣는다 — 게임이 끝났는데도 숫자가 줄어드는 걸 실제 플레이에서 확인했다.
    startCountdown(null, document.getElementById("timerLabel"));
    document.getElementById("timerLabel").textContent = "";
    document.getElementById("winnerLabel").style.display = "block";
    return;
  }
  document.getElementById("phaseLabel").textContent = `${round}라운드 - ${PHASE_LABELS[phase]}`;
  startCountdown(phaseEndsAt, document.getElementById("timerLabel"));
  if (phase === "night" || phase === "day_discussion") {
    document.getElementById("resultLog").textContent = "";
  }

  // 밤 결과는 state:night_result 슬라이드가 따로 띄우므로 여기서 중복해서 안내하지 않는다.
  if (phaseActuallyChanged && phase === "night") {
    showSlide("🌙", "밤이 되었습니다", `${round}라운드 - 각자 행동을 선택하세요`);
  } else if (phaseActuallyChanged && phase === "day_discussion") {
    showSlide("💬", "토론 시작", "누가 수상한지 이야기해보세요");
  } else if (phaseActuallyChanged && phase === "day_vote") {
    showSlide("🗳️", "투표 시작", "의심되는 사람을 지목하세요");
  }
  const advanceBtn = document.getElementById("advanceBtn");
  const extendBtn = document.getElementById("extendBtn");
  // 페이즈 목록을 하드코딩하는 대신 서버가 준 phaseEndsAt으로 판단한다 — 타이머가 붙는
  // 타이머가 붙는 페이즈가 늘어나도 여기를 같이 고칠 필요가 없다.
  extendBtn.style.display = phaseEndsAt != null ? "block" : "none";
  advanceBtn.textContent = "다음 단계로";
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

socket.on("state:vote_result", ({ tie, finalTie, topTargetId, topTargetNickname }) => {
  // 서버가 보내준 닉네임을 우선 쓴다 — id로 찾으면 그 사람이 방금 재접속했을 때 "???"가 된다.
  const targetName = topTargetNickname ?? (topTargetId ? nameOf(topTargetId) : null);

  // 지목만으로는 데미지가 없다(찬반 심판을 거쳐야 한다). damageLog는 항상 비어 있으므로
  // 결과 로그에는 "누가 지목됐는지"를 직접 적어준다.
  let note;
  if (tie) {
    note = finalTie ? "동점 - 데미지 없음" : "동점 - 재투표";
  } else if (targetName) {
    note = `${targetName} 최종 지목 - 심판으로 넘어갑니다`;
  } else {
    note = "아무도 지목되지 않았습니다";
  }
  showResult("🗳 투표 결과", [], note);

  let sub;
  if (tie) {
    sub = finalTie ? "동점으로 이번 라운드는 피해 없이 종료됩니다" : "동점! 동점자끼리 재투표합니다";
  } else if (targetName) {
    sub = `${targetName}가 최종 지목되었습니다`;
  } else {
    sub = "아무도 지목되지 않았습니다";
  }
  showSlide("🗳️", "투표 결과", sub);
});

// 지명수배 포스터 아래에 찬성/반대 진영을 실시간으로 그린다.
function renderJudgementTally() {
  const el = document.getElementById("judgementPosterTally");
  if (el) el.innerHTML = judgementTallyHtml(players, voteProgress);
}

socket.on("state:judgement_started", ({ nickname }) => {
  const poster = document.getElementById("judgementPoster");
  const nameEl = document.getElementById("judgementPosterName");
  nameEl.textContent = nickname;
  // 글자 수를 CSS에 넘겨 긴 닉네임일수록 글자를 줄인다(항상 한 줄 유지).
  nameEl.style.setProperty("--name-len", Math.max(nickname.length, 2));
  document.getElementById("judgementPosterSub").textContent = "처단할지 찬반 투표 중";
  poster.style.display = "flex";
  showSlide("⚖️", "최종 심판", `${nickname}을(를) 처단할까요?`);
});

socket.on("state:judgement_result", ({ nickname, approve, oppose, passed, players: updated }) => {
  if (updated) players = updated;
  document.getElementById("judgementPoster").style.display = "none";

  const summary = `찬성 ${approve} · 반대 ${oppose}`;
  const target = players.find((p) => p.nickname === nickname);
  const died = passed && target && !target.alive;
  showResult(
    "⚖ 심판 결과",
    [],
    passed
      ? `${nickname} 처단 가결 (${summary})${died ? ` · 사망 (${ROLE_NAMES[target.role] ?? target.role})` : ""}`
      : `${nickname} 처단 부결 (${summary})`,
  );
  showSlide(
    passed ? "⚔️" : "🕊️",
    passed ? "처단 가결" : "처단 부결",
    passed
      ? `${nickname} 데미지 1 (${summary})${died ? "\n사망" : ""}`
      : `${nickname}은(는) 살아남았습니다 (${summary})`,
  );
  renderGrid();
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
