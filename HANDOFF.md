# Handoff: gaepyo-live

## Current status

- Local repo: `/Users/kth88/Documents/선거 실시간`
- GitHub repo: `https://github.com/bigwin22/gaepyo-live`
- Branch: `master`
- Current pushed commit: `66d30f0268d152900511aa98a8694f38aefb2532`
- GitHub Pages is not enabled yet. Enable with Settings > Pages > Deploy from a branch > `master` > `/root`.

## User goal

Build a fast, simple, viral/shareable GitHub Pages site for the 2026-06-03 Korean local election count.

Required experience:

- Top: official NEC live CCTV/results access and region search bar.
- Below: up to 3 live YouTube streams from major media outlets.
- Below: national count status and selected region's candidate race/lead status.
- Must prioritize speed and accuracy.
- User wants meaningful Git history and source pushed to GitHub early.
- User prefers orchestration: use subagents for GitHub/admin/research tasks while main agent focuses on core implementation.

## What is already done

Initial static site scaffold was committed and pushed:

- `README.md`
- `index.html`
- `styles.css`
- `app.js`

The current UI is only a scaffold. It has:

- Region search list
- Official NEC links
- Broadcast link cards
- Placeholder race panel

## NEC source investigation so far

Official election system page:

- `https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP09`
- `VCCP09` = 개표진행상황
- `VCCP08` = 개표단위별 개표결과

Important POST endpoint:

- `https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml`

Known form fields for `VCCP09`:

```txt
electionId=0020260603
requestURI=/electioninfo/0020260603/vc/vccp09.jsp
topMenuId=VC
secondMenuId=VCCP09
menuId=VCCP09
statementId=VCCP09_#3
electionCode=3
cityCode=-1
townCode=-1
sggCityCode=-1
sggTownCode=-1
```

Known `VCCP09` statementId mapping found in official page script:

```txt
1  -> VCCP09_#1
2  -> VCCP09_#2
3  -> VCCP09_#3       시·도지사선거
4  -> VCCP09_#4       구·시·군의 장선거
5  -> VCCP09_#5_0
6  -> VCCP09_#6_0
7  -> VCCP09_#7
8  -> VCCP09_#8
9  -> VCCP09_#9
10 -> VCCP09_#10_0
11 -> VCCP09_#11      교육감선거
20 -> VCCP09_#20
```

Known `VCCP08` core fields:

```txt
electionId=0020260603
requestURI=/electioninfo/0020260603/vc/vccp08.jsp
topMenuId=VC
secondMenuId=VCCP08
menuId=VCCP08
statementId=VCCP08_#00
electionCode=3
cityCode=1100
townCode=-1
sggCityCode=-1
sggTownCode=-1
townCodeFromSgg=-1
```

Official `VCCP08` page has city codes:

```txt
1100 서울특별시
2600 부산광역시
2700 대구광역시
2800 인천광역시
2900 광주광역시
3000 대전광역시
3100 울산광역시
5100 세종특별자치시
4100 경기도
5200 강원특별자치도
4300 충청북도
4400 충청남도
5300 전북특별자치도
4600 전라남도
4700 경상북도
4800 경상남도
4900 제주특별자치도
```

Likely architecture:

- Do not rely on browser direct fetch from GitHub Pages unless CORS is verified.
- Safer approach: GitHub Actions scheduled/manual workflow runs a Node script, POSTs to NEC, parses HTML tables, writes `data/latest.json`, commits it back.
- GitHub Pages reads same-origin `data/latest.json` and updates UI every 30-60 seconds with cache busting.
- For true high-frequency live updates, a separate server/proxy would be better, but user asked to prefer GitHub Pages over Vercel.

## Next implementation steps

1. Add `scripts/fetch-nec-results.mjs`.
   - Use built-in `fetch`.
   - POST VCCP09 for key election codes, at least 3 and 11 first.
   - Parse table HTML with a lightweight parser. For no dependencies, use `node:util`/regex carefully after inspecting table structure; for reliability, add `cheerio` and document dependency.
   - Output `data/latest.json`.

2. Add GitHub Actions workflow:
   - `.github/workflows/update-results.yml`
   - `workflow_dispatch`
   - `schedule` maybe every 5 minutes. GitHub does not guarantee sub-minute schedules.
   - Commit updated `data/latest.json` only when changed.

3. Update `app.js`.
   - Fetch `./data/latest.json?ts=...`
   - Render national summary and selected region candidate rankings.
   - Show source timestamp and stale warning.
   - If JSON missing/stale, keep official NEC links prominent.

4. Improve broadcast cards.
   - YouTube embed for fixed live video IDs only if current live video IDs are verified.
   - Otherwise link to channel `/streams` pages to avoid broken embeds.
   - Candidates: KBS News, MBC News, SBS News, YTN. Max 3 per user request.

5. Enable Pages.
   - If using `gh api`, check whether repo Pages can be enabled programmatically.
   - Otherwise final handoff says Settings > Pages > Deploy from a branch > `master` > `/root`.

## Useful commands

```sh
cd "/Users/kth88/Documents/선거 실시간"
git status --short --branch
git remote -v
git log --oneline --decorate --max-count=5
```

Manual NEC test:

```sh
curl -sSL 'https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'electionId=0020260603&requestURI=%2Felectioninfo%2F0020260603%2Fvc%2Fvccp09.jsp&topMenuId=VC&secondMenuId=VCCP09&menuId=VCCP09&statementId=VCCP09_%233&electionCode=3&cityCode=-1&townCode=-1&sggCityCode=-1&sggTownCode=-1'
```

