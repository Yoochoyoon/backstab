# 진행자/TV 화면 느와르 UI 개선

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 진행자/TV 화면(host.html/host.js)을 고전 마피아 조직 사건 기록실 테마로 디자인하여 게임 진행 상황을 시각적으로 명확하게 전달하고, 모바일부터 TV까지 모든 화면에서 잘 보이도록 최적화한다.

**Architecture:** CSS 변수로 느와르 색상 팔레트를 정의하고, 기존 HTML 구조에 클래스와 속성을 추가하여 역할을 명확히 한다. 스타일은 공용(style.css)과 진행자화면 전용으로 구분하고, JavaScript는 HP바 버그 수정과 페이즈별 상태 클래스 추가만 진행한다. 실제 디자인(배경 텍스처, 이미지)은 MVP에서 제외하고 순수 CSS/HTML로만 구현한다.

**Tech Stack:** HTML5, CSS3 (변수, 그리드, 미디어 쿼리), 웹폰트 (Google Fonts), JavaScript (ES6, Socket.IO), 반응형 디자인

## Global Constraints

- 기존 소켓 이벤트 ID(`#phaseLabel`, `#timerLabel`, `#playerGrid` 등)는 절대 변경하지 않는다.
- 기존 JavaScript 로직(`emitState()`, `renderGrid()`, `publicPlayers()` 등)은 최소 범위에서만 수정한다.
- 모든 텍스트는 한글/영문 혼용 가능해야 한다.
- 애니메이션은 `prefers-reduced-motion: reduce`를 존중한다.
- 모바일 최소 터치 대상: 44×44px, 확정 버튼은 52px 이상.
- TV 화면(1200px+)에서 글자 최소 크기: 20px (타이머는 48px).
- 색상 대비: 일반 텍스트 4.5:1 이상, 큰 UI 요소 3:1 이상.
- 기능성(조작, 가독성, 오류 방지) > 분위기 > 장식.

---

## 파일 구조

| 파일 | 책임 | 변경 유형 |
|---|---|---|
| `public/style.css` | CSS 변수, 공용 폰트, 색상 팔레트, 기본 스타일 | 수정 (변수 + 새 클래스) |
| `public/host.html` | 진행자/TV 화면 레이아웃 | 수정 (인라인 스타일 제거, 클래스 추가) |
| `public/host.js` | 진행자/TV 화면 로직 + HP바 버그 수정 | 수정 (HP 계산 + 페이즈별 상태 클래스) |
| `public/shared.js` | 공용 상수 | 수정 없음 |

---

### Task 1: CSS 변수 및 웹폰트 선언

**Files:**
- Modify: `public/style.css:1-40`

**Interfaces:**
- Produces: `:root` CSS 변수 세트 (색상, 폰트, 반경, 그림자)
  - 색상: `--color-bg`, `--color-surface`, `--color-paper`, `--color-crimson` 등 16개
  - 폰트: `--font-body`, `--font-display`, `--font-typewriter`, `--font-latin-display`
  - 레이아웃: `--radius-sm`, `--radius-md`, `--shadow-card` 등

**Steps:**

- [ ] **Step 1: Google Fonts 링크 추가**

`public/style.css` 맨 앞에 추가:

```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@500;600;700&family=Special+Elite&display=swap');
```

- [ ] **Step 2: CSS 변수 블록 작성**

```css
:root {
  /* Base */
  --color-bg: #12131a;
  --color-bg-deep: #0b0c10;
  --color-surface: #1b1a1b;
  --color-surface-raised: #242126;
  --color-border: #3a3430;
  --color-border-strong: #66584a;

  /* Paper / typography */
  --color-paper: #e7d8b8;
  --color-paper-muted: #c7b894;
  --color-paper-dark: #9d8a69;
  --color-ink: #211c18;
  --color-text: #f0e7d4;
  --color-text-muted: #b9ad98;
  --color-text-disabled: #746d64;

  /* Theme accents */
  --color-crimson: #8f2028;
  --color-crimson-bright: #c33a3f;
  --color-crimson-deep: #5b151c;
  --color-teal: #3f7772;
  --color-teal-bright: #67aaa1;
  --color-ochre: #b28a3e;
  --color-gold: #c7a55a;
  --color-gold-bright: #e3c477;
  --color-purple-legacy: #5865f2;

  /* Semantic states */
  --color-success: #5d9275;
  --color-warning: #c18d3e;
  --color-danger: var(--color-crimson-bright);
  --color-dead: #5e5b59;
  --color-focus: #d7b663;

  /* Layout */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --shadow-card: 0 8px 24px rgb(0 0 0 / 28%);
  --shadow-stamp: 0 2px 0 rgb(0 0 0 / 20%);
  --border-hairline: 1px solid rgb(231 216 184 / 16%);

  /* Fonts */
  --font-body: "Noto Sans KR", sans-serif;
  --font-display: "Noto Serif KR", serif;
  --font-typewriter: "Special Elite", "Courier New", monospace;
  --font-latin-display: "Cormorant Garamond", serif;
}
```

