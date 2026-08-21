// 헤드리스 크롬을 CDP(Chrome DevTools Protocol)로 직접 모는 얇은 클라이언트.
//
// Playwright를 devDependency로 들이지 않는 이유: 이 저장소가 필요한 건 "탭 몇 개 열고,
// 뷰포트 크기 정하고, JS 실행하고, 스크린샷 찍기"가 전부다. `ws`는 socket.io를 통해
// 이미 들어와 있어서 추가 설치 없이 이만큼은 직접 만들 수 있다.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import WebSocket from "ws";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      "크롬을 찾지 못했습니다. CHROME_PATH 환경변수로 실행 파일 경로를 지정해주세요.",
    );
  }
  return found;
}

/** 한 탭(=CDP 세션). 이 스크립트들이 실제로 쓰는 동작만 담았다. */
export class Tab {
  constructor(conn, sessionId) {
    this.conn = conn;
    this.sessionId = sessionId;
    /** favicon 404처럼 무시해도 되는 것까지 전부 모인다 — 읽는 쪽에서 걸러 쓴다. */
    this.errors = [];
  }

  send(method, params) {
    return this.conn.rpc(method, params, this.sessionId);
  }

  async viewport(width, height, deviceScaleFactor = 1, mobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile,
    });
    await sleep(450);
  }

  async goto(url) {
    const loaded = this.conn.waitEvent("Page.loadEventFired", this.sessionId);
    await this.send("Page.navigate", { url });
    await loaded;
    await sleep(600);
  }

  /** 페이지 안에서 async 함수 본문을 실행하고 반환값을 그대로 받아온다. */
  async evals(body) {
    const res = await this.send("Runtime.evaluate", {
      expression: `(async () => { ${body} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? "evaluate 실패");
    }
    return res.result.value;
  }

  /**
   * 페이즈 전환 슬라이드가 완전히 사라질 때까지 기다린다.
   * 이걸 안 하면 반투명 오버레이가 덮인 채로 캡처돼 색이 죽고 글자가 겹친다.
   */
  async settle(timeout = 9000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const hidden = await this.evals(`
        const o = document.getElementById('phaseSlide');
        return !o || getComputedStyle(o).display === 'none';
      `);
      if (hidden) {
        await sleep(350);
        return;
      }
      await sleep(300);
    }
  }

  /**
   * 반대로, 계속 떠 있는 슬라이드(승리 발표)는 페이드인이 "끝날 때까지" 기다린다.
   * settle()은 슬라이드가 사라지길 기다리므로 이 경우엔 쓸 수 없고, 그냥 캡처하면
   * 반투명하게 찍혀 뒤 화면과 글자가 겹쳐 보인다.
   */
  async slideShown(timeout = 6000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const opaque = await this.evals(`
        const o = document.getElementById('phaseSlide');
        if (!o || getComputedStyle(o).display === 'none') return false;
        return parseFloat(getComputedStyle(o).opacity || '1') > 0.99;
      `);
      if (opaque) {
        await sleep(250);
        return;
      }
      await sleep(200);
    }
  }

  /** 폰 화면은 세로가 길어 중요한 패널이 화면 밖에 있다 — 캡처 전에 가운데로 끌어온다. */
  async focus(selector) {
    await this.evals(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (el) el.scrollIntoView({ block: 'center' });
      await new Promise(r => setTimeout(r, 400));
      return 'ok';
    `);
  }

  async screenshot() {
    const res = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    return Buffer.from(res.data, "base64");
  }

  /**
   * 화면 결함을 눈이 아니라 수치로 잰다.
   * 이 프로젝트에서 레이아웃 버그는 스크린샷을 눈으로 봐서는 몇 번이나 놓쳤고,
   * scrollWidth/clientWidth 비교로는 매번 바로 드러났다.
   */
  metrics() {
    return this.evals(`
      const cards = [...document.querySelectorAll('.hp-monitor-card')];
      const clipped = cards.filter(c => {
        const box = c.getBoundingClientRect();
        const pips = c.querySelector('.hp-monitor-card__pips');
        const name = c.querySelector('.hp-monitor-card__name');
        return (pips && pips.getBoundingClientRect().bottom > box.bottom + 1)
            || (name && name.getBoundingClientRect().bottom > box.bottom + 1);
      }).map(c => (c.querySelector('.hp-monitor-card__name') || {}).textContent);

      const overflowing = [...document.querySelectorAll(
        '.progress-timer, #timerLabel, .na-box__value, .case-badge__value'
      )].filter(e => e.scrollWidth > e.clientWidth + 2)
        .map(e => (e.id || e.className) + ':' + (e.textContent || '').slice(0, 14));

      const de = document.documentElement;
      return {
        scrollX: de.scrollWidth > de.clientWidth + 1,
        overshoot: de.scrollWidth - de.clientWidth,
        clipped,
        overflowing,
        cards: cards.length,
      };
    `);
  }
}

class Connection {
  constructor(url) {
    this.nextId = 0;
    this.pending = new Map();
    this.waiters = [];
    this.tabs = new Map();
    this.ws = new WebSocket(url, { maxPayload: 2 ** 28 });
  }

  ready() {
    return new Promise((resolve, reject) => {
      this.ws.on("open", resolve);
      this.ws.on("error", reject);
      this.ws.on("message", (raw) => this.#onMessage(JSON.parse(raw.toString())));
    });
  }

  #onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      return msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }

    const tab = this.tabs.get(msg.sessionId);
    if (tab) {
      if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
        tab.errors.push(msg.params.args.map((a) => a.description || a.value).join(" "));
      }
      if (msg.method === "Runtime.exceptionThrown") {
        tab.errors.push(msg.params.exceptionDetails?.exception?.description ?? "exception");
      }
    }

    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i];
      if (w.method === msg.method && (!w.sessionId || w.sessionId === msg.sessionId)) {
        this.waiters.splice(i, 1);
        w.resolve(msg.params);
      }
    }
  }

  rpc(method, params = {}, sessionId) {
    const id = ++this.nextId;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  waitEvent(method, sessionId, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const waiter = { method, sessionId, resolve };
      this.waiters.push(waiter);
      setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          reject(new Error(`${method} 이벤트 대기 시간 초과`));
        }
      }, timeout);
    });
  }

  async newTab() {
    const { targetId } = await this.rpc("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await this.rpc("Target.attachToTarget", { targetId, flatten: true });
    const tab = new Tab(this, sessionId);
    this.tabs.set(sessionId, tab);
    await tab.send("Page.enable");
    await tab.send("Runtime.enable");
    return tab;
  }
}

/**
 * 헤드리스 크롬을 띄우고 CDP로 붙는다.
 * 반환된 close()를 반드시 불러야 크롬 프로세스가 남지 않는다.
 */
export async function launchBrowser({ port = 9333, profileDir } = {}) {
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      ...(profileDir ? [`--user-data-dir=${profileDir}`] : []),
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let wsUrl = null;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    await sleep(400);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      wsUrl = (await res.json()).webSocketDebuggerUrl;
    } catch {
      // 아직 안 떴다 — 다시 시도
    }
  }
  if (!wsUrl) throw new Error("크롬 디버깅 엔드포인트에 연결하지 못했습니다.");

  const conn = new Connection(wsUrl);
  await conn.ready();
  return { conn, close: () => chrome.kill() };
}
