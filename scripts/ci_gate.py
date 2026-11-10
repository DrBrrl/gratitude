#!/usr/bin/env python3
"""Fail closed unless every required category of CI verification succeeded."""
import json
import os

REQUIRED = {'plan', 'build', 'backend', 'firebase', 'import-scale', 'push'}


def failures(results):
    return {name: results.get(name, {}).get('result', 'missing')
            for name in sorted(REQUIRED | set(results))
            if results.get(name, {}).get('result') != 'success'}


if __name__ == '__main__':
    failed = failures(json.loads(os.environ['RESULTS']))
    if failed:
        raise SystemExit(f'Required checks did not succeed: {failed}')
    print('All planned checks passed.')
