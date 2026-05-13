from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Location(BaseModel):
    id: str
    name: str
    description: str
    item_ids: list[str] = Field(default_factory=list)
    connected_location_ids: list[str] = Field(default_factory=list)


class Item(BaseModel):
    id: str
    name: str
    description: str
    location_id: str  # sentinel: "inventory"
    is_takeable: bool
    is_locked: bool = False
    unlock_item_id: str | None = None  # item required in inventory to take this


class Puzzle(BaseModel):
    id: str
    location_id: str
    description: str
    solution: str  # server-side only — stripped before sending to LLM
    is_solved: bool = False
    reward_item_id: str | None = None  # item placed in location on solve


class WinCondition(BaseModel):
    description: str
    target_location_id: str
    required_solved_puzzle_ids: list[str] = Field(default_factory=list)
    is_met: bool = False


StateChangeType = Literal[
    "move_player", "take_item", "use_item", "move_item", "solve_puzzle"
]


class StateChange(BaseModel):
    type: StateChangeType
    item_id: str | None = None
    from_location: str | None = None
    to_location: str | None = None
    puzzle_id: str | None = None
    attempted_solution: str | None = None  # LLM must actively fill; default null


class TurnResult(BaseModel):
    narration: str
    state_changes: list[StateChange] = Field(default_factory=list)
    is_won: bool = False


class WorldState(BaseModel):
    session_id: str
    current_location_id: str
    locations: dict[str, Location]
    items: dict[str, Item]
    inventory: list[str] = Field(default_factory=list)
    puzzles: dict[str, Puzzle]
    win_condition: WinCondition
    turn_count: int = 0
    is_won: bool = False
    history: list[dict] = Field(default_factory=list)  # [{action, narration}, …]

    @model_validator(mode="after")
    def _check_referential_integrity(self) -> WorldState:
        loc_ids = set(self.locations)
        item_ids = set(self.items)

        if self.current_location_id not in loc_ids:
            raise ValueError(
                f"current_location_id '{self.current_location_id}' not in locations"
            )
        if self.win_condition.target_location_id not in loc_ids:
            raise ValueError(
                f"win_condition.target_location_id '{self.win_condition.target_location_id}' not in locations"
            )
        for pid in self.win_condition.required_solved_puzzle_ids:
            if pid not in self.puzzles:
                raise ValueError(
                    f"win_condition.required_solved_puzzle_ids references unknown puzzle '{pid}'"
                )

        for loc in self.locations.values():
            for cid in loc.connected_location_ids:
                if cid not in loc_ids:
                    raise ValueError(
                        f"Location '{loc.id}' references unknown connected location '{cid}'"
                    )
            for iid in loc.item_ids:
                if iid not in item_ids:
                    raise ValueError(
                        f"Location '{loc.id}' references unknown item '{iid}'"
                    )

        for item in self.items.values():
            if item.unlock_item_id and item.unlock_item_id not in item_ids:
                raise ValueError(
                    f"Item '{item.id}' unlock_item_id '{item.unlock_item_id}' not in items"
                )
            if item.location_id != "inventory" and item.location_id not in loc_ids:
                raise ValueError(
                    f"Item '{item.id}' location_id '{item.location_id}' not in locations"
                )

        for puzzle in self.puzzles.values():
            if puzzle.location_id not in loc_ids:
                raise ValueError(
                    f"Puzzle '{puzzle.id}' location_id '{puzzle.location_id}' not in locations"
                )
            if puzzle.reward_item_id and puzzle.reward_item_id not in item_ids:
                raise ValueError(
                    f"Puzzle '{puzzle.id}' reward_item_id '{puzzle.reward_item_id}' not in items"
                )

        for iid in self.inventory:
            if iid not in item_ids:
                raise ValueError(f"Inventory references unknown item '{iid}'")

        return self

    def safe_context(self) -> dict:
        """Return state dict for LLM context with puzzle solutions stripped."""
        data = self.model_dump()
        for puzzle in data["puzzles"].values():
            puzzle.pop("solution", None)
        return data
