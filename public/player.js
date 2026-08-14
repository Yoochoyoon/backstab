const socket = io();

// 페이지 로드 시 자동 재연결 시도
window.addEventListener("load", () => {
  const sessionId = localStorage.getItem("sessionId");
  const roomCode = localStorage.getItem("roomCode");

  if (sessionId && roomCode) {
    socket.emit("player:reconnect", { sessionId, roomCode }, (res) => {
      if (res.ok) {
        console.log("재연결 성공");
        joinSection.style.display = "none";
        document.getElementById("postJoinScreen").style.display = "flex";
        // 나머지 화면 상태는 state:full_sync 이벤트로 받음
      } else {
        console.log("재연결 실패:", res.error);
        // 세션 정보 삭제 (새로 입장해야 함)
        localStorage.removeItem("sessionId");
        localStorage.removeItem("roomCode");
      }
    });
  }
});

// 07룰복잡도온보딩.md: 1~2라운드까지만 짧은 첫판 힌트를 보여주고, 3라운드부터는 자동으로 사라진다.
const BEGINNER_HINTS = {
  night: "💡 지금은 밤이에요. 위에서 행동을 고르고 대상을 지목한 뒤 '지목 확정'을 누르세요.",
  day_reveal: "💡 밤 사이 벌어진 일이 공개돼요. 진행자가 토론을 시작할 때까지 잠시 기다리세요.",
  day_discussion: "💡 자유롭게 이야기하며 누가 스파이인지, 배신자인지 추리해보세요.",
  day_vote: "💡 의심되는 사람을 지목하고 '지목 확정'을 누르세요. 최다득표자는 데미지를 입어요.",
};

const ACTION_META = {
  attack: { title: "기본 공격", sub: "데미지 1", icon: "target" },
  boss_execute: { title: "긴급 처형", sub: "이번 공격 데미지 2배 (게임당 1회)", icon: "crown" },
  bodyguard_shield: { title: "육탄 방어", sub: "대상 보호 (쿨타임 1라운드)", icon: "shield" },
  bodyguard_oath: { title: "충성심 서약", sub: "이번 라운드 피해 무효화 (게임당 1회)", icon: "shield-check" },
  spy_disrupt: { title: "교란 작전", sub: "대상 이번 라운드 행동 봉쇄 (게임당 1회)", icon: "wifi-off" },
  traitor_smile: { title: "흑막의 미소", sub: "공격력+1, 사망자 발생 시 HP+2 (게임당 1회)", icon: "dagger" },
};

const ACTION_ICONS = {
  target:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="1" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="1" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="23" y2="12"/></svg>',
  "wifi-off":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
  shield:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  "shield-check":
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
  crown:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 19h20l-2-9-5 4-3-8-3 8-5-4-2 9z"/></svg>',
  dagger:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3l6.5 6.5-2 2L12 5l2.5-2z"/><path d="M13 6l-9 9v4h4l9-9"/></svg>',
};

let myId = null;
let myRole = null;
let players = [];
let myself = null;
let currentPhase = "lobby";
let currentRound = 0;
let voteAllowedTargetIds = null;
let selectedTargetId = null;
let myNightOptions = { canAttack: true, specialActions: [] };
let selectedAction = "attack";
let selectedShieldMode = "absorb";

const joinSection = document.getElementById("joinSection");
const waitingSection = document.getElementById("waitingSection");
const bossBanner = document.getElementById("bossBanner");
const roleCard = document.getElementById("roleCard");
const spyRevealSection = document.getElementById("spyRevealSection");
const gameSection = document.getElementById("gameSection");
const resultSection = document.getElementById("resultSection");
const overSection = document.getElementById("overSection");
const errorLabel = document.getElementById("errorLabel");

socket.on("connect", () => {
  myId = socket.id;
});

document.getElementById("joinBtn").addEventListener("click", () => {
  // 새 방에 직접 입장하는 순간 이전 세션은 더 이상 유효하지 않다 — 지워두지 않으면
  // 다음 새로고침 때 이 방이 아니라 이전(어쩌면 중단된) 방으로 자동 재접속돼버린다.
  localStorage.removeItem("sessionId");
  localStorage.removeItem("roomCode");

  const code = document.getElementById("codeInput").value.trim().toUpperCase();
  const nickname = document.getElementById("nicknameInput").value.trim();
  socket.emit("player:join_room", { code, nickname }, (res) => {
    if (!res.ok) {
      errorLabel.textContent = res.error;
      return;
    }
    // sessionId 저장
    if (res.sessionId) {
      localStorage.setItem("sessionId", res.sessionId);
      localStorage.setItem("roomCode", code);
    }
    errorLabel.textContent = "";
    joinSection.style.display = "none";
    waitingSection.style.display = "flex";
  });
});

