---
name: 자동QA
description: 사용자 없이 혼자 배포판에서 게임을 끝까지 돌려 QA한다. 봇 소켓으로 승리조건 3종(스파이/보스측/배신자)을 각각 강제로 만들어 완주시키고, 인원수 6~10명과 화면 3종 크기(데스크톱·아이패드·폰)로 UI를 점검한 뒤, 찾은 문제(화면·순서·기능·하드코딩)를 고치고 개발로그와 개발메모까지 쓰고 커밋한다. "자동으로 테스트 돌려줘", "혼자 QA해줘", "밤새 테스트해둬" 같은 요청에 사용한다.
---

# 자동QA 스킬

`게임QA`가 **사용자와 같이** 한 판을 플레이하는 스킬이라면, 이 스킬은 **사용자 없이 혼자** 게임을 여러 판 돌려 문제를 찾아 고치는 스킬이다. 사용자가 자리에 없을 때(자는 중, 다른 일 중) 돌리는 걸 전제로 하므로 **처음부터 끝까지 아무것도 묻지 않는다.**

끝나면 고친 내용을 `docs/10개발로그.md`에, 남은 일을 `docs/09개발메모.md`에 적고 커밋한다.

## 원칙

- **묻지 않는다.** 애매하면 판단해서 진행하고, 그 판단을 결과 보고에 적는다. 되돌리기 어려운 일(force push, 방 삭제 등)만 예외로 남겨둔다.
- **배포판(`https://backstab-tu0e.onrender.com`)에서 돌린다.** 사용자가 실제로 쓰는 빌드가 대상이다. 다만 CSS/JS를 고친 뒤 검증할 때는 배포 대기(수 분)를 기다리는 대신, 로컬 서버(`npm run dev`)에 같은 상태를 만들어 확인하고 → 푸시 → 배포판에 반영됐는지 `curl`로 확인하는 순서가 빠르다.
- **증거 없이 "고쳤다"고 하지 않는다.** 화면 문제는 수치로 재고(겹침/잘림/스크롤), 로직 문제는 실제로 이벤트를 흘려 확인한다.
- 사용자가 열어둔 탭은 건드리지 않는다. 항상 새 탭을 만든다.

## 1. 준비 — 봇 하네스

브라우저 탭을 봇마다 하나씩 여는 방식은 8명이면 8탭이라 느리고 잘 깨진다. **한 페이지에서 소켓을 여러 개 만들어** 봇을 굴리는 쪽이 훨씬 안정적이다(실제로 이 방식으로 밤새 완주시킨 적 있음).

`{origin}/player`를 연 탭 하나에서:

```js
// 진행자 소켓도 같은 페이지에 두면 탭 전환 없이 한 판을 통째로 몬다.
window.__mk = () => new Promise(r => { const s = io(); s.on('connect', () => r(s)); });

window.__newGame = async (n) => {
  window.__bots = []; window.__events = [];
  const host = await window.__mk();
  const code = await new Promise(r => host.emit('host:create_room', {}, res => r(res.code)));
  window.__host = host;
  for (let i = 1; i <= n; i++) {
    await new Promise(res => {
      const s = io();
      const b = { nick: '봇'+i, s, id: null, role: null, players: [], phase: 'lobby', round: 0, allowed: null };
      s.on('connect', () => s.emit('player:join_room', { code, nickname: b.nick }, r => {
        if (r.ok) { b.id = r.playerId; window.__bots.push(b); } res();
      }));
      s.on('state:players', ({ players }) => { b.players = players; });
      s.on('state:phase_changed', ({ phase, round }) => { b.phase = phase; b.round = round; });
      s.on('player:role_assigned', ({ role }) => { b.role = role; });
      s.on('state:vote_result', ({ tiedTargetIds }) => { b.allowed = (tiedTargetIds||[]).length ? tiedTargetIds : null; });
      s.on('state:full_sync', d => { if (d.players) b.players = d.players; if (d.myRole) b.role = d.myRole; });
      if (i === 1) ['state:night_result','state:vote_result','state:judgement_result','state:game_over']
        .forEach(ev => s.on(ev, p => window.__events.push({ ev, p })));
    });
  }
  return code;
};

window.__adv   = (ms=700) => new Promise(r => { window.__host.emit('host:advance_phase'); setTimeout(r, ms); });
window.__begin = (ms=1200) => new Promise(r => { window.__host.emit('host:start_game', {}, ()=>{}); setTimeout(r, ms); });
window.__roles = () => Object.fromEntries(window.__bots.map(b => [b.nick, b.role]));
window.__state = () => ({ phase: window.__bots[0].phase, round: window.__bots[0].round,
  alive: window.__bots[0].players.filter(p => p.alive).map(p => ({ n: p.nickname, hp: p.hp })) });
window.__idOf  = nick => (window.__bots[0].players.find(p => p.nickname === nick)||{}).id;
window.__night = plan => { for (const [f,t] of Object.entries(plan)) { const b = window.__bots.find(x=>x.nick===f), id = window.__idOf(t); if (b&&id) b.s.emit('player:submit_night_action', { actionType:'attack', targetId:id }); } };
window.__vote  = plan => { for (const [f,t] of Object.entries(plan)) { const b = window.__bots.find(x=>x.nick===f), id = window.__idOf(t); if (b&&id) b.s.emit('player:submit_vote', { targetId:id }); } };
window.__judge = plan => { for (const [f,a] of Object.entries(plan)) { const b = window.__bots.find(x=>x.nick===f); if (b) b.s.emit('player:submit_judgement', { approve:a }); } };
```

