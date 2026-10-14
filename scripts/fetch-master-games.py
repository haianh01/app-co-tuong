#!/usr/bin/env python3
"""
fetch-master-games.py
---------------------
Thu thap van dai su tu xqbase.com (象棋巫师棋谱仓库).

Lay khoang 200 van, phan bo deu tren range gameid 1..11150.
Moi van cach nhau 2s de khong tao tai cho trang.
Luu tung van thanh mot file JSON trong .data/master-games/.
Ket thuc in bao cao tong hop ra stdout.

Su dung: python3 scripts/fetch-master-games.py [--count N] [--delay D] [--resume]
"""

import argparse
import datetime
import json
import re
import ssl
import time
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_URL = "https://www.xqbase.com/xqbase/?gameid={gameid}"
GAMEID_MIN = 1
GAMEID_MAX = 11150
OUTPUT_DIR = Path(__file__).parent.parent / ".data" / "master-games"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

KNOWN_MASTERS: dict[str, str] = {
    "许银川": "Xu Yinchuan",
    "吕钦":   "Lv Qin",
    "胡荣华": "Hu Ronghua",
    "赵国荣": "Zhao Guorong",
    "柳大华": "Liu Dahua",
    "李来群": "Li Laiqun",
    "徐天红": "Xu Tianhong",
    "王斌":   "Wang Bin",
    "郑一泓": "Zheng Yihong",
    "孙勇征": "Sun Yongzheng",
    "谢靖":   "Xie Jing",
    "蒋川":   "Jiang Chuan",
    "王天一": "Wang Tianyi",
    "郑惟桐": "Zheng Weitong",
    "金波":   "Jin Bo",
    "李雪松": "Li Xuesong",
    "洪智":   "Hong Zhi",
    "汪洋":   "Wang Yang",
    "景学义": "Jing Xueyi",
    "郝继超": "Hao Jichao",
}

RESULT_MAP: dict[str, str] = {
    "先胜": "red_wins",
    "先负": "black_wins",
    "先和": "draw",
    "红胜": "red_wins",
    "黑胜": "black_wins",
    "和棋": "draw",
    "和局": "draw",
}


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class MasterGame:
    gameid: int
    source_url: str
    red_player: str
    black_player: str
    result: str
    tournament: str
    date: str
    ecco_code: str
    ecco_name: str
    moves_chinese: list
    move_count: int
    master_red: Optional[str]
    master_black: Optional[str]
    fetched_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_ssl_ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


SSL_CTX = make_ssl_ctx()


def fetch_html(gameid: int) -> str:
    url = BASE_URL.format(gameid=gameid)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as resp:
        raw = resp.read()
    return raw.decode("gb18030", errors="replace")


def parse_result(text: str) -> str:
    for cn, en in RESULT_MAP.items():
        if cn in text:
            return en
    return "unknown"


def parse_moves(pre_text: str) -> list:
    half_moves = []
    for line in pre_text.splitlines():
        stripped = re.sub(r"^\s*\d+\.\s*", "", line).strip()
        if not stripped or stripped.startswith("（") or stripped.startswith("("):
            continue
        parts = re.split(r"[\s\u3000]+", stripped)
        for p in parts:
            p = p.strip()
            if p and not re.match(r"^[\(（]", p):
                half_moves.append(p)
    return half_moves