function renderWaitingList(list) {
  const el = document.getElementById("waitingPlayerList");
  el.innerHTML = "";
  for (const p of list) {
    const li = document.createElement("li");
    li.textContent = p.nickname;
    el.appendChild(li);
  }
}

socket.on("state:players", (payload) => {
  players = payload.players;
  if (currentPhase === "lobby") renderWaitingList(players);
  if (currentPhase === "night" || currentPhase === "day_vote") renderTargetList();
});

socket.on("public:boss_revealed", ({ nickname }) => {
  bossBanner.style.display = "block";
  document.getElementById("bossName").textContent = nickname;
});

socket.on("player:role_assigned", ({ role, hp }) => {
  myRole = role;
  const roleNames = { boss: "보스", bodyguard: "경호원", spy: "스파이", traitor: "배신자" };
  document.getElementById("roleName").textContent = roleNames[role] ?? role;
  document.getElementById("hpLabel").textContent = `HP ${hp}`;
  document.getElementById("hpBarFill").style.width = "100%";
  document.getElementById("postJoinScreen").style.display = "flex";
  roleCard.style.display = "block";
  waitingSection.style.display = "none";
});

socket.on("player:spy_reveal", ({ teammates }) => {
  spyRevealSection.style.display = "block";
  const el = document.getElementById("spyTeammateList");
  el.innerHTML = teammates.map((name) => `<li>${name}</li>`).join("");
});

socket.on("player:night_options", (options) => {
  myNightOptions = options;
  selectedAction = "attack";
  if (currentPhase === "night") renderActionChoices();
});

// state:phase_changed(실시간)와 state:full_sync(재접속 복원) 둘 다 같은 화면
// 갱신 로직을 타야 해서 함수로 뽑아뒀다 — 재접속 시 이 호출이 빠지면 화면이
// 대기 화면에 멈춘 채 아무것도 안 보이는 버그가 생긴다.
function applyPhase(phase, round, phaseEndsAt) {
  currentPhase = phase;
  currentRound = round;
  selectedTargetId = null;
  selectedAction = "attack";
  resultSection.style.display = "none";

  const myself = players.find((p) => p.id === myId);
  if (myself) {
    document.getElementById("hpLabel").textContent = `HP ${myself.hp}${myself.alive ? "" : " (사망)"}`;
    document.getElementById("hpBarFill").style.width = `${Math.max(0, (myself.hp / 5) * 100)}%`;
  }

  if (phase === "game_over") {
    gameSection.style.display = "none";
    overSection.style.display = "block";
    const roleNames = { boss: "보스", bodyguard: "경호원", spy: "스파이", traitor: "배신자" };
    document.getElementById("myRoleReveal").textContent = `내 역할은 ${roleNames[myRole] ?? myRole}이었습니다.`;
    return;
  }

  gameSection.style.display = "flex";
  document.getElementById("phaseLabel").textContent = PHASE_LABELS[phase];
  startCountdown(phaseEndsAt, document.getElementById("timerLabel"));

  const instructionLabel = document.getElementById("instructionLabel");
  const submitBtn = document.getElementById("submitBtn");
  const summaryPanel = document.getElementById("summaryPanel");

  if (phase === "night" && round === 1) {
    instructionLabel.textContent =
      myRole === "spy"
        ? "1라운드는 정찰 라운드입니다. 위에 동료 스파이 목록이 표시됩니다. 공격은 아직 불가능합니다."
        : "1라운드는 정찰 라운드입니다. 스파이들이 서로의 정체를 확인하는 동안 기다려주세요. 공격은 아직 불가능합니다.";
    submitBtn.style.display = "none";
    summaryPanel.style.display = "none";
    document.getElementById("actionSection").style.display = "none";
    document.getElementById("shieldModeChoices").style.display = "none";
    document.getElementById("summaryActionRow").style.display = "none";
    document.getElementById("targetList").innerHTML = "";
  } else if (phase === "night") {
    instructionLabel.textContent = "행동을 선택하고 대상을 지목하세요.";
    submitBtn.style.display = "block";
    summaryPanel.style.display = "block";
    renderActionChoices();
  } else if (phase === "day_vote") {
    voteAllowedTargetIds = null; // 서버가 별도로 알려주지 않는 한 전원 대상
    instructionLabel.textContent = "투표할 대상을 지목하세요.";
    submitBtn.style.display = "block";
    summaryPanel.style.display = "block";
    document.getElementById("actionSection").style.display = "none";
    document.getElementById("shieldModeChoices").style.display = "none";
    document.getElementById("summaryActionRow").style.display = "none";
    renderTargetList();
  } else if (phase === "day_reveal") {
    instructionLabel.textContent = "밤 사이 벌어진 일이 공개됩니다. 진행자가 토론을 시작할 때까지 기다려주세요.";
    submitBtn.style.display = "none";
    summaryPanel.style.display = "none";
    document.getElementById("actionSection").style.display = "none";
    document.getElementById("shieldModeChoices").style.display = "none";
    document.getElementById("summaryActionRow").style.display = "none";
    document.getElementById("targetList").innerHTML = "";
  } else if (phase === "day_discussion") {
    instructionLabel.textContent = "자유롭게 토론하세요.";
    submitBtn.style.display = "none";
    summaryPanel.style.display = "none";
    document.getElementById("actionSection").style.display = "none";
    document.getElementById("shieldModeChoices").style.display = "none";
    document.getElementById("summaryActionRow").style.display = "none";
    document.getElementById("targetList").innerHTML = "";
  }

  updateBeginnerHint(phase, round);
}