**반드시 지킬 것 — 제출과 진행 사이에 텀을 둔다.** 제출 직후 곧바로 `host:advance_phase`를 쏘면 서버에 진행이 먼저 도착해서 제출이 통째로 유실된다. 이걸 모르면 "밤에 4명이 쳤는데 데미지가 1이다" 같은 **없는 버그**를 쫓게 된다. 어떤 페이즈에서 시작하든 끝까지 모는 드라이버:

```js
window.__run = async (opts, maxSteps = 60) => {
  const steps = [];
  for (let i = 0; i < maxSteps; i++) {
    const st = window.__state();
    if (st.phase === 'game_over') break;
    if (st.phase === 'night')           window.__night(opts.night ? opts.night(window.__roles(), st) : {});
    else if (st.phase === 'day_vote')   window.__vote (opts.vote  ? opts.vote (window.__roles(), st) : {});
    else if (st.phase === 'day_judgement') window.__judge(opts.judge ? opts.judge(window.__roles(), st) : {});
    if (['night','day_vote','day_judgement'].includes(st.phase)) await new Promise(r => setTimeout(r, 500));
    await window.__adv(1200);
    const a = window.__state();
    steps.push(`${st.phase}(R${st.round}) -> ${a.phase}(R${a.round}) | ` + a.alive.map(x=>x.n+':'+x.hp).join(' '));
  }
  return steps;
};
```

## 2. 승리조건 3종 — 각각 한 판씩 강제로 만들어 완주

역할은 서버가 무작위로 준다. **`__roles()`로 실제 역할을 읽은 뒤** 그에 맞춰 공격 대상을 정하면 원하는 승리를 만들 수 있다. 8인 기준 구성은 보스 1 · 조직원 3 · 스파이 3 · 배신자 1.

| 목표 | 방법 |
|---|---|
| **스파이 승리** | 스파이 전원이 매 밤 보스만 집중 공격. 투표는 서로 갈라 던져 동점(피해 없음)으로 흘린다. |
| **보스측 승리** | 보스+조직원이 살아있는 스파이/배신자를 하나씩 집중 공격. 낮 지목·심판 찬성까지 얹으면 빨리 끝난다. |
| **배신자 승리** | 보스는 건드리지 않고 나머지를 전부 정리해 **보스와 배신자 단 둘**만 남긴다. |

1라운드 밤은 정찰이라 행동이 없다(그냥 넘긴다).

각 판마다 확인할 것:
- `state:game_over`의 `winner` 값이 의도한 진영인가
- 종료 페이로드에 **전원 역할이 공개**되는가 (`players[].role`)
- 승리 슬라이드가 크게 뜨고 자동으로 사라지지 않는가

**배신자 승리는 특히 신경 써서 본다.** 판정 순서를 잘못 두면 이 분기는 어떤 입력으로도 실행되지 않는 죽은 코드가 되는데, 실제로 그런 적이 있었다(`docs/03라운드진행.md`의 승리 판정 순서 항목 참고).

## 3. 인원수별 UI 변화 — 6·8·10명

`ROLE_COMPOSITIONS`가 인원마다 다르고(`server/src/game/types.ts`), 진행자 화면 카드 그리드는 인원수에 따라 열 수가 바뀐다(`--player-count-half`). 최소·중간·최대를 다 본다.

- 6명 / 8명 / 10명으로 각각 방을 만들어 게임을 시작하고, **진행자 화면에서** 카드가 두 줄로 배치되는지, 카드가 잘리거나 화면 밖으로 나가지 않는지 확인한다.
- 인원이 늘면 카드가 좁아진다 — 이름·HP·조각이 다 보이는지 수치로 잰다.

## 4. 화면 3종 크기

각 화면(진행자 `/host`, 참가자 `/player`)을 아래 크기로 본다:

| 이름 | 크기 |
|---|---|
| 데스크톱 | 1920 × 1080 |
| 아이패드 | 1180 × 820 (가로), 820 × 1180 (세로) |
| 폰 | 390 × 844 |

**눈으로만 보지 말고 매번 이 지표를 재서 판정한다:**

```js
() => {
  const cards = [...document.querySelectorAll('.hp-monitor-card')];
  const clipped = cards.filter(c => {
    const p = c.querySelector('.hp-monitor-card__pips');
    return p && p.getBoundingClientRect().bottom > c.getBoundingClientRect().bottom + 1;
  }).map(c => c.querySelector('.hp-monitor-card__name').textContent);
  const t = document.querySelector('.progress-timer') || document.getElementById('timerLabel');
  return {
    vp: document.documentElement.clientWidth + 'x' + innerHeight,
    scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth, // 항상 false여야 함
    clipped,                                   // 항상 빈 배열이어야 함
    timerOverflow: t && t.scrollWidth > t.clientWidth + 1,
    rows: [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().top)))].length,
  };
}
```

