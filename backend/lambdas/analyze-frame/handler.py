import json
import boto3
import base64
import os
import decimal
from datetime import datetime

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

FLAGS_TABLE = os.environ['FLAGS_TABLE']
MODEL_ID = os.environ.get('MODEL_ID', 'anthropic.claude-3-5-sonnet-20241022-v2:0')

PROMPT = """You are analyzing a dashcam frame captured while a car was driving.

City infrastructure records indicate there should be a **{sign_type}** road sign
near GPS coordinates ({lat}, {lng}).

Look at this image and determine the visibility of that sign.

Respond with EXACTLY this format:
VERDICT: [CLEAR | OBSCURED | MISSING | UNCLEAR]
REASON: [One sentence describing what you see, max 20 words]

Examples:
VERDICT: OBSCURED
REASON: A tree branch covers the upper half of the stop sign at the intersection.

VERDICT: CLEAR
REASON: Stop sign is fully visible with no obstructions.

VERDICT: MISSING
REASON: No sign is visible where one is expected based on the GPS location.
"""


def lambda_handler(event, context):
    record = event['Records'][0]
    bucket = record['s3']['bucket']['name']
    key = record['s3']['object']['key']

    head = s3.head_object(Bucket=bucket, Key=key)
    meta = head.get('Metadata', {})

    sign_id = meta.get('sign-id', 'unknown')
    sign_type = meta.get('sign-type', 'road sign')
    category = meta.get('category', '')
    description = meta.get('description', '')
    lat = meta.get('lat', '0')
    lng = meta.get('lng', '0')
    session_id = meta.get('session-id', 'unknown')
    timestamp = int(meta.get('timestamp', str(int(datetime.now().timestamp() * 1000))))

    obj = s3.get_object(Bucket=bucket, Key=key)
    image_bytes = obj['Body'].read()
    image_b64 = base64.b64encode(image_bytes).decode('utf-8')

    bedrock = boto3.client('bedrock-runtime', region_name=os.environ.get('AWS_REGION', 'us-west-2'))

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 200,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": image_b64,
                    },
                },
                {
                    "type": "text",
                    "text": PROMPT.format(sign_type=sign_type, lat=lat, lng=lng),
                },
            ],
        }],
    })

    response = bedrock.invoke_model(
        modelId=MODEL_ID,
        body=body,
        contentType='application/json',
        accept='application/json',
    )

    result = json.loads(response['body'].read())
    text = result['content'][0]['text'].strip()

    verdict = 'UNCLEAR'
    reason = ''
    for line in text.splitlines():
        if line.startswith('VERDICT:'):
            verdict = line.split(':', 1)[1].strip()
        elif line.startswith('REASON:'):
            reason = line.split(':', 1)[1].strip()

    print(f"sign={sign_type} verdict={verdict} reason={reason} session={session_id}")

    if verdict in ('OBSCURED', 'MISSING'):
        table = dynamodb.Table(FLAGS_TABLE)
        table.put_item(Item={
            'id': f"{session_id}#{timestamp}",
            'session_id': session_id,
            'timestamp': timestamp,
            'sign_id': sign_id,
            'sign_type': sign_type,
            'category': category,
            'description': description,
            'lat': decimal.Decimal(lat),
            'lng': decimal.Decimal(lng),
            's3_key': key,
            'verdict': verdict,
            'reason': reason,
            'reported': False,
        })
        print(f"Flag written: {session_id}/{timestamp}")

    return {'statusCode': 200}