- [ ] **Step 3: 기존 배경색 업데이트**

기존의 `body { background: #12131a; }` 부분을 다음으로 변경:

```css
body {
  margin: 0;
  font-family: var(--font-body);
  background: var(--color-bg);
  color: var(--color-text);
  min-height: 100vh;
}
```

- [ ] **Step 4: 브라우저에서 확인**

`npm run dev` 후 `/host`로 접속해 색상이 약간 더 따뜻한 갈색으로 변경됐는지 확인 (기능 동작은 그대로)

- [ ] **Step 5: 커밋**

```bash
git add public/style.css
git commit -m "style: add CSS color palette and web fonts for noir theme"
```

---

### Task 2: host.html 구조 업데이트 및 클래스 추가

**Files:**
- Modify: `public/host.html`

**Interfaces:**
- Consumes: CSS 변수 (Task 1)
- Produces: 업데이트된 HTML 구조 (id/클래스 유지)
  - `#bossBanner` → `boss-case-file` 클래스 추가
  - `#playerGrid` → `player-file-grid` 클래스 추가
  - `.tv-player-card` → `player-file-card` 클래스 추가, 상태 클래스 `is-alive`, `is-dead`, `is-targeted` 준비

**Steps:**

- [ ] **Step 1: host.html 읽기**

현재 구조에서 인라인 스타일을 확인하고, 각 섹션에 적절한 클래스명을 부여할 계획 수립

- [ ] **Step 2: 상단 헤더 영역 업데이트**

```html
<div class="host-layout">
  <div class="tv-upper">
    <header class="case-header">
      <span class="case-header__label">CONFIDENTIAL CASE FILE</span>
      <h1 id="titleLabel">집중표적게임</h1>
      <div class="phase-status">
        <span id="roundLabel" class="round-label"></span>
        <span id="phaseLabel" class="phase-label"></span>
        <strong id="timerLabel" class="countdown">--:--</strong>
      </div>
    </header>
```

기존 `#phaseLabel`, `#timerLabel`은 그대로 두고 주변에 클래스만 추가.

- [ ] **Step 3: 보스 배너 클래스 추가**

```html
<div id="bossBanner" class="boss-case-file" style="display:none;">
  <div class="boss-case-file__label">보스 공개</div>
  <div id="bossName" class="boss-case-file__name"></div>
</div>
```

- [ ] **Step 4: 플레이어 그리드 클래스 추가**

```html
<div class="player-file-grid" id="playerGrid" aria-label="생존자 명단"></div>
```

(기존 구조 유지, 클래스만 추가)

- [ ] **Step 5: 결과 로그 영역 클래스 추가**

```html
<div class="event-report" aria-live="polite">
  <div id="resultLog" class="event-report__content"></div>
</div>
```

- [ ] **Step 6: 게임 상태 속성 추가**

```html
<div class="host-layout" data-phase="lobby">
  <!-- ... -->
</div>
```

JavaScript에서 `data-phase` 값을 `lobby`, `night`, `day_reveal`, `day_discussion`, `day_vote`, `game_over`로 업데이트하도록 할 예정.

- [ ] **Step 7: 테스트**

`npm run dev` 후 `/host`에서 화면이 정상적으로 로드되고, 방 생성/플레이어 입장/게임 진행이 기존처럼 작동하는지 확인

- [ ] **Step 8: 커밋**

```bash
git add public/host.html
git commit -m "refactor: add semantic classes and data attributes to host screen"
```

---

### Task 3: host.js에서 HP바 버그 수정

**Files:**
- Modify: `public/host.js`

