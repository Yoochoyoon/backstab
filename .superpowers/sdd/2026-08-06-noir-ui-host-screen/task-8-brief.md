# Task 8: host.js 통합 — 페이즈별 상태 클래스 및 이벤트 연결

## Summary

`public/host.js`의 기존 이벤트 핸들러를 수정하여 CSS 상태 클래스를 추가한다. renderGrid()에서 플레이어 카드에 상태 클래스(`is-dead`, `is-boss`, `is-targeted`)를 적용하고, 타이머 상태에 따라 `.countdown.is-warning`/`.is-critical` 클래스를 토글하며, 보스 HP가 1 이하일 때 `.bossBanner.is-critical` 클래스를 추가한다.

## Acceptance Criteria

- ✅ `renderGrid()`: 플레이어 카드에 `player-file-card` 클래스 명 추가 (기존 `tv-player-card` 유지)
- ✅ `renderGrid()`: `.is-dead`, `.is-boss`, `.is-targeted` 클래스 토글
- ✅ `state:players` 이벤트: 보스 HP ≤ 1일 때 `.is-critical` 클래스 추가
- ✅ `startCountdown()` 함수: 타이머 30초 이하 `.is-warning`, 10초 이하 `.is-critical` 토글
- ✅ 8명 게임에서 보스/비보스 HP, 타이머 상태, 보스 위험 상태 시각적 표시 검증
- ✅ 기존 Socket.IO 로직/이벤트 변경 불가
- ✅ 기존 기능 유지 (방 생성, 입장, 게임 진행, 강제진행, 시간연장)

## Code to Implement

### Step 1: renderGrid() 함수 수정

기존 코드에서:
```javascript
div.className = "tv-player-card";
```

수정:
```javascript
div.className = "player-file-card tv-player-card";
if (!p.alive) div.classList.add("is-dead");
if (p.role === "boss") div.classList.add("is-boss");
if (currentTargets && currentTargets.includes(p.id)) div.classList.add("is-targeted");
```

**주의:** `currentTargets` 변수가 host.js에 존재하는지 확인. 없으면 수정하지 말고 보고.

### Step 2: state:players 이벤트 핸들러에서 보스 HP 상태 처리

`socket.on("state:players", ...)` 핸들러 내에 다음을 추가 (renderGrid() 호출 후):

```javascript
socket.on("state:players", ({ players: ps }) => {
  players = ps;
  // ... 기존 코드 (renderPlayerList 등) ...
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
  // ... 기존 코드 계속 ...
});
```

### Step 3: 타이머 상태 클래스 토글

기존 `startCountdown()` 함수를 다음과 같이 수정 (또는 타이머 로직 있는 곳에 추가):

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
```

**주의:** 기존 `formatTimer()` 함수가 있는지 확인. 있으면 그대로 사용.

## Testing

1. `npm run dev` 실행
2. `/host` 접속 → 방 생성 → 6명 이상 입장 → 게임 시작
3. **CSS 클래스 검증** (Chrome DevTools Elements 탭):
   - [ ] 플레이어 카드 className에 `player-file-card` 포함
   - [ ] 사망자 카드에 `is-dead` 클래스 확인
   - [ ] 보스 카드에 `is-boss` 클래스 확인

4. **보스 HP 상태 검증**:
   - [ ] 보스 HP가 5~2일 때: bossBanner 정상 색상
   - [ ] 보스 HP가 1이 되면: bossBanner에 `.is-critical` 클래스 추가, 카드 배경색이 crimson 반투명으로 변경

5. **타이머 상태 검증**:
   - [ ] 밤 페이즈 시작 후 타이머 카운트다운 시작
   - [ ] 타이머 30초 이하: `.countdown.is-warning` 클래스 추가, 색상 orange/warning으로 변경
   - [ ] 타이머 10초 이하: `.countdown.is-critical` 클래스 추가, 색상 crimson-bright로 변경 + 깜빡임
   - [ ] 타이머 종료 후: 클래스 제거, 색상 정상 복구

6. **기능 검증**:
   - [ ] 방 생성/입장: 정상 작동
   - [ ] 게임 시작/진행: 기존 기능 유지
   - [ ] 강제진행/시간연장: 정상 작동
   - [ ] 모든 화면 크기에서 동작 (반응형 유지)

7. 콘솔 에러 없음 확인

## Current Code State

- File: `public/host.js` (Task 3에서 HP바 버그 수정 이후)
- 현재:
  - `renderGrid()` 함수에서 `className = "tv-player-card"` 만 설정
  - 타이머 로직은 `state:phase_changed` 이벤트에서 구현되어 있으나, 상태 클래스 토글 없음
  - 보스 HP 상태 처리 로직 없음

## Global Constraints Applied

- 기존 Socket.IO 이벤트 ID 절대 변경 불가
- 기존 Socket 핸들러 로직 유지 (클래스 추가만)
- 기존 HTML id/클래스 변경 불가 (classList.add/remove만 사용)
- 기능성 변경 없음 (순수 CSS 상태 클래스 추가)
- 애니메이션은 Task 6 CSS에서 이미 구현됨

## Edge Cases

1. **currentTargets 변수 확인**: renderGrid()에서 `currentTargets` 사용하려면 이 변수가 host.js에 정의되어 있어야 함. 없으면 이 부분 스킵.
2. **formatTimer() 함수**: 타이머 포맷팅이 기존 함수로 처리되는지 확인.
3. **타이머 중복 시작**: `window.__countdownTimer` 체크로 기존 타이머 정리 후 새로 시작.

