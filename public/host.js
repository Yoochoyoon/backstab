const socket = io();
let players = [];
let currentRoomCode = "";

const MAX_HP_BY_ROLE = {
  boss: 5,
  bodyguard: 4,
  spy: 4,
  traitor: 4,
};

function getMaxHpForRole(role) {
  return role ? MAX_HP_BY_ROLE[role] || 4 : 4;
}

// 보스 카드/플레이어 카드 양쪽에서 공용으로 쓰는 HP 조각(pip) 렌더러.
function renderPipBar(container, hp, maxHp, colorClass) {
  container.innerHTML = "";
  for (let i = 0; i < maxHp; i++) {
    const pip = document.createElement("div");
    pip.className = `hp-pip ${colorClass}` + (i < hp ? " filled" : "");
    container.appendChild(pip);
  }
}

const PHASE_ICON_MAP = {
  night: "night",
  day_reveal: "discussion",
  day_discussion: "discussion",
  day_vote: "vote",
};

const createSection = document.getElementById("createSection");
const lobbySection = document.getElementById("lobbySection");
const gameControlSection = document.getElementById("gameControlSection");
const errorLabel = document.getElementById("errorLabel");

document.getElementById("createRoomBtn").addEventListener("click", () => {
  socket.emit("host:create_room", {}, (res) => {
    currentRoomCode = res.code;
    document.getElementById("roomCode").textContent = res.code;
    createSection.style.display = "none";
    lobbySection.style.display = "flex";
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

function renderGrid() {
  const grid = document.getElementById("playerGrid");
  grid.innerHTML = "";
  const playerCount = players.length || MIN_PLAYERS;
  grid.style.setProperty("--player-count", playerCount);
  grid.style.setProperty("--player-count-half", Math.ceil(playerCount / 2));
  for (const p of players) {
    const div = document.createElement("div");
    div.className = "hp-monitor-card";
    if (p.alive) div.classList.add("is-alive");
    if (!p.alive) div.classList.add("is-dead");
    if (p.role === "boss") div.classList.add("is-boss");
    const maxHp = getMaxHpForRole(p.role);
    const initial = p.nickname.charAt(0).toUpperCase();
    // 캐릭터 사진 자리 — 지금은 이니셜 플레이스홀더, 나중에 실제 캐릭터 이미지로 교체 예정
    div.innerHTML = `<div class="hp-monitor-card__avatar">${initial}</div>
      <div class="hp-monitor-card__body">
        <div class="hp-monitor-card__name">${p.nickname}${p.alive ? "" : " (사망)"}</div>
        <div class="hp-monitor-card__hp-text">HP ${p.hp}/${maxHp}</div>
        <div class="hp-monitor-card__pips"></div>
      </div>`;
    renderPipBar(div.querySelector(".hp-monitor-card__pips"), p.hp, maxHp, "hp-pip--red");
    grid.appendChild(div);
  }
}

function showResult(title, damageLog, note) {
  const nameOf = (id) => players.find((p) => p.id === id)?.nickname ?? "???";
  const lines = damageLog.map((d) => `${nameOf(d.targetId)} -${d.damage}`);
  document.getElementById("resultLog").innerHTML =
    `<strong>${title}</strong><br>` + (lines.join("<br>") || note || "이번엔 아무 일도 없었습니다.");
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
  const advanceBtn = document.getElementById("advanceBtn");
  const extendBtn = document.getElementById("extendBtn");
  const hasTimer = phase === "night" || phase === "day_discussion" || phase === "day_vote";
  extendBtn.style.display = hasTimer ? "block" : "none";
  advanceBtn.textContent = phase === "day_reveal" ? "토론 시작하기" : "다음 단계로 (강제 진행)";
});

socket.on("state:night_result", ({ damageLog }) => showResult("🌙 밤 결과", damageLog));
socket.on("state:vote_result", ({ damageLog, tie, finalTie }) =>
  showResult("🗳 투표 결과", damageLog, tie ? (finalTie ? "동점 - 데미지 없음" : "동점 - 재투표") : undefined),
);

socket.on("state:game_over", ({ winner }) => {
  const gameShell = document.querySelector(".host-layout");
  if (gameShell) {
    gameShell.setAttribute("data-phase", "game_over");
  }

  const label = document.getElementById("winnerLabel");
  label.style.display = "block";
  label.textContent = WINNER_LABELS[winner] ?? winner;
});