**Interfaces:**
- Consumes: Player 객체 구조 (id, nickname, hp, alive, role)
  - MAX_HP: boss=5, bodyguard=4, spy=4, traitor=4 (server/src/game/types.ts 기준)
- Produces: 정확한 HP 바 비율 계산 함수
  - `getMaxHpForRole(role: string): number`
  - `getHpPercentage(hp: number, role: string): number`

**Steps:**

- [ ] **Step 1: MAX_HP 맵 추가**

`public/host.js` 맨 위에:

```javascript
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
```

- [ ] **Step 2: renderGrid 함수에서 HP 바 계산 수정**

기존 코드:
```javascript
const hpPercent = Math.max(0, (p.hp / 5) * 100);
```

수정:
```javascript
const hpPercent = getHpPercentage(p.hp, p.role);
```

- [ ] **Step 3: 타이머 스타일 클래스 추가**

`renderGrid()` 내에서 HP 바 엘리먼트에 역할 클래스 추가:

```javascript
div.className = "tv-player-card";
if (!p.alive) div.classList.add("is-dead");
if (p.role === "boss") div.classList.add("is-boss");
```

- [ ] **Step 4: 테스트**

- 8명 게임 시작 후 보스와 비보스 캐릭터의 HP 감소 시 HP바가 올바른 비율로 줄어드는지 확인
- 보스 HP 5일 때 100%, 조직원 HP 4일 때 100% 표시되는지 확인

- [ ] **Step 5: 커밋**

```bash
git add public/host.js
git commit -m "fix: calculate HP bar percentage based on role-specific MAX_HP"
```

---

### Task 4: 진행자/TV 화면 기본 스타일 (배경, 카드, 타이머)

**Files:**
- Modify: `public/style.css` (진행자/TV 화면 전용 스타일 추가)

**Interfaces:**
- Consumes: CSS 변수 (Task 1), HTML 구조 (Task 2)
- Produces: 느와르 테마 기본 스타일
  - `.case-header`: 문서 머리말 스타일
  - `.phase-status`: 페이즈 상태 표시
  - `.countdown`: 타이머 스타일
  - `.boss-case-file`: 보스 카드
  - `.player-file-grid`, `.player-file-card`: 플레이어 카드 그리드
  - `.host-layout`: TV 상단/컨트롤 하단 레이아웃

**Steps:**

- [ ] **Step 1: 호스트 레이아웃 스타일**

기존 `.host-layout` 스타일을 유지하되 색상 변수로 업데이트:

```css
.host-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  gap: 12px;
  padding: 12px;
  box-sizing: border-box;
  background: var(--color-bg);
}

.tv-upper {
  flex: 2;
  overflow-y: auto;
  background: var(--color-surface);
  padding: 20px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
}

.control-lower {
  flex: 1;
  overflow-y: auto;
  background: var(--color-surface-raised);
  padding: 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
}
```

- [ ] **Step 2: case-header 스타일**

```css
.case-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--color-border-strong);
}

.case-header__label {
  display: block;
  font-family: var(--font-typewriter);
  font-size: 0.9rem;
  color: var(--color-text-muted);
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.case-header h1 {
  font-family: var(--font-display);
  font-size: 2.4rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 12px 0;
}
```

- [ ] **Step 3: phase-status 스타일**

```css
.phase-status {
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 1.1rem;
  color: var(--color-text-muted);
}

.phase-label {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--color-text);
}

.round-label {
  font-family: var(--font-typewriter);
  font-size: 1rem;
}
```

- [ ] **Step 4: countdown (타이머) 스타일**

```css
.countdown {
  font-family: var(--font-typewriter);
  font-size: 3rem;
  font-weight: 700;
  text-align: right;
  color: var(--color-gold-bright);
  min-width: 140px;
}

.countdown.is-warning {
  color: var(--color-warning);
}

.countdown.is-critical {
  color: var(--color-crimson-bright);
}
```

- [ ] **Step 5: boss-case-file 스타일**

```css
.boss-case-file {
  background: var(--color-paper);
  border: 2px solid var(--color-gold);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin: 16px 0;
  box-shadow: var(--shadow-card);
}

.boss-case-file__label {
  font-family: var(--font-typewriter);
  font-size: 0.85rem;
  color: var(--color-ink);
  text-transform: uppercase;
  letter-spacing: 1px;
  display: block;
  margin-bottom: 8px;
}

.boss-case-file__name {
  font-family: var(--font-display);
  font-size: 2.2rem;
  font-weight: 700;
  color: var(--color-gold);
}

.boss-case-file__hp {
  font-size: 1.1rem;
  color: var(--color-ink);
  margin-top: 12px;
}

.boss-case-file.is-critical {
  border-color: var(--color-crimson-bright);
  background: rgba(195, 58, 63, 0.08);
}
```

