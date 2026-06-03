# AGENTS.md

이 문서는 다른 Codex/자동화 에이전트가 `gaepyo-live` 작업을 이어받기 위한 운영 가이드다. 정확도와 배포 속도가 중요하므로, 변경 전후로 데이터 흐름과 공개 URL 검증을 반드시 확인한다.

## 현재 운영 상태

- 운영 URL: `https://vote.gubiko.com/`
- Vercel 프로젝트: 로컬 `.vercel/project.json`에 연결 정보가 있다. `.vercel`은 커밋하지 않는다.
- GitHub 저장소: `bigwin22/gaepyo-live`
- 기본 브랜치: `master`
- GitHub Pages는 운영 URL로 쓰지 않는다. Vercel 서버리스 API가 있는 `vote.gubiko.com`이 기준이다.

## 사이트 구조

- `index.html`: SEO 메타, JSON-LD, `#root`, React ESM entry만 둔다.
- `app.js`: React 18 + htm 기반 전체 UI. 번들러 없이 브라우저 ESM URL을 직접 import한다.
- `styles.css`: 전체 반응형 스타일.
- `api/latest.js`: Vercel 서버리스 API. 기본 요청은 저장 캐시를 즉시 반환하고, `?live=1` 요청만 선관위 실시간 수집을 수행한다.
- `scripts/fetch-nec-results.mjs`: 선관위 `VCCP09` HTML 표 수집/파싱 스크립트.
- `scripts/prepare-seo.mjs`: 최신 데이터 기반 SEO 문구/사이트맵 갱신.
- `data/latest.json`: 저장 캐시 데이터. 초기 표시와 후보 사진 캐시에 사용된다.
- `.github/workflows/update-results.yml`: GitHub Actions 데이터 갱신 루프. 5분 schedule 안에서 60초 간격 5회 수집한다.
- `robots.txt`, `sitemap.xml`, `site.webmanifest`: 운영 도메인 `https://vote.gubiko.com/` 기준 SEO 파일.
- `assets/`: 아이콘/OG 이미지 등 정적 SEO 자산.

## 데이터 흐름

1. 사용자가 접속하면 `app.js`가 먼저 브라우저 `localStorage` 캐시와 `data/latest.json`을 읽어 즉시 화면을 표시한다.
2. Vercel 운영 환경에서는 이후 `./api/latest?live=1`을 백그라운드로 호출한다.
3. `api/latest.js?live=1`은 선관위 `POST https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml`에서 `VCCP09` 표를 수집한다.
4. 최신 수집 결과가 오면 화면을 교체하고 브라우저 캐시에 저장한다.
5. `./api/latest` 기본 요청은 접속 UX를 위해 `data/latest.json`을 즉시 반환한다.
6. GitHub Actions는 주기적으로 `data/latest.json`, `index.html`, `sitemap.xml`을 갱신하고 자동 커밋한다.

## 선거 데이터 범위

`scripts/fetch-nec-results.mjs`는 다음 선거종류를 수집한다.

- `2`: 국회의원선거
- `3`: 시도지사선거
- `4`: 구시군장선거
- `5`: 시도의회의원선거
- `6`: 구시군의회의원선거
- `8`: 광역의원비례대표선거
- `9`: 기초의원비례대표선거
- `11`: 교육감선거

핵심 결과 정확도는 `data/latest.json`과 선관위 원문 링크를 기준으로 확인한다. 선관위 HTML 구조가 바뀌면 `parseVccp09` 계열 파서를 먼저 점검한다.

## 프론트엔드 주의사항

- 이 프로젝트는 Vite/Next 번들러를 쓰지 않는다. 브라우저에서 바로 동작하는 ESM URL import를 사용한다.
- `@vercel/analytics`와 `@vercel/speed-insights`는 npm dependency에 있지만, `app.js`에서는 esm.sh URL로 import한다.
- 유튜브 iframe은 개표 데이터 1분 갱신 때 다시 생성되면 안 된다. 방송 영역 컴포넌트와 데이터 영역 상태 변경을 분리해서 유지한다.
- `AUTO_REFRESH_SECONDS`는 60초가 기준이다.
- 접속 UX를 망치지 않도록 캐시를 먼저 보여주고 live 수집은 백그라운드로 유지한다.
- 후보 사진은 매번 새로 받지 않는다. `data/latest.json`의 기존 photo cache를 재사용한다.

## 로컬 실행

정적 UI 확인:

```sh
python3 -m http.server 4183
```

브라우저에서 `http://127.0.0.1:4183/`을 연다. 포트가 사용 중이면 기존 서버가 이 디렉터리를 보고 있는지 확인하거나 다른 포트를 쓴다.

문법 확인:

