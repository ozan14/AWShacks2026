import boto3
import requests
import json
import time

BUCKET = "signwatch-frames-ozant"
REGION = "us-west-2"
S3_KEY = "signs-latest.json"

# Seattle SDOT ---------------------------------------------------------------

SDOT_URL = (
    "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest"
    "/services/SDOT_Street_Signs/FeatureServer/1/query"
)

SDOT_CATEGORIES = {
    "REGBP", "REGSL", "REGTP", "REGWL", "REGMIS",  # regulatory
    "WARNCW", "WARNS", "WARNH", "WARNTC", "WARNCU", # warning
}


def fetch_seattle_signs():
    signs = []
    offset = 0
    batch = 2000
    print("Fetching Seattle SDOT signs...")

    while True:
        params = {
            "where": "1=1",
            "outFields": "OBJECTID,SIGNTYPE,CATEGORY,UNITDESC,SHAPE_LAT,SHAPE_LNG",
            "f": "json",
            "resultOffset": offset,
            "resultRecordCount": batch,
        }
        data = requests.get(SDOT_URL, params=params).json()
        features = data.get("features", [])
        if not features:
            break

        for f in features:
            a = f["attributes"]
            if a.get("CATEGORY") not in SDOT_CATEGORIES:
                continue
            lat, lng = a.get("SHAPE_LAT"), a.get("SHAPE_LNG")
            if not lat or not lng:
                continue
            signs.append({
                "id": f"sdot_{a['OBJECTID']}",
                "sign_type": a.get("SIGNTYPE") or "",
                "category": a.get("CATEGORY") or "",
                "description": a.get("UNITDESC") or "",
                "lat": lat,
                "lng": lng,
                "source": "seattle",
            })

        offset += batch
        print(f"  Seattle: {offset} records scanned, {len(signs)} kept")
        time.sleep(0.2)

    print(f"  Seattle total: {len(signs)} signs")
    return signs


# King County (Redmond, Kirkland, unincorporated) ----------------------------

KC_URL = (
    "https://gismaps.kingcounty.gov/arcgis/rest/services"
    "/Roads/KingCo_Roads/MapServer/2/query"
)

KC_SIGN_CLASSES = {"Regulatory", "Warning"}


def fetch_king_county_signs():
    signs = []
    offset = 0
    batch = 1000  # King County MapServer max record count
    print("Fetching King County signs (Redmond, Kirkland, etc.)...")

    while True:
        params = {
            "where": "SignClass IN ('Regulatory', 'Warning')",
            "outFields": "OBJECTID,MUTCDCode,Description,SignClass,RoadName",
            "returnGeometry": "true",
            "outSR": "4326",        # returns geometry as WGS84 lng/lat
            "f": "json",
            "resultOffset": offset,
            "resultRecordCount": batch,
        }
        resp = requests.get(KC_URL, params=params)
        data = resp.json()

        if "error" in data:
            print(f"  King County API error: {data['error']}")
            break

        features = data.get("features", [])
        if not features:
            break

        for f in features:
            a = f["attributes"]
            geom = f.get("geometry") or {}
            lng = geom.get("x")
            lat = geom.get("y")
            if not lat or not lng:
                continue
            road = a.get("RoadName") or ""
            desc = a.get("Description") or ""
            signs.append({
                "id": f"kc_{a['OBJECTID']}",
                "sign_type": desc or a.get("MUTCDCode") or "",
                "category": a.get("SignClass") or "",
                "description": f"{a.get('MUTCDCode') or ''} — {road}".strip(" —"),
                "lat": lat,
                "lng": lng,
                "source": "king_county",
            })

        offset += batch
        print(f"  King County: {offset} records fetched, {len(signs)} kept")
        time.sleep(0.2)

        if not data.get("exceededTransferLimit", False):
            break

    print(f"  King County total: {len(signs)} signs")
    return signs


# Upload ---------------------------------------------------------------------

def upload_to_s3(signs):
    print(f"\nUploading {len(signs)} total signs to S3...")
    s3 = boto3.client("s3", region_name=REGION)
    body = json.dumps(signs, separators=(",", ":"))
    s3.put_object(
        Bucket=BUCKET,
        Key=S3_KEY,
        Body=body,
        ContentType="application/json",
    )
    print(f"Done — {len(body) / 1024:.0f} KB at s3://{BUCKET}/{S3_KEY}")


if __name__ == "__main__":
    seattle = fetch_seattle_signs()
    king_county = fetch_king_county_signs()
    all_signs = seattle + king_county
    print(f"\nTotal: {len(all_signs)} signs ({len(seattle)} Seattle + {len(king_county)} King County)")
    upload_to_s3(all_signs)
