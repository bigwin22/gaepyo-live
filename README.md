# gaepyo-live

2026년 6월 3일 제9회 전국동시지방선거 개표 상황을 빠르게 확인하기 위한 GitHub Pages 정적 사이트입니다.

## 제공 기능

- 중앙선거관리위원회 선거통계시스템 공식 링크와 개표소 현황 링크
- GitHub Actions가 생성하는 `data/latest.json` 기반 전국 개표 요약과 브라우저 60초 자동 갱신
- 선택 지역의 후보별 순위, 득표율, 득표수, 1-2위 격차 표시
- SBS/MBC/TV조선 공식 유튜브 개표방송을 페이지 안에서 바로 시청
- 모바일 390px 폭에서도 검색, 공식 링크, 후보 경합 카드가 읽히는 반응형 UI

## 공식 확인 사실

- 공식 선거통계시스템 페이지:
  - 개표진행상황: `VCCP09`
  - 개표단위별 개표결과: `VCCP08`
- 데이터 수집 엔드포인트:
  - `POST https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml`
- 제9회 전국동시지방선거 ID:
  - `electionId=0020260603`
- 현재 수집 스크립트는 `VCCP09`의 시·도지사선거(`electionCode=3`)와 교육감선거(`electionCode=11`) 개표진행상황 표를 호출합니다.

## 준실시간 구조

GitHub Pages의 브라우저 JavaScript가 선관위에 직접 POST 요청을 보내면 CORS 또는 정책 변경에 막힐 수 있습니다. 그래서 이 사이트는 다음 구조를 사용합니다.

1. GitHub Actions가 5분 주기 또는 수동 실행으로 선관위 POST 엔드포인트를 호출합니다.
2. `scripts/fetch-nec-results.mjs`가 HTML 표를 파싱합니다.
3. 결과를 `data/latest.json`에 저장하고 변경이 있으면 자동 커밋합니다.
4. Pages UI는 같은 저장소의 `data/latest.json`을 읽어 화면을 갱신합니다.

GitHub Actions schedule은 지연될 수 있으므로 초 단위 실시간을 보장하지 않습니다. 공식 원문 확인이 필요하면 화면 상단의 선관위 링크를 사용하세요.

## 로컬 실행

정적 파일만 사용하므로 간단한 HTTP 서버로 확인할 수 있습니다.

```sh
python3 -m http.server 4173
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다.

## 데이터 수집

실제 선관위 호출:

```sh
node scripts/fetch-nec-results.mjs --out data/latest.json
```

로컬 fixture HTML로 파서만 검증:

```sh
node scripts/fetch-nec-results.mjs --fixture /path/to/vccp09.html --out /tmp/latest.json
```

`data/latest.json`의 `status` 값:

- `ok`: 공식 응답 파싱 성공
- `initial`: 아직 공식 데이터 갱신 전
- `fixture`: 로컬 fixture 검증 결과
- `empty`: 공식 표가 비어 있음
- `error`: 수집 또는 파싱 실패

## GitHub Pages 배포

1. GitHub 저장소의 `Settings > Pages`로 이동합니다.
2. `Build and deployment`에서 `Deploy from a branch`를 선택합니다.
3. Branch는 `master`, 폴더는 `/root`를 선택합니다.
4. 저장 후 Pages URL이 생성될 때까지 기다립니다.

데이터 자동 갱신을 위해 `Settings > Actions > General`에서 Actions가 활성화되어 있어야 합니다. 수동 검증은 `Actions > Update NEC results > Run workflow`로 실행합니다.

## 개발 메모

- 언론사 방송은 당일 확인된 SBS/MBC/TV조선 개표방송을 페이지 안에서 바로 보여줍니다. 방송이 종료되면 카드의 `유튜브에서 보기` 링크로 확인할 수 있습니다.
- 현재 표시 영상은 SBS `qdSrfJWkPlM`, MBC `SPDq9vB0pYs`, TV조선 `EeDftZ8E244`입니다.
- KBS 개표 라이브 `hMILhRIIOaI`, `KvpScfnaXtA`도 확인했지만 현재 YouTube iframe에서 직접 재생이 막혀 있어 직접 시청 목록에서는 제외했습니다.
- 후보/득표/개표율 값은 `data/latest.json`에 들어온 공식 POST 파싱 결과만 표시합니다.
- `errors`는 핵심 시·도지사선거 수집 실패에 사용하고, 교육감선거처럼 보조 수집 실패는 `warnings`로 분리합니다.
- 선관위 HTML 구조가 바뀌면 `scripts/fetch-nec-results.mjs`의 `parseVccp09`를 조정해야 합니다.
