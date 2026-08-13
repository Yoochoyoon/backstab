# Task 3: host.js에서 HP바 버그 수정

## Summary

`public/host.js`에서 HP 바 비율 계산 시 모든 역할에 대해 MAX_HP를 5로 고정하는 버그를 수정한다. 역할별 MAX_HP를 반영하여 정확한 비율을 계산하도록 변경한다:
- 보스: MAX_HP = 5
- 경호원/스파이/배신자: MAX_HP = 4

## Acceptance Criteria

- ✅ `MAX_HP_BY_ROLE` 맵 추가 (보스 5, 나머지 4)
- ✅ `getMaxHpForRole(role)` 함수 구현
- ✅ `getHpPercentage(hp, role)` 함수 구현
- ✅ `renderGrid()` 내 HP 바 계산을 `getHpPercentage(p.hp, p.role)`로 변경
- ✅ 상태 클래스 추가 (is-dead, is-boss)
- ✅ 8명 풀 게임에서 보스/비보스 HP 정확도 검증
- ✅ 타입 검사 또는 린트 통과

## Code to Implement

### Step 1: MAX_HP 맵과 헬퍼 함수 추가

`public/host.js` 맨 위(Socket 초기화 이전)에 추가:

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

### Step 2: renderGrid 함수에서 HP 바 계산 수정

기존:
```javascript
const hpPercent = Math.max(0, (p.hp / 5) * 100);
```

수정:
```javascript
const hpPercent = getHpPercentage(p.hp, p.role);
```

### Step 3: 상태 클래스 추가

`renderGrid()` 내에서 플레이어 카드 div를 생성할 때:

```javascript
const div = document.createElement('div');
div.className = 'tv-player-card';
if (!p.alive) div.classList.add('is-dead');
if (p.role === 'boss') div.classList.add('is-boss');
```

### Step 4: 테스트

1. `npm run dev` 실행
2. 8명 방 생성 → 6명 이상 입장 → 게임 시작
3. 밤 페이즈에서 다양한 역할에게 데미지 발생
4. HP 바 정확도 확인:
   - 보스 HP 5일 때 100%, 4일 때 80%, 3일 때 60% 표시
   - 경호원/스파이/배신자 HP 4일 때 100%, 3일 때 75%, 2일 때 50% 표시
5. 콘솔 에러 없음 확인

## Current Code State

- File: `public/host.js`
- 현재: HP 비율 계산이 모든 역할에서 `(hp / 5) * 100` 사용
- 버그: 보스는 MAX_HP=5가 맞지만, 나머지는 MAX_HP=4임
- 영향: 경호원/스파이/배신자의 HP 바가 100% 이상으로 표시될 수 있음 (100% == 4/5)

## Global Constraints Applied

- 기존 소켓 이벤트 ID 절대 변경 불가
- 기존 Socket.IO 로직 건드리지 않기
- 기능성만 수정, 스타일 변경 없음 (Task 4에서 처리)
- 추가 의존성 없음

## Testing

1. 로컬 개발 서버 실행 (`npm run dev`)
2. 기본 게임 플로우: 방 생성 → 6~10명 입장 → 게임 시작
3. 밤/낮 사이클 진행하며 모든 역할의 HP 변화 관찰
4. HP 바 비율이 정확한지 확인:
   - 보스만 MAX_HP 5 기준
   - 나머지는 MAX_HP 4 기준
5. 콘솔 에러 없음 확인

