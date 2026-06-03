#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from pathlib import Path


SEO_RELEVANT_PREFIXES = (
    ".codex/",
    ".github/workflows/",
    "api/",
    "assets/",
    "data/",
    "region/",
    "scripts/",
)

SEO_RELEVANT_FILES = {
    "AGENTS.md",
    "agents.md",
    "app.js",
    "index.html",
    "package-lock.json",
    "package.json",
    "README.md",
    "robots.txt",
    "site.webmanifest",
    "sitemap.xml",
    "styles.css",
    "vercel.json",
}

CHECK_COMMANDS = [
    ["node", "--check", "app.js"],
    ["node", "--check", "api/latest.js"],
    ["node", "--check", "scripts/fetch-nec-results.mjs"],
    ["node", "--check", "scripts/prepare-seo.mjs"],
]


def main() -> int:
    hook_input = read_hook_input()
    repo = git_root(Path(hook_input.get("cwd") or os.getcwd()))
    if repo is None:
        return 0
    os.chdir(repo)

    changed = changed_files()
    ahead_files = ahead_of_master_files()
    relevant = sorted({path for path in changed | ahead_files if is_seo_relevant(path)})
    if not relevant:
        return 0

    messages = []
    prepare = run(["npm", "run", "prepare-seo"])
    if prepare.returncode != 0:
        return block(
            "SEO/sitemap 재생성 실패",
            [
                "SEO 영향 파일 변경이 감지됐지만 `npm run prepare-seo`가 실패했습니다.",
                "실패 원인을 수정한 뒤 다시 실행하세요.",
                tail(prepare.stderr or prepare.stdout),
            ],
        )

    for command in CHECK_COMMANDS:
        result = run(command)
        if result.returncode != 0:
            return block(
                "SEO 훅 문법 검사 실패",
                [
                    f"`{' '.join(command)}` 실패.",
                    "수정 후 SEO/sitemap 재생성과 배포를 다시 진행하세요.",
                    tail(result.stderr or result.stdout),
                ],
            )

    sitemap_check = run(["rg", "-q", "https://vote.gubiko.com/region/seoul/election/education", "sitemap.xml"])
    if sitemap_check.returncode != 0:
        return block(
            "사이트맵 하위 경로 누락",
            [
                "`sitemap.xml`에 대표 하위 경로가 없습니다.",
                "`npm run prepare-seo`와 `scripts/prepare-seo.mjs`의 route page 생성을 확인하세요.",
            ],
        )

    dirty_after_prepare = changed_files()
    relevant_dirty = sorted(path for path in dirty_after_prepare if is_seo_relevant(path))
    if relevant_dirty:
        messages.append("SEO 영향 파일이 미커밋 상태입니다. `npm run prepare-seo` 실행 결과를 포함해 변경 파일을 검토하고 커밋에 포함하세요.")
        messages.append(format_paths("갱신/미커밋 파일", relevant_dirty))

    branch = current_branch()
    ahead_count = count_ahead_origin_master()
    if branch != "master" or ahead_count > 0:
        messages.append(
            "SEO 영향 변경이 현재 브랜치에 있습니다. 커밋, push, PR 생성/병합 후 `npx --yes vercel deploy --prod --yes`로 운영 배포하세요."
        )

    messages.append(
        "배포 후 `https://vote.gubiko.com/sitemap.xml`과 대표 하위 경로 `/region/seoul/election/education`의 canonical/og:url을 curl로 확인하세요."
    )

    return block("SEO/sitemap 및 배포 후속 작업 필요", messages)


def read_hook_input() -> dict:
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except Exception:
        return {}


def git_root(cwd: Path) -> Path | None:
    result = run(["git", "rev-parse", "--show-toplevel"], cwd=cwd)
    if result.returncode != 0:
        return None
    return Path(result.stdout.strip())


def changed_files() -> set[str]:
    files = set()
    for command in (
        ["git", "diff", "--name-only"],
        ["git", "diff", "--cached", "--name-only"],
        ["git", "ls-files", "--others", "--exclude-standard"],
    ):
        result = run(command)
        if result.returncode == 0:
            files.update(line.strip() for line in result.stdout.splitlines() if line.strip())
    return files


def ahead_of_master_files() -> set[str]:
    result = run(["git", "diff", "--name-only", "origin/master...HEAD"])
    if result.returncode != 0:
        return set()
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def count_ahead_origin_master() -> int:
    result = run(["git", "rev-list", "--count", "origin/master..HEAD"])
    if result.returncode != 0:
        return 0
    try:
        return int(result.stdout.strip())
    except ValueError:
        return 0


def current_branch() -> str:
    result = run(["git", "branch", "--show-current"])
    return result.stdout.strip() if result.returncode == 0 else ""


def is_seo_relevant(path: str) -> bool:
    return path in SEO_RELEVANT_FILES or path.startswith(SEO_RELEVANT_PREFIXES)


def run(command: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(command, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def block(reason: str, lines: list[str]) -> int:
    message = "\n".join(line for line in lines if line)
    payload = {
        "continue": False,
        "stopReason": reason,
        "systemMessage": message,
        "hookSpecificOutput": {
            "hookEventName": "Stop",
            "additionalContext": message,
        },
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def format_paths(title: str, paths: list[str]) -> str:
    shown = "\n".join(f"- {path}" for path in paths[:40])
    suffix = "" if len(paths) <= 40 else f"\n- ... 외 {len(paths) - 40}개"
    return f"{title}:\n{shown}{suffix}"


def tail(text: str, limit: int = 1200) -> str:
    text = text.strip()
    return text[-limit:] if len(text) > limit else text


if __name__ == "__main__":
    raise SystemExit(main())
