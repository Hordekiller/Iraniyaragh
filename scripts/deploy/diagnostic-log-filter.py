#!/usr/bin/env python3
"""Streaming filters for operator-only Docker logs; never reads env/secrets."""
import argparse
import json
import re
import sys


def matches(entry, request_id=None, level=None, event=None):
    if request_id and request_id not in (entry.get('requestId'), entry.get('correlationId')):
        return False
    severity = entry.get('level', entry.get('severity'))
    if severity is None and isinstance(entry.get('statusCode'), int):
        status = entry['statusCode']
        severity = 'error' if status >= 500 else 'warn' if status >= 400 else 'info'
    return (not level or severity == level) and (not event or entry.get('event') == event)


def archive_record(entry):
    """Allowlisted operational metadata only; never re-export arbitrary logger data."""
    if not isinstance(entry.get('event'), str) or not re.fullmatch(r'[a-z][a-z0-9_.-]{0,99}', entry['event']):
        return None
    safe = {'event': entry['event']}
    patterns = {
        'timestamp': r'\d{4}-\d\d-\d\dT[0-9:.+Z-]{8,40}',
        'service': r'iranyaragh-[a-z-]{1,40}', 'version': r'(?:[0-9a-f]{40}|unknown)',
        'environment': r'(?:production|staging|development|test)',
        'requestId': r'[A-Za-z0-9._:-]{1,128}', 'correlationId': r'[A-Za-z0-9._:-]{1,128}',
        'level': r'(?:info|warn|error|fatal|debug|verbose)', 'severity': r'(?:info|warn|error|fatal|debug|verbose)',
        'outcome': r'(?:success|failure|unknown)', 'errorCode': r'[A-Z][A-Z0-9_]{0,79}',
        'route': r'(?:/[A-Za-z_/:.{}()\[\]-]{0,240}|/api/v1/[A-Za-z_/:.{}()-]{0,230}|unmatched)',
        'surface': r'(?:api|admin|storefront|media|media-upload|discovery)', 'method': r'(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|OTHER)',
        'upstreamStatus': r'[0-9, :.-]{0,50}', 'upstreamSeconds': r'[0-9, :.-]{0,100}',
    }
    for key, pattern in patterns.items():
        value = entry.get(key)
        if isinstance(value, str) and re.fullmatch(pattern, value):
            safe[key] = value
    for key in ['durationMs', 'durationSeconds', 'statusCode']:
        value = entry.get(key)
        if type(value) in (int, float) and 0 <= value <= 100000000:
            safe[key] = value
    source = entry.get('data')
    if isinstance(source, dict):
        data = {}
        for key in ['method', 'errorCode', 'causeCode', 'errorType', 'queue', 'jobRef']:
            value = source.get(key)
            if isinstance(value, str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9_.:-]{0,99}|[0-9a-f]{16}', value):
                data[key] = value
        for key in ['statusCode', 'attempt', 'claimed', 'published', 'deadLettered', 'accepted', 'pending', 'failed']:
            value = source.get(key)
            if type(value) is int and 0 <= value <= 100000000:
                data[key] = value
        if type(source.get('exhausted')) is bool:
            data['exhausted'] = source['exhausted']
        validation = []
        for item in source.get('validation', [])[:16] if isinstance(source.get('validation'), list) else []:
            if not isinstance(item, dict) or not isinstance(item.get('field'), str) or not re.fullmatch(r'[A-Za-z0-9_.\[\]-]{1,400}', item['field']):
                continue
            rules = [v for v in item.get('rules', [])[:8] if isinstance(v, str) and re.fullmatch(r'[A-Za-z]{1,40}', v)] if isinstance(item.get('rules'), list) else []
            validation.append({'field': item['field'], 'rules': rules})
        if validation:
            data['validation'] = validation
        frames = source.get('frames')
        if isinstance(frames, list):
            data['frames'] = [v for v in frames[:8] if isinstance(v, str) and re.fullmatch(r'(?:dist/src|src|\.next/server)/[A-Za-z0-9_./-]{1,180}\.[cm]?js:\d{1,7}:\d{1,6}', v)]
        if data:
            safe['data'] = data
    return safe


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request-id')
    parser.add_argument('--level', choices=['info', 'warn', 'error', 'debug', 'verbose', 'fatal'])
    parser.add_argument('--event')
    parser.add_argument('--archive-safe', action='store_true')
    args = parser.parse_args()
    filtered = bool(args.request_id or args.level or args.event or args.archive_safe)
    emitted = 0
    while True:
        line = sys.stdin.readline(65537)
        if not line:
            break
        if len(line) > 65536:
            while line and not line.endswith('\n'):
                line = sys.stdin.readline(65537)
            continue
        try:
            entry = json.loads(line)
        except (ValueError, RecursionError):
            if not filtered:
                print(line.rstrip(), flush=True)
            continue
        if isinstance(entry, dict) and matches(entry, args.request_id, args.level, args.event):
            if args.archive_safe:
                entry = archive_record(entry)
                if not entry or emitted >= 10000:
                    continue
            emitted += 1
            print(json.dumps(entry, ensure_ascii=False, separators=(',', ':')), flush=True)


if __name__ == '__main__':
    try:
        main()
    except BrokenPipeError:
        pass
