"""bSmart AI service API (internal only).

Run:  uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8001
Every /v1 endpoint needs the shared secret in the X-AI-Token header.
"""
import hmac
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

from .config import load_settings
from .index import TYPE_CODES, VectorIndex
from .indexer import build_indexer
from .store import Store, to_object_id
from .sync import SyncWorker
from .tagging import load_taxonomy
from .users import UserVectors

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
log = logging.getLogger('ai-service')


class CandidatesRequest(BaseModel):
    user_id: str
    k: int = Field(200, ge=1, le=1000)
    types: list[str] = Field(default_factory=lambda: ['post', 'reel', 'tweet'])
    exclude_author_ids: list[str] = Field(default_factory=list, max_length=5000)
    exclude_item_ids: list[str] = Field(default_factory=list, max_length=5000)
    since_days: int = Field(30, ge=1, le=365)


class ScoreRequest(BaseModel):
    user_id: str
    item_ids: list[str] = Field(..., max_length=2000)


def _hits(hits):
    return [{'item_id': item_id, 'item_type': item_type, 'score': round(score, 4)}
            for item_id, item_type, score in hits]


def create_app(settings=None, store=None, encoder=None, taxonomy=None):
    settings = settings or load_settings()
    store = store or Store(settings)
    taxonomy = taxonomy or load_taxonomy()
    index = VectorIndex()
    users = UserVectors(settings, store, index)
    worker = SyncWorker(settings, store, index,
                        lambda: build_indexer(settings, store, index, encoder=encoder, taxonomy=taxonomy))

    @asynccontextmanager
    async def lifespan(_app):
        store.ensure_indexes()
        if not settings.token:
            log.warning('AI_SERVICE_TOKEN is not set: every /v1 request will be refused')
        if settings.run_background:
            worker.start()
        yield
        worker.stop()

    app = FastAPI(title='bSmart AI service', version='1.0.0', lifespan=lifespan)
    app.state.settings, app.state.store, app.state.index = settings, store, index
    app.state.users, app.state.worker = users, worker

    def require_token(x_ai_token: str | None = Header(default=None)):
        if not settings.token or not hmac.compare_digest((x_ai_token or '').encode(), settings.token.encode()):
            raise HTTPException(status_code=401, detail='Invalid or missing X-AI-Token')

    def parse_user(user_id):
        oid = to_object_id(user_id)
        if oid is None:
            raise HTTPException(status_code=400, detail='user_id must be a valid id')
        return oid

    def check_types(types):
        unknown = [t for t in types if t not in TYPE_CODES]
        if unknown:
            raise HTTPException(status_code=400, detail=f'Unknown item types: {", ".join(unknown)}')

    @app.get('/health')
    def health():
        return {'status': 'ok', 'items_indexed': len(index), 'worker': worker.status, 'model': worker.model_name}

    @app.post('/v1/candidates', dependencies=[Depends(require_token)])
    def candidates(req: CandidatesRequest):
        """Items closest to the user's taste. The caller still applies its own
        privacy and block filters; these are only a head start."""
        user_id = parse_user(req.user_id)
        check_types(req.types)
        taste = users.get(user_id)
        if taste is None:
            return {'items': [], 'has_profile': False}
        since = datetime.now(timezone.utc) - timedelta(days=req.since_days)
        hits = index.search(taste, req.k, types=req.types, since=since,
                            exclude_authors=[*req.exclude_author_ids, str(user_id)],
                            exclude_ids=req.exclude_item_ids)
        return {'items': _hits(hits), 'has_profile': True}

    @app.post('/v1/score', dependencies=[Depends(require_token)])
    def score(req: ScoreRequest):
        """Cosine similarity between the user's taste and each item (items
        without a vector are left out)."""
        taste = users.get(parse_user(req.user_id))
        if taste is None:
            return {'scores': {}, 'has_profile': False}
        scores = {}
        for item_id in req.item_ids:
            vector = index.get(item_id)
            if vector is not None:
                scores[item_id] = round(float(vector @ taste), 4)
        return {'scores': scores, 'has_profile': True}

    @app.get('/v1/items/{item_id}/similar', dependencies=[Depends(require_token)])
    def similar(item_id: str, k: int = Query(20, ge=1, le=100), types: str | None = None):
        vector = index.get(item_id)
        if vector is None:
            raise HTTPException(status_code=404, detail='Item is not indexed')
        type_list = [t for t in (types or '').split(',') if t] or None
        if type_list:
            check_types(type_list)
        return {'items': _hits(index.search(vector, k, types=type_list, exclude_ids=[item_id]))}

    @app.post('/v1/users/{user_id}/refresh', dependencies=[Depends(require_token)])
    def refresh_user(user_id: str):
        taste, used = users.build(parse_user(user_id))
        return {'has_profile': taste is not None, 'items_used': used}

    @app.get('/v1/taxonomy', dependencies=[Depends(require_token)])
    def get_taxonomy():
        return {'labels': [{'id': label['id'], 'terms': label.get('terms') or [label['id']]}
                           for label in taxonomy['labels']]}

    return app
