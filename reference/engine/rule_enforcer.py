"""Pure-Python validator and state applier. No I/O, no async."""
from __future__ import annotations

import copy

from .models import StateChange, TurnResult, WorldState

MAX_HISTORY = 15


def validate(world_state: WorldState, turn_result: TurnResult) -> list[str]:
    """Return a list of violation messages. Empty list means all changes are valid."""
    violations: list[str] = []
    loc_ids = set(world_state.locations)
    item_ids = set(world_state.items)
    current_loc = world_state.locations[world_state.current_location_id]

    for sc in turn_result.state_changes:
        violations.extend(_validate_change(sc, world_state, current_loc, loc_ids, item_ids))

    return violations


def _validate_change(
    sc: StateChange,
    ws: WorldState,
    current_loc,
    loc_ids: set[str],
    item_ids: set[str],
) -> list[str]:
    v: list[str] = []

    if sc.type == "move_player":
        if not sc.to_location:
            v.append("move_player missing to_location")
        elif sc.to_location not in loc_ids:
            v.append(f"move_player: unknown location '{sc.to_location}'")
        elif sc.to_location not in current_loc.connected_location_ids:
            v.append(
                f"move_player: '{sc.to_location}' is not connected to '{ws.current_location_id}'"
            )

    elif sc.type == "take_item":
        if not sc.item_id:
            v.append("take_item missing item_id")
        elif sc.item_id not in item_ids:
            v.append(f"take_item: unknown item '{sc.item_id}'")
        else:
            item = ws.items[sc.item_id]
            if sc.item_id not in current_loc.item_ids:
                v.append(f"take_item: '{sc.item_id}' is not in current location")
            elif sc.item_id in ws.inventory:
                v.append(f"take_item: '{sc.item_id}' already in inventory")
            elif not item.is_takeable:
                v.append(f"take_item: '{sc.item_id}' is not takeable")
            elif item.is_locked:
                if not item.unlock_item_id or item.unlock_item_id not in ws.inventory:
                    v.append(
                        f"take_item: '{sc.item_id}' is locked — need '{item.unlock_item_id}' in inventory"
                    )

    elif sc.type == "use_item":
        if not sc.item_id:
            v.append("use_item missing item_id")
        elif sc.item_id not in item_ids:
            v.append(f"use_item: unknown item '{sc.item_id}'")
        elif sc.item_id not in ws.inventory:
            v.append(f"use_item: '{sc.item_id}' not in inventory")

    elif sc.type == "move_item":
        if not sc.item_id:
            v.append("move_item missing item_id")
        elif sc.item_id not in item_ids:
            v.append(f"move_item: unknown item '{sc.item_id}'")
        elif sc.item_id not in current_loc.item_ids:
            v.append(f"move_item: '{sc.item_id}' is not in current location")
        elif not sc.to_location or sc.to_location not in loc_ids:
            v.append(f"move_item: invalid to_location '{sc.to_location}'")

    elif sc.type == "solve_puzzle":
        if not sc.puzzle_id:
            v.append("solve_puzzle missing puzzle_id")
        elif sc.puzzle_id not in ws.puzzles:
            v.append(f"solve_puzzle: unknown puzzle '{sc.puzzle_id}'")
        else:
            puzzle = ws.puzzles[sc.puzzle_id]
            if puzzle.location_id != ws.current_location_id:
                v.append(
                    f"solve_puzzle: puzzle '{sc.puzzle_id}' is not in current location"
                )
            elif puzzle.is_solved:
                v.append(f"solve_puzzle: puzzle '{sc.puzzle_id}' already solved")
            elif not sc.attempted_solution or sc.attempted_solution.strip().lower() != puzzle.solution.strip().lower():
                v.append(
                    f"solve_puzzle: wrong solution for puzzle '{sc.puzzle_id}'"
                )

    return v


def apply(world_state: WorldState, turn_result: TurnResult) -> WorldState:
    """Apply all state changes and return a new WorldState. Assumes validate() returned []."""
    ws = world_state.model_copy(deep=True)

    for sc in turn_result.state_changes:
        _apply_change(ws, sc)

    ws.is_won = _check_win(ws)
    ws.turn_count += 1
    _append_history(ws, turn_result.narration)
    return ws


def _apply_change(ws: WorldState, sc: StateChange) -> None:
    if sc.type == "move_player":
        ws.current_location_id = sc.to_location  # type: ignore[assignment]

    elif sc.type == "take_item":
        iid = sc.item_id
        loc = ws.locations[ws.current_location_id]
        if iid in loc.item_ids:
            loc.item_ids.remove(iid)
        ws.items[iid].location_id = "inventory"  # type: ignore[index]
        if iid not in ws.inventory:
            ws.inventory.append(iid)  # type: ignore[arg-type]

    elif sc.type == "use_item":
        pass  # narration-only side effect; enforcer already verified it's in inventory

    elif sc.type == "move_item":
        iid = sc.item_id
        from_loc = ws.locations[ws.current_location_id]
        if iid in from_loc.item_ids:
            from_loc.item_ids.remove(iid)
        dest = ws.locations[sc.to_location]  # type: ignore[index]
        if iid not in dest.item_ids:
            dest.item_ids.append(iid)
        ws.items[iid].location_id = sc.to_location  # type: ignore[assignment,index]

    elif sc.type == "solve_puzzle":
        puzzle = ws.puzzles[sc.puzzle_id]  # type: ignore[index]
        puzzle.is_solved = True
        if puzzle.reward_item_id:
            loc = ws.locations[ws.current_location_id]
            if puzzle.reward_item_id not in loc.item_ids:
                loc.item_ids.append(puzzle.reward_item_id)
            ws.items[puzzle.reward_item_id].location_id = ws.current_location_id


def _check_win(ws: WorldState) -> bool:
    if ws.current_location_id != ws.win_condition.target_location_id:
        return False
    return all(
        ws.puzzles[pid].is_solved
        for pid in ws.win_condition.required_solved_puzzle_ids
    )


def _append_history(ws: WorldState, narration: str, action: str = "") -> None:
    ws.history.append({"action": action, "narration": narration})
    if len(ws.history) > MAX_HISTORY:
        ws.history = ws.history[-MAX_HISTORY:]


def apply_fallback(world_state: WorldState, action: str) -> WorldState:
    """Return a new WorldState with 'Nothing happens.' recorded and turn incremented."""
    ws = world_state.model_copy(deep=True)
    ws.turn_count += 1
    _append_history(ws, "Nothing happens.", action)
    return ws
