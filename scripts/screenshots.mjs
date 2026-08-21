/**
 * README용 스크린샷 생성기 — docs/screenshots/*.png 를 다시 만든다.
 *
 *   npm run screenshots            # localhost:3000 (npm run dev가 떠 있어야 함)
 *
 * 목업이 아니라 실제 게임을 한 판 세팅해서 찍는다. 그래서 카드 위 투표자 프로필,
 * 제출완료 배지, 역할 공개처럼 실제로 동작하는 것만 화면에 담긴다.
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser, sleep } from "./lib/browser.mjs";
import { advance, planNightFor, BOT_HARNESS } from "./lib/game.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "screenshots");
const PROFILE = join(tmpdir(), "backstab-shots-profile");
const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";

const BOTS = ["김도현", "박서준", "이하은", "최유나", "정민석", "한소희"];
const ME = "나";
/** 참가자 화면 주인공이 스파이일 때 UI가 가장 풍성하다(동료 공개 + 교란 작전 + 실시간 현황). */
const WANTED_ROLE = "스파이";

async function main() {
  mkdirSync(OUT, { recursive: true });
  try {
    rmSync(PROFILE, { recursive: true, force: true });
  } catch {
    // 없으면 그만
  }

  const { conn, close } = await launchBrowser({ port: 9334, profileDir: PROFILE });
  const host = await conn.newTab();
  const driver = await conn.newTab();
  const player = await conn.newTab();

  const save = async (tab, name) => {
    writeFileSync(join(OUT, `${name}.png`), await tab.screenshot());
    console.log("  저장", name + ".png");
  };

  await host.viewport(1600, 900, 1);
  await driver.viewport(800, 600, 1);
  await player.viewport(390, 844, 2, true);

  // 참가자(주인공)가 봇들과 함께 로비에 있어야 하므로 startGame()을 쓰지 않고
  // 방 생성 -> 봇 입장 -> 참가자 입장 -> 시작 순서를 여기서 직접 맞춘다.
  let roles;
  for (let attempt = 1; attempt <= 10; attempt++) {
    console.log(`시도 ${attempt}: 방 생성 후 역할 확인`);
    await host.goto(`${ORIGIN}/host`);
    const code = await host.evals(`
      document.getElementById('createRoomBtn').click();
      await new Promise(r => setTimeout(r, 900));
      return document.getElementById('roomCode').textContent;
    `);

    await driver.goto(`${ORIGIN}/player`);
    await driver.evals(BOT_HARNESS);
    await driver.evals(`return await window.__join(${JSON.stringify(code)}, ${JSON.stringify(BOTS)}, true);`);

    await player.goto(`${ORIGIN}/player`);
    await player.evals(`
      document.getElementById('codeInput').value = ${JSON.stringify(code)};
      document.getElementById('nicknameInput').value = ${JSON.stringify(ME)};
      document.getElementById('joinBtn').click();
      await new Promise(r => setTimeout(r, 700));
      return 'joined';
    `);

    if (attempt === 1) {
      await sleep(700);
      await save(host, "01-lobby-host");
    }

    await host.evals(`
      document.getElementById('startBtn').click();
      await new Promise(r => setTimeout(r, 1500));
      return 'ok';
    `);

    const myRole = await player.evals(`return document.getElementById('roleName').textContent;`);
    roles = await driver.evals(`return window.__roles();`);
    console.log("  내 역할:", myRole);
    if (myRole === WANTED_ROLE) break;

    await driver.evals(`return window.__closeAll();`);
    await sleep(400);
  }

  // 1라운드 밤 — 스파이 동료 공개
  await player.settle();
  await player.focus("#spyRevealSection");
  await save(player, "02-player-scout");

  // 토론 -> 투표
  await advance(host, 1500);
  await host.settle();
  await advance(host, 1500);
  await host.settle();
  await player.settle();

  // 일부만 먼저 던져서 "실시간 투표 공개"가 화면에 남게 한다
  const victim = BOTS[1];
  await driver.evals(`
    window.__vote(${JSON.stringify({ [BOTS[0]]: victim, [BOTS[2]]: victim, [BOTS[3]]: victim })});
    await new Promise(r => setTimeout(r, 600));
    return 'ok';
  `);
  await sleep(900);
  await save(host, "03-host-vote");

  await player.evals(`
    const card = [...document.querySelectorAll('#targetSection .hp-monitor-card')]
      .find(c => c.textContent.includes(${JSON.stringify(victim)}));
    if (card) card.click();
    await new Promise(r => setTimeout(r, 300));
    return 'ok';
  `);
  await player.focus("#targetSection");
  await save(player, "04-player-vote");

  await driver.evals(`
    window.__vote(${JSON.stringify({ [BOTS[4]]: victim, [BOTS[5]]: victim })});
    await new Promise(r => setTimeout(r, 500));
    return 'ok';
  `);

  // 찬반 심판
  await advance(host, 1800);
  await host.settle();
  await player.settle();
  await driver.evals(`
    window.__judge(${JSON.stringify({ [BOTS[0]]: true, [BOTS[2]]: true, [BOTS[3]]: false })});
    await new Promise(r => setTimeout(r, 700));
    return 'ok';
  `);
  await sleep(800);
  await save(host, "05-host-judgement");

  // 2라운드 밤 — 스킬 선택 + 동료 스파이 실시간 현황
  await advance(host, 1800);
  await host.settle();
  await player.settle();
  await player.evals(`
    const cards = [...document.querySelectorAll('#actionChoices .na-skill-card')];
    if (cards[1]) cards[1].click();
    await new Promise(r => setTimeout(r, 300));
    const targets = [...document.querySelectorAll('#targetSection .hp-monitor-card')];
    if (targets[0]) targets[0].click();
    await new Promise(r => setTimeout(r, 300));
    return 'ok';
  `);
  await player.focus("#actionSection");
  await save(player, "07-player-night");

  // 게임 종료 — 승리 발표 슬라이드
  const bossNick = Object.entries(roles).find(([, r]) => r === "boss")?.[0];
  for (let i = 0; i < 8 && bossNick; i++) {
    const state = await driver.evals(`return window.__state();`);
    if (state.phase === "game_over") break;
    if (state.phase === "night" && state.round > 1) {
      const alive = state.players.filter((p) => p.alive).map((p) => p.n);
      const plan = planNightFor("spy", roles, alive);
      // 스파이만으로 부족하면 전원이 보스를 친다 — 화면을 찍는 게 목적이라 빨리 끝낸다.
      for (const nick of alive) if (nick !== bossNick) plan[nick] = bossNick;
      await driver.evals(`
        window.__night(${JSON.stringify(plan)});
        await new Promise(r => setTimeout(r, 700));
        return 'ok';
      `);
    }
    await advance(host, 1600);
  }
  await host.slideShown();
  await save(host, "09-host-gameover");

  close();
  console.log("완료 →", OUT);
  process.exit(0);
}

main().catch((err) => {
  console.error("실패:", err.message);
  process.exit(1);
});
