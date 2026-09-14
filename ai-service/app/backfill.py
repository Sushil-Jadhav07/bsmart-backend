"""Index existing content right away instead of waiting for the background worker.

    python -m app.backfill                # continue from the saved checkpoints
    python -m app.backfill --days 90 --reset
"""
import argparse
import dataclasses
import logging
import time

from .config import load_settings
from .index import VectorIndex
from .indexer import build_indexer
from .items import SOURCES
from .store import Store
from .sync import SyncWorker


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--days', type=int, help='how far back to index (default: AI_INDEX_DAYS)')
    parser.add_argument('--reset', action='store_true', help='forget the checkpoints and start again')
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    settings = load_settings()
    if args.days:
        settings = dataclasses.replace(settings, index_days=args.days)

    store = Store(settings)
    store.ensure_indexes()
    if args.reset:
        store.state.delete_many({'_id': {'$in': [f'sync:{name}' for name in SOURCES]}})

    index = VectorIndex()
    worker = SyncWorker(settings, store, index, lambda: build_indexer(settings, store, index))
    total, started = 0, time.time()
    while True:
        processed = worker.sync_new()
        if not processed:
            break
        total += processed
        logging.info('%d documents read (%.0f/s)', total, total / max(time.time() - started, 1e-6))
    logging.info('Done: %d documents read, %d vectors in the index', total, len(index))


if __name__ == '__main__':
    main()
