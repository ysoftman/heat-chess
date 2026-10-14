# Heat Chess

체스 기물이 움직일수록 달아오르는 변형 체스. 브라우저에서 바로 플레이.

## 규칙

일반 체스와 같되 `heat` 가 추가된다.

- 기물이 움직이면 그 기물의 heat +1
- 같은 순간, 움직이지 않은 내 기물은 heat -1 — 정산은 **내가 수를 둘 때만** 일어난다.
  상대 차례에는 내 기물이 식지 않는다
- heat 가 4 에 닿으면 **과열** — 그 기물은 내 턴 2번 동안 움직일 수 없고, 풀리면 heat 0 으로 돌아간다
- 킹은 과열되지 않는다 (아니면 체크를 피하지 못해 게임이 막힌다)
- 캐슬링은 룩도 함께 달아오른다
- 내 기물이 전부 과열되면 그 턴은 자동으로 넘어간다. 단 체크 상태라면 패배 (히트메이트)

### 에어컨 체스 (❄️ 모드)

- 시작할 때 내 기물 하나(킹 제외)를 몰래 에어컨 기물로 지정한다 — 상대에게는 보이지 않는다
- 에어컨 기물이 잡히면 그 즉시 패배
- 이 모드에서는 히트 규칙을 쓰지 않는다 — 열도 과열 잠금도 없다

### 일반 체스

변형 규칙 없는 보통 체스. 열도 과열 잠금도 아이템도 없다.

## 실행

```sh
bun install
bun run dev     # http://localhost:3000
bun test
bun run build   # dist/
```

## 리소스 출처

기물 이미지는 [lichess-org/lila](https://github.com/lichess-org/lila) 의
`public/piece/cburnett` 세트를 그대로 가져와 `src/piece/` 에 두었다.
카툰 세트(`src/piece/cartoon/`)는 "Cartoon Chess Piece Icon Sheet" 이미지를 12조각으로 잘라
webp 로 변환한 것이다. 우측 패널의 기물 셀렉트로 바꿀 수 있다.
치비 세트(`src/piece/chibi/`, 기본값)와 `src/icon/` 의 아이콘(열 단계·잠금, 아이템,
사운드·타이머·되돌리기 등)은 "Chibi Chess Game Asset Atlas" 에서 잘라낸 것이다.
배경이 흐린 그라데이션이라 macOS Vision 의 전경 추출(subject lift)로 배경을 지웠다.
파괴 연출은 아틀라스에 킹 스트립만 있어 색별 하나를 모든 기물이 공용한다.

효과음은 리소스 없이 WebAudio 오실레이터로 합성한다 (이동 / 캡처 / 과열 / 체크).

## 배포

`main` 에 push 하면 GitHub Actions 가 빌드해서 GitHub Pages 로 올린다.
저장소 Settings → Pages → Source 를 **GitHub Actions** 로 한 번 설정해두면 된다.
