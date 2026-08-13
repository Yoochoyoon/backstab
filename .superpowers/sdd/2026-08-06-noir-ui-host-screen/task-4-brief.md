# Task 4: 진행자/TV 화면 기본 스타일 (배경, 카드, 타이머)

## Summary

`public/style.css`에 느와르 테마의 기본 스타일링을 추가한다. Task 1의 CSS 변수와 Task 2에서 추가한 시맨틱 클래스를 활용하여 느와르 사건 기록실 미학을 구현한다. 색상, 폰트, 레이아웃, 셰도우, 반경만 사용하고 이미지/텍스처는 추가하지 않는다.

## Acceptance Criteria

- ✅ `.host-layout`, `.tv-upper`, `.control-lower` 기본 레이아웃 스타일
- ✅ `.case-header` (문서 헤더), `.case-header__label` (CONFIDENTIAL CASE FILE)
- ✅ `.phase-status`, `.phase-label`, `.round-label` (페이즈 표시)
- ✅ `.countdown` (타이머) — 기본 3rem 크기, `.is-warning`, `.is-critical` 상태 클래스
- ✅ `.boss-case-file` (보스 카드) — 금색 테두리, `.is-critical` 상태
- ✅ `.player-file-grid` (플레이어 그리드) — auto-fit minmax, 반응형 (1/3/4 컬럼)
- ✅ `.player-file-card` (플레이어 카드) — `.is-alive`, `.is-dead`, `.is-targeted`, `.is-boss` 상태
- ✅ `.tv-player-name`, `.tv-player-hp` (카드 내 텍스트)
- ✅ 기존 HTML 구조 변경 없음
- ✅ 기능성 유지 (Socket.IO 로직, 기존 이벤트 핸들러)
- ✅ 타입 검사 또는 린트 통과

## Code to Implement

### Step 1: 레이아웃 스타일 추가 (.host-layout, .tv-upper, .control-lower)

`public/style.css`의 기존 코드 다음에 추가:

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

### Step 2: 헤더 스타일 (.case-header, .case-header__label, .case-header h1)

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

### Step 3: 페이즈 상태 스타일 (.phase-status, .phase-label, .round-label)

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

### Step 4: 타이머 스타일 (.countdown, .countdown.is-warning, .countdown.is-critical)

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

### Step 5: 보스 카드 스타일 (.boss-case-file, .boss-case-file__label, .boss-case-file__name, .boss-case-file__hp, .boss-case-file.is-critical)

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

### Step 6: 플레이어 그리드 스타일 (.player-file-grid)

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

### Step 7: 플레이어 카드 스타일 (.player-file-card, .player-file-card.is-*, .tv-player-name, .tv-player-hp)

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

## Testing

1. `npm run dev` 실행
2. `/host` 접속 후:
   - [ ] 헤더가 느와르 스타일(Noto Serif KR 폰트, 갈색 종이 느낌)로 보이는지 확인
   - [ ] "CONFIDENTIAL CASE FILE" 라벨이 타이프라이터 스타일로 표시되는지 확인
   - [ ] 타이머가 크고 금색으로 보이는지 확인
   - [ ] 보스 배너가 금색 테두리 카드로 표시되는지 확인
   - [ ] 플레이어 카드들이 그리드로 정렬되는지 확인
3. 기본 기능 테스트:
   - [ ] 방 생성 버튼 작동 (기능 유지)
   - [ ] 플레이어 입장 시 카드 추가 (기능 유지)
   - [ ] 게임 시작 가능 (기능 유지)
4. 반응형 확인:
   - [ ] 모바일 (375px): 1 컬럼
   - [ ] 태블릿 (768px): 3 컬럼
   - [ ] TV (1200px+): 4 컬럼
5. 콘솔 에러 없음 확인

## Current Code State

- File: `public/style.css`
- 현재: Task 1 CSS 변수만 있음
- 필요: Task 2/3 HTML 구조와 클래스가 준비됨
- 추가할: 지금 task-4-brief에서 정의한 모든 CSS 클래스 스타일

## Global Constraints Applied

- 기존 HTML 구조 변경 불가
- 이미지/텍스처 에셋 추가 없음 (순수 CSS/HTML)
- 기존 기능(Socket.IO, 게임 로직) 변경 불가
- CSS 변수만 사용 (Task 1에서 정의한 값들)
- 접근성: 색상 대비 4.5:1 이상 유지

