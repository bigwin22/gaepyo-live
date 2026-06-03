# 개표라이브

2026년 6월 3일 제9회 전국동시지방선거 개표 상황을 한 화면에서 빠르게 확인하는 실시간 개표 허브입니다.

운영 사이트: [https://vote.gubiko.com](https://vote.gubiko.com)

## 무엇을 볼 수 있나

- 전국 개표율, 집계 지역 수, 투표수, 유효표 요약
- 시도지사, 구시군장, 시도의원, 구시군의원, 비례대표, 교육감, 국회의원 보궐선거 개표 현황
- 지역별 후보 순위, 득표율, 득표수, 1-2위 격차
- 지역 검색과 세부 지역 선택
- SBS, MBC, TV조선 개표방송 임베드
- 선관위 공식 개표 페이지 바로가기
- 모바일에서도 바로 읽히는 반응형 화면

## 정확도 원칙

이 서비스는 예측이나 자체 판정을 만들지 않습니다. 후보별 득표율, 개표율, 표수는 중앙선거관리위원회 선거통계시스템 응답을 파싱한 값만 표시합니다.

공식 확인이 필요한 경우 사이트 하단의 선관위 링크를 사용하세요. 선관위 HTML 구조가 바뀌거나 공식 서버 응답이 지연되면 화면에도 오류 또는 저장 데이터 상태가 표시됩니다.

## 갱신 방식

접속 UX와 정확도를 함께 맞추기 위해 두 단계로 동작합니다.

1. 사용자가 접속하면 브라우저 캐시와 `data/latest.json` 저장 데이터를 먼저 보여줍니다.
2. Vercel 서버리스 API가 `api/latest?live=1`로 선관위 데이터를 백그라운드 수집합니다.
3. 최신 수집 결과가 도착하면 화면이 자동으로 교체됩니다.
4. 브라우저는 60초마다 개표 데이터만 갱신합니다. 유튜브 iframe은 다시 로드하지 않습니다.

기본 `/api/latest` 요청은 빠른 응답을 위해 저장 캐시를 반환합니다. 실제 실시간 수집은 `/api/latest?live=1`에서 수행됩니다.

## 기술 구성

- Frontend: React 18 ESM, htm, plain CSS
- Hosting: Vercel
- Data API: Vercel Serverless Function
- Data source: 중앙선거관리위원회 선거통계시스템 `VCCP09`
- Automation: GitHub Actions
- Analytics: Vercel Web Analytics, Vercel Speed Insights

번들러 없이 브라우저 ESM URL을 직접 import합니다. 이 구조는 정적 페이지처럼 빠르게 배포하면서도 Vercel API를 붙이기 위한 선택입니다.

## 주요 파일

- `index.html`: SEO 메타, JSON-LD, React root
- `app.js`: 화면 전체 React 컴포넌트와 자동 갱신 로직
- `styles.css`: 반응형 UI 스타일
- `api/latest.js`: 캐시 응답과 실시간 수집 API
- `scripts/fetch-nec-results.mjs`: 선관위 HTML 표 수집/파싱
- `scripts/prepare-seo.mjs`: 최신 데이터 기반 SEO 파일 갱신
- `data/latest.json`: 저장 개표 데이터와 후보 사진 캐시
- `.github/workflows/update-results.yml`: 자동 데이터 갱신 워크플로
- `agents.md`: 다른 에이전트가 이어서 작업하기 위한 상세 운영 문서

## 수집 대상 선거

현재 수집 스크립트는 다음 선거 종류를 처리합니다.

- 국회의원선거
- 시도지사선거
- 구시군장선거
- 시도의회의원선거
- 구시군의회의원선거
- 광역의원비례대표선거
- 기초의원비례대표선거
- 교육감선거

## 로컬 실행

의존성 설치:

```sh
npm install
```

정적 서버 실행:

```sh
python3 -m http.server 4183
```

브라우저에서 `http://127.0.0.1:4183/`을 엽니다.

## 데이터 수집

저장 데이터를 갱신합니다.

```sh
npm run fetch:nec
```

후보 사진까지 다시 채워야 할 때만 다음 명령을 사용합니다. 평소에는 트래픽 절약을 위해 기존 사진 캐시를 재사용합니다.

```sh
node scripts/fetch-nec-results.mjs --out data/latest.json --with-photos
```

SEO 파일 갱신:

```sh
npm run prepare-seo
```

## 검증

문법 확인:

```sh
node --check app.js
node --check api/latest.js
node --check scripts/fetch-nec-results.mjs
node --check scripts/prepare-seo.mjs
```

운영 API 확인:

```sh
tmp=$(mktemp)
curl -w "\ntime_total=%{time_total}\n" -fsS -D "$tmp" -o /tmp/gaepyo-live.json "https://vote.gubiko.com/api/latest?live=1"
sed -n '1,24p' "$tmp"
node -e 'const j=require("/tmp/gaepyo-live.json"); console.log({mode:j.delivery?.mode, generatedAt:j.generatedAt, elections:j.elections?.length, errors:j.errors})'
```

SEO 확인:

```sh
curl -fsSL "https://vote.gubiko.com/" | rg "canonical|og:url|vote.gubiko.com"
curl -fsSL "https://vote.gubiko.com/robots.txt"
curl -fsSL "https://vote.gubiko.com/sitemap.xml"
```

## 배포

Vercel 프로덕션 배포:

```sh
npx --yes vercel deploy --prod --yes
```

배포 성공 후 출력에 다음 alias가 표시되어야 합니다.

```text
Aliased https://vote.gubiko.com
```

GitHub Pages는 운영 배포 채널로 사용하지 않습니다. 운영 URL은 `https://vote.gubiko.com/`입니다.

## 운영 메모

- 실시간 수집은 첫 요청에서 40초 이상 걸릴 수 있습니다. 화면은 이미 저장 캐시를 보여주므로 사용자가 빈 화면을 보지 않아야 합니다.
- 1분 내 반복 요청은 Vercel 캐시 또는 서버리스 메모리 캐시로 빨라질 수 있습니다.
- 방송 iframe은 데이터 갱신과 분리되어야 합니다.
- 선관위 응답 구조가 바뀌면 `scripts/fetch-nec-results.mjs`의 파서를 먼저 확인하세요.
- 더 자세한 인수인계 문서는 `agents.md`를 참고하세요.
