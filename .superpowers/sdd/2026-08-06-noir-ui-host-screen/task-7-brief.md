# Task 7: 모바일/TV 반응형 규칙 및 최적화

## Summary

`public/style.css`에 반응형 미디어 쿼리를 추가하여 모바일(320px), 태블릿(768px), TV/데스크톱(1200px+) 각 화면 크기에 맞는 최적화된 레이아웃을 구현한다. 폰트 크기, 그리드 컬럼 수, 간격, 터치 대상 크기를 조정한다.

## Acceptance Criteria

- ✅ 모바일 (<360px): 헤더 1.8rem, 타이머 2rem, 1열 그리드
- ✅ 모바일 (360~767px): 헤더 2rem, 타이머 2.4rem, 1열 그리드
- ✅ 태블릿 (768~1199px): 헤더 2.2rem, 타이머 3rem, 3열 그리드
- ✅ TV/데스크톱 (1200px+): 헤더 2.8rem, 타이머 4rem, 4열 그리드, 넉넉한 패딩
- ✅ 터치 대상 최소 크기: 44×44px (모든 버튼/클릭 가능 요소)
- ✅ iPhone SE(375px) / iPad(768px) / 1920px 데스크톱에서 레이아웃 검증
- ✅ 접근성: 사용자 글자 크기 설정 존중 (max/min 없이 비율 조정)
- ✅ 기존 기능 유지

## Code to Implement

### Step 1: 초소형 모바일 규칙 (<360px)

`public/style.css`의 기존 스타일 이후에 추가:

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
```

### Step 2: 모바일 규칙 (360~767px)

```css
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

### Step 3: 태블릿 규칙 (768~1199px)

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

### Step 4: TV/데스크톱 규칙 (1200px+)

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

### Step 5: 터치 대상 크기 최소화

CSS 파일 어디든(보통 맨 아래) 추가:

```css
button,
[role="button"],
.clickable,
.player-file-card {
  min-height: 44px;
  min-width: 44px;
}
```

## Testing

1. `npm run dev` 실행
2. Chrome DevTools Device Toolbar로 다양한 화면 크기 테스트:

   **초소형 모바일 (320px):**
   - [ ] 헤더가 1.8rem으로 작아지는지 확인
   - [ ] 타이머가 2rem으로 표시되는지 확인
   - [ ] 패딩이 8px로 축소되는지 확인

   **모바일 (375px / iPhone SE):**
   - [ ] 헤더가 2rem, 타이머가 2.4rem으로 표시되는지 확인
   - [ ] 플레이어 카드가 1열로 정렬되는지 확인
   - [ ] 카드가 화면 너비에 맞게 확대되는지 확인

   **태블릿 (768px / iPad):**
   - [ ] 헤더가 2.2rem, 타이머가 3rem으로 증가하는지 확인
   - [ ] 플레이어 카드가 3열로 정렬되는지 확인
   - [ ] 간격이 적절한지 확인

   **TV/데스크톱 (1200px+, 1920px):**
   - [ ] 헤더가 2.8rem, 타이머가 4rem으로 크게 표시되는지 확인
   - [ ] 플레이어 카드가 4열로 정렬되는지 확인
   - [ ] 패딩이 16px으로 증가하는지 확인
   - [ ] 플레이어 카드 내 텍스트 크기가 커지는지 확인 (name 1.1rem, hp 0.95rem)

3. **기능 검증:**
   - [ ] 모든 화면 크기에서 "방 만들기" 버튼 작동 확인
   - [ ] 플레이어 카드 클릭/터치 가능 (44×44px 이상)
   - [ ] 게임 진행 중 반응형 유지 (로비 → 밤 → 낮 전환 시)

4. **접근성:**
   - [ ] 브라우저 기본 폰트 크기 설정(125%, 150%)에서 레이아웃이 깨지지 않는지 확인

5. 콘솔 에러 없음 확인

## Current Code State

- File: `public/style.css` (Task 1~6 스타일 모두 포함)
- 현재: 기본 `auto-fit minmax(140px, 1fr)` 그리드만 있음
- 필요: 미디어 쿼리 추가로 각 화면 크기 최적화

## Global Constraints Applied

- 기존 HTML/JS 변경 불가
- 모든 수치 px 단위 (rem은 폰트 크기만 - 사용자 기본 폰트 크기 존중)
- 접근성: 폰트는 flex(상대 단위), 레이아웃은 px
- 터치 대상 최소 44×44px 준수
- 기존 애니메이션 유지 (Task 6)

