const socket = io();
let players = [];

const MAX_HP_BY_ROLE = {
  boss: 5,
  bodyguard: 4,
  spy: 4,
  traitor: 4,
};

function getMaxHpForRole(role) {
  return role ? MAX_HP_BY_ROLE[role] || 4 : 4;
}

function getHpPercentage(hp, role) {
  const maxHp = getMaxHpForRole(role);
  return Math.max(0, (hp / maxHp) * 100);
}

const createSection = document.getElementById("createSection");
const lobbySection = document.getElementById("lobbySection");
const gameControlSection = document.getElementById("gameControlSection");
const errorLabel = document.getElementById("errorLabel");

document.getElementById("createRoomBtn").addEventListener("click", () => {
  socket.emit("host:create_room", {}, (res) => {
    document.getElementById("roomCode").textContent = res.code;
    createSection.style.display = "none";
    lobbySection.style.display = "block";
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

function renderPlayerList(el, players, { showHp } = { showHp: false }) {
  el.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");
    if (!p.alive) li.classList.add("dead");
    li.textContent = showHp ? `${p.nickname} (HP ${p.hp})` : p.nickname;
    el.appendChild(li);
  }
}

function renderGrid() {
  const grid = document.getElementById("playerGrid");
  grid.innerHTML = "";
  for (const p of players) {
    const div = document.createElement("div");
    div.className = "player-file-card";
    if (p.alive) div.classList.add("is-alive");
    if (!p.alive) div.classList.add("is-dead");
    if (p.role === "boss") div.classList.add("is-boss");
    const hpPercent = getHpPercentage(p.hp, p.role);
    const maxHp = getMaxHpForRole(p.role);
    div.innerHTML = `<div class="tv-player-name">${p.nickname}${p.alive ? "" : " (사망)"}</div>
      <div style="background:#333; height:8px; margin-top:8px; border-radius:2px;">
        <div style="background:#e74c3c; height:100%; width:${hpPercent}%; border-radius:2px;"></div>
      </div>
      <div class="tv-player-hp">HP ${p.hp}/${maxHp}</div>`;
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
  renderPlayerList(document.getElementById("playerList"), players);
  renderPlayerList(document.getElementById("gamePlayerList"), players, { showHp: true });
  renderGrid();
  const validCount = players.length >= MIN_PLAYERS && players.length <= MAX_PLAYERS;
  document.getElementById("startBtn").disabled = !validCount;
  document.getElementById("startBtn").textContent = validCount
    ? "시작"
    : `시작 (${players.length}/${MIN_PLAYERS}~${MAX_PLAYERS}명)`;
});

socket.on("public:boss_revealed", ({ nickname }) => {
  document.getElementById("bossBanner").style.display = "block";
  document.getElementById("bossName").textContent = nickname;
});

socket.on("state:phase_changed", ({ phase, round, phaseEndsAt }) => {
  errorLabel.textContent = "";
  document.getElementById("winnerLabel").style.display = "none";
  if (phase === "lobby") {
    document.getElementById("phaseLabel").textContent = "플레이어 입장 대기 중";
    document.getElementById("timerLabel").textContent = "";
    return;
  }
  lobbySection.style.display = "none";
  gameControlSection.style.display = "block";
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
  const label = document.getElementById("winnerLabel");
  label.style.display = "block";
  label.textContent = WINNER_LABELS[winner] ?? winner;
});
