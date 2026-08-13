# Heat Chess

체스 기물이 움직일수록 달아오르는 변형 체스. 브라우저에서 바로 플레이.

## 규칙

일반 체스와 같되 `heat` 가 추가된다.

- 기물이 움직이면 그 기물의 heat +1
- 이번 턴에 움직이지 않은 내 기물은 heat -1
- heat 가 4 에 닿으면 **과열** — 그 기물은 내 턴 2번 동안 움직일 수 없고, 풀리면 heat 0 으로 돌아간다
- 킹은 과열되지 않는다 (아니면 체크를 피하지 못해 게임이 막힌다)
- 캐슬링은 룩도 함께 달아오른다
- 내 기물이 전부 과열되면 그 턴은 자동으로 넘어간다. 단 체크 상태라면 패배 (히트메이트)

## 실행

```sh
bun install
bun run dev     # http://localhost:3000
bun test
bun run build   # dist/
```

## 배포

`main` 에 push 하면 GitHub Actions 가 빌드해서 GitHub Pages 로 올린다.
저장소 Settings → Pages → Source 를 **GitHub Actions** 로 한 번 설정해두면 된다.
