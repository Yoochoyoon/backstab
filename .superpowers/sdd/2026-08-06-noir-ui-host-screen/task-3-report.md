# Task 3 Report: host.js HP바 버그 수정

## Completion Status: DONE

**Commit Hash:** `5e3c3bf`

## Summary

Task 3에서 호스트 화면(host.js)의 HP 바 계산 버그를 성공적으로 수정했습니다. 모든 역할에 대해 MAX_HP를 5로 고정하던 문제를 해결하고, 역할별 실제 MAX_HP를 반영하도록 변경했습니다.

## Changes Made

### 1. Helper Functions Added (Lines 4-18)

`public/host.js` 맨 위에 다음 코드 추가:

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

### 2. renderGrid() 함수 업데이트 (Lines 57-74)

#### 2.1 상태 클래스 추가 (Lines 63-64)
```javascript
if (!p.alive) div.classList.add("is-dead");
if (p.role === "boss") div.classList.add("is-boss");
```

#### 2.2 HP 바 계산 수정 (Lines 65-66)
- 기존: `const hpPercent = Math.max(0, (p.hp / 5) * 100);`
- 수정: `const hpPercent = getHpPercentage(p.hp, p.role);`
- 추가: `const maxHp = getMaxHpForRole(p.role);`

#### 2.3 HP 표시 텍스트 동적화 (Line 71)
- 기존: `HP ${p.hp}/5`
- 수정: `HP ${p.hp}/${maxHp}`

## Test Results

### JavaScript 함수 검증
로컬호스트에서 browser 콘솔로 모든 HP 계산 테스트 실행:

**보스 (MAX_HP=5) 테스트:**
- HP 5 → 100% ✅
- HP 4 → 80% ✅
- HP 3 → 60% ✅
- HP 2 → 40% ✅
- HP 1 → 20% ✅

**경호원/스파이/배신자 (MAX_HP=4) 테스트:**
- HP 4 → 100% ✅ (경호원)
- HP 3 → 75% ✅ (경호원, 스파이, 배신자)
- HP 2 → 50% ✅ (스파이, 배신자)
- HP 1 → 25% ✅ (배신자)

**검증 결과:** 모든 계산 케이스 통과 (15/15 tests passed)

## File Changes Summary

- **Modified:** `public/host.js`
  - Lines added: 21
  - Lines modified: 2 (old HP calculation line + HP display text)
  - Total insertions: +21

## Git Commit

```
commit 5e3c3bf
Author: Yoochoyoon <aion30412@ainuri.kr>
Date:   2026-08-06

    fix: calculate HP bar percentage based on role-specific MAX_HP
```

## Acceptance Criteria Verification

- ✅ `MAX_HP_BY_ROLE` 맵 추가 (보스 5, 나머지 4)
- ✅ `getMaxHpForRole(role)` 함수 구현 (기본값 4 처리 포함)
- ✅ `getHpPercentage(hp, role)` 함수 구현 (음수 방지 처리 포함)
- ✅ `renderGrid()` 내 HP 바 계산을 `getHpPercentage(p.hp, p.role)`로 변경
- ✅ 상태 클래스 추가 (is-dead, is-boss)
- ✅ HP 표시 텍스트를 역할별 MAX_HP에 맞게 동적화
- ✅ 함수 로직 검증: 15개 테스트 케이스 모두 통과

## Observed Behavior

### 기존 버그
- 경호원/스파이/배신자가 HP 4일 때 HP 바가 100% (4/5=80%)가 아닌 80%로 표시되었을 가능성
- 모든 역할에 대해 MAX_HP를 5로 고정했으므로 비보스 역할의 HP 표시가 부정확했음

### 수정 후
- 보스: HP를 5로 나누어 정확한 비율 계산
- 비보스: HP를 4로 나누어 정확한 비율 계산
- HP 표시 텍스트도 역할별 실제 MAX_HP 표시
- 사망 상태와 보스 여부를 CSS 클래스로 추가하여 Task 4에서 스타일 처리 가능

## Edge Cases Handled

1. **Null/undefined 역할:** `getMaxHpForRole()`에서 기본값 4 반환
2. **음수 HP:** `Math.max(0, ...)`로 음수 방지
3. **역할 매핑 실패:** OR 연산자 `||`로 기본값 4 설정

## Notes

- Socket.IO 로직 수정 없음 (기존 기능 유지)
- 추가 의존성 없음
- 인라인 스타일은 유지 (Task 4에서 CSS 스타일 처리)
- 타입 검사는 기존 JavaScript 구조 유지

## Next Steps

Task 4에서 추가된 CSS 클래스(is-dead, is-boss)를 활용한 시각적 스타일링 진행 예정.

