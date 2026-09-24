"""Select public web configuration explicitly; no administrative or Gemini secrets."""
import json
import os
from pathlib import Path

target = os.environ['FIREBASE_TARGET']
if target not in ('production', 'preview'):
    raise SystemExit('Invalid Firebase build target')
config = json.loads(Path(f'config/firebase-{target}.json').read_text())
fields = {'projectId': 'PROJECT_ID', 'apiKey': 'API_KEY', 'authDomain': 'AUTH_DOMAIN', 'appId': 'APP_ID'}
with open(os.environ['GITHUB_ENV'], 'a') as output:
    for key, suffix in fields.items():
        value = config[key]
        if not isinstance(value, str) or not value or '\n' in value or '\r' in value:
            raise SystemExit(f'Invalid public Firebase setting: {key}')
        output.write(f'VITE_FIREBASE_{suffix}={value}\n')
print(f'Firebase build target: {target} ({config["projectId"]})')
