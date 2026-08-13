# Task 1: CSS 변수 및 웹폰트 선언

## Summary

`public/style.css` 맨 앞에 Google Fonts 임포트와 `:root` CSS 변수 블록을 추가하여 느와르 테마의 색상 팔레트(16개), 폰트 이름(4개), 레이아웃 토큰(반경·그림자)을 정의합니다. 기존 코드는 유지하고 변수만 추가합니다.

## Acceptance Criteria

- ✅ Google Fonts 링크가 파일 맨 앞에 `@import` 형태로 추가됨
- ✅ `:root` 블록에 색상 16개, 폰트 4개, 레이아웃 토큰이 정의됨
- ✅ `public/style.css`의 기존 코드는 그대로 유지 (73줄 현상 유지)
- ✅ CSS 문법 검증: `npm run build` 또는 TypeScript 컴파일 통과 (빌드가 없으면 브라우저 로드 확인)

## Code to Implement

### Step 1: Google Fonts 링크 (파일 맨 앞에 추가)

```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@500;600;700&family=Special+Elite&display=swap');
```

### Step 2: CSS 변수 블록 (Google Fonts 임포트 바로 아래에 추가)

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

## Testing

1. 브라우저에서 `npm run dev` 후 `/host` 또는 `/player` 접속
2. Chrome DevTools → Styles 탭에서 CSS 변수가 정의되었는지 확인 (`--color-bg` 등)
3. Google Fonts가 로드됐는지 확인: Network 탭에서 fonts.googleapis.com 또는 fonts.gstatic.com 요청 확인
4. 페이지가 정상 로드되고 레이아웃이 깨지지 않는지 확인 (색상/폰트는 아직 적용되지 않음)

## Current Code State

- 파일: `public/style.css` (현재 73줄)
- 현재 폰트: "Pretendard", "Malgun Gothic", system-ui, sans-serif (2줄)
- 현재 색상: 하드코딩됨 (#12131a, #5865f2 등)
- 기존 내용은 변수 선언 후에 그대로 유지

## Global Constraints Applied

- 기존 소켓 이벤트 ID/로직 변경 불가
- 애니메이션 prefers-reduced-motion 존중 (이 Task에는 해당 없음)
- 한글/영문 혼용 가능 (변수명은 영문)
- 기능성 > 분위기 > 장식 (이 Task는 기초 설정)
