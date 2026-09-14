"""Test fixtures: a throwaway mongod (the binary the Node tests download) and
the fake encoder, so no model download is needed."""
import glob
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import pytest
from PIL import Image
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings  # noqa: E402

REPO = Path(__file__).resolve().parents[2]

TEST_TAXONOMY = {
    'labels': [
        {'id': 'cricket', 'terms': ['cricket'], 'prompts': ['cricket', 'cricket match', 'cricket bat']},
        {'id': 'food', 'terms': ['food', 'streetfood'], 'prompts': ['food', 'street food', 'tasty food']},
        {'id': 'red', 'terms': ['red'], 'prompts': ['red']},
    ],
    'distractors': [
        {'id': 'person', 'prompts': ['selfie', 'person selfie']},
    ],
}


def _mongod_binary():
    if os.environ.get('MONGOD_BINARY'):
        return os.environ['MONGOD_BINARY']
    for pattern in (REPO / 'node_modules/.cache/mongodb-memory-server/mongod*',
                    Path.home() / '.cache/mongodb-binaries/*/mongod*'):
        found = sorted(p for p in glob.glob(str(pattern)) if not p.endswith('.lock'))
        if found:
            return found[-1]
    return shutil.which('mongod')


@pytest.fixture(scope='session')
def mongo_uri():
    binary = _mongod_binary()
    if not binary:
        pytest.skip('No mongod binary: set MONGOD_BINARY, or run the Node feed tests once to download one')
    dbpath = tempfile.mkdtemp(prefix='ai-service-test-')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    process = subprocess.Popen([binary, '--dbpath', dbpath, '--port', str(port), '--bind_ip', '127.0.0.1', '--quiet'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    uri = f'mongodb://127.0.0.1:{port}/ai_service_test'
    client = MongoClient(uri, serverSelectionTimeoutMS=300)
    for _ in range(150):
        try:
            client.admin.command('ping')
            break
        except Exception:
            time.sleep(0.1)
    else:
        process.kill()
        pytest.fail('mongod did not start')
    yield uri
    client.close()
    process.terminate()
    process.wait(timeout=15)
    shutil.rmtree(dbpath, ignore_errors=True)


@pytest.fixture
def settings(mongo_uri):
    return Settings(mongo_uri=mongo_uri, token='test-token', encoder='fake',
                    public_base_url='https://api.test', cloudfront_base_url='https://cdn.test',
                    run_background=False, sync_batch=100, tag_min_prob=0.3)


@pytest.fixture
def store(settings):
    from app.store import Store
    s = Store(settings)
    s.client.drop_database(s.db.name)
    s.ensure_indexes()
    yield s
    s.client.close()


@pytest.fixture
def fake_images(monkeypatch):
    """Serves solid-colour images instead of downloading: the colour comes from
    the URL ('red' in the URL → a red image). URLs containing 'broken' fail."""
    from app import media

    colours = {'red': (220, 20, 20), 'green': (20, 200, 20), 'blue': (20, 20, 220)}
    downloaded = []

    def download(url, _settings):
        downloaded.append(url)
        if 'broken' in url:
            return None
        colour = next((rgb for name, rgb in colours.items() if name in url), (128, 128, 128))
        return Image.new('RGB', (32, 32), colour)

    monkeypatch.setattr(media, 'download_image', download)
    monkeypatch.setattr(media, 'extract_video_frames', lambda url, _settings, offsets=(1, 4, 8): [])
    return downloaded
