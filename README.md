# gaepyo-live

2026년 6월 3일 제9회 전국동시지방선거 개표 상황을 빠르게 확인하기 위한 GitHub Pages 정적 사이트입니다.

## 제공 기능

- 중앙선거관리위원회 선거통계시스템 공식 링크와 개표소 현황 링크
- GitHub Actions가 생성하는 `data/latest.json` 기반 전국 개표 요약과 브라우저 60초 자동 갱신
- 선택 지역의 시도지사, 구시군장, 지방의원, 비례대표, 교육감, 국회의원 보궐선거 후보별 순위, 득표율, 득표수, 1-2위 격차 표시
- SBS/MBC/TV조선 공식 유튜브 개표방송을 페이지 안에서 바로 시청
- 모바일 390px 폭에서도 검색, 선거종류 탭, 후보 경합 카드가 읽히는 반응형 UI

## 공식 확인 사실

- 공식 선거통계시스템 페이지:
  - 개표진행상황: `VCCP09`
  - 개표단위별 개표결과: `VCCP08`
- 데이터 수집 엔드포인트:
  - `POST https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml`
- 제9회 전국동시지방선거 ID:
  - `electionId=0020260603`
- 현재 수집 스크립트는 `VCCP09`의 시·도지사선거(`electionCode=3`), 구·시·군의 장선거(`4`), 시·도의회의원선거(`5`), 구·시·군의회의원선거(`6`), 광역의원비례대표선거(`8`), 기초의원비례대표선거(`9`), 교육감선거(`11`), 국회의원선거(`2`) 개표진행상황 표를 호출합니다.

## 준실시간 구조

GitHub Pages의 브라우저 JavaScript가 선관위에 직접 POST 요청을 보내면 CORS 또는 정책 변경에 막힐 수 있습니다. 그래서 이 사이트는 다음 구조를 사용합니다.

1. GitHub Actions가 5분 주기 또는 수동 실행으로 시작되고, 실행 중 60초 간격으로 5회 선관위 POST 엔드포인트를 호출합니다.
2. `scripts/fetch-nec-results.mjs`가 HTML 표를 파싱합니다.
3. 결과를 `data/latest.json`에 저장하고 변경이 있으면 자동 커밋합니다.
4. Pages UI는 같은 저장소의 `data/latest.json`을 읽어 화면을 갱신합니다.

GitHub Actions schedule 자체는 GitHub 정책상 5분보다 짧게 예약할 수 없어, 워크플로 내부 루프로 1분 단위 갱신에 가깝게 맞춥니다. schedule은 지연될 수 있으므로 초 단위 실시간을 보장하지 않습니다. 공식 원문 확인이 필요하면 화면 하단의 선관위 링크를 사용하세요.

정확도 우선 운영 URL은 Vercel 배포인 `https://gaepyo-live.vercel.app/`입니다. 이 URL은 `api/latest.js` 서버리스 함수가 있어 `지금 갱신` 클릭 시 선관위 데이터를 즉시 다시 수집합니다. GitHub Pages URL은 정적 fallback 확인용입니다.

## 프론트엔드 구조

UI는 React 18 ESM과 htm을 브라우저에서 직접 로드해 렌더링합니다. 별도 Vite 빌드 산출물 없이 GitHub Pages의 루트 배포 구조를 유지하기 위한 선택입니다. `index.html`은 `#root`와 module script만 제공하고, 실제 화면 상태는 `app.js`의 React 컴포넌트가 관리합니다.

## 실시간 갱신 방식

정확한 온디맨드 갱신은 서버리스 API가 있는 배포에서 동작합니다. `api/latest.js`는 요청 시점에 선관위 `VCCP09` 응답을 새로 수집하고, 브라우저의 `지금 갱신` 버튼은 먼저 `./api/latest`를 호출합니다. Vercel 같은 서버리스 배포에서는 버튼을 누르는 순간 공식 데이터를 다시 수집합니다.

GitHub Pages는 정적 호스팅이라 `./api/latest`가 없으므로 `data/latest.json`으로 fallback합니다. 이 경우 UI는 `저장 데이터 표시`로 상태를 바꿔, 사용자가 실시간 API가 아니라 저장 JSON을 보고 있다는 점을 숨기지 않습니다.

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

기본 수집은 트래픽 절약을 위해 후보 사진을 새로 요청하지 않고 기존 `data/latest.json`의 사진 URL만 재사용합니다. 사진을 다시 채워야 할 때만 다음처럼 실행합니다.

```sh
node scripts/fetch-nec-results.mjs --out data/latest.json --with-photos
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
- 브라우저 자동 갱신은 개표 데이터 영역만 다시 그리며, 유튜브 iframe은 재생 중 다시 생성하지 않습니다.
- `errors`는 핵심 시·도지사선거 수집 실패에 사용하고, 다른 선거종류의 보조 수집 실패는 `warnings`로 분리합니다.
- 선관위 HTML 구조가 바뀌면 `scripts/fetch-nec-results.mjs`의 `parseVccp09`를 조정해야 합니다.
