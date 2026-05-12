import argparse
import json
import math
import re
import statistics
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SEED_PATH = DATA_DIR / "products_seed.json"
UNIVERSE_PATH = DATA_DIR / "products_universe.json"
CANDIDATES_PATH = DATA_DIR / "products_candidates.json"
OUTPUT_PATH = DATA_DIR / "products.json"

EASTMONEY_LIST_URL = "https://push2.eastmoney.com/api/qt/clist/get"
EASTMONEY_KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
SINA_KLINE_URL = "https://quotes.sina.cn/cn/api/jsonp.php/var%20data=/CN_MarketDataService.getKLineData"

MIN_MARKET_CAP = 200_000_000
MIN_TURNOVER = 2_000_000
MAX_PER_CATEGORY = 18


CATEGORY_RULES = {
    "cash": {
        "include": ["货币", "添益", "日利", "现金", "保证金"],
        "exclude": ["债", "黄金", "商品", "豆粕", "能源"],
        "maxItems": 8,
    },
    "bond": {
        "include": ["债", "国债", "政金债", "公司债", "城投债", "可转债"],
        "exclude": ["增强", "股票", "黄金"],
        "maxItems": 12,
    },
    "dividend": {
        "include": ["红利", "股息", "高股息", "低波"],
        "exclude": ["港股通互联网"],
        "maxItems": 12,
    },
    "broad": {
        "include": ["沪深300", "中证A500", "A500", "中证500", "中证1000", "创业板", "科创50", "上证50"],
        "exclude": ["增强", "红利", "半导体", "芯片", "医药", "互联网", "新能源", "军工"],
        "maxItems": 18,
    },
    "gold": {
        "include": ["黄金"],
        "exclude": ["有色", "稀土"],
        "maxItems": 8,
    },
    "growth": {
        "include": [
            "半导体",
            "芯片",
            "人工智能",
            "AI",
            "机器人",
            "云计算",
            "创新药",
            "生物医药",
            "恒生科技",
            "互联网",
            "软件",
            "新能源",
            "军工",
            "科创",
        ],
        "exclude": ["红利", "债", "黄金"],
        "maxItems": 24,
    },
}


def fetch_text(url):
    last_error = None
    for attempt in range(4):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        f"Chrome/{120 + attempt}.0.0.0 Safari/537.36"
                    ),
                    "Accept": "application/json,text/plain,*/*",
                    "Referer": "https://quote.eastmoney.com/center/gridlist.html",
                    "Cache-Control": "no-cache",
                },
            )
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.read().decode("utf-8", errors="ignore")
        except Exception as exc:
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise last_error


def fetch_etf_universe():
    products = []
    page = 1
    page_size = 200
    total = None
    while total is None or len(products) < total:
        params = {
            "pn": str(page),
            "pz": str(page_size),
            "po": "1",
            "np": "1",
            "ut": "bd1d9ddb04089700cf9c27f6f7426281",
            "fltt": "2",
            "invt": "2",
            "fid": "f3",
            "fs": "b:MK0021,b:MK0022,b:MK0023,b:MK0024",
            "fields": "f12,f14,f2,f3,f5,f6,f20",
        }
        url = f"{EASTMONEY_LIST_URL}?{urllib.parse.urlencode(params)}"
        data = json.loads(fetch_text(url))
        payload = data.get("data") or {}
        total = payload.get("total") or 0
        rows = payload.get("diff") or []
        if not rows:
            break
        for row in rows:
            products.append(
                {
                    "code": row.get("f12"),
                    "name": row.get("f14"),
                    "latestPrice": row.get("f2"),
                    "dailyChangePct": row.get("f3"),
                    "volume": row.get("f5"),
                    "turnover": row.get("f6") or 0,
                    "marketCap": row.get("f20") or 0,
                }
            )
        page += 1
        time.sleep(0.15)
    return [item for item in products if item.get("code") and item.get("name")]