```sh
node --check app.js
node --check api/latest.js
node --check scripts/fetch-nec-results.mjs
node --check scripts/prepare-seo.mjs
```

의존성 확인:

```sh
npm ls @vercel/analytics @vercel/speed-insights
```

## 데이터 수집 명령

기본 수집:

```sh
npm run fetch:nec
```

직접 실행:

```sh
node scripts/fetch-nec-results.mjs --out data/latest.json
```

후보 사진까지 다시 채울 때만:

```sh
node scripts/fetch-nec-results.mjs --out data/latest.json --with-photos
```

SEO 재생성:

```sh
npm run prepare-seo
```

## Vercel 배포

프로덕션 배포:

```sh
npx --yes vercel deploy --prod --yes
```

성공 시 출력에서 `Aliased https://vote.gubiko.com`을 확인한다. 임시 worktree에서 배포할 때 `.vercel/project.json`이 없으면 기존 프로젝트가 아닌 새 프로젝트로 인식될 수 있다. 이 경우 메인 작업 폴더의 `.vercel/project.json`을 임시 worktree의 `.vercel/project.json`으로 복사한 뒤 다시 배포한다.

배포 후 필수 확인:

```sh
curl -fsSL "https://vote.gubiko.com/?verify=$(date +%s)" | rg "canonical|og:url|vote.gubiko.com"
curl -fsSL "https://vote.gubiko.com/robots.txt?verify=$(date +%s)"
curl -fsSL "https://vote.gubiko.com/sitemap.xml?verify=$(date +%s)"
curl -fsSL "https://vote.gubiko.com/app.js?verify=$(date +%s)" | rg "LIVE_REFRESH_ENDPOINT|Analytics|SpeedInsights"
```

API 확인:

```sh
tmp=$(mktemp)
curl -w "\ntime_total=%{time_total}\n" -fsS -D "$tmp" -o /tmp/gaepyo-default.json "https://vote.gubiko.com/api/latest"
sed -n '1,24p' "$tmp"
node -e 'const j=require("/tmp/gaepyo-default.json"); console.log({mode:j.delivery?.mode, generatedAt:j.generatedAt, elections:j.elections?.length, errors:j.errors})'
```

`/api/latest`는 `serverless-static-cache`가 정상이다. 실시간 수집 확인은 다음을 사용한다.

```sh
tmp=$(mktemp)
curl -w "\ntime_total=%{time_total}\n" -fsS -D "$tmp" -o /tmp/gaepyo-live.json "https://vote.gubiko.com/api/latest?live=1"
sed -n '1,24p' "$tmp"
node -e 'const j=require("/tmp/gaepyo-live.json"); console.log({mode:j.delivery?.mode, generatedAt:j.generatedAt, elections:j.elections?.length, errors:j.errors})'
```

`?live=1` 첫 요청은 선관위 수집 때문에 40초 이상 걸릴 수 있다. 화면은 이미 캐시를 보여주므로 사용자 UX는 막히지 않아야 한다. 1분 내 재요청은 Vercel 캐시 HIT로 빨라질 수 있다.

## Git 작업 규칙

- 브랜치명은 `codex/` prefix를 사용한다.
- 변경 범위를 좁게 유지한다. 데이터/API/UI/SEO 변경을 가능한 별도 커밋으로 나눈다.
- 사용자 변경이 섞여 있으면 되돌리지 말고, 필요한 경우 깨끗한 `git worktree`를 만들어 작업한다.
- `node_modules`, `.vercel`, `.DS_Store`는 커밋하지 않는다.
- 커밋 메시지는 한국어로 작성한다.
- PR을 만들고 병합한 뒤 Vercel 프로덕션 배포까지 진행하는 것이 기본 완료 기준이다.

일반 흐름:

```sh
git switch -c codex/<task-name>
# edit
node --check app.js
node --check api/latest.js
git add <changed files>
git commit -m "<한국어 메시지>"
git push -u origin codex/<task-name>
gh pr create --base master --head codex/<task-name> --title "[codex] <제목>" --body "<요약/확인>"
gh pr merge <PR번호> --squash --delete-branch --subject "<제목>" --body "<요약>"
npx --yes vercel deploy --prod --yes
```

## 정확도 체크리스트

- `data/latest.json`의 `generatedAt`, `elections.length`, `errors`를 확인한다.
- 후보 우세율, 개표율, 표수는 선관위 파싱 결과만 표시한다.
- 오류가 핵심 선거종류에 있으면 UI에서 숨기지 않는다.
- `warnings`와 `errors`를 혼동하지 않는다.
- 자동 갱신이 유튜브 iframe을 다시 로드하지 않는지 확인한다.
- SEO URL은 항상 `https://vote.gubiko.com/` 기준으로 유지한다.