socket.on("state:phase_changed", ({ phase, round, phaseEndsAt }) => {
  applyPhase(phase, round, phaseEndsAt);
});

function updateBeginnerHint(phase, round) {
  const hintEl = document.getElementById("beginnerHint");
  const alreadyCoveredByInstructions = phase === "night" && round === 1;
  if (round <= 2 && !alreadyCoveredByInstructions && BEGINNER_HINTS[phase]) {
    hintEl.textContent = BEGINNER_HINTS[phase];
    hintEl.style.display = "block";
  } else {
    hintEl.style.display = "none";
  }
}

socket.on("state:night_result", ({ damageLog }) => {
  showResult("🌙 밤 결과", damageLog);
});

socket.on("state:vote_result", ({ damageLog, tie, tiedTargetIds, finalTie }) => {
  if (tie) {
    voteAllowedTargetIds = tiedTargetIds ?? null;
    showResult("🗳 투표 결과", [], finalTie ? "동점으로 이번 라운드는 데미지 없이 종료됩니다." : "동점! 동점자 중에서 재투표합니다.");
  } else {
    showResult("🗳 투표 결과", damageLog);
  }
});

socket.on("state:full_sync", (data) => {
  // 재접속한 플레이어의 화면을 현재 게임 상태로 복원한다.
  players = data.players;
  myself = players.find((p) => p.id === myId) || myself;

  // 본인 역할은 players 배열이 아니라 서버가 따로 보내주는 myRole/myHp로 받는다
  // (players는 publicPlayers()라 보스가 아닌 이상 role이 비공개로 빠져 있다).
  if (data.myRole) {
    myRole = data.myRole;
    const roleNames = { boss: "보스", bodyguard: "경호원", spy: "스파이", traitor: "배신자" };
    document.getElementById("roleName").textContent = roleNames[myRole] ?? myRole;
    document.getElementById("hpLabel").textContent = `HP ${data.myHp}`;
    document.getElementById("hpBarFill").style.width = "100%";
    roleCard.style.display = "block";
  }

  // 재접속 시 이미 공개된 보스 정보를 복원한다 — player:role_assigned 흐름과 달리
  // full_sync에는 이 처리가 아예 빠져 있어서, 새로고침한 클라이언트에는 보스 배너가
  // 영원히 안 뜨는 버그가 있었다.
  const bossPlayer = players.find((p) => p.role === "boss");
  if (bossPlayer) {
    bossBanner.style.display = "block";
    document.getElementById("bossName").textContent = bossPlayer.nickname;
  }

  waitingSection.style.display = "none";

  applyPhase(data.phase, data.round, data.phaseEndsAt);
});

function showResult(title, damageLog, note) {
  resultSection.style.display = "block";
  const el = document.getElementById("resultLog");
  const nameOf = (id) => players.find((p) => p.id === id)?.nickname ?? "???";
  const lines = damageLog.map((d) => `${nameOf(d.targetId)} 이(가) 데미지 ${d.damage}를 입었습니다.`);
  el.innerHTML = `<strong>${title}</strong><br>` + (lines.join("<br>") || note || "이번엔 아무 일도 없었습니다.");
}

function renderActionChoices() {
  const section = document.getElementById("actionSection");
  const summaryRow = document.getElementById("summaryActionRow");
  const el = document.getElementById("actionChoices");
  const actions = ["attack", ...myNightOptions.specialActions];
  if (actions.length <= 1) {
    el.innerHTML = "";
    section.style.display = "none";
    summaryRow.style.display = "none";
    renderShieldModeChoices();
    renderTargetList();
    return;
  }
  section.style.display = "flex";
  summaryRow.style.display = "flex";
  el.innerHTML = "";
  for (const actionType of actions) {
    const meta = ACTION_META[actionType] ?? { title: actionType, sub: "", icon: "target" };
    const li = document.createElement("li");
    li.className = "na-skill-card";
    if (actionType === selectedAction) li.classList.add("selected");
    li.innerHTML = `<div class="na-skill-card__icon">${ACTION_ICONS[meta.icon] ?? ""}</div>
      <span class="na-skill-card__title">${meta.title}</span>
      <span class="na-skill-card__sub">${meta.sub}</span>`;
    li.addEventListener("click", () => {
      selectedAction = actionType;
      selectedTargetId = null;
      renderActionChoices();
    });
    el.appendChild(li);
  }
  renderShieldModeChoices();
  renderTargetList();
}

