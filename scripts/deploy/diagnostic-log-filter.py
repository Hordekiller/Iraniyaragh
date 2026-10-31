#!/usr/bin/env python3
"""Streaming filters for operator-only Docker logs; never reads env/secrets."""
import argparse
import json
import sys


def matches(entry, request_id=None, level=None, event=None):
    if request_id and request_id not in (entry.get('requestId'), entry.get('correlationId')):
        return False
    severity = entry.get('level', entry.get('severity'))
    if severity is None and isinstance(entry.get('statusCode'), int):
        status = entry['statusCode']
        severity = 'error' if status >= 500 else 'warn' if status >= 400 else 'info'
    return (not level or severity == level) and (not event or entry.get('event') == event)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request-id')
    parser.add_argument('--level', choices=['info', 'warn', 'error', 'debug', 'verbose', 'fatal'])
    parser.add_argument('--event')
    args = parser.parse_args()
    filtered = bool(args.request_id or args.level or args.event)
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
        except ValueError:
            if not filtered:
                print(line.rstrip(), flush=True)
            continue
        if isinstance(entry, dict) and matches(entry, args.request_id, args.level, args.event):
            print(json.dumps(entry, ensure_ascii=False, separators=(',', ':')), flush=True)


if __name__ == '__main__':
    try:
        main()
    except BrokenPipeError:
        pass
