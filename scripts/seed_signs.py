"""
Generic seed runner — loads all city configs from scripts/cities/*.json
and uploads a merged signs-latest.json to S3.

To add a new city: run discover_city.py to generate a config, then rerun this script.
"""
import boto3
import requests
import json
import time
from pathlib import Path

BUCKET = "signwatch-frames-ozant"
REGION = "us-west-2"
S3_KEY = "signs-latest.json"
CITIES_DIR = Path(__file__).parent / "cities"


def fetch_city_signs_socrata(config):
    domain = config["domain"]
    dataset_id = config["dataset_id"]
    where = config.get("where_clause", "")
    field_map = config["fields"]
    source_id = config["source_id"]
    lat_field = config["lat_field"]
    lng_field = config["lng_field"]

    signs = []
    offset = 0
    batch = 5000
    print(f"\nFetching {config['name']} (Socrata)...")

    while True:
        params = {"$limit": batch, "$offset": offset}
        if where:
            params["$where"] = where
        resp = requests.get(f"https://{domain}/resource/{dataset_id}.json", params=params, timeout=30)
        records = resp.json()

        if not records or (isinstance(records, dict) and "error" in records):
            break

        for r in records:
            try:
                lat = float(r.get(lat_field) or 0)
                lng = float(r.get(lng_field) or 0)
            except (ValueError, TypeError):
                continue
            if not lat or not lng:
                continue
            signs.append({
                "id": f"{source_id}_{r.get(field_map['id'], offset)}",
                "sign_type": r.get(field_map["sign_type"]) or "",
                "category": r.get(field_map["category"]) or "",
                "description": r.get(field_map["description"]) or "",
                "lat": lat,
                "lng": lng,
                "source": source_id,
            })

        offset += batch
        print(f"  {offset} records fetched, {len(signs)} kept")
        time.sleep(0.2)

        if len(records) < batch:
            break

    print(f"  Done: {len(signs)} signs from {config['name']}")
    return signs


def fetch_city_signs(config):
    name = config["name"]
    url = config["api_url"]
    batch = config.get("batch_size", 2000)
    where = config.get("where_clause", "1=1")
    geo_mode = config.get("geometry_mode", "fields")
    field_map = config["fields"]
    source_id = config["source_id"]

    out_fields = ",".join([
        field_map["id"],
        field_map["sign_type"],
        field_map["category"],
        field_map["description"],
    ])
    if geo_mode == "fields":
        out_fields += f",{config['lat_field']},{config['lng_field']}"

    signs = []
    offset = 0
    print(f"\nFetching {name}...")

    while True:
        params = {
            "where": where,
            "outFields": out_fields,
            "returnGeometry": "true" if geo_mode == "geometry" else "false",
            "f": "json",
            "resultOffset": offset,
            "resultRecordCount": batch,
        }
        if geo_mode == "geometry":
            params["outSR"] = config.get("out_sr", 4326)

        resp = requests.get(f"{url}/query", params=params, timeout=30)
        data = resp.json()

        if "error" in data:
            print(f"  API error: {data['error']}")
            break

        features = data.get("features", [])
        if not features:
            break

        for f in features:
            a = f["attributes"]

            if geo_mode == "fields":
                lat = a.get(config["lat_field"])
                lng = a.get(config["lng_field"])
            else:
                geom = f.get("geometry") or {}
                lat = geom.get("y")
                lng = geom.get("x")

            if not lat or not lng:
                continue

            signs.append({
                "id": f"{source_id}_{a[field_map['id']]}",
                "sign_type": a.get(field_map["sign_type"]) or "",
                "category": a.get(field_map["category"]) or "",
                "description": a.get(field_map["description"]) or "",
                "lat": lat,
                "lng": lng,
                "source": source_id,
            })

        offset += batch
        print(f"  {offset} records fetched, {len(signs)} kept")
        time.sleep(0.2)

        if not data.get("exceededTransferLimit", False):
            break

    print(f"  Done: {len(signs)} signs from {name}")
    return signs


def upload_to_s3(signs):
    print(f"\nUploading {len(signs)} total signs to S3...")
    s3 = boto3.client("s3", region_name=REGION)
    body = json.dumps(signs, separators=(",", ":"))
    s3.put_object(Bucket=BUCKET, Key=S3_KEY, Body=body, ContentType="application/json")
    print(f"Done — {len(body) / 1024:.0f} KB at s3://{BUCKET}/{S3_KEY}")


if __name__ == "__main__":
    configs = sorted(CITIES_DIR.glob("*.json"))
    if not configs:
        print(f"No city configs found in {CITIES_DIR}/")
        exit(1)

    print(f"Loading {len(configs)} city config(s): {[c.stem for c in configs]}")

    all_signs = []
    for config_path in configs:
        config = json.loads(config_path.read_text())
        if config.get("api_type") == "Socrata":
            all_signs.extend(fetch_city_signs_socrata(config))
        else:
            all_signs.extend(fetch_city_signs(config))

    by_source = {}
    for s in all_signs:
        by_source[s["source"]] = by_source.get(s["source"], 0) + 1
    print(f"\nTotal: {len(all_signs)} signs — {by_source}")

    upload_to_s3(all_signs)
