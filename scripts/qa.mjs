/**
 * 무인 QA 스윕 — 승리조건 3종 + 인원 6/8/10명 + 화면 4종 크기 + 콘솔 에러.
 *
 *   npm run qa                     # localhost:3000 (npm run dev가 떠 있어야 함)
 *   npm run qa -- --origin=https://backstab-tu0e.onrender.com
 *
 * 유닛 테스트로는 못 잡는 것들을 본다: 페이즈 타이밍, 실제 레이아웃, 도달 불가능한 분기.
 * 화면 문제는 눈이 아니라 수치로 판정한다(scrollWidth/clientWidth, 요소 경계 비교).
 */
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchBrowser } from "./lib/browser.mjs";
import { startGame, advance, playUntilOver } from "./lib/game.mjs";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const ORIGIN = arg("origin", "http://localhost:3000");
const PROFILE = join(tmpdir(), "backstab-qa-profile");

const SIZES = [
  ["데스크톱", 1920, 1080],
  ["아이패드 가로", 1180, 820],
  ["아이패드 세로", 820, 1180],
  ["폰", 390, 844],
];

const problems = [];
const ok = (msg) => console.log("   " + msg);
const fail = (msg) => {
  problems.push(msg);
  console.log("   !! " + msg);
};

// 잘림 버그는 이 프로젝트에서 거의 항상 긴 닉네임에서 나왔다 — 최대 길이를 꼭 섞는다.
const namesFor = (n) =>
  Array.from({ length: n }, (_, i) => (i === 0 ? "일곱글자닉넴" : "봇" + (i + 1)));

async function main() {
  try {
    rmSync(PROFILE, { recursive: true, force: true });
  } catch {
    // 없으면 그만
  }

  console.log(`대상: ${ORIGIN}\n`);
  const { conn, close } = await launchBrowser({ port: 9333, profileDir: PROFILE });
  const host = await conn.newTab();
  const driver = await conn.newTab();

  // ---------- A. 승리조건 3종 ----------
  // 판정 순서를 잘못 두면 배신자 분기는 어떤 입력으로도 실행되지 않는 죽은 코드가 된다.
  // 실제로 그런 적이 있어서, 세 진영 모두 실제로 이겨보는지 매번 확인한다.
  console.log("[A] 승리조건 3종");
  for (const goal of ["spy", "boss", "traitor"]) {
    await startGame({ host, driver, origin: ORIGIN, names: namesFor(8) });
    const roles = await driver.evals(`return window.__roles();`);
    const over = await playUntilOver({ host, driver, goal, roles });

    if (!over) {
      fail(`${goal} 승리 시나리오가 끝나지 않음`);
    } else {
      const revealed = over.players.every((p) => p.role);
      if (over.winner !== goal) fail(`${goal} 목표였는데 winner=${over.winner}`);
      else if (!revealed) fail(`${goal}: 종료 시 역할이 공개되지 않은 플레이어가 있음`);
      else ok(`${goal} 승리 정상 (전원 역할 공개 확인)`);
    }
    await driver.evals(`return window.__closeAll();`);
  }

  // ---------- B. 인원수 × 화면 크기 (진행자 화면) ----------
  console.log("\n[B] 인원 6/8/10명 × 화면 4종 — 진행자 화면");
  for (const count of [6, 8, 10]) {
    await startGame({ host, driver, origin: ORIGIN, names: namesFor(count) });
    await host.settle();
    for (const [label, w, h] of SIZES) {
      await host.viewport(w, h);
      const m = await host.metrics();
      const tag = `${count}인 / ${label}`;
      if (m.scrollX) fail(`${tag}: 가로 스크롤 발생 (+${m.overshoot}px)`);
      else if (m.clipped.length) fail(`${tag}: 카드 내용 잘림 → ${m.clipped.join(", ")}`);
      else if (m.overflowing.length) fail(`${tag}: 텍스트 넘침 → ${m.overflowing.join(" | ")}`);
      else ok(`${tag}: 정상 (카드 ${m.cards})`);
    }
    await host.viewport(1600, 900);
    await driver.evals(`return window.__closeAll();`);
  }

  // ---------- C. 참가자 화면 크기 ----------
  console.log("\n[C] 참가자 화면 3종 크기");
  await startGame({ host, driver, origin: ORIGIN, names: namesFor(8) });
  const player = await conn.newTab();
  await player.goto(`${ORIGIN}/player`);
  await advance(host, 1500); // 밤 -> 토론
  await advance(host, 1500); // 토론 -> 투표
  for (const [label, w, h, mobile] of [
    ["폰", 390, 844, true],
    ["아이패드", 820, 1180, false],
    ["데스크톱", 1600, 900, false],
  ]) {
    await player.viewport(w, h, 1, mobile);
    const m = await player.metrics();
    if (m.scrollX) fail(`참가자 / ${label}: 가로 스크롤 (+${m.overshoot}px)`);
    else if (m.overflowing.length) fail(`참가자 / ${label}: 텍스트 넘침 → ${m.overflowing.join(" | ")}`);
    else ok(`참가자 / ${label}: 정상`);
  }

  // ---------- D. 콘솔 에러 ----------
  console.log("\n[D] 콘솔 에러");
  for (const [name, tab] of [["진행자", host], ["참가자", player], ["드라이버", driver]]) {
    // favicon 404는 이 프로젝트에 원래부터 있던 무관한 항목이다.
    const real = tab.errors.filter((e) => !/favicon/i.test(e));
    if (real.length) fail(`${name} 콘솔 에러 ${real.length}건: ${real.slice(0, 3).join(" / ")}`);
    else ok(`${name}: 에러 없음`);
  }

  console.log("\n================ 결과 ================");
  if (problems.length === 0) {
    console.log("문제 없음 — 모든 항목 통과");
  } else {
    console.log(`문제 ${problems.length}건:`);
    problems.forEach((p) => console.log(" - " + p));
  }

  close();
  process.exit(problems.length ? 1 : 0);
}

main().catch((err) => {
  console.error("실패:", err.message);
  process.exit(1);
});