function renderShieldModeChoices() {
  const el = document.getElementById("shieldModeChoices");
  if (selectedAction !== "bodyguard_shield") {
    el.style.display = "none";
    return;
  }
  el.style.display = "block";
  el.innerHTML = "";
  const modes = [
    { key: "absorb", label: "데미지 전량 대신 받기" },
    { key: "halve", label: "데미지 절반으로 경감" },
  ];
  for (const mode of modes) {
    const li = document.createElement("li");
    li.textContent = mode.label;
    if (mode.key === selectedShieldMode) li.classList.add("selected");
    li.addEventListener("click", () => {
      selectedShieldMode = mode.key;
      renderShieldModeChoices();
    });
    el.appendChild(li);
  }
}

function renderTargetList() {
  const el = document.getElementById("targetList");
  const titleEl = document.getElementById("targetSectionTitle");
  el.innerHTML = "";
  const myself = players.find((p) => p.id === myId);

  if (myself && !myself.alive) {
    titleEl.textContent = "사망 - 관전 중입니다.";
    document.getElementById("submitBtn").style.display = "none";
    updateSummary();
    return;
  }

  if (currentPhase === "night" && selectedAction === "bodyguard_oath") {
    titleEl.textContent = "대상 지목 없이 자신을 보호합니다.";
    updateSummary();
    return;
  }

  titleEl.textContent = currentPhase === "day_vote" ? "2. 투표할 대상을 선택하세요" : "2. 대상을 선택하세요";

  const targetable = players.filter((p) => {
    if (p.id === myId) return false;
    if (!p.alive) return false;
    if (currentPhase === "day_vote" && voteAllowedTargetIds && !voteAllowedTargetIds.includes(p.id)) return false;
    return true;
  });
  for (const p of targetable) {
    // 진행상황 화면(host.js renderGrid)과 같은 hp-monitor-card 구조를 그대로 재사용한다.
    const li = document.createElement("li");
    li.className = "hp-monitor-card";
    if (p.id === selectedTargetId) li.classList.add("selected");
    const maxHp = getMaxHpForRole(p.role);
    const initial = p.nickname.charAt(0).toUpperCase();
    li.innerHTML = `${p.role === "boss" ? '<span class="na-target-card__tag">보스</span>' : ""}
      <div class="hp-monitor-card__avatar">${initial}</div>
      <div class="hp-monitor-card__body">
        <div class="hp-monitor-card__name">${p.nickname}</div>
        <div class="hp-monitor-card__hp-text">HP ${p.hp}/${maxHp}</div>
        <div class="hp-monitor-card__pips"></div>
      </div>`;
    renderPipBar(
      li.querySelector(".hp-monitor-card__pips"),
      p.hp,
      maxHp,
      p.role === "boss" ? "hp-pip--yellow" : "hp-pip--red",
    );
    li.addEventListener("click", () => {
      selectedTargetId = p.id;
      renderTargetList();
    });
    el.appendChild(li);
  }
  updateSummary();
}

function updateSummary() {
  const actionRow = document.getElementById("summaryActionRow");
  const actionValue = document.getElementById("summaryActionValue");
  const targetValue = document.getElementById("summaryTargetValue");

  if (actionRow.style.display !== "none") {
    const meta = ACTION_META[selectedAction];
    actionValue.textContent = meta ? meta.title : selectedAction;
  }

  if (currentPhase === "night" && selectedAction === "bodyguard_oath") {
    targetValue.textContent = "본인";
  } else if (selectedTargetId) {
    const target = players.find((p) => p.id === selectedTargetId);
    targetValue.textContent = target ? target.nickname : "-";
  } else {
    targetValue.textContent = "-";
  }
}

document.getElementById("submitBtn").addEventListener("click", () => {
  if (currentPhase === "night") {
    if (selectedAction !== "bodyguard_oath" && !selectedTargetId) return;
    const payload = { actionType: selectedAction };
    if (selectedAction !== "bodyguard_oath") payload.targetId = selectedTargetId;
    if (selectedAction === "bodyguard_shield") payload.shieldMode = selectedShieldMode;
    socket.emit("player:submit_night_action", payload);
  } else {
    if (!selectedTargetId) return;
    socket.emit("player:submit_vote", { targetId: selectedTargetId });
  }
  document.getElementById("instructionLabel").textContent = "지목 완료! 다른 사람들을 기다리는 중...";
});