def parse_game(gameid: int, html: str) -> Optional[MasterGame]:
    title_m = re.search(r"<title>(.*?)</title>", html)
    if not title_m:
        return None
    title = title_m.group(1).replace(" - 象棋巫师棋谱仓库", "").strip()
    result_str = parse_result(title)

    red_m   = re.search(r"红方 ([^<]+)", html)
    black_m = re.search(r"黑方 ([^<]+)", html)
    if not red_m or not black_m:
        return None
    red_player   = red_m.group(1).strip()
    black_player = black_m.group(1).strip()

    ecco_m    = re.search(r'ecco=([A-Z]\d+).*?<b>([^<]+)</b>', html)
    ecco_code = ecco_m.group(1).strip() if ecco_m else ""
    ecco_name = ecco_m.group(2).strip() if ecco_m else ""
    ecco_name = re.sub(r"^[A-Z]\d+\.\s*", "", ecco_name)

    tournament = ""
    date_str   = ""
    td_titles  = re.findall(r'<td[^>]+title="([^"]+)"', html)
    for t in td_titles:
        if re.match(r"\d{4}年", t) and not re.search(r"先[胜负和]|红|黑", t):
            if re.search(r"月|日|弈于", t):
                date_str = t
            elif not tournament:
                tournament = t

    pre_m = re.search(r"<pre>(.*?)</pre>", html, re.DOTALL)
    if not pre_m:
        return None
    pre_text = pre_m.group(1).strip()
    moves = parse_moves(pre_text)
    if len(moves) < 4:
        return None

    result_pre = parse_result(pre_text)
    if result_pre != "unknown":
        result_str = result_pre

    master_red   = next((en for cn, en in KNOWN_MASTERS.items() if cn in red_player),   None)
    master_black = next((en for cn, en in KNOWN_MASTERS.items() if cn in black_player), None)

    return MasterGame(
        gameid=gameid,
        source_url=BASE_URL.format(gameid=gameid),
        red_player=red_player,
        black_player=black_player,
        result=result_str,
        tournament=tournament,
        date=date_str,
        ecco_code=ecco_code,
        ecco_name=ecco_name,
        moves_chinese=moves,
        move_count=len(moves),
        master_red=master_red,
        master_black=master_black,
        fetched_at=datetime.datetime.utcnow().isoformat() + "Z",
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch master games from xqbase.com")
    parser.add_argument("--count",  type=int,   default=200, help="Number of games to fetch")
    parser.add_argument("--delay",  type=float, default=2.0, help="Seconds between requests")
    parser.add_argument("--resume", action="store_true",     help="Skip already-downloaded gameids")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    step    = (GAMEID_MAX - GAMEID_MIN) // args.count
    gameids = [GAMEID_MIN + i * step for i in range(args.count)]

    if args.resume:
        existing = {int(f.stem.split("_")[1]) for f in OUTPUT_DIR.glob("game_*.json")}
        gameids  = [gid for gid in gameids if gid not in existing]
        print(f"Resuming: {len(gameids)} games remaining")

    stats = {
        "attempted": 0,
        "saved": 0,
        "skipped_empty": 0,
        "skipped_error": 0,
        "with_master": 0,
        "results": {"red_wins": 0, "black_wins": 0, "draw": 0, "unknown": 0},
        "ecco_codes": {},
    }

    print(f"Fetching {len(gameids)} games (delay={args.delay}s) -> {OUTPUT_DIR}")
    print("=" * 60)

    for i, gameid in enumerate(gameids):
        stats["attempted"] += 1
        out_path = OUTPUT_DIR / f"game_{gameid:05d}.json"

        if args.resume and out_path.exists():
            stats["skipped_empty"] += 1
            continue

        try:
            html = fetch_html(gameid)
            game = parse_game(gameid, html)
        except Exception as e:
            print(f"  [{i+1}/{len(gameids)}] gameid={gameid} ERROR: {e}")
            stats["skipped_error"] += 1
            time.sleep(args.delay)
            continue

        if game is None:
            print(f"  [{i+1}/{len(gameids)}] gameid={gameid} SKIP (no data)")
            stats["skipped_empty"] += 1
            time.sleep(args.delay)
            continue

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(asdict(game), f, ensure_ascii=False, indent=2)

        stats["saved"] += 1
        res = game.result
        stats["results"][res] = stats["results"].get(res, 0) + 1
        if game.master_red or game.master_black:
            stats["with_master"] += 1
        if game.ecco_code:
            stats["ecco_codes"][game.ecco_code] = stats["ecco_codes"].get(game.ecco_code, 0) + 1

        master_tag = ""
        if game.master_red:
            master_tag += f" *{game.master_red}"
        if game.master_black:
            master_tag += f" *{game.master_black}"

        print(
            f"  [{i+1}/{len(gameids)}] id={gameid} "
            f"{game.red_player} vs {game.black_player} "
            f"({game.result}, {game.move_count//2}t, {game.ecco_code})"
            f"{master_tag}"
        )

        time.sleep(args.delay)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Attempted  : {stats['attempted']}")
    print(f"  Saved      : {stats['saved']}")
    print(f"  Skipped    : {stats['skipped_empty']} (empty) + {stats['skipped_error']} (error)")
    print(f"  With master: {stats['with_master']}")
    print("  Results    :")
    for k, v in stats["results"].items():
        print(f"    {k:12s}: {v}")
    print("  Top ECCO codes:")
    top_ecco = sorted(stats["ecco_codes"].items(), key=lambda x: -x[1])[:10]
    for code, cnt in top_ecco:
        print(f"    {code}: {cnt}")

    summary_path = OUTPUT_DIR / "fetch_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print(f"\n  Summary saved -> {summary_path}")


if __name__ == "__main__":
    main()
