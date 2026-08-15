const socket = io();

const SESSION_KEYS = ["sessionId", "roomCode", "sessionSavedAt"];

// 세션은 탭 전용 sessionStorage를 우선으로 저장하고, localStorage에도 같이 남긴다.
// localStorage는 같은 브라우저의 모든 탭이 공유해서, 한 브라우저로 여러 명이
// (또는 봇 여러 개가) 붙으면 나중에 들어온 탭이 앞 탭의 세션을 덮어쓰고
// 서로 남의 플레이어로 재접속해버린다. 탭 전용 저장소를 먼저 보면 그 문제가 없고,
// 브라우저를 완전히 닫았다 다시 연 경우엔 localStorage 쪽이 받아준다.
// savedAt은 서버 부팅 시각과 비교해 "재시작 때문에 사라진 방"을 구분하는 데 쓴다.
function saveSession(sessionId, roomCode) {
  const values = [sessionId, roomCode, String(Date.now())];
  for (const store of [sessionStorage, localStorage]) {
    SESSION_KEYS.forEach((key, i) => store.setItem(key, values[i]));
  }
}

function readSession() {
  const store = sessionStorage.getItem("sessionId") ? sessionStorage : localStorage;
  return {
    sessionId: store.getItem("sessionId"),
    roomCode: store.getItem("roomCode"),
    savedAt: Number(store.getItem("sessionSavedAt") || 0),
  };
}

function clearSession() {
  for (const store of [sessionStorage, localStorage]) {
    SESSION_KEYS.forEach((key) => store.removeItem(key));
  }
}

// 재접속은 server:hello를 받은 뒤에 시도한다. 서버 부팅 시각을 먼저 알아야
// 실패했을 때 "서버 재시작 때문"인지 아닌지 제대로 안내할 수 있다.
// 또 이 이벤트는 소켓이 조용히 끊겼다 다시 붙을 때도 다시 오므로, 그때마다
// 재접속을 걸어 서버 쪽 player.id를 새 소켓으로 갱신한다 — 안 그러면 화면은
// 멀쩡한데 제출이 전부 무시되는 유령 상태가 된다.
socket.on("server:hello", ({ startedAt }) => {
  const { sessionId, roomCode, savedAt } = readSession();
  if (!sessionId || !roomCode) return;

  const serverRestarted = startedAt > savedAt;

  socket.emit("player:reconnect", { sessionId, roomCode }, (res) => {
    if (res.ok) {
      myRoomCode = roomCode;
      joinSection.style.display = "none";
      errorLabel.textContent = "";
      // 어느 화면(대기실 vs 게임)으로 갈지는 곧이어 오는 state:full_sync가 정한다 —
      // 여기서 게임 화면을 먼저 띄우면 아직 로비인데 빈 게임 화면이 번쩍인다.
      return;
    }

    // 서버가 우리 세션보다 나중에 떴다면 방이 사라진 이유가 명확하다.
    // 그 경우에만 세션을 지운다 — 일시적인 실패로 지워버리면 돌아갈 수 있었던
    // 게임까지 같이 잃는다.
    if (serverRestarted) {
      clearSession();
      errorLabel.textContent = "서버가 재시작되어 이전 게임이 종료되었습니다. 새로 입장해주세요.";
      joinSection.style.display = "flex";
      document.getElementById("postJoinScreen").style.display = "none";
      waitingSection.style.display = "none";
    }
  });
});

// 07룰복잡도온보딩.md: 1~2라운드까지만 짧은 첫판 힌트를 보여주고, 3라운드부터는 자동으로 사라진다.
const BEGINNER_HINTS = {
  night: "💡 지금은 밤이에요. 위에서 행동을 고르고 대상을 지목한 뒤 '지목 확정'을 누르세요.",
  day_reveal: "💡 밤 사이 벌어진 일이 공개돼요. 진행자가 토론을 시작할 때까지 잠시 기다리세요.",
  day_discussion: "💡 자유롭게 이야기하며 누가 스파이인지, 배신자인지 추리해보세요.",
  day_vote: "💡 의심되는 사람을 지목하고 '지목 확정'을 누르세요. 최다득표자는 데미지를 입어요.",
};