- [ ] **Step 6: player-file-grid 스타일**

```css
.player-file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin: 20px 0;
}

@media (min-width: 1200px) {
  .player-file-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 767px) {
  .player-file-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
```

- [ ] **Step 7: player-file-card 스타일**

```css
.player-file-card {
  background: var(--color-paper);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  text-align: center;
  box-shadow: var(--shadow-card);
  transition: all 200ms ease-out;
}

.player-file-card.is-alive {
  color: var(--color-ink);
}

.player-file-card.is-dead {
  background: var(--color-dead);
  color: var(--color-text-disabled);
  opacity: 0.5;
  text-decoration: line-through;
  border-color: var(--color-border);
}

.player-file-card.is-targeted {
  border-color: var(--color-crimson-bright);
  background: rgba(195, 58, 63, 0.12);
  box-shadow: 0 0 0 3px rgba(195, 58, 63, 0.2);
}

.player-file-card.is-boss {
  border-color: var(--color-gold);
  background: rgba(199, 165, 90, 0.08);
}

.tv-player-name {
  font-weight: 700;
  margin-bottom: 6px;
  font-size: 0.95rem;
}

.tv-player-hp {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin-top: 4px;
}
```

- [ ] **Step 8: 테스트**

`npm run dev` 후 `/host`에서:
- 헤더가 문서 스타일로 보이는지 확인
- 타이머가 크고 명확한지 확인
- 플레이어 카드가 카드 스타일로 보이는지 확인
- 기능(방 생성, 플레이어 입장, 게임 진행)이 그대로 작동하는지 확인

- [ ] **Step 9: 커밋**

```bash
git add public/style.css
git commit -m "style: add noir theme styling for host/TV screen"
```

---

### Task 5: 페이즈별 분위기 효과 (밤/낮 배경 전환)

**Files:**
- Modify: `public/style.css`, `public/host.js`

**Interfaces:**
- Consumes: `data-phase` 속성 (Task 2), CSS 변수 (Task 1)
- Produces: 페이즈 전환 시 배경/색상 변화
  - `data-phase="night"` → 어두운 배경
  - `data-phase="day_*"` → 밝은 배경

**Steps:**

- [ ] **Step 1: 페이즈별 배경 색상 CSS**

```css
.host-layout {
  transition: background-color 500ms ease-out;
}

.host-layout[data-phase="night"] {
  background: var(--color-bg-deep);
}

.host-layout[data-phase="night"] .tv-upper {
  background: var(--color-surface);
  filter: brightness(0.95);
}

.host-layout[data-phase="day_reveal"],
.host-layout[data-phase="day_discussion"],
.host-layout[data-phase="day_vote"] {
  background: var(--color-bg);
}

.host-layout[data-phase="day_reveal"] .tv-upper {
  background: rgba(231, 216, 184, 0.05);
}
```

- [ ] **Step 2: host.js에서 페이즈 변경 시 data-phase 업데이트**

`socket.on("state:phase_changed", ...)` 핸들러에서:

```javascript
socket.on("state:phase_changed", ({ phase, round, phaseEndsAt }) => {
  const gameShell = document.querySelector(".host-layout");
  if (gameShell) {
    gameShell.setAttribute("data-phase", phase);
  }
  // ... 기존 코드
});
```

- [ ] **Step 3: 게임 종료 시 배경 처리**

```javascript
socket.on("state:game_over", ({ winner }) => {
  const gameShell = document.querySelector(".host-layout");
  if (gameShell) {
    gameShell.setAttribute("data-phase", "game_over");
  }
  // ... 기존 코드
});
```

- [ ] **Step 4: 테스트**

8명 게임 시작 후:
- 밤 페이즈: 배경이 약간 더 어두워지는지 확인
- 낮 페이즈: 배경이 밝아지는지 확인
- 게임 종료: 배경이 정상인지 확인

- [ ] **Step 5: 커밋**

```bash
git add public/style.css public/host.js
git commit -m "style: add phase-based background transitions for night/day atmosphere"
```

---

