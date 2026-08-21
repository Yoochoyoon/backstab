// 실제 게임 한 판을 자동으로 세팅하고 진행시키는 헬퍼.
//
// 탭을 참가자 수만큼 여는 대신, 드라이버 탭 하나에서 socket.io 연결을 여러 개 만들어
// 봇을 굴린다. 8명이면 8탭인 방식보다 훨씬 빠르고 잘 안 깨진다.
import { sleep } from "./browser.mjs";

/** 드라이버 탭에 주입하는 봇 하네스. 페이지 전역(window)에 헬퍼를 붙인다. */
export const BOT_HARNESS = `
window.__bots = [];
window.__over = null;

window.__join = async (code, names, withAvatar) => {
  for (const nick of names) {
    await new Promise(done => {
      const s = io({ reconnection: false });
      const bot = { nick, s, id: null, role: null, players: [], phase: 'lobby', round: 0 };
      s.on('connect', () => s.emit(
        'player:join_room',
        { code, nickname: nick, avatar: withAvatar ? window.__avatar(nick) : undefined },
        res => { if (res.ok) { bot.id = res.playerId; window.__bots.push(bot); } done(); }
      ));
      s.on('state:players', ({ players }) => { bot.players = players; });
      s.on('state:phase_changed', ({ phase, round }) => { bot.phase = phase; bot.round = round; });
      s.on('player:role_assigned', ({ role }) => { bot.role = role; });
      s.on('state:game_over', payload => { window.__over = payload; });
    });
  }
  return window.__bots.length;
};

/* 프로필 사진이 없으면 카드에 이니셜만 떠서 실제 화면과 달라진다 — 캔버스로 만들어 넣는다. */
window.__avatar = (seed) => {
  const colors = ['#b3202d','#2f6f8f','#2a9d8f','#c9762b','#6d3fa0','#8a8f2a','#3f6d3f','#8f2a6d','#2a4d8f'];
  const c = document.createElement('canvas'); c.width = 96; c.height = 96;
  const ctx = c.getContext('2d');
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  ctx.fillStyle = colors[h % colors.length]; ctx.fillRect(0, 0, 96, 96);
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  ctx.beginPath(); ctx.arc(48, 34, 20, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(48, 92, 30, 26, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(seed[0], 48, 36);
  return c.toDataURL('image/jpeg', 0.8);
};

window.__idOf = nick => (window.__bots[0].players.find(p => p.nickname === nick) || {}).id;
window.__roles = () => Object.fromEntries(window.__bots.map(b => [b.nick, b.role]));
window.__state = () => ({
  phase: window.__bots[0].phase,
  round: window.__bots[0].round,
  players: window.__bots[0].players.map(p => ({ n: p.nickname, hp: p.hp, alive: p.alive })),
});

window.__night = plan => {
  for (const [from, to] of Object.entries(plan)) {
    const bot = window.__bots.find(b => b.nick === from), id = window.__idOf(to);
    if (bot && id) bot.s.emit('player:submit_night_action', { actionType: 'attack', targetId: id });
  }
};
window.__vote = plan => {
  for (const [from, to] of Object.entries(plan)) {
    const bot = window.__bots.find(b => b.nick === from), id = window.__idOf(to);
    if (bot && id) bot.s.emit('player:submit_vote', { targetId: id });
  }
};
window.__judge = plan => {
  for (const [from, approve] of Object.entries(plan)) {
    const bot = window.__bots.find(b => b.nick === from);
    if (bot) bot.s.emit('player:submit_judgement', { approve });
  }
};
window.__closeAll = () => {
  for (const b of window.__bots) b.s.close();
  window.__bots = []; window.__over = null;
  return 'ok';
};
return 'ok';
`;

/**
 * 진행자 탭에서 방을 만들고, 드라이버 탭의 봇들을 입장시킨 뒤 게임을 시작한다.
 * 방 코드는 서버가 무작위로 만드니 하드코딩하지 않고 콜백에서 받아온다.
 */
export async function startGame({ host, driver, origin, names, withAvatar = false }) {
  await host.goto(`${origin}/host`);
  const code = await host.evals(`
    document.getElementById('createRoomBtn').click();
    await new Promise(r => setTimeout(r, 900));
    return document.getElementById('roomCode').textContent;
  `);

  await driver.goto(`${origin}/player`);
  await driver.evals(BOT_HARNESS);
  await driver.evals(
    `return await window.__join(${JSON.stringify(code)}, ${JSON.stringify(names)}, ${withAvatar});`,
  );

  await host.evals(`
    document.getElementById('startBtn').click();
    await new Promise(r => setTimeout(r, 1500));
    return 'ok';
  `);

  return code;
}

/** 진행자 화면의 "다음 단계로"를 눌러 페이즈를 넘긴다. */
export async function advance(host, waitMs = 1400) {
  await host.evals(`
    document.getElementById('advanceBtn').click();
    await new Promise(r => setTimeout(r, ${waitMs}));
    return 'ok';
  `);
}

/**
 * 원하는 진영이 이기도록 밤 공격을 짜준다.
 * 역할은 서버가 무작위로 주므로, 실제 배정을 읽은 뒤 거기에 맞춰 대상을 정한다.
 */
export function planNightFor(goal, roles, alive) {
  const bossNick = Object.entries(roles).find(([, r]) => r === "boss")?.[0];
  const traitorNick = Object.entries(roles).find(([, r]) => r === "traitor")?.[0];
  const plan = {};

  if (goal === "spy") {
    // 스파이 전원이 보스만 집중 공격
    for (const [nick, role] of Object.entries(roles)) {
      if (role === "spy" && alive.includes(nick)) plan[nick] = bossNick;
    }
  } else if (goal === "boss") {
    // 보스측이 살아있는 위협을 하나씩 정리
    const threat = alive.find((n) => roles[n] === "spy" || roles[n] === "traitor");
    if (threat) {
      for (const [nick, role] of Object.entries(roles)) {
        if ((role === "boss" || role === "bodyguard") && alive.includes(nick)) plan[nick] = threat;
      }
    }
  } else if (goal === "traitor") {
    // 보스는 건드리지 않고 나머지를 걷어내 보스와 배신자 단 둘만 남긴다
    const target = alive.find((n) => n !== bossNick && n !== traitorNick);
    if (target) for (const nick of alive) if (nick !== target && nick !== bossNick) plan[nick] = target;
  }

  return plan;
}

/** 게임이 끝날 때까지 밤마다 goal에 맞춰 공격하며 진행시킨다. */
export async function playUntilOver({ host, driver, goal, roles, maxSteps = 40 }) {
  for (let step = 0; step < maxSteps; step++) {
    const state = await driver.evals(`return window.__state();`);
    if (state.phase === "game_over") break;

    if (state.phase === "night" && state.round > 1) {
      const alive = state.players.filter((p) => p.alive).map((p) => p.n);
      const plan = planNightFor(goal, roles, alive);
      if (Object.keys(plan).length) {
        // 제출과 진행 사이에 텀을 둔다. 붙여 쏘면 서버에 진행이 먼저 도착해
        // 제출이 통째로 유실되고, "밤에 4명이 쳤는데 데미지가 1"인 없는 버그를 쫓게 된다.
        await driver.evals(`
          window.__night(${JSON.stringify(plan)});
          await new Promise(r => setTimeout(r, 650));
          return 'ok';
        `);
      }
    }
    await advance(host);
  }
  return driver.evals(`return window.__over || null;`);
}

export { sleep };