**긴 닉네임(7자, 최대 길이)을 반드시 한 명 섞는다.** 이 프로젝트에서 잘림 버그는 거의 항상 긴 이름에서 나왔다. 프로필 사진도 canvas로 만들어 넣어야 실제와 같은 화면이 된다(사진이 없으면 이니셜만 떠서 문제가 안 보인다).

## 5. 고칠 것 — 네 갈래로 나눠 본다

- **화면**: 잘림, 넘침, 가로 스크롤, 겹침, 큰 화면에서 늘어짐, 말줄임(`text-overflow: ellipsis`)으로 정보가 사라지는 곳
- **순서**: 페이즈 전환 타이밍, 이벤트 순서(결과 슬라이드가 결과보다 먼저 뜨는 등), 재접속 후 상태 복원
- **기능**: 규칙 문서(`docs/02역할.md`, `03라운드진행.md`)와 실제 동작이 어긋나는 곳, 도달 불가능한 분기
- **하드코딩**: 페이즈 이름·역할 목록·인원수를 코드에 직접 박아둔 곳. 이미 있는 상수/헬퍼(`PHASE_LABELS`, `ROLE_NAMES`, `getMaxHpForRole`, `ROLE_COMPOSITIONS`)로 대체할 수 있는지 본다.

고칠 때는 **원인을 찾고 고친다.** 증상만 눌러 담으면(값 하나 키우기 등) 다른 폭에서 다시 터진다. 예: 카드가 잘린다고 글자만 줄이지 말고, 왜 본문이 넘치는지(이름이 두 줄이 됐다) 보고 그 구조를 고친다.

## 6. 검증

1. `npx tsc --noEmit` + `npm test` 통과
2. 고친 화면은 3종 크기에서 위 지표를 다시 재서 **수치로** 확인
3. 서버 로직을 고쳤으면 실제 소켓으로 시나리오를 태워 확인 (유닛 테스트로 못 잡는 것들이 있다 — 재접속, 중복 제출 등)
4. 푸시했으면 `curl -s {배포판}/style.css | grep -c "<고친 규칙>"`로 배포 반영 확인

## 7. 기록 — 개발로그 + 개발메모

**`docs/10개발로그.md`** (`개발로그` 스킬 규칙 그대로): 오늘 날짜 섹션에 **완료한 것만** 굵은 제목 + 원인/해결로 적는다. 이번 QA에서 무엇을 어떻게 돌렸는지(몇 인, 어떤 승리, 어떤 크기)와 찾은 버그의 **원인**을 남긴다. 기존 항목은 수정하지 않고 덧붙이기만 한다.

**`docs/09개발메모.md`**: 이번에 **안 고치고 남긴 것**을 "다음에 할 일"에 적는다. 왜 남겼는지(범위 밖, 판단 필요, 비용 대비 효과 낮음)를 같이 적어야 나중에 다시 판단할 수 있다. 사용자 결정이 필요한 항목은 그렇게 표시한다.

## 8. 커밋

`커밋푸시` 스킬과 달리 **커밋까지만** 한다(푸시 여부는 사용자가 정한다). 단, 배포판에서 검증이 필요해 이미 푸시했다면 그 사실을 보고에 명시한다.

커밋은 성격별로 나눈다 — 화면 수정, 로직 수정, 문서를 한 덩어리로 묶지 않는다. 메시지에는 **무엇을 고쳤는지가 아니라 왜 그게 문제였는지**를 적는다.

## 9. 마지막 보고

사용자가 자고 일어나서 읽는다고 생각하고 쓴다:

- 돌린 판 수와 각 판의 결과(승리 진영, 라운드 수)
- 찾은 문제와 **원인** — 증상만 나열하지 않는다
- 고친 것 / 안 고치고 남긴 것(이유 포함)
- 내가 판단해서 정한 것들(사용자가 뒤집을 수 있게)
- 검증 결과(테스트 개수, 3종 크기 지표)

**하네스 문제와 제품 버그를 반드시 구분해서 보고한다.** 내 테스트 도구가 잘못해서 나온 현상을 제품 버그로 보고하면 사용자가 없는 버그를 쫓게 된다.

## 주의

- 봇 소켓을 만든 탭을 새로고침하면 봇이 전부 끊긴다. 로비에서 끊기면 60초 유예 뒤 방에서 제거된다(`LOBBY_DISCONNECT_GRACE_MS`).
- 한 소켓은 한 방에 한 자리만 차지한다. 같은 소켓으로 두 번 입장하면 거부된다(중복 입장 방지).
- 최대 인원은 10명이다. 방에 이미 사람이 있으면 그만큼 봇을 줄인다.
- 방 코드는 서버가 무작위로 만든다. 하드코딩하지 말고 `host:create_room` 콜백에서 받는다.
- 판을 새로 돌릴 때는 방을 새로 만든다. 끝난 방을 재사용하지 않는다.
