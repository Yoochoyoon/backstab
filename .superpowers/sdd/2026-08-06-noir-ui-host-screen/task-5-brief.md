# Task 5: 페이즈별 분위기 효과 (밤/낮 배경 전환)

## Summary

`public/style.css`와 `public/host.js`를 수정하여 게임 페이즈가 바뀔 때 배경 색상/밝기가 부드럽게 전환되도록 한다. Task 2에서 추가한 `data-phase` 속성을 활용하여 밤(어둡게) ↔ 낮(밝게) 전환 효과를 구현한다.

## Acceptance Criteria

- ✅ CSS: `.host-layout` 페이즈별 배경 색상 규칙 추가
- ✅ CSS: `transition: background-color 500ms ease-out` 애니메이션
- ✅ CSS: `data-phase="night"` 어두운 배경 (color-bg-deep)
- ✅ CSS: `data-phase="day_reveal"` 밝은 배경 (rgba 종이색 위상)
- ✅ host.js: `state:phase_changed` 이벤트에서 `data-phase` 속성 업데이트
- ✅ host.js: `state:game_over` 이벤트에서 `data-phase="game_over"` 설정
- ✅ 8명 게임에서 밤/낮 전환 시 배경 변화 시각 검증
- ✅ 타입 검사 또는 린트 통과

## Code to Implement

### Step 1: CSS 페이즈별 배경 스타일 추가

`public/style.css`의 기존 `.host-layout` 스타일을 다음과 같이 수정 (또는 확장):

```css
.host-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  gap: 12px;
  padding: 12px;
  box-sizing: border-box;
  background: var(--color-bg);
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

### Step 2: host.js에서 phase_changed 이벤트 처리

기존 `socket.on("state:phase_changed", ...)` 핸들러에서, 페이즈 라벨 업데이트 부분 바로 앞에 추가:

```javascript
socket.on("state:phase_changed", ({ phase, round, phaseEndsAt }) => {
  const gameShell = document.querySelector(".host-layout");
  if (gameShell) {
    gameShell.setAttribute("data-phase", phase);
  }
  
  // 기존 코드 (phaseLabel 업데이트 등)
  ...
});
```

### Step 3: host.js에서 game_over 이벤트 처리

기존 `socket.on("state:game_over", ...)` 핸들러에서, 핸들러 시작 부분에 추가:

```javascript
socket.on("state:game_over", ({ winner }) => {
  const gameShell = document.querySelector(".host-layout");
  if (gameShell) {
    gameShell.setAttribute("data-phase", "game_over");
  }
  
  // 기존 코드 (승자 표시, 결과 로그 등)
  ...
});
```

### Step 4: 테스트

1. `npm run dev` 실행
2. `/host` 접속 → 방 생성 → 6명 이상 입장 → 게임 시작
3. 게임 진행 중 관찰:
   - [ ] **밤 페이즈**: 배경이 color-bg-deep(더 어두운 갈색)으로 부드럽게 전환되는지 확인
   - [ ] **낮 페이즈** (결과공개/토론/투표): 배경이 밝아지고 tv-upper에 종이색 반투명 레이어가 적용되는지 확인
   - [ ] **전환 속도**: 500ms 정도 걸려 부드럽게 전환되는지 확인 (갑자기 바뀌지 않음)
4. 게임 종료 시 배경이 정상인지 확인
5. 콘솔 에러 없음 확인

## Current Code State

- File: `public/style.css` (Task 4에서 추가된 스타일들 유지)
- File: `public/host.js` (phase_changed, game_over 이벤트 핸들러 이미 존재, data-phase 속성만 추가)
- 현재: `data-phase` 속성이 HTML에는 "lobby"로 초기화되어 있지만, Socket 이벤트에서 업데이트되지 않음

## Global Constraints Applied

- 기존 소켓 이벤트 핸들러 로직 유지 (페이즈 라벨 업데이트 등)
- 기존 게임 진행 로직 변경 불가
- CSS 변수만 사용 (Task 1 정의)
- 애니메이션은 Task 6에서 처리 (이 task는 배경 색상만)
- `prefers-reduced-motion` 존중 (Task 6에서 처리)