### Task 6: 애니메이션 및 상태 효과 (타겟 펄스, HP 변화)

**Files:**
- Modify: `public/style.css`

**Interfaces:**
- Consumes: `.is-targeted`, `.is-dead` 클래스
- Produces: CSS 애니메이션
  - `@keyframes target-pulse`: 표적 도장 점멸
  - `@keyframes hp-decrease`: HP 감소 효과
  - `@keyframes fade-in`: 결과 공개

**Steps:**

- [ ] **Step 1: target-pulse 애니메이션**

```css
@keyframes target-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(195, 58, 63, 0);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(195, 58, 63, 0.22);
  }
}

.player-file-card.is-targeted {
  animation: target-pulse 2.2s ease-in-out infinite;
}
```

- [ ] **Step 2: prefers-reduced-motion 존중**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: 타이머 경고 애니메이션**

```css
@keyframes timer-warning {
  0%, 100% {
    color: var(--color-warning);
    text-shadow: none;
  }
  50% {
    color: var(--color-gold-bright);
    text-shadow: 0 0 8px rgba(227, 196, 119, 0.3);
  }
}

.countdown.is-warning {
  animation: timer-warning 600ms ease-in-out infinite;
}
```

- [ ] **Step 4: 테스트**

- 플레이어를 지목했을 때 카드에 펄스 효과가 있는지 확인 (host.js에서 `.is-targeted` 클래스 추가 필요)
- 타이머가 30초 이하일 때 경고 애니메이션이 나타나는지 확인
- 모션 감소 설정한 기기에서 애니메이션이 없어지는지 확인

- [ ] **Step 5: 커밋**

```bash
git add public/style.css
git commit -m "style: add animations for target pulse and timer warning"
```

---

### Task 7: 모바일/TV 반응형 규칙 및 최적화

**Files:**
- Modify: `public/style.css`

**Interfaces:**
- Consumes: 모든 이전 스타일
- Produces: 반응형 미디어 쿼리 (320px ~ 1920px)
  - 모바일 (< 768px): 1열 그리드, 큰 버튼, 상단 고정 타이머
  - 태블릿 (768px ~ 1199px): 2~3열 그리드
  - TV (1200px+): 4열 그리드, 큰 폰트, 넉넉한 간격

**Steps:**

- [ ] **Step 1: 모바일 전용 규칙 추가**

