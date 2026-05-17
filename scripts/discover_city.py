"""
City discovery agent — given a city name, uses Claude via AWS Bedrock to find
its public ArcGIS sign data API and generate a city config for seed_signs.py.

Usage:
  python discover_city.py "Portland, OR"
  python discover_city.py "Chicago, IL"

Requires AWS credentials configured (same ones used for sam deploy).
"""
import boto3
import requests
import json
import sys
from pathlib import Path
from duckduckgo_search import DDGS

CITIES_DIR = Path(__file__).parent / "cities"
REGION = "us-west-2"
MODEL_ID = "us.anthropic.claude-sonnet-4-6"

bedrock = boto3.client("bedrock-runtime", region_name=REGION)

# --- Tools the agent can call ------------------------------------------------

def web_search(query: str) -> dict:
    """Search the web for open data portals and sign dataset pages."""
    try:
        results = DDGS().text(query, max_results=6)
        return {"results": [{"title": r["title"], "url": r["href"], "snippet": r["body"]} for r in results]}
    except Exception as e:
        return {"error": str(e)}


def search_socrata_catalog(domain: str, query: str) -> dict:
    """Search a Socrata open data portal for sign-related datasets."""
    try:
        resp = requests.get(
            "https://api.us.socrata.com/api/catalog/v1",
            params={"q": query, "domains": domain, "only": "datasets", "limit": 10},
            timeout=10,
        )
        data = resp.json()
        results = []
        for r in data.get("results", []):
            resource = r.get("resource", {})
            results.append({
                "name": resource.get("name"),
                "id": resource.get("id"),
                "description": resource.get("description", "")[:200],
                "columns": resource.get("columns_name", []),
                "api_url": f"https://{domain}/resource/{resource.get('id')}.json",
            })
        return {"results": results}
    except Exception as e:
        return {"error": str(e)}


def fetch_socrata_sample(domain: str, dataset_id: str, where: str = "") -> dict:
    """Fetch a few sample records from a Socrata dataset to inspect the data."""
    try:
        params = {"$limit": 3}
        if where:
            params["$where"] = where
        resp = requests.get(
            f"https://{domain}/resource/{dataset_id}.json",
            params=params,
            timeout=10,
        )
        records = resp.json()
        if isinstance(records, dict) and "error" in records:
            return {"error": records}
        return {"record_count": len(records), "sample": records}
    except Exception as e:
        return {"error": str(e)}


def fetch_arcgis_layer_info(url: str) -> dict:
    """Fetch metadata and field schema from an ArcGIS layer URL."""
    try:
        resp = requests.get(url, params={"f": "json"}, timeout=10)
        data = resp.json()
        if "error" in data:
            return {"error": data["error"]}
        return {
            "name": data.get("name"),
            "type": data.get("type"),
            "geometryType": data.get("geometryType"),
            "spatialReference": data.get("spatialReference"),
            "maxRecordCount": data.get("maxRecordCount"),
            "fields": [
                {"name": f["name"], "type": f["type"], "alias": f.get("alias", "")}
                for f in data.get("fields", [])
            ],
        }
    except Exception as e:
        return {"error": str(e)}


def run_test_query(url: str, where: str = "1=1", out_fields: str = "*", out_sr: int = 4326) -> dict:
    """Run a small test query to verify real coordinates and sign data."""
    try:
        params = {
            "where": where,
            "outFields": out_fields,
            "returnGeometry": "true",
            "outSR": out_sr,
            "resultRecordCount": 3,
            "f": "json",
        }
        resp = requests.get(f"{url}/query", params=params, timeout=10)
        data = resp.json()
        if "error" in data:
            return {"error": data["error"]}
        return {
            "feature_count": len(data.get("features", [])),
            "exceeded_limit": data.get("exceededTransferLimit", False),
            "sample_records": data.get("features", [])[:2],
        }
    except Exception as e:
        return {"error": str(e)}