def fetch_etf_universe_akshare():
    import akshare as ak

    df = ak.fund_etf_spot_em()
    products = []
    for _, row in df.iterrows():
        code = str(row.get("代码", "")).zfill(6)
        name = str(row.get("名称", ""))
        if not code or not name:
            continue
        turnover = safe_float(row.get("成交额"))
        products.append(
            {
                "code": code,
                "name": name,
                "latestPrice": safe_float(row.get("最新价")),
                "dailyChangePct": safe_float(row.get("涨跌幅")),
                "volume": safe_float(row.get("成交量")),
                "turnover": turnover,
                # ETF spot data may not expose market cap consistently; turnover drives liquidity filtering.
                "marketCap": safe_float(row.get("总市值")) or 0,
            }
        )
    return products


def fetch_etf_universe_with_fallback():
    try:
        return fetch_etf_universe(), "Eastmoney ETF list endpoint"
    except Exception as direct_error:
        try:
            return fetch_etf_universe_akshare(), f"AkShare fund_etf_spot_em fallback after: {direct_error}"
        except Exception as akshare_error:
            raise RuntimeError(f"direct={direct_error}; akshare={akshare_error}") from akshare_error


def safe_float(value):
    try:
        if value is None or value == "-":
            return 0
        numeric = float(value)
        if math.isnan(numeric):
            return 0
        return numeric
    except Exception:
        return 0


def secid_for_code(code):
    if code.startswith(("5", "6", "9")):
        return f"1.{code}"
    return f"0.{code}"


def market_symbol_for_code(code):
    prefix = "sh" if code.startswith(("5", "6", "9")) else "sz"
    return f"{prefix}{code}"


def fetch_sina_kline_points(code):
    params = {
        "symbol": market_symbol_for_code(code),
        "scale": "240",
        "ma": "no",
        "datalen": "360",
    }
    url = f"{SINA_KLINE_URL}?{urllib.parse.urlencode(params)}"
    text = fetch_text(url)
    match = re.search(r"var\s+data=\((\[.*\])\);?", text, re.S)
    if not match:
        return []
    raw = json.loads(match.group(1))
    points = []
    for item in raw:
        close = item.get("close")
        date = item.get("day")
        if close and date:
            points.append({"date": date, "value": float(close)})
    return points


def fetch_eastmoney_kline_points(code):
    params = {
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
        "klt": "101",
        "fqt": "1",
        "end": "20500101",
        "lmt": "360",
        "secid": secid_for_code(code),
    }
    url = f"{EASTMONEY_KLINE_URL}?{urllib.parse.urlencode(params)}"
    data = json.loads(fetch_text(url))
    raw = data.get("data", {}).get("klines") or []
    points = []
    for line in raw:
        parts = line.split(",")
        if len(parts) >= 3:
            points.append({"date": parts[0], "value": float(parts[2])})
    return points


def fetch_price_points(code):
    points = fetch_sina_kline_points(code)
    if points:
        return points, "Sina CN_MarketDataService"
    points = fetch_eastmoney_kline_points(code)
    if points:
        return points, "Eastmoney kline"
    return [], None


def pct_change(points, days):
    if len(points) < 2:
        return None
    latest = points[-1]["value"]
    cutoff = max(0, len(points) - days)
    base = points[cutoff]["value"]
    if not base:
        return None
    return (latest / base - 1) * 100


def max_drawdown(points, days):
    window = points[-days:] if len(points) > days else points
    if len(window) < 2:
        return None
    peak = window[0]["value"]
    worst = 0.0
    for point in window:
        value = point["value"]
        peak = max(peak, value)
        if peak:
            worst = min(worst, value / peak - 1)
    return worst * 100


def annual_volatility(points, days):
    window = points[-days:] if len(points) > days else points
    if len(window) < 20:
        return None
    returns = []
    for prev, current in zip(window, window[1:]):
        if prev["value"]:
            returns.append(current["value"] / prev["value"] - 1)
    if len(returns) < 2:
        return None
    return statistics.stdev(returns) * math.sqrt(252) * 100


def normalize(value, low, high, reverse=False):
    if value is None:
        return 50
    if high == low:
        return 50
    score = (value - low) / (high - low) * 100
    score = max(0, min(100, score))
    return 100 - score if reverse else score