```css
@media (max-width: 359px) {
  .host-layout {
    padding: 8px;
    gap: 8px;
  }
  .case-header h1 {
    font-size: 1.8rem;
  }
  .countdown {
    font-size: 2rem;
  }
}

@media (min-width: 360px) and (max-width: 767px) {
  .case-header h1 {
    font-size: 2rem;
  }
  .countdown {
    font-size: 2.4rem;
  }
  .player-file-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: 태블릿 규칙**

```css
@media (min-width: 768px) and (max-width: 1199px) {
  .case-header h1 {
    font-size: 2.2rem;
  }
  .countdown {
    font-size: 3rem;
  }
  .player-file-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

- [ ] **Step 3: TV/데스크톱 규칙**

```css
@media (min-width: 1200px) {
  .host-layout {
    padding: 16px;
    gap: 16px;
  }
  .tv-upper {
    padding: 24px;
  }
  .case-header h1 {
    font-size: 2.8rem;
  }
  .countdown {
    font-size: 4rem;
  }
  .player-file-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  .player-file-card {
    padding: 16px;
  }
  .tv-player-name {
    font-size: 1.1rem;
  }
  .tv-player-hp {
    font-size: 0.95rem;
  }
}
```

- [ ] **Step 4: 모든 화면에서 터치 대상 최소 크기 확보**

버튼/클릭 가능 요소에:

```css
button, [role="button"], .clickable {
  min-height: 44px;
  min-width: 44px;
}
```

- [ ] **Step 5: 테스트**

다양한 기기/화면 크기에서:
- iPhone SE (375px): 1열 그리드, 읽기 가능한 폰트
- iPad (768px): 3열 그리드
- 1920px 모니터: 4열 그리드, 큰 타이머(4rem)
- 접근성 설정(큰 텍스트): 폰트가 지나치게 커지지 않는지 확인

- [ ] **Step 6: 커밋**

```bash
git add public/style.css
git commit -m "style: add responsive design for mobile, tablet, and TV screens"
```

---

### Task 8: host.js 통합 — 페이즈별 상태 클래스 및 이벤트 연결

**Files:**
- Modify: `public/host.js`

**Interfaces:**
- Consumes: host.html의 ID/클래스 (Task 2), CSS 변수 (Task 1)
- Produces: JavaScript 이벤트 핸들러 업데이트
  - `renderGrid()`: `.is-targeted` 클래스 추가
  - `state:players` 이벤트: 보스 HP 상태에 따라 `.is-critical` 클래스 관리
  - 타이머 상태: `.is-warning`, `.is-critical` 클래스 추가

**Steps:**

- [ ] **Step 1: renderGrid()에서 타겟 상태 클래스 추가**

기존 코드:
```javascript
function renderGrid() {
  const grid = document.getElementById("playerGrid");
  grid.innerHTML = "";
  for (const p of players) {
    const div = document.createElement("div");
    div.className = "tv-player-card";
    // ...
  }
}
```

수정:
```javascript
function renderGrid() {
  const grid = document.getElementById("playerGrid");
  grid.innerHTML = "";
  for (const p of players) {
    const div = document.createElement("div");
    div.className = "player-file-card tv-player-card";
    if (!p.alive) div.classList.add("is-dead");
    if (p.role === "boss") div.classList.add("is-boss");
    // ... 타겟 표시는 host.js 내 별도 로직에서 처리
    // ...
  }
}
```

- [ ] **Step 2: 보스 HP 상태에 따른 클래스**

`socket.on("state:players", ...)` 핸들러에서:

```javascript
socket.on("state:players", ({ players: ps }) => {
  players = ps;
  renderPlayerList(document.getElementById("playerList"), players);
  renderPlayerList(document.getElementById("gamePlayerList"), players, { showHp: true });
  renderGrid();

  // 보스 상태 업데이트
  const boss = players.find(p => p.role === "boss");
  const bossBanner = document.getElementById("bossBanner");
  if (boss && bossBanner) {
    if (boss.hp <= 1) {
      bossBanner.classList.add("is-critical");
    } else {
      bossBanner.classList.remove("is-critical");
    }
  }

  // ... 기존 코드
});
```

- [ ] **Step 3: 타이머 경고 상태**

`startCountdown()` 함수 내에서 (또는 새로운 타이머 로직):

```javascript
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
    
    // 30초 이하 경고, 10초 이하 긴급
    if (ms <= 10000) {
      el.classList.add("is-critical");
      el.classList.remove("is-warning");
    } else if (ms <= 30000) {
      el.classList.add("is-warning");
      el.classList.remove("is-critical");
    } else {
      el.classList.remove("is-warning", "is-critical");
    }
  };
  tick();
  window.__countdownTimer = setInterval(tick, 250);
}
```

- [ ] **Step 4: 테스트**

8명 게임 진행 중:
- 플레이어 피해 시 HP바가 정확하게 줄어드는지 확인
- 보스 HP가 1 이하가 되면 카드 색상이 변하는지 확인
- 타이머가 30초 이하에서 경고색으로 변하는지 확인
- 타이머가 10초 이하에서 긴급색으로 변하는지 확인

- [ ] **Step 5: 커밋**

```bash
git add public/host.js
git commit -m "feat: add state-based CSS classes for HP, timer, and boss status"
```

---

### Task 9: 통합 검증 및 문서 업데이트

**Files:**
- Modify: `docs/10개발로그.md`
- Test: 브라우저 테스트

**Interfaces:**
- Consumes: 모든 이전 작업
- Produces: 개발 로그 업데이트

**Steps:**

- [ ] **Step 1: 브라우저 검증 체크리스트**

`npm run dev` 실행 후:

**로비 화면:**
- [ ] 방 코드가 명확하게 표시되는가
- [ ] 플레이어 입장 시 목록이 업데이트되는가
- [ ] "시작 (N/6~10명)" 버튼이 올바르게 표시되는가

**게임 진행 중:**
- [ ] 헤더에 "CONFIDENTIAL CASE FILE", 라운드, 페이즈, 타이머가 명확하게 보이는가
- [ ] 보스 카드가 화면 왼쪽에 크게 표시되는가
- [ ] 플레이어 카드가 그리드로 정렬되는가
- [ ] 밤 페이즈에서 배경이 어두워지는가
- [ ] 낮 페이즈에서 배경이 밝아지는가
- [ ] 타이머가 크고 읽기 쉬운가
- [ ] 30초 이하일 때 타이머 색상이 변하는가

**HP 버그 수정 검증:**
- [ ] 보스 HP 5 → 4일 때 HP바가 80% 표시되는가
- [ ] 조직원 HP 4 → 3일 때 HP바가 75% 표시되는가

**애니메이션:**
- [ ] 플레이어를 지목하면 카드에 펄스 효과가 있는가
- [ ] 보스 HP가 1이 되면 카드 색상이 변하는가

**반응형:**
- [ ] 모바일(375px): 1열 그리드, 읽기 가능
- [ ] 태블릿(768px): 3열 그리드
- [ ] 데스크톱(1920px): 4열 그리드

- [ ] **Step 2: 접근성 검증**

- [ ] 텍스트 대비 4.5:1 이상인가 (Chrome DevTools Lighthouse 확인)
- [ ] 포커스 링이 명확한가
- [ ] 버튼 크기가 44×44px 이상인가

- [ ] **Step 3: 기능 검증**

- [ ] 방 생성/입장: 정상 작동
- [ ] 게임 시작 (6~10명): 정상 작동
- [ ] 밤/낮 사이클: 정상 작동
- [ ] 투표/결과 공개: 정상 작동
- [ ] 게임 종료: 정상 작동

- [ ] **Step 4: 성능 확인**

- [ ] Lighthouse 성능 점수 60 이상
- [ ] 애니메이션이 부드러운가 (60fps)

- [ ] **Step 5: 개발 로그 업데이트**

`docs/10개발로그.md`의 "UI/UX 개선 디자인 보완 사양 작성" 항목을 다음과 같이 확장:

```markdown
- **진행자/TV 화면 느와르 UI 구현**: design.md 17장 기준으로 host.html/host.js/style.css 구현. CSS 색상 팔레트(16개 변수) 및 웹폰트(Noto Sans/Serif KR + Special Elite) 적용, 기존 엘리먼트에 `.case-header`, `.phase-status`, `.boss-case-file`, `.player-file-grid` 등 시맨틱 클래스 추가. HP바 버그 수정(역할별 MAX_HP 반영), 페이즈별 배경 전환(밤/낮), 표적 펄스·타이머 경고 애니메이션 추가. 모바일(360px), 태블릿(768px), TV(1200px) 반응형 미디어 쿼리 적용. 텍스처 및 이미지 없이 순수 CSS/HTML로 구현하여 빠른 로드·높은 접근성 유지.
  - 검증: `npm run dev` 8명 게임 시뮬레이션, Lighthouse 성능 점수 60+, 텍스트 대비 4.5:1 이상.
```

- [ ] **Step 6: 커밋**

```bash
git add docs/10개발로그.md
git commit -m "docs: add noir UI implementation summary to dev log"
```

---

## 검증 방법

### 로컬 테스트
```bash
npm run dev
# localhost:5173/host 접속
# 방 생성 → 플레이어 6~10명 입장 → 게임 시작 → 밤/낮/투표 진행
```

### 색상/폰트 검증
- Chrome DevTools → Elements → Computed 탭에서 CSS 변수 값 확인
- Google Fonts 로드 상태 Network 탭에서 확인

### 반응형 검증
- Chrome DevTools → Device Toolbar
  - iPhone SE (375px)
  - iPad (768px)
  - Desktop 1920px

### 접근성 검증
- Chrome DevTools → Lighthouse → Accessibility
- 대비 비율 확인: Accessibility Inspector

### 성능 검증
- Chrome DevTools → Lighthouse → Performance
- FCP < 1.5s, LCP < 2.5s 목표

---

## 다음 단계 (이 계획 범위 외)

1. **플레이어 화면 느와르 UI** (`public/player.html`, `public/player.js`)
   - 능력 카드 5종 UI (백엔드 구현 분만)
   - HP바 버그 수정 (player.js)
   - "TOP SECRET" 기밀 지령서 스타일
   - 모바일 최적화

2. **선택적 에셋 추가**
   - 역할 아이콘 4개 (SVG)
   - 행동 아이콘 5개 (SVG)
   - 조직 인장 1개 (SVG)
   - 수배 도장 SVG

3. **성능 최적화**
   - 웹폰트 서브셋 로드
   - CSS 축소
   - 이미지 최적화 (에셋 추가 시)
