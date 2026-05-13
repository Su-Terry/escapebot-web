"""EscapeBot LLM-driven game engine."""
from __future__ import annotations

import logging

from . import rule_enforcer
from .models import WorldState
from .scenario_generator import ScenarioGenerationError, generate
from .turn_handler import handle_turn

logger = logging.getLogger(__name__)

__all__ = ["WorldState", "generate", "process_turn", "ScenarioGenerationError"]


async def process_turn(world_state: WorldState, player_action: str) -> WorldState:
    """Run one game turn: call Turn Handler, validate, apply (with up to 2 retries).

    Returns a new WorldState. On persistent failure, records 'Nothing happens.'
    """
    violations: list[str] = []

    for attempt in range(3):
        try:
            turn_result = await handle_turn(
                world_state,
                player_action,
                correction=violations if attempt > 0 else None,
            )
        except Exception:
            logger.exception(
                "Turn handler raised on attempt %d for action %r", attempt + 1, player_action
            )
            break

        violations = rule_enforcer.validate(world_state, turn_result)
        if not violations:
            return rule_enforcer.apply(world_state, turn_result)

        logger.warning(
            "Turn handler attempt %d/%d produced invalid state changes: %s",
            attempt + 1, 3, violations,
        )

    logger.warning(
        "All turn handler attempts failed for action %r; falling back to 'Nothing happens.'",
        player_action,
    )
    return rule_enforcer.apply_fallback(world_state, player_action)