def classify_product(product):
    name = product["name"]
    if product["marketCap"] < MIN_MARKET_CAP and product["turnover"] < MIN_TURNOVER:
        return None
    for category_id, rules in CATEGORY_RULES.items():
        if any(keyword in name for keyword in rules["include"]) and not any(
            keyword in name for keyword in rules["exclude"]
        ):
            return category_id
    return None


def quality_score(product):
    size_score = normalize(product.get("marketCap"), MIN_MARKET_CAP, 10_000_000_000)
    turnover_score = normalize(product.get("turnover"), MIN_TURNOVER, 500_000_000)
    return size_score * 0.55 + turnover_score * 0.45


def load_seed_overrides():
    if not SEED_PATH.exists():
        return {}
    seeds = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    return {item["code"]: item for item in seeds}


def seed_candidates():
    seeds = json.loads(SEED_PATH.read_text(encoding="utf-8")) if SEED_PATH.exists() else []
    return [
        {
            **seed,
            "latestPrice": None,
            "dailyChangePct": None,
            "volume": None,
            "turnover": 0,
            "marketCap": 0,
            "qualityScore": seed.get("liquidityScore", 70),
        }
        for seed in seeds
    ]


def select_candidates(universe):
    seed_overrides = load_seed_overrides()
    grouped = {category_id: [] for category_id in CATEGORY_RULES}

    for product in universe:
        category_id = classify_product(product)
        if not category_id:
            continue
        item = {
            **product,
            "categoryId": category_id,
            "expenseBps": seed_overrides.get(product["code"], {}).get("expenseBps", 60),
            "liquidityScore": round(normalize(product.get("turnover"), MIN_TURNOVER, 500_000_000), 2),
            "qualityScore": round(quality_score(product), 2),
        }
        grouped[category_id].append(item)

    for seed in seed_overrides.values():
        if any(seed["code"] == item["code"] for items in grouped.values() for item in items):
            continue
        grouped.setdefault(seed["categoryId"], []).append(
            {
                **seed,
                "latestPrice": None,
                "dailyChangePct": None,
                "volume": None,
                "turnover": 0,
                "marketCap": 0,
                "qualityScore": seed.get("liquidityScore", 70),
            }
        )

    candidates = []
    for category_id, items in grouped.items():
        max_items = CATEGORY_RULES[category_id].get("maxItems", MAX_PER_CATEGORY)
        ranked = sorted(items, key=lambda item: (item.get("qualityScore", 0), item.get("marketCap", 0)), reverse=True)
        candidates.extend(ranked[:max_items])
    return candidates


def score_product(product, metrics):
    category = product["categoryId"]
    expense_score = normalize(product.get("expenseBps"), 20, 80, reverse=True)
    liquidity_score = product.get("liquidityScore", 70)
    drawdown_score = normalize(metrics.get("maxDrawdown1y"), -35, 0)
    vol_score = normalize(metrics.get("volatility1y"), 5, 45, reverse=True)
    return_1m = normalize(metrics.get("return1m"), -8, 8)
    return_3m = normalize(metrics.get("return3m"), -18, 18)
    return_1y = normalize(metrics.get("return1y"), -35, 45)

    if category in {"cash", "bond"}:
        weights = {
            "return_1m": 0.12,
            "return_3m": 0.18,
            "return_1y": 0.12,
            "drawdown": 0.28,
            "vol": 0.12,
            "expense": 0.08,
            "liquidity": 0.10,
        }
    elif category == "growth":
        weights = {
            "return_1m": 0.10,
            "return_3m": 0.20,
            "return_1y": 0.35,
            "drawdown": 0.10,
            "vol": 0.05,
            "expense": 0.05,
            "liquidity": 0.15,
        }
    else:
        weights = {
            "return_1m": 0.10,
            "return_3m": 0.20,
            "return_1y": 0.30,
            "drawdown": 0.15,
            "vol": 0.10,
            "expense": 0.05,
            "liquidity": 0.10,
        }

    score = (
        return_1m * weights["return_1m"]
        + return_3m * weights["return_3m"]
        + return_1y * weights["return_1y"]
        + drawdown_score * weights["drawdown"]
        + vol_score * weights["vol"]
        + expense_score * weights["expense"]
        + liquidity_score * weights["liquidity"]
    )
    return round(score, 2)


