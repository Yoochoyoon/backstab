# Backstab

4가지 역할(보스·조직원·스파이·배신자)이 수행하는 6~10인 소셜 디덕션 파티 게임. 기획 문서는 `docs/` 폴더 참고. MVP는 핵심 게임루프를 완성했고, Phase 2 기능 중 인원수 가변·재접속 자동 복귀·UI/UX 개선이 진행 중입니다.

## 🎮 플레이 링크

### 로컬 개발

```bash
npm install
npm run dev
```

**접속 주소:**
- **진행자/TV 통합**: http://localhost:3000/host
  - 방 만들기 → 방 코드 확인 → 플레이어 6~10명 입장 시까지 대기
  - 게임 시작/강제진행/시간 연장 제어

- **플레이어**: http://localhost:3000/player
  - 방 코드 + 닉네임 입력 → 입장
  - 밤(행동 선택) / 낮(토론/투표) 참여

- **공용 TV 화면** (레거시): http://localhost:3000/tv
  - 방 코드 입력 → 방에 연결
  - 전체 게임 진행 상황 표시

### 라이브 배포

**호스트 (진행자/TV 통합)**: https://backstab-tu0e.onrender.com/host

**플레이어**: https://backstab-tu0e.onrender.com/player

**공용 TV** (레거시): https://backstab-tu0e.onrender.com/tv

## 🧪 테스트

```bash
npm test
```

`server/src/game/resolveRound.test.ts` + `roleAssignment.test.ts`에서 밤 데미지·능력·투표·승리조건·역할배정을 검증합니다 (23/23 테스트 통과).

## 📦 배포 (Render.com)

1. GitHub 저장소에 push
2. Render에서 "New Web Service" → 저장소 연결
3. Build Command: `npm install`
4. Start Command: `npm start`
5. `PORT` 환경변수는 Render가 자동 주입
