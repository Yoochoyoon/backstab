# Task 6: 애니메이션 및 상태 효과 (타겟 펄스, 타이머 경고)

## Summary

`public/style.css`에 CSS 애니메이션을 추가한다. 표적된 플레이어 카드의 펄스 효과, 타이머 경고 시 색상 점멸, 그리고 `prefers-reduced-motion: reduce`를 존중하는 접근성 설정을 구현한다.

## Acceptance Criteria

- ✅ `@keyframes target-pulse`: 크림슨색 박스셰도우 반복 (2.2s ease-in-out)
- ✅ `.player-file-card.is-targeted` 에 target-pulse 애니메이션 적용
- ✅ `@keyframes timer-warning`: 골드 ↔ 경고색 점멸 (600ms ease-in-out)
- ✅ `.countdown.is-warning` 에 timer-warning 애니메이션 적용
- ✅ `@media (prefers-reduced-motion: reduce)` 블록: 모든 애니메이션/트랜지션 비활성화
- ✅ 기존 기능 유지 (는 Task 8에서 is-targeted 클래스가 추가될 때 작동)
- ✅ 타입 검사 또는 린트 통과

## Code to Implement

### Step 1: target-pulse 애니메이션 추가

`public/style.css`에 추가:

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

### Step 2: prefers-reduced-motion 존중

`public/style.css`에 추가 (스타일시트 맨 아래):

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Step 3: timer-warning 애니메이션 추가

`public/style.css`에 추가:

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

### Step 4: 테스트

1. `npm run dev` 실행
2. `/host` 접속 → 방 생성 → 6명 이상 입장 → 게임 시작
3. 애니메이션 검증:
   - [ ] 타이머가 30초 이하일 때 `.countdown.is-warning` 클래스가 추가되고 색상이 점멸하는지 확인 (host.js 로직은 이미 Task 3에서 구현됨으로 보임)
   - [ ] 타이머 경고 애니메이션이 부드럽게 작동하는지 확인 (600ms 사이클)
4. 접근성 검증:
   - [ ] Mac 설정 → 손쉬운 사용 → 표시 → "움직임 줄이기" 활성화 후 페이지 새로고침
   - [ ] 모든 애니메이션이 즉시 완료되거나 비활성화되는지 확인
5. 콘솔 에러 없음 확인
6. **참고**: is-targeted 클래스 적용은 Task 8에서 host.js renderGrid()에서 구현됨

## Current Code State

- File: `public/style.css` (Task 1~5 스타일 모두 포함)
- 현재: 애니메이션 규칙 없음
- Task 3 보고서에 따르면, host.js에서 `.is-targeted` 클래스를 renderGrid()에 추가할 준비는 되어 있지만, Task 8에서 추가 예정

## Global Constraints Applied

- CSS 변수만 사용 (Task 1 정의: --color-gold-bright, --color-warning, --color-crimson 등)
- 기존 HTML/JS 변경 불가 (애니메이션은 CSS만)
- `prefers-reduced-motion: reduce` 반드시 존중
- 모든 애니메이션은 무한 반복 (infinite) 또는 적절한 반복 횟수
- 기존 기능/이벤트 변경 없음

## Testing Strategy

1. **타이머 경고 애니메이션**: Task 3에서 이미 is-warning 클래스 토글 로직이 구현되어 있으므로, 타이머가 30초 이하일 때 자동으로 애니메이션 적용
2. **표적 펄스**: Task 8에서 is-targeted 클래스 추가 후 검증 (지금은 CSS만 준비)
3. **접근성**: 실제 기기/OS 설정으로 모션 감소 테스트, 또는 DevTools에서 prefers-reduced-motion 에뮬레이션 확인

