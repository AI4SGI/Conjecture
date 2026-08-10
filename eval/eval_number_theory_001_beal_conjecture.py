#!/usr/bin/env python3
"""Exact offline verifier for the OPBench Beal Conjecture task."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


KEYS = ("A", "B", "C", "x", "y", "z")


def _is_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def verify(candidate: Any) -> dict[str, Any]:
    conditions: list[dict[str, Any]] = []

    def add(condition_id: int, condition: str, passed: bool, reason: str) -> None:
        conditions.append(
            {
                "condition_id": condition_id,
                "condition": condition,
                "passed": passed,
                "reason": reason,
            }
        )

    if not isinstance(candidate, dict) or tuple(candidate) != KEYS:
        add(1, "The output has exactly the declared six integer keys.", False,
            f"Expected keys {list(KEYS)} in order.")
        return _result(conditions, None, output_parsing=False)

    values_are_integers = all(_is_integer(candidate[key]) for key in KEYS)
    add(1, "All declared values are integers.", values_are_integers,
        "Boolean, string, floating-point, and missing values are rejected.")
    if not values_are_integers:
        return _result(conditions, None, output_parsing=True)

    a, b, c, x, y, z = (candidate[key] for key in KEYS)
    positive_bases = all(value > 0 for value in (a, b, c))
    add(2, "$A,B,C\\in\\mathbb Z_{>0}$.", positive_bases,
        f"A={a}, B={b}, C={c}.")
    exponent_bound = all(value > 2 for value in (x, y, z))
    add(3, "$x,y,z>2$.", exponent_bound, f"x={x}, y={y}, z={z}.")
    common_gcd = math.gcd(math.gcd(a, b), c) if positive_bases else None
    coprime = common_gcd == 1
    add(4, "$\\gcd(A,B,C)=1$.", coprime,
        f"The common gcd is {common_gcd}." if common_gcd is not None else "The bases are invalid.")

    metric = None
    equality = False
    if positive_bases and exponent_bound:
        left = pow(a, x) + pow(b, y)
        right = pow(c, z)
        metric = abs(left - right)
        equality = left == right
        reason = f"Exact arithmetic gives left={left}, right={right}, residual={metric}."
    else:
        reason = "The exact powers are not evaluated until domain constraints pass."
    add(5, "$A^x+B^y=C^z$.", equality, reason)
    return _result(conditions, metric, output_parsing=True)


def _result(
    conditions: list[dict[str, Any]], metric: int | None, *, output_parsing: bool
) -> dict[str, Any]:
    passed = bool(conditions) and output_parsing and all(item["passed"] for item in conditions)
    return {
        "passed": passed,
        "output_parsing": output_parsing,
        "metric": metric,
        "verification_conditions": conditions,
        "failed_conditions": [item["condition"] for item in conditions if not item["passed"]],
    }


def _load_candidate(path_value: str | None) -> Any:
    text = Path(path_value).read_text(encoding="utf-8") if path_value else sys.stdin.read()
    payload = json.loads(text)
    return payload.get("output", payload) if isinstance(payload, dict) else payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", nargs="?", help="JSON candidate/result file; stdin if omitted")
    args = parser.parse_args()
    try:
        result = verify(_load_candidate(args.candidate))
    except (OSError, json.JSONDecodeError) as error:
        result = {
            "passed": False,
            "output_parsing": False,
            "metric": None,
            "verification_conditions": [],
            "failed_conditions": [str(error)],
        }
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
