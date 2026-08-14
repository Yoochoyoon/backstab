const MIN_PLAYERS = 6;
const MAX_PLAYERS = 10;

const MAX_HP_BY_ROLE = {
  boss: 5,
  bodyguard: 4,
  spy: 4,
  traitor: 4,
};

function getMaxHpForRole(role) {
  return role ? MAX_HP_BY_ROLE[role] || 4 : 4;
}

// 보스 카드/플레이어 카드/모바일 대상 카드 등 여러 화면에서 공용으로 쓰는 HP 조각(pip) 렌더러.
function renderPipBar(container, hp, maxHp, colorClass) {
  container.innerHTML = "";
  for (let i = 0; i < maxHp; i++) {
    const pip = document.createElement("div");
    pip.className = `hp-pip ${colorClass}` + (i < hp ? " filled" : "");
    container.appendChild(pip);
  }
}

const PHASE_LABELS = {
  lobby: "대기실",
  night: "🌙 밤 - 대상 지목",
  day_reveal: "☀ 결과 공개",
  day_discussion: "💬 토론",
  day_vote: "🗳 투표",
  game_over: "게임 종료",
};

const WINNER_LABELS = {
  boss: "보스 & 경호원 승리",
  spy: "스파이 승리",
  traitor: "배신자 승리",
};

function formatTimer(ms) {
  if (ms == null) return "--:--";
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function startCountdown(phaseEndsAt, el) {
  if (window.__countdownTimer) clearInterval(window.__countdownTimer);
  if (!phaseEndsAt) {
    el.textContent = "--:--";
    el.classList.remove("is-warning", "is-critical");
    return;
  }
  const tick = () => {
    const ms = phaseEndsAt - Date.now();
    el.textContent = formatTimer(ms);

    // 10초 이하: 긴급 (crimson-bright)
    if (ms <= 10000) {
      el.classList.add("is-critical");
      el.classList.remove("is-warning");
    }
    // 30초 이하: 경고 (warning)
    else if (ms <= 30000) {
      el.classList.add("is-warning");
      el.classList.remove("is-critical");
    }
    // 30초 초과: 정상
    else {
      el.classList.remove("is-warning", "is-critical");
    }
  };
  tick();
  window.__countdownTimer = setInterval(tick, 250);
}