const ACTION_META = {
  attack: { title: "기본 공격", sub: "지목한 대상에게 데미지 1을 입힙니다.", icon: "target" },
  boss_execute: {
    title: "긴급 처형",
    sub: "지목한 대상에게 데미지 2를 입힙니다. 게임 중 단 한 번만 사용할 수 있습니다.",
    icon: "crown",
  },
  bodyguard_shield: {
    title: "육탄 방어",
    sub: "지목한 대상을 이번 라운드 공격으로부터 보호합니다 (데미지를 대신 받거나 절반으로 경감 — 아래에서 선택). 한 번 쓰면 1라운드 동안 다시 쓸 수 없습니다.",
    icon: "shield",
  },
  bodyguard_oath: {
    title: "충성심 서약",
    sub: "대상 지목 없이 이번 라운드 자신이 입는 모든 피해를 무효화합니다. 게임 중 단 한 번만 사용할 수 있습니다.",
    icon: "shield-check",
  },
  spy_disrupt: {
    title: "교란 작전",
    sub: "지목한 대상의 이번 라운드 행동을 전부 무효화합니다. 게임 중 단 한 번만 사용할 수 있습니다.",
    icon: "wifi-off",
  },
  traitor_smile: {
    title: "흑막의 미소",
    sub: "지목한 대상에게 데미지 2를 입힙니다. 이번 라운드에 사망자가 나오면 사망자 한 명당 HP 2를 회복합니다. 게임 중 단 한 번만 사용할 수 있습니다.",
    icon: "dagger",
  },
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
let submittedIds = [];
let spyTeammates = [];
let spyTeammatePreview = {};
let leaderId = null;
let myRoomCode = null;
let judgementTarget = null; // { id, nickname }
let myJudgement = null; // true=찬성, false=반대, null=미제출
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
const showSlide = createSlideQueue("phaseSlide");

socket.on("connect", () => {
  myId = socket.id;
});

document.getElementById("joinBtn").addEventListener("click", () => {
  // 새 방에 직접 입장하는 순간 이전 세션은 더 이상 유효하지 않다 — 지워두지 않으면
  // 다음 새로고침 때 이 방이 아니라 이전(어쩌면 중단된) 방으로 자동 재접속돼버린다.
  clearSession();

  const code = document.getElementById("codeInput").value.trim().toUpperCase();
  const nickname = document.getElementById("nicknameInput").value.trim();
  socket.emit("player:join_room", { code, nickname }, (res) => {
    if (!res.ok) {
      errorLabel.textContent = res.error;
      return;
    }
    myRoomCode = code;
    if (res.sessionId) saveSession(res.sessionId, code);
    errorLabel.textContent = "";
    joinSection.style.display = "none";
    waitingSection.style.display = "flex";
  });
});

// 폰만으로 방을 만든다 — 방 코드 입력 없이 이름만 받고, 만든 사람이 방장이 된다.
document.getElementById("createRoomBtn").addEventListener("click", () => {
  clearSession();

  const nickname = document.getElementById("nicknameInput").value.trim();
  socket.emit("player:create_room", { nickname }, (res) => {
    if (!res.ok) {
      errorLabel.textContent = res.error;
      return;
    }
    myRoomCode = res.code;
    if (res.sessionId) saveSession(res.sessionId, res.code);
    errorLabel.textContent = "";
    joinSection.style.display = "none";
    waitingSection.style.display = "flex";
  });
});

document.getElementById("leaderStartBtn").addEventListener("click", () => {
  // 서버는 data.isHost로만 권한을 확인하므로 진행자 화면과 같은 이벤트를 그대로 쓴다.
  socket.emit("host:start_game", {}, (res) => {
    if (res && !res.ok) errorLabel.textContent = res.error;
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

// 방장에게만 방 코드와 시작 버튼을 보여준다. 방장이 아니면 기존 "진행자가 시작하면..." 안내 그대로.
function renderLeaderControls() {
  const isLeader = leaderId != null && leaderId === myId;
  const startBtn = document.getElementById("leaderStartBtn");
  const codeBox = document.getElementById("waitingCode");

  startBtn.style.display = isLeader ? "block" : "none";
  codeBox.style.display = isLeader && myRoomCode ? "flex" : "none";
  if (!isLeader) return;

  document.getElementById("waitingCodeValue").textContent = myRoomCode ?? "----";
  document.getElementById("waitingMessage").innerHTML =
    "이 방코드를 친구들에게 알려주세요.<br><br>6명이 모이면 시작할 수 있습니다.";

  const enough = players.length >= MIN_PLAYERS && players.length <= MAX_PLAYERS;
  startBtn.disabled = !enough;
  startBtn.textContent = enough ? "시작" : `시작 (${players.length}/${MIN_PLAYERS}~${MAX_PLAYERS}명)`;
}

socket.on("state:players", (payload) => {
  players = payload.players;
  if (payload.leaderId !== undefined) leaderId = payload.leaderId;
  if (currentPhase === "lobby") {
    renderWaitingList(players);
    renderLeaderControls();
  }
  if (currentPhase === "night" || currentPhase === "day_vote") renderTargetList();
  // 로스터는 페이즈와 무관하게 항상 갱신한다 — 토론 중에도 계속 보여야 하기 때문.
  renderRoster();
  // 사망하면 즉시 입력창이 잠겨야 하므로 참가자 상태가 바뀔 때마다 같이 갱신한다.
  renderChatPanel();
});

// 밤 행동/투표 제출 현황 — 참여자 화면만으로도 누가 이미 제출했고 누가 안 했는지 알 수 있게 한다.
socket.on("state:submission_progress", ({ submittedIds: ids }) => {
  submittedIds = ids;
  if (currentPhase === "night" || currentPhase === "day_vote") renderTargetList();
});

// host.js는 이 이벤트로 winnerLabel을 채우지만 player.js엔 리스너가 아예 없어서
// 게임 종료 화면의 승자 문구가 항상 빈 채로 남아있던 버그 — 재접속 시에도 서버가
// 같은 이벤트를 다시 보내주므로 리스너 하나로 두 경우 다 해결된다.
socket.on("state:game_over", ({ winner }) => {
  document.getElementById("winnerLabel").textContent = WINNER_LABELS[winner] ?? winner;
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
  spyTeammates = teammates;
  const el = document.getElementById("spyTeammateList");
  el.innerHTML = teammates.map((name) => `<li>${name}</li>`).join("");
});

// 2라운드부터 밤 행동 중, 같은 팀 스파이가 지금 고르고 있는 대상을 실시간으로 보여준다
// (제출 전이라도 서버가 팀원에게만 귓속말로 알려줌 — 말 없이도 몰빵/분산 공격을 조율할 수 있게).
socket.on("spy:teammate_preview", ({ fromNickname, targetNickname }) => {
  spyTeammatePreview[fromNickname] = targetNickname;
  renderSpyCoordPanel();
});

function renderSpyCoordPanel() {
  const panel = document.getElementById("spyCoordPanel");
  if (myRole !== "spy" || currentPhase !== "night" || currentRound <= 1) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";
  const list = document.getElementById("spyCoordList");
  list.innerHTML = spyTeammates
    .map((name) => {
      const target = spyTeammatePreview[name];
      return `<li>${name}: ${target ? `<strong>${target}</strong>` : "선택 중..."}</li>`;
    })
    .join("");
}

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

  // 직전 결과는 결과공개~토론~투표 내내 띄워둔다. 예전엔 페이즈가 바뀔 때마다 무조건
  // 숨겨서, 결과가 2.4초짜리 슬라이드로 스치고 나면 다시 확인할 방법이 없었다 —
  // 다같이 진행자 화면을 보던 오프라인에선 괜찮았지만 온라인에선 정보가 통째로 사라진다.
  // 새 라운드의 밤이 시작될 때만 지운다.
  if (phase === "night" || phase === "lobby") {
    resultSection.style.display = "none";
  }

  // 새 페이즈가 시작되면 지난 페이즈에 눌러둔 "지목완료" 상태를 원래대로 되돌린다.
  const submitBtnReset = document.getElementById("submitBtn");
  submitBtnReset.textContent = "지목 확정";
  submitBtnReset.classList.remove("is-submitted");
  submitBtnReset.disabled = false;

  const myself = players.find((p) => p.id === myId);
  if (myself) {
    document.getElementById("hpLabel").textContent = `HP ${myself.hp}${myself.alive ? "" : " (사망)"}`;
    const myMaxHp = getMaxHpForRole(myRole);
    document.getElementById("hpBarFill").style.width = `${Math.max(0, (myself.hp / myMaxHp) * 100)}%`;
  }

  if (phase === "game_over") {
    gameSection.style.display = "none";
    overSection.style.display = "block";
    const roleNames = { boss: "보스", bodyguard: "경호원", spy: "스파이", traitor: "배신자" };
    document.getElementById("myRoleReveal").textContent = `내 역할은 ${roleNames[myRole] ?? myRole}이었습니다.`;
    // phaseLabel/timerLabel은 상단 3박스에 계속 남아있으므로, 게임 종료 후에도
    // 직전 페이즈("투표" 등)의 문구/타이머가 그대로 붙어있지 않게 정리한다.
    document.getElementById("phaseLabel").textContent = "게임 종료";
    startCountdown(null, document.getElementById("timerLabel"));
    // 종료 화면에서도 로스터를 그린다 — 이 시점엔 서버가 전원 역할을 공개하므로
    // 로스터가 그대로 "누가 무슨 역할이었는지" 최종 결과표 역할을 한다.
    renderRoster();
    return;
  }

  gameSection.style.display = "flex";
  document.getElementById("phaseLabel").textContent = PHASE_LABELS[phase];
  startCountdown(phaseEndsAt, document.getElementById("timerLabel"));

  // day_reveal은 night_result 슬라이드가 이미 그 내용을 보여주므로 따로 안내 슬라이드를 안 띄운다.
  // 호스트 화면 없이도 지금 무슨 상황인지 알 수 있게 참가자 화면에도 똑같이 띄운다.
  if (phase === "night") {
    showSlide("🌙", "밤이 되었습니다", `${round}라운드 - 각자 행동을 선택하세요`);
  } else if (phase === "day_discussion") {
    showSlide("💬", "토론 시작", "누가 수상한지 이야기해보세요");
  } else if (phase === "day_vote") {
    showSlide("🗳️", "투표 시작", "의심되는 사람을 지목하세요");
  }

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
    document.getElementById("targetSection").style.display = "none";
    document.getElementById("shieldModeChoices").style.display = "none";
    document.getElementById("summaryActionRow").style.display = "none";
    document.getElementById("targetList").innerHTML = "";
  } else if (phase === "night") {
    instructionLabel.textContent = "행동을 선택하고 대상을 지목하세요.";
    submitBtn.style.display = "block";
    summaryPanel.style.display = "block";
    document.getElementById("targetSection").style.display = "flex";
    spyTeammatePreview = {}; // 새 밤 라운드마다 지난 라운드의 동료 선택 현황을 지운다.
    renderActionChoices();
  } else if (phase === "day_vote") {
    instructionLabel.textContent = "투표할 대상을 지목하세요.";
    submitBtn.style.display = "block";
    summaryPanel.style.display = "block";
    document.getElementById("actionSection").style.display = "none";
    document.getElementById("targetSection").style.display = "flex";
    document.getElementById("shieldModeChoices").style.display = "none";
    document.getElementById("summaryActionRow").style.display = "none";
    renderTargetList();
  } else if (phase === "day_judgement") {
    // 지목 대상은 크게 띄운 심판 패널에서 고르므로, 지목용 목록/확정 버튼은 숨긴다.
    instructionLabel.textContent = "지목된 사람을 처단할지 찬반으로 정하세요.";
    submitBtn.style.display = "none";
    summaryPanel.style.display = "none";
    document.getElementById("actionSection").style.display = "none";
    document.getElementById("targetSection").style.display = "none";
    document.getElementById("shieldModeChoices").style.display = "none";
    document.getElementById("summaryActionRow").style.display = "none";
    document.getElementById("targetList").innerHTML = "";
  } else if (phase === "day_reveal") {
    instructionLabel.textContent = "밤 사이 벌어진 일이 공개됩니다. 진행자가 토론을 시작할 때까지 기다려주세요.";
    submitBtn.style.display = "none";
    summaryPanel.style.display = "none";
    document.getElementById("actionSection").style.display = "none";
    document.getElementById("targetSection").style.display = "none";
    document.getElementById("shieldModeChoices").style.display = "none";
    document.getElementById("summaryActionRow").style.display = "none";
    document.getElementById("targetList").innerHTML = "";
  } else if (phase === "day_discussion") {
    // 재투표는 토론을 건너뛰고 day_vote -> day_vote로 바로 돌아오므로, "전원 대상"으로
    // 되돌리는 초기화는 여기(토론 진입 시점)에서만 해야 한다 — day_vote 진입 시점에 초기화하면
    // 방금 state:vote_result가 넣어준 동점자 제한(voteAllowedTargetIds)을 재투표 시작과 동시에
    // 지워버려서, 재투표인데도 아무나 찍을 수 있게 되고 서버는 그 표를 조용히 버려
    // (제출은 눌렀는데 "제출완료" 배지가 안 뜨는) 버그가 생긴다.
    voteAllowedTargetIds = null;
    instructionLabel.textContent = "자유롭게 토론하세요.";
    submitBtn.style.display = "none";
    summaryPanel.style.display = "none";
    document.getElementById("actionSection").style.display = "none";
    document.getElementById("targetSection").style.display = "none";
    document.getElementById("shieldModeChoices").style.display = "none";
    document.getElementById("summaryActionRow").style.display = "none";
    document.getElementById("targetList").innerHTML = "";
  }

  updateBeginnerHint(phase, round);
  renderSpyCoordPanel();
  renderRoster();
  renderChatPanel();
  renderJudgementPanel();
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

socket.on("state:night_result", ({ damageLog, players: updatedPlayers }) => {
  showResult("🌙 밤 결과", damageLog);

  // 호스트 화면 없이도 참가자 화면만으로 밤 사이 무슨 일이 있었는지 알 수 있게 슬라이드로도 보여준다.
  let sub;
  if (damageLog.length === 0) {
    sub = "이번 밤엔 아무 일도 없었습니다";
  } else {
    const nameOfFresh = (id) => (updatedPlayers || players).find((p) => p.id === id)?.nickname ?? "???";
    const deaths = (updatedPlayers || []).filter(
      (p) => !p.alive && damageLog.some((d) => d.targetId === p.id),
    );
    const lines = deaths.map((p) => `${p.nickname} 사망 (${ROLE_NAMES[p.role] ?? p.role})`);
    const survivedHits = damageLog.length - deaths.length;
    if (survivedHits > 0) lines.push(`그 외 ${survivedHits}명 피해`);
    sub = lines.join("\n") || damageLog.map((d) => `${nameOfFresh(d.targetId)} -${d.damage}`).join("\n");
  }
  showSlide("☀️", "밤 사이 벌어진 일", sub);
});

socket.on("state:vote_result", ({ tie, tiedTargetIds, finalTie, topTargetId, topTargetNickname, players: updatedPlayers }) => {
  // 지목 단계에서는 데미지가 발생하지 않는다 — 실제 피해는 찬반 심판을 통과해야 들어간다.
  // 이름은 서버가 준 값을 우선 쓴다(id로 찾으면 그 사람이 방금 재접속했을 때 "???"가 된다).
  const targetName =
    topTargetNickname ??
    (topTargetId ? (updatedPlayers || players).find((p) => p.id === topTargetId)?.nickname : null);

  let note;
  if (tie) {
    voteAllowedTargetIds = tiedTargetIds ?? null;
    note = finalTie ? "동점으로 이번 라운드는 데미지 없이 종료됩니다." : "동점! 동점자 중에서 재투표합니다.";
  } else if (targetName) {
    note = `${targetName} 최종 지목 - 심판으로 넘어갑니다`;
  } else {
    note = "아무도 지목되지 않았습니다.";
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

socket.on("state:full_sync", (data) => {
  // 재접속한 플레이어의 화면을 현재 게임 상태로 복원한다.
  players = data.players;
  myself = players.find((p) => p.id === myId) || myself;
  if (data.leaderId !== undefined) leaderId = data.leaderId;

  // 아직 시작 전이면 게임 화면이 아니라 대기실로 되돌아가야 한다
  // (방장이면 방 코드와 시작 버튼도 같이 복구된다).
  if (data.phase === "lobby") {
    currentPhase = "lobby";
    currentRound = data.round;
    joinSection.style.display = "none";
    document.getElementById("postJoinScreen").style.display = "none";
    waitingSection.style.display = "flex";
    renderWaitingList(players);
    renderLeaderControls();
    return;
  }

  // 본인 역할은 players 배열이 아니라 서버가 따로 보내주는 myRole/myHp로 받는다
  // (players는 publicPlayers()라 보스가 아닌 이상 role이 비공개로 빠져 있다).
  if (data.myRole) {
    myRole = data.myRole;
    const roleNames = { boss: "보스", bodyguard: "경호원", spy: "스파이", traitor: "배신자" };
    document.getElementById("roleName").textContent = roleNames[myRole] ?? myRole;
    document.getElementById("hpLabel").textContent = `HP ${data.myHp}`;
    const myMaxHp = getMaxHpForRole(myRole);
    document.getElementById("hpBarFill").style.width = `${Math.max(0, (data.myHp / myMaxHp) * 100)}%`;
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
  // 게임 중 재접속에서는 player:role_assigned가 다시 오지 않으므로
  // 게임 화면을 여기서 띄워야 한다.
  document.getElementById("postJoinScreen").style.display = "flex";

  submittedIds = data.submittedIds || [];
  // 서버는 진작 이 값을 보내주고 있었는데 클라이언트가 읽지 않아서, 재투표 도중
  // 재접속하면 동점자 제한이 풀린 채로 보였다 — 그러면 엉뚱한 사람을 찍게 되고
  // 서버는 그 표를 조용히 버린다(제출했는데 배지가 안 뜨는 그 증상).
  voteAllowedTargetIds = data.voteAllowedTargetIds ?? null;
  // 심판 도중 재접속했으면 누가 지목돼 있는지 복원한다(내가 이미 던진 표는 서버가
  // 갖고 있으므로, 화면에서는 다시 고를 수 있게 둔다 — 같은 값으로 덮어쓰면 그만이다).
  judgementTarget = data.judgementTargetId
    ? { id: data.judgementTargetId, nickname: data.judgementTargetNickname ?? "???" }
    : null;
  myJudgement = null;

  // 재접속 시 그동안 오간 대화를 복원한다. 중복으로 쌓이지 않게 먼저 비운다.
  document.getElementById("chatLog").innerHTML = "";
  for (const message of data.chatLog ?? []) appendChatMessage(message);

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

// 이름 뒤 꼬리표 — host.js의 statusLabel()과 같은 규칙.
// 서버가 role을 안 준 살아있는 참가자에겐 아무것도 안 붙는다.
function rosterLabel(p) {
  const roleText = p.role ? ROLE_NAMES[p.role] ?? p.role : "";
  if (!p.alive) return ` (사망${roleText ? " · " + roleText : ""})`;
  return roleText ? ` (${roleText})` : "";
}

// 지목용 목록(#targetList)과 별개로, 페이즈와 무관하게 항상 보이는 읽기 전용 현황판.
// 온라인 플레이에선 진행자 화면을 같이 볼 수 없으니 이게 각자의 스코어보드가 된다.
function renderRoster() {
  const section = document.getElementById("rosterSection");
  const list = document.getElementById("rosterList");
  const title = document.getElementById("rosterTitle");

  if (currentPhase === "lobby" || players.length === 0) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";
  title.textContent =
    currentPhase === "game_over"
      ? "최종 결과"
      : `생존자 현황 (${players.filter((p) => p.alive).length}/${players.length})`;

  list.innerHTML = "";
  for (const p of players) {
    // 지목 카드(renderTargetList)와 같은 hp-monitor-card 구조를 그대로 재사용한다.
    const li = document.createElement("li");
    li.className = "hp-monitor-card";
    if (!p.alive) li.classList.add("is-dead");
    if (p.id === myId) li.classList.add("is-me");
    const maxHp = getMaxHpForRole(p.role);
    li.innerHTML = `${p.role === "boss" ? '<span class="na-target-card__tag">보스</span>' : ""}
      <div class="hp-monitor-card__avatar">${p.nickname.charAt(0).toUpperCase()}</div>
      <div class="hp-monitor-card__body">
        <div class="hp-monitor-card__name">${p.nickname}${p.id === myId ? " (나)" : ""}${rosterLabel(p)}</div>
        <div class="hp-monitor-card__hp-text">HP ${p.hp}/${maxHp}</div>
        <div class="hp-monitor-card__pips"></div>
      </div>`;
    renderPipBar(
      li.querySelector(".hp-monitor-card__pips"),
      p.hp,
      maxHp,
      p.role === "boss" ? "hp-pip--yellow" : "hp-pip--red",
    );
    list.appendChild(li);
  }
}

// 서버의 CHATTABLE_PHASES와 같은 목록 — 밤은 정보 비대칭 유지를 위해 제외.
// 심판 단계는 지목된 사람이 변론해야 하므로 포함한다.
const CHATTABLE_PHASES = ["day_reveal", "day_discussion", "day_vote", "day_judgement"];

// 지목된 대상자를 크게 띄우고 찬반만 받는 화면.
function renderJudgementPanel() {
  const section = document.getElementById("judgementSection");
  if (currentPhase !== "day_judgement" || !judgementTarget) {
    section.style.display = "none";
    return;
  }
  section.style.display = "flex";
  const nameEl = document.getElementById("judgementName");
  nameEl.textContent = judgementTarget.nickname;
  // 글자 수를 CSS에 넘겨 긴 닉네임일수록 글자를 줄인다(항상 한 줄 유지).
  nameEl.style.setProperty("--name-len", Math.max(judgementTarget.nickname.length, 2));

  const target = players.find((p) => p.id === judgementTarget.id);
  document.getElementById("judgementHp").textContent = target
    ? `HP ${target.hp}/${getMaxHpForRole(target.role)}`
    : "";

  const me = players.find((p) => p.id === myId);
  const canVote = me ? me.alive : false;
  const approveBtn = document.getElementById("judgeApproveBtn");
  const opposeBtn = document.getElementById("judgeOpposeBtn");
  approveBtn.disabled = !canVote;
  opposeBtn.disabled = !canVote;
  approveBtn.classList.toggle("is-chosen", myJudgement === true);
  opposeBtn.classList.toggle("is-chosen", myJudgement === false);

  const note = document.getElementById("judgementNote");
  if (!canVote) {
    note.textContent = "사망해서 심판에 참여할 수 없습니다.";
  } else if (myJudgement === null) {
    note.textContent =
      judgementTarget.id === myId ? "당신이 지목되었습니다. 변론하세요." : "";
  } else {
    note.textContent = myJudgement ? "찬성했습니다." : "반대했습니다.";
  }
}

function submitJudgement(approve) {
  myJudgement = approve;
  socket.emit("player:submit_judgement", { approve });
  renderJudgementPanel();
}

document.getElementById("judgeApproveBtn").addEventListener("click", () => submitJudgement(true));
document.getElementById("judgeOpposeBtn").addEventListener("click", () => submitJudgement(false));

socket.on("state:judgement_started", ({ targetId, nickname }) => {
  judgementTarget = { id: targetId, nickname };
  myJudgement = null;
  showSlide("⚖️", "최종 심판", `${nickname}을(를) 처단할까요?`);
  renderJudgementPanel();
});

socket.on("state:judgement_result", ({ nickname, approve, oppose, passed, players: updated }) => {
  if (updated) players = updated;
  const summary = `찬성 ${approve} · 반대 ${oppose}`;
  const target = players.find((p) => p.nickname === nickname);
  const died = passed && target && !target.alive;
  showResult(
    "⚖ 심판 결과",
    [],
    passed
      ? `${nickname} 처단 가결 (${summary})${died ? ` — 사망 (${ROLE_NAMES[target.role] ?? target.role})` : ""}`
      : `${nickname} 처단 부결 (${summary})`,
  );
  showSlide(
    passed ? "⚔️" : "🕊️",
    passed ? "처단 가결" : "처단 부결",
    passed
      ? `${nickname} 데미지 1 (${summary})${died ? "\n사망" : ""}`
      : `${nickname}은(는) 살아남았습니다 (${summary})`,
  );
  judgementTarget = null;
  myJudgement = null;
  renderRoster();
});

function appendChatMessage({ nickname, text }) {
  const log = document.getElementById("chatLog");
  const li = document.createElement("li");
  li.className = "chat-log__item";
  // 방 안에서 닉네임 중복은 서버가 막으므로 닉네임 비교로 내 메시지를 구분해도 안전하다.
  if (nickname === players.find((p) => p.id === myId)?.nickname) li.classList.add("is-mine");
  li.innerHTML = `<span class="chat-log__name"></span><span class="chat-log__text"></span>`;
  // 사용자 입력이라 textContent로 넣는다 — innerHTML로 넣으면 채팅으로 남의 화면에
  // 마크업을 주입할 수 있다.
  li.querySelector(".chat-log__name").textContent = nickname;
  li.querySelector(".chat-log__text").textContent = text;
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;
}

function renderChatPanel() {
  const section = document.getElementById("chatSection");
  if (!CHATTABLE_PHASES.includes(currentPhase)) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";

  // 사망자는 읽기만 가능(03라운드진행.md) — 서버도 같은 규칙으로 거부하지만,
  // 입력창을 아예 잠가서 헛수고하지 않게 한다.
  const me = players.find((p) => p.id === myId);
  const muted = me ? !me.alive : false;
  document.getElementById("chatInput").disabled = muted;
  document.getElementById("chatSendBtn").disabled = muted;
  const notice = document.getElementById("chatNotice");
  notice.style.display = muted ? "block" : "none";
  notice.textContent = muted ? "사망해서 대화에 참여할 수 없습니다. 읽기만 가능합니다." : "";
}

document.getElementById("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  socket.emit("chat:send", { text }, (res) => {
    if (res && !res.ok) {
      const notice = document.getElementById("chatNotice");
      notice.style.display = "block";
      notice.textContent = res.error;
      return;
    }
    input.value = "";
  });
});

socket.on("chat:message", (message) => {
  appendChatMessage(message);
});

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
    // 밤 행동/투표 제출 여부 — 나뿐 아니라 다른 사람이 제출했는지도 이 화면만으로 알 수 있게 배지로 표시한다.
    const submitted = submittedIds.includes(p.id);
    li.innerHTML = `${p.role === "boss" ? '<span class="na-target-card__tag">보스</span>' : ""}${submitted ? '<span class="hp-monitor-card__submit-badge">✓ 제출완료</span>' : ""}
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
      // 스파이는 제출 전에 고르는 순간부터 동료에게 실시간으로 대상을 공유한다.
      if (myRole === "spy" && currentPhase === "night" && currentRound > 1) {
        socket.emit("player:preview_night_target", { targetId: p.id });
      }
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
  markSubmitted();
});

// 제출 완료 상태를 눈에 띄게 보여준다 — 지목한 카드는 노랑(선택)에서 초록(확정)으로,
// 버튼은 "지목완료"로 바뀌고 더 눌리지 않게 잠근다.
function markSubmitted() {
  const btn = document.getElementById("submitBtn");
  btn.textContent = "지목완료";
  btn.classList.add("is-submitted");
  btn.disabled = true;

  const selectedCard = document.querySelector("#targetList .hp-monitor-card.selected");
  if (selectedCard) {
    selectedCard.classList.remove("selected");
    selectedCard.classList.add("confirmed");
  }
  document.querySelectorAll("#targetList .hp-monitor-card").forEach((el) => {
    el.style.pointerEvents = "none";
  });
  document.querySelectorAll(".na-skill-card").forEach((el) => {
    el.style.pointerEvents = "none";
  });
}