def update_product(product):
    result = dict(product)
    result["metrics"] = {
        "return1m": None,
        "return3m": None,
        "return1y": None,
        "maxDrawdown1y": None,
        "volatility1y": None,
    }
    result["score"] = 0
    result["dataStatus"] = "missing"

    try:
        points, source = fetch_price_points(product["code"])
        if not points:
            return result
        metrics = {
            "return1m": pct_change(points, 21),
            "return3m": pct_change(points, 63),
            "return1y": pct_change(points, 252),
            "maxDrawdown1y": max_drawdown(points, 252),
            "volatility1y": annual_volatility(points, 252),
        }
        result["metrics"] = {key: (round(value, 2) if value is not None else None) for key, value in metrics.items()}
        result["latestDate"] = points[-1]["date"]
        result["dataSource"] = source
        result["score"] = score_product(product, metrics)
        result["dataStatus"] = "ok"
    except Exception as exc:
        result["error"] = str(exc)
    return result


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def scan_universe():
    universe, source = fetch_etf_universe_with_fallback()
    candidates = select_candidates(universe)
    now = datetime.now(timezone.utc).isoformat()
    write_json(
        UNIVERSE_PATH,
        {
            "updatedAt": now,
            "source": source,
            "count": len(universe),
            "products": universe,
        },
    )
    write_json(
        CANDIDATES_PATH,
        {
            "updatedAt": now,
            "source": "Filtered from ETF universe by category rules",
            "universeCount": len(universe),
            "count": len(candidates),
            "products": candidates,
        },
    )
    print(f"scanned universe={len(universe)} candidates={len(candidates)}")
    return candidates, len(universe)


def load_candidates():
    if CANDIDATES_PATH.exists():
        data = json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))
        products = data.get("products") or []
        if products:
            return products, data.get("universeCount", 0), "products_candidates.json"
    products = seed_candidates()
    return products, 0, "products_seed.json"


def update_scores(candidates, universe_count, candidate_source):
    updated = []
    for product in candidates:
        updated.append(update_product(product))
        time.sleep(0.25)

    if updated and all(product.get("dataStatus") != "ok" for product in updated):
        if OUTPUT_PATH.exists():
            existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
            if existing.get("products"):
                print("all product fetches failed; preserving existing products.json")
                return

    for product in updated:
        product.pop("error", None)

    now = datetime.now(timezone.utc).isoformat()
    write_json(
        OUTPUT_PATH,
        {
            "updatedAt": now,
            "source": "Sina and Eastmoney public ETF data, generated by GitHub Actions",
            "candidateSource": candidate_source,
            "universeCount": universe_count,
            "candidateCount": len(candidates),
            "scoring": "Same-category comparison. Higher score is not investment advice.",
            "products": sorted(updated, key=lambda item: (item["categoryId"], -(item.get("score") or 0))),
        },
    )
    ok_count = sum(1 for product in updated if product.get("dataStatus") == "ok")
    print(f"universe={universe_count} candidates={len(candidates)} scored={ok_count} -> {OUTPUT_PATH}")


def main():
    parser = argparse.ArgumentParser(description="Update ETF product candidates and scores.")
    parser.add_argument(
        "--mode",
        choices=["update", "scan"],
        default="update",
        help="update only refreshes existing candidates; scan refreshes the ETF universe and candidate pool first.",
    )
    args = parser.parse_args()

    DATA_DIR.mkdir(exist_ok=True)
    if args.mode == "scan":
        candidates, universe_count = scan_universe()
        update_scores(candidates, universe_count, "fresh universe scan")
    else:
        candidates, universe_count, candidate_source = load_candidates()
        update_scores(candidates, universe_count, candidate_source)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"update failed: {exc}", file=sys.stderr)
        sys.exit(1)
