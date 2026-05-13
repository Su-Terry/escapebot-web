"""Utilities for Gemini API compatibility.

Gemini's structured output rejects several JSON Schema fields that Pydantic v2 emits.
`to_gemini_schema` resolves $ref/$defs and strips all unsupported fields so the
resulting dict is safe to pass as response_schema.
"""
from __future__ import annotations

from typing import Any


# Fields Gemini's schema parser rejects outright
_UNSUPPORTED = frozenset({
    "additionalProperties",
    "$defs",
    "$schema",
    "examples",
})

# After ref-resolution these are no longer needed
_POST_RESOLVE_STRIP = frozenset({"$ref", "definitions"})


def to_gemini_schema(pydantic_cls) -> dict:
    """Convert a Pydantic model class to a Gemini-compatible JSON Schema dict.

    Steps:
    1. Generate schema with model_json_schema()
    2. Inline all $ref references from $defs
    3. Strip Gemini-unsupported fields recursively
    """
    schema = pydantic_cls.model_json_schema()
    defs = schema.get("$defs", {})
    resolved = _resolve_refs(schema, defs, seen=set())
    return _strip_unsupported(resolved)


def _resolve_refs(obj: Any, defs: dict, seen: set[str]) -> Any:
    """Recursively inline all $ref references."""
    if isinstance(obj, dict):
        if "$ref" in obj:
            ref_path: str = obj["$ref"]  # e.g. "#/$defs/Location"
            ref_name = ref_path.split("/")[-1]
            if ref_name in seen:
                # Circular reference guard: return a bare object type
                return {"type": "object"}
            if ref_name in defs:
                return _resolve_refs(defs[ref_name], defs, seen | {ref_name})
            return obj  # unknown ref — leave as-is
        return {k: _resolve_refs(v, defs, seen) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_resolve_refs(item, defs, seen) for item in obj]
    return obj


def _strip_unsupported(obj: Any) -> Any:
    """Strip Gemini-unsupported schema fields recursively."""
    strip = _UNSUPPORTED | _POST_RESOLVE_STRIP
    if isinstance(obj, dict):
        cleaned = {k: _strip_unsupported(v) for k, v in obj.items() if k not in strip}
        # Convert anyOf:[..., {type:null}] → nullable form Gemini prefers
        return _maybe_flatten_nullable(cleaned)
    elif isinstance(obj, list):
        return [_strip_unsupported(item) for item in obj]
    return obj


def _maybe_flatten_nullable(obj: dict) -> dict:
    """If obj is `anyOf: [X, {type: null}]`, return `{...X, nullable: true}`.

    Pydantic v2 renders `T | None` as anyOf with a null branch.
    Gemini prefers the nullable property instead.
    """
    if "anyOf" not in obj:
        return obj
    branches = obj["anyOf"]
    if not isinstance(branches, list) or len(branches) != 2:
        return obj
    null_branch = {"type": "null"}
    non_null = [b for b in branches if b != null_branch]
    if len(non_null) != 1:
        return obj
    result = dict(non_null[0])
    result["nullable"] = True
    # preserve any sibling keys on obj (e.g. "description", "default")
    for k, v in obj.items():
        if k != "anyOf" and k not in result:
            result[k] = v
    return result
