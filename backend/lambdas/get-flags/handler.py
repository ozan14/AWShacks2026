import json
import os
import decimal
import boto3
from boto3.dynamodb.conditions import Attr

dynamodb = boto3.resource('dynamodb')
FLAGS_TABLE = os.environ['FLAGS_TABLE']

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
}


def decimal_to_float(obj):
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    raise TypeError


def lambda_handler(event, context):
    params = event.get('queryStringParameters') or {}
    session_id = params.get('session_id')

    if not session_id:
        return {
            'statusCode': 400,
            'headers': HEADERS,
            'body': json.dumps({'error': 'session_id is required'}),
        }

    table = dynamodb.Table(FLAGS_TABLE)
    response = table.scan(
        FilterExpression=Attr('session_id').eq(session_id)
    )

    flags = response.get('Items', [])

    return {
        'statusCode': 200,
        'headers': HEADERS,
        'body': json.dumps(flags, default=decimal_to_float),
    }