def save_city_config(config: dict) -> dict:
    """Save the generated city config JSON to scripts/cities/."""
    CITIES_DIR.mkdir(exist_ok=True)
    source_id = config.get("source_id", "unknown")
    path = CITIES_DIR / f"{source_id}.json"
    path.write_text(json.dumps(config, indent=2))
    return {"saved": str(path)}


TOOL_HANDLERS = {
    "web_search": lambda inp: web_search(inp["query"]),
    "search_socrata_catalog": lambda inp: search_socrata_catalog(inp["domain"], inp["query"]),
    "fetch_socrata_sample": lambda inp: fetch_socrata_sample(inp["domain"], inp["dataset_id"], inp.get("where", "")),
    "fetch_arcgis_layer_info": lambda inp: fetch_arcgis_layer_info(inp["url"]),
    "run_test_query": lambda inp: run_test_query(
        inp["url"],
        where=inp.get("where", "1=1"),
        out_fields=inp.get("out_fields", "*"),
        out_sr=inp.get("out_sr", 4326),
    ),
    "save_city_config": lambda inp: save_city_config(inp["config"]),
}

# Bedrock Converse tool config format
TOOL_CONFIG = {
    "tools": [
        {
            "toolSpec": {
                "name": "web_search",
                "description": "Search the web to find ArcGIS open data portals, FeatureServer URLs, and sign dataset pages for a city. Use this FIRST before guessing URLs.",
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "Search query, e.g. 'Portland Oregon road signs ArcGIS FeatureServer open data'"}
                        },
                        "required": ["query"],
                    }
                },
            }
        },
        {
            "toolSpec": {
                "name": "search_socrata_catalog",
                "description": "Search a Socrata open data portal (e.g. data.seattle.gov) for sign-related datasets. Use this when a city uses Socrata instead of ArcGIS.",
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": {
                            "domain": {"type": "string", "description": "Socrata domain, e.g. data.cityofchicago.org"},
                            "query": {"type": "string", "description": "Search term, e.g. 'traffic signs'"},
                        },
                        "required": ["domain", "query"],
                    }
                },
            }
        },
        {
            "toolSpec": {
                "name": "fetch_socrata_sample",
                "description": "Fetch sample records from a Socrata dataset to inspect field names and values.",
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": {
                            "domain": {"type": "string", "description": "Socrata domain"},
                            "dataset_id": {"type": "string", "description": "4x4 dataset ID, e.g. 'abcd-1234'"},
                            "where": {"type": "string", "description": "Optional SoQL filter clause"},
                        },
                        "required": ["domain", "dataset_id"],
                    }
                },
            }
        },
        {
            "toolSpec": {
                "name": "fetch_arcgis_layer_info",
                "description": (
                    "Fetch metadata and field schema from an ArcGIS FeatureServer or MapServer "
                    "layer URL. Use this to inspect a candidate layer before querying it. "
                    "The URL should end in a layer index like /FeatureServer/0 or /MapServer/2."
                ),
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": {
                            "url": {"type": "string", "description": "ArcGIS layer URL ending in a layer index"}
                        },
                        "required": ["url"],
                    }
                },
            }
        },
        {
            "toolSpec": {
                "name": "run_test_query",
                "description": (
                    "Run a small test query against an ArcGIS layer to verify it has real "
                    "coordinates and useful sign type data. Returns up to 2 sample records."
                ),
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": {
                            "url": {"type": "string", "description": "ArcGIS layer URL (without /query)"},
                            "where": {"type": "string", "description": "SQL where clause"},
                            "out_fields": {"type": "string", "description": "Comma-separated fields or *"},
                            "out_sr": {"type": "integer", "description": "Output spatial reference (4326 = WGS84 lat/lng)"},
                        },
                        "required": ["url"],
                    }
                },
            }
        },
        {
            "toolSpec": {
                "name": "save_city_config",
                "description": "Save the completed, validated city config to scripts/cities/. Only call this once you have verified the API returns real data.",
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": {
                            "config": {
                                "type": "object",
                                "description": "Complete city config matching the SignWatch schema",
                            }
                        },
                        "required": ["config"],
                    }
                },
            }
        },
    ]
}

