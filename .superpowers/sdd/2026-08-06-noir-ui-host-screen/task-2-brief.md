# Task 2: host.html 구조 업데이트 및 클래스 추가

## Summary

`public/host.html`의 기존 id는 모두 유지하면서, 의미 있는 클래스명과 `data-phase` 속성을 추가하여 스타일 시스템과의 연결고리를 만듭니다. 인라인 스타일은 제거하지 않아도 되지만 필요에 따라 정리합니다.

## Acceptance Criteria

- ✅ 기존 id(`#bossBanner`, `#playerGrid`, `#phaseLabel`, `#timerLabel`, `#resultLog` 등) 모두 유지
- ✅ 다음 클래스 추가:
  - `.host-layout` (최상위 컨테이너)
  - `.tv-upper` (공용 TV 영역)
  - `.control-lower` (진행자 컨트롤 영역)
  - `.case-header` (헤더)
  - `.case-header__label`
  - `.phase-status`
  - `.round-label`
  - `.phase-label`
  - `.countdown` (타이머)
  - `.boss-case-file` (보스 배너 클래스)
  - `.player-file-grid` (플레이어 그리드)
  - `.event-report` (결과 로그)
- ✅ `data-phase="lobby"` 속성 추가 (JavaScript에서 나중에 업데이트할 준비)
- ✅ 모든 기존 기능 동작 검증 (방 생성, 플레이어 입장, 게임 시작 등)
- ✅ 타입 검사 또는 린트 통과

## Structure to Apply

```html
<!-- 최상위 -->
<div class="host-layout" data-phase="lobby">
  <!-- TV 영역 (위쪽) -->
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
    <!-- 기타 콘텐츠 -->
    <div id="bossBanner" class="boss-case-file" style="display:none;">
      ...
    </div>
    <div class="player-file-grid" id="playerGrid" aria-label="생존자 명단">
      ...
    </div>
    <div class="event-report" aria-live="polite">
      <div id="resultLog" class="event-report__content"></div>
    </div>
  </div>

  <!-- 진행자 컨트롤 영역 (아래쪽) -->
  <div class="control-lower">
    ...
  </div>
</div>
```

## Testing

1. `npm run dev` 실행
2. 기본 기능 테스트:
   - [ ] `/host` 접속 → "방 만들기" 버튼 클릭 → 방 코드 표시
   - [ ] `/player` 5개 탭에서 입장 → 플레이어 목록 업데이트
   - [ ] 6명 이상 입장 후 "시작" 클릭 → 게임 시작
   - [ ] 게임 진행 중 타이머 작동, 강제진행/시간연장 버튼 작동
   - [ ] 게임 종료 → 승리 화면 표시
3. 콘솔 에러 없음 확인
4. Chrome DevTools → Elements에서 클래스/속성 추가 확인

## Current Code State

- File: `public/host.html` (기존 75줄)
- 현재 구조:
  - `.host-layout` div 있음 (기존)
  - `.tv-upper`, `.control-lower` div 있음 (기존)
  - `#bossBanner`, `#playerGrid`, `#resultLog` id 있음 (유지할 것)
  - `#phaseLabel`, `#timerLabel` id 있음 (클래스 추가)
  - 인라인 스타일 일부 존재 (유지)

## Global Constraints Applied

- 기존 id 절대 변경 불가
- 기존 기능 변경 불가
- Socket.IO 이벤트 영향 없음 (순수 마크업 변경)
- 폴백 지원: 구형 브라우저도 클래스 없이도 작동해야 함
