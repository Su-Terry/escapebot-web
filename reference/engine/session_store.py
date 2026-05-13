"""Async JSON persistence for WorldState, with per-user locking."""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from .models import WorldState

logger = logging.getLogger(__name__)

_USER_DIR = Path("User/users")
_locks: dict[str, asyncio.Lock] = {}


def _lock_for(username: str) -> asyncio.Lock:
    if username not in _locks:
        _locks[username] = asyncio.Lock()
    return _locks[username]


def has_played_before(username: str) -> bool:
    """Return True if a saved session file already exists for this user."""
    return (_USER_DIR / f"{username}.json").exists()


async def load(username: str) -> WorldState | None:
    async with _lock_for(username):
        path = _USER_DIR / f"{username}.json"
        if not path.exists():
            return None
        try:
            return WorldState.model_validate_json(path.read_text("utf-8"))
        except Exception:
            logger.exception("Failed to load session for %s", username)
            return None


async def save(username: str, state: WorldState) -> None:
    async with _lock_for(username):
        _USER_DIR.mkdir(parents=True, exist_ok=True)
        path = _USER_DIR / f"{username}.json"
        path.write_text(state.model_dump_json(indent=2), "utf-8")


async def delete(username: str) -> None:
    async with _lock_for(username):
        path = _USER_DIR / f"{username}.json"
        if path.exists():
            path.unlink()