SYSTEM_PROMPT = """You are a GIS data engineer helping expand SignWatch, a crowdsourced road sign monitoring app, to new cities.

SignWatch needs a city config JSON that tells it where to find public road sign data. Your job is to find that data and generate a validated config.

## City config schema

### ArcGIS (FeatureServer or MapServer):
{
  "name": "City Name",
  "source_id": "snake_case_unique_id",
  "api_type": "FeatureServer" or "MapServer",
  "api_url": "https://.../FeatureServer/N",   // layer URL WITHOUT /query
  "batch_size": 2000,
  "where_clause": "SQL to filter for regulatory + warning signs",
  "geometry_mode": "fields" or "geometry",
  "lat_field": "FIELD_NAME",   // only when geometry_mode = "fields"
  "lng_field": "FIELD_NAME",   // only when geometry_mode = "fields"
  "out_sr": 4326,              // only when geometry_mode = "geometry"
  "fields": { "id": "...", "sign_type": "...", "category": "...", "description": "..." },
  "report_url": "https://..."
}

### Socrata (data.cityname.gov portals):
{
  "name": "City Name",
  "source_id": "snake_case_unique_id",
  "api_type": "Socrata",
  "domain": "data.cityname.gov",
  "dataset_id": "abcd-1234",
  "where_clause": "category='Regulatory'",   // SoQL filter, optional
  "lat_field": "latitude",
  "lng_field": "longitude",
  "fields": { "id": "objectid", "sign_type": "...", "category": "...", "description": "..." },
  "report_url": "https://..."
}

## Strategy

1. ALWAYS start with web_search — search for "{city} traffic signs open data ArcGIS" and "{city} road signs GIS dataset". Look for ArcGIS FeatureServer URLs or Socrata data portals in the results.

2. If results point to ArcGIS: use fetch_arcgis_layer_info to inspect the layer, then run_test_query to verify.

3. If results point to a Socrata portal (data.cityname.gov): use search_socrata_catalog to find the right dataset, then fetch_socrata_sample to inspect fields.

4. Map fields to the schema — sign_type must be human-readable plain English (not a code like R1-1).

5. Call save_city_config once you have verified real data with coordinates.

Do NOT guess ArcGIS org IDs — always search first."""


def run_agent(city_name: str):
    print(f"\nSignWatch City Discovery Agent")
    print(f"City: {city_name}\n")

    messages = [
        {"role": "user", "content": [{"text": f"Find road sign data for: {city_name}"}]}
    ]

    while True:
        response = bedrock.converse(
            modelId=MODEL_ID,
            system=[{"text": SYSTEM_PROMPT}],
            messages=messages,
            toolConfig=TOOL_CONFIG,
            inferenceConfig={"maxTokens": 4096},
        )

        output_message = response["output"]["message"]
        stop_reason = response["stopReason"]

        for block in output_message["content"]:
            if "text" in block:
                print(block["text"])

        if stop_reason == "end_turn":
            break

        if stop_reason != "tool_use":
            print(f"Unexpected stop reason: {stop_reason}")
            break

        # Process tool calls and collect results
        tool_results = []
        for block in output_message["content"]:
            if "toolUse" not in block:
                continue

            tool = block["toolUse"]
            print(f"\n[→ {tool['name']}({list(tool['input'].keys())})]")

            result = TOOL_HANDLERS[tool["name"]](tool["input"])

            if tool["name"] == "save_city_config":
                print(f"   Config saved: {result.get('saved')}")

            tool_results.append({
                "toolResult": {
                    "toolUseId": tool["toolUseId"],
                    "content": [{"text": json.dumps(result)}],
                }
            })

        messages.append({"role": "assistant", "content": output_message["content"]})
        messages.append({"role": "user", "content": tool_results})

    print("\nDone. If a config was saved, run seed_signs.py to add it to the sign index.")


if __name__ == "__main__":
    city = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else input("Enter city name: ")
    run_agent(city)
