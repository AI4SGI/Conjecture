#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Run and deterministically verify exact polynomial-map counterexamples.

Model text is never executed and no LLM judge is used.  A response is scored
only through the exact sparse-polynomial certificate following
``FINAL_CERTIFICATE_JSON:``.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import multiprocessing
import os
import queue as queue_module
import re
import tempfile
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple


SCRIPT_FOLDER = Path(__file__).resolve().parent
REPOSITORY_ROOT = SCRIPT_FOLDER.parent
DATASET_PATH = REPOSITORY_ROOT / "problems" / "jacobian_conjecture.jsonl"
OUTPUT_ROOT = REPOSITORY_ROOT / "results"

# Formal evaluation configuration. Edit these values before running a model.
MODEL_LIST = [
    "claude-opus-4-8-thinking",
    "gemini-3.1-pro-preview-thinking",
    "glm-5.2",
    "gpt-5.5-xhigh",
    "kimi-k3",
]
MODEL = MODEL_LIST[0]
BASE_URL = "http://35.220.164.252:3888/v1"
API_KEY = os.environ.get("ROLLOUT_API_KEY", "")

TEMPERATURE = 1.0
TOP_P = 0.95
MAX_TOKENS = 128_000
API_TIMEOUT_SEC = 10_400
API_MAX_RETRIES = 0

MAX_CONCURRENCY = 10
RUN_NOHINT = True
RUN_HINT = True
REPEATS_PER_TASK = 1

VERIFY_TIMEOUT_SEC = 300
VERIFY_MEMORY_MB = 2_048

CERTIFICATE_MARKER = "FINAL_CERTIFICATE_JSON:"
BANNED_PROMPT_PHRASE = "jacobian conjecture"

MAX_CERTIFICATE_BYTES = 5_000_000
MAX_RESPONSE_BYTES = 10_000_000
MAX_TERMS_PER_POLYNOMIAL = 5_000
MAX_TOTAL_TERMS = 20_000
MAX_EXPONENT = 256
MAX_INTEGER_BITS = 16_384
MAX_FIELD_DEGREE = 256
MAX_POLY_WORK = 40_000_000
MAX_INTERMEDIATE_TERMS = 300_000

FieldElement = Tuple[Fraction, ...]
Exponent = Tuple[int, ...]
SparsePolynomial = Dict[Exponent, FieldElement]

_poly_work = 0


class CertificateError(ValueError):
    """A deterministic certificate-validation failure."""


def reset_work_counter() -> None:
    global _poly_work
    _poly_work = 0


def charge_work(amount: int) -> None:
    global _poly_work
    _poly_work += amount
    if _poly_work > MAX_POLY_WORK:
        raise CertificateError(
            f"symbolic-operation cap exceeded ({_poly_work}>{MAX_POLY_WORK})"
        )


def parse_int(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise CertificateError(f"{label} must be an integer")
    if value.bit_length() > MAX_INTEGER_BITS:
        raise CertificateError(f"{label} exceeds the integer-size cap")
    return value


def parse_rational(value: Any, label: str = "rational") -> Fraction:
    if isinstance(value, bool):
        raise CertificateError(f"{label} must not be boolean")
    if isinstance(value, int):
        return Fraction(parse_int(value, label), 1)
    if (
        isinstance(value, list)
        and len(value) == 2
        and all(isinstance(item, int) and not isinstance(item, bool) for item in value)
    ):
        numerator = parse_int(value[0], f"{label}.numerator")
        denominator = parse_int(value[1], f"{label}.denominator")
        if denominator == 0:
            raise CertificateError(f"{label} has zero denominator")
        return Fraction(numerator, denominator)
    raise CertificateError(
        f"{label} must be an integer or [numerator, denominator]"
    )


def rational_json(value: Fraction) -> Any:
    if value.denominator == 1:
        return value.numerator
    return [value.numerator, value.denominator]


@dataclass(frozen=True)
class ExactField:
    """Q or Q[alpha]/(a monic irreducible polynomial)."""

    modulus: Optional[Tuple[Fraction, ...]] = None

    @property
    def degree(self) -> int:
        return 1 if self.modulus is None else len(self.modulus) - 1

    @property
    def zero(self) -> FieldElement:
        return (Fraction(0),) * self.degree

    @property
    def one(self) -> FieldElement:
        return (Fraction(1),) + (Fraction(0),) * (self.degree - 1)

    def element(self, coefficients: Sequence[Fraction]) -> FieldElement:
        if self.modulus is None:
            if any(coefficients[index] for index in range(1, len(coefficients))):
                raise CertificateError("non-rational element without a number field")
            return (coefficients[0] if coefficients else Fraction(0),)

        degree = self.degree
        reduced = list(coefficients)
        while len(reduced) < degree:
            reduced.append(Fraction(0))
        for power in range(len(reduced) - 1, degree - 1, -1):
            lead = reduced[power]
            if lead:
                offset = power - degree
                for index in range(degree):
                    reduced[offset + index] -= lead * self.modulus[index]
        return tuple(reduced[:degree])

    def add(self, left: FieldElement, right: FieldElement) -> FieldElement:
        return tuple(a + b for a, b in zip(left, right))

    def neg(self, value: FieldElement) -> FieldElement:
        return tuple(-item for item in value)

    def sub(self, left: FieldElement, right: FieldElement) -> FieldElement:
        return tuple(a - b for a, b in zip(left, right))

    def mul(self, left: FieldElement, right: FieldElement) -> FieldElement:
        coefficients = [Fraction(0)] * (len(left) + len(right) - 1)
        for left_index, left_value in enumerate(left):
            for right_index, right_value in enumerate(right):
                coefficients[left_index + right_index] += left_value * right_value
        return self.element(coefficients)

    def scale_rational(
        self, value: FieldElement, scalar: Fraction | int
    ) -> FieldElement:
        factor = scalar if isinstance(scalar, Fraction) else Fraction(scalar)
        return tuple(factor * item for item in value)

    def power(self, value: FieldElement, exponent: int) -> FieldElement:
        if exponent < 0:
            raise CertificateError("negative field-element exponent")
        result = self.one
        base = value
        power = exponent
        while power:
            if power & 1:
                result = self.mul(result, base)
            if power > 1:
                base = self.mul(base, base)
            power >>= 1
        return result

    def is_zero(self, value: FieldElement) -> bool:
        return value == self.zero


def parse_field(value: Any) -> ExactField:
    if value is None:
        return ExactField()
    if not isinstance(value, dict) or set(value) != {"minimal_polynomial"}:
        raise CertificateError("field must contain only minimal_polynomial")
    raw = value["minimal_polynomial"]
    if not isinstance(raw, list) or len(raw) < 3:
        raise CertificateError(
            "minimal_polynomial must list degree >=2 coefficients low-to-high"
        )
    if len(raw) - 1 > MAX_FIELD_DEGREE:
        raise CertificateError("number-field degree exceeds the cap")
    coefficients = [
        parse_rational(item, f"minimal_polynomial[{index}]")
        for index, item in enumerate(raw)
    ]
    if coefficients[-1] != 1:
        raise CertificateError("minimal_polynomial must be monic")
    try:
        import sympy as sp
    except ModuleNotFoundError as exc:
        raise CertificateError(
            "SymPy is required to certify number-field irreducibility"
        ) from exc
    symbol = sp.Symbol("alpha")
    expression = sum(
        sp.Rational(coeff.numerator, coeff.denominator) * symbol**index
        for index, coeff in enumerate(coefficients)
    )
    if not sp.Poly(expression, symbol, domain=sp.QQ).is_irreducible:
        raise CertificateError("minimal_polynomial is reducible over Q")
    return ExactField(tuple(coefficients))


def parse_field_element(
    value: Any, field: ExactField, label: str
) -> FieldElement:
    if isinstance(value, dict):
        if set(value) != {"a"} or not isinstance(value["a"], list):
            raise CertificateError(f"{label} must be a field element {{'a': [...]}}")
        if field.modulus is None:
            raise CertificateError(f"{label} uses a field element without a field")
        if not 1 <= len(value["a"]) <= field.degree:
            raise CertificateError(
                f"{label}.a must contain between 1 and {field.degree} coefficients"
            )
        coefficients = [
            parse_rational(item, f"{label}.a[{index}]")
            for index, item in enumerate(value["a"])
        ]
        return field.element(coefficients)
    return field.element([parse_rational(value, label)])


def field_element_json(value: FieldElement) -> Any:
    if all(item == 0 for item in value[1:]):
        return rational_json(value[0])
    coefficients = list(value)
    while len(coefficients) > 1 and coefficients[-1] == 0:
        coefficients.pop()
    return {"a": [rational_json(item) for item in coefficients]}


def poly_add(
    field: ExactField,
    left: Mapping[Exponent, FieldElement],
    right: Mapping[Exponent, FieldElement],
) -> SparsePolynomial:
    result = dict(left)
    for exponent, coefficient in right.items():
        result[exponent] = field.add(
            result.get(exponent, field.zero), coefficient
        )
        if field.is_zero(result[exponent]):
            del result[exponent]
    return result


def poly_neg(
    field: ExactField, poly: Mapping[Exponent, FieldElement]
) -> SparsePolynomial:
    return {exponent: field.neg(coeff) for exponent, coeff in poly.items()}


def poly_mul(
    field: ExactField,
    left: Mapping[Exponent, FieldElement],
    right: Mapping[Exponent, FieldElement],
) -> SparsePolynomial:
    if not left or not right:
        return {}
    charge_work(len(left) * len(right))
    result: SparsePolynomial = {}
    for left_exp, left_coeff in left.items():
        for right_exp, right_coeff in right.items():
            exponent = tuple(a + b for a, b in zip(left_exp, right_exp))
            coefficient = field.mul(left_coeff, right_coeff)
            result[exponent] = field.add(
                result.get(exponent, field.zero), coefficient
            )
            if field.is_zero(result[exponent]):
                del result[exponent]
    if len(result) > MAX_INTERMEDIATE_TERMS:
        raise CertificateError("intermediate polynomial exceeds the term cap")
    return result


def poly_derivative(
    field: ExactField,
    poly: Mapping[Exponent, FieldElement],
    variable: int,
) -> SparsePolynomial:
    result: SparsePolynomial = {}
    for exponent, coefficient in poly.items():
        if exponent[variable] == 0:
            continue
        new_exp = list(exponent)
        multiplier = new_exp[variable]
        new_exp[variable] -= 1
        result[tuple(new_exp)] = field.scale_rational(coefficient, multiplier)
    return result


def poly_degree(poly: Mapping[Exponent, FieldElement]) -> int:
    if not poly:
        return -1
    return max(sum(exponent) for exponent in poly)


def parse_sparse_polynomial(
    value: Any,
    dimension: int,
    field: ExactField,
    *,
    label: str,
) -> SparsePolynomial:
    if not isinstance(value, list):
        raise CertificateError(f"{label} must be a list of sparse terms")
    if len(value) > MAX_TERMS_PER_POLYNOMIAL:
        raise CertificateError(f"{label} exceeds the term cap")
    result: SparsePolynomial = {}
    for index, term in enumerate(value):
        if not isinstance(term, dict) or set(term) != {"c", "e"}:
            raise CertificateError(
                f"{label}[{index}] must have exactly keys 'c' and 'e'"
            )
        powers = term["e"]
        if (
            not isinstance(powers, list)
            or len(powers) != dimension
            or any(
                isinstance(power, bool)
                or not isinstance(power, int)
                or power < 0
                or power > MAX_EXPONENT
                for power in powers
            )
        ):
            raise CertificateError(f"{label}[{index}].e has invalid exponents")
        coefficient = parse_field_element(
            term["c"], field, f"{label}[{index}].c"
        )
        exponent = tuple(powers)
        result[exponent] = field.add(
            result.get(exponent, field.zero), coefficient
        )
        if field.is_zero(result[exponent]):
            del result[exponent]
    return result


def permutation_sign(permutation: Sequence[int]) -> int:
    inversions = sum(
        permutation[left] > permutation[right]
        for left in range(len(permutation))
        for right in range(left + 1, len(permutation))
    )
    return -1 if inversions % 2 else 1


def polynomial_matrix_determinant(
    matrix: Sequence[Sequence[SparsePolynomial]],
    field: ExactField,
) -> SparsePolynomial:
    dimension = len(matrix)
    if dimension not in (2, 3):
        raise CertificateError("determinants are supported only in dimensions 2 and 3")
    result: SparsePolynomial = {}
    zero_exponent = (0,) * dimension
    for permutation in itertools.permutations(range(dimension)):
        term: SparsePolynomial = {zero_exponent: field.one}
        for row, column in enumerate(permutation):
            term = poly_mul(field, term, matrix[row][column])
        if permutation_sign(permutation) < 0:
            term = poly_neg(field, term)
        result = poly_add(field, result, term)
    return result


def constant_value(
    poly: Mapping[Exponent, FieldElement],
    field: ExactField,
    dimension: int,
) -> Optional[FieldElement]:
    if not poly:
        return field.zero
    zero_exponent = (0,) * dimension
    if any(exponent != zero_exponent for exponent in poly):
        return None
    return poly[zero_exponent]


def evaluate_polynomial(
    poly: Mapping[Exponent, FieldElement],
    point: Sequence[FieldElement],
    field: ExactField,
) -> FieldElement:
    result = field.zero
    for exponent, coefficient in poly.items():
        term = coefficient
        for coordinate, power in zip(point, exponent):
            term = field.mul(term, field.power(coordinate, power))
        result = field.add(result, term)
    return result


def parse_map_candidate(
    task: Mapping[str, Any], candidate: Mapping[str, Any]
) -> Dict[str, Any]:
    allowed_keys = {"kind", "dimension", "field", "map", "points"}
    if set(candidate) - allowed_keys:
        extras = sorted(set(candidate) - allowed_keys)
        raise CertificateError(f"certificate has unsupported keys: {extras}")
    if candidate.get("kind") != "map_collision":
        raise CertificateError("kind must be map_collision")

    constraints = task["constraints"]
    dimension = parse_int(candidate.get("dimension"), "dimension")
    if dimension != constraints["dimension"]:
        raise CertificateError(f"dimension must equal {constraints['dimension']}")
    field = parse_field(candidate.get("field"))

    raw_map = candidate.get("map")
    if not isinstance(raw_map, list) or len(raw_map) != dimension:
        raise CertificateError(f"map must contain {dimension} coordinate polynomials")
    polynomials = [
        parse_sparse_polynomial(item, dimension, field, label=f"map[{index}]")
        for index, item in enumerate(raw_map)
    ]
    total_terms = sum(len(poly) for poly in polynomials)
    if total_terms > MAX_TOTAL_TERMS:
        raise CertificateError("map exceeds the total-term cap")

    derivatives = [
        [
            poly_derivative(field, polynomial, variable)
            for variable in range(dimension)
        ]
        for polynomial in polynomials
    ]
    determinant_poly = polynomial_matrix_determinant(derivatives, field)
    determinant = constant_value(determinant_poly, field, dimension)
    if determinant is None or field.is_zero(determinant):
        raise CertificateError("Jacobian determinant is not a nonzero constant")

    required_points = constraints["min_points"]
    raw_points = candidate.get("points")
    if not isinstance(raw_points, list) or len(raw_points) < required_points:
        raise CertificateError(f"at least {required_points} points are required")
    points: List[List[FieldElement]] = []
    for point_index, raw_point in enumerate(raw_points):
        if not isinstance(raw_point, list) or len(raw_point) != dimension:
            raise CertificateError(f"points[{point_index}] has the wrong dimension")
        points.append(
            [
                parse_field_element(
                    coordinate,
                    field,
                    f"points[{point_index}][{coordinate_index}]",
                )
                for coordinate_index, coordinate in enumerate(raw_point)
            ]
        )
    if len({tuple(point) for point in points}) != len(points):
        raise CertificateError("collision points must be pairwise distinct")

    images = [
        tuple(
            evaluate_polynomial(polynomial, point, field)
            for polynomial in polynomials
        )
        for point in points
    ]
    if any(image != images[0] for image in images[1:]):
        raise CertificateError("the submitted points do not have a common image")

    component_degrees = [poly_degree(poly) for poly in polynomials]
    nonrational_coefficient = any(
        any(value != 0 for value in coefficient[1:])
        for polynomial in polynomials
        for coefficient in polynomial.values()
    )
    return {
        "metrics": {
            "dimension": dimension,
            "component_degrees": component_degrees,
            "max_component_degree": max(component_degrees),
            "total_monomials": total_terms,
            "point_count": len(points),
            "field_degree": field.degree,
            "coefficient_domain": (
                f"number_field_degree_{field.degree}"
                if nonrational_coefficient
                else "Q"
            ),
            "jacobian_determinant": field_element_json(determinant),
        }
    }


def objective_pass(task: Mapping[str, Any], metrics: Mapping[str, Any]) -> bool:
    objective = task["objective"]
    if objective["kind"] == "counterexample":
        return True
    if objective["kind"] == "max_degree":
        return metrics["max_component_degree"] <= objective["value"]
    raise AssertionError(f"unknown objective kind: {objective['kind']}")


def verify_candidate(task: Mapping[str, Any], candidate: Any) -> Dict[str, Any]:
    reset_work_counter()
    result: Dict[str, Any] = {
        "math_valid": False,
        "objective_pass": False,
        "official_pass": False,
        "error": None,
        "metrics": {},
        "symbolic_work": 0,
    }
    try:
        if not isinstance(candidate, dict):
            raise CertificateError("certificate must be a JSON object")
        detail = parse_map_candidate(task, candidate)
        result["metrics"] = detail["metrics"]
        result["math_valid"] = True
        result["objective_pass"] = objective_pass(task, detail["metrics"])
        result["official_pass"] = (
            result["math_valid"] and result["objective_pass"]
        )
    except (CertificateError, KeyError, TypeError, OverflowError) as exc:
        result["error"] = str(exc)
    result["symbolic_work"] = _poly_work
    return result


def extract_output(response_text: str) -> str:
    if len(response_text.encode("utf-8")) > MAX_RESPONSE_BYTES:
        raise CertificateError("response exceeds the size cap")
    index = response_text.rfind(CERTIFICATE_MARKER)
    if index < 0:
        raise CertificateError(f"missing {CERTIFICATE_MARKER}")
    output = response_text[index + len(CERTIFICATE_MARKER) :].strip()
    if len(output.encode("utf-8")) > MAX_CERTIFICATE_BYTES:
        raise CertificateError("certificate JSON exceeds the size cap")
    return output


def parse_certificate_output(output: str) -> Dict[str, Any]:
    try:
        candidate = json.loads(output)
    except json.JSONDecodeError as exc:
        raise CertificateError(f"invalid certificate JSON: {exc}") from exc
    if not isinstance(candidate, dict):
        raise CertificateError("certificate JSON must be an object")
    return candidate


def _verify_worker(
    task: Dict[str, Any],
    candidate: Dict[str, Any],
    queue: multiprocessing.Queue,
    memory_mb: int,
    cpu_seconds: int,
) -> None:
    try:
        try:
            import resource

            if memory_mb > 0:
                memory_bytes = memory_mb * 1024 * 1024
                resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
            if cpu_seconds > 0:
                resource.setrlimit(
                    resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1)
                )
        except (ImportError, OSError, ValueError):
            pass
        queue.put(verify_candidate(task, candidate))
    except BaseException as exc:
        queue.put(
            {
                "math_valid": False,
                "objective_pass": False,
                "official_pass": False,
                "error": f"verifier worker failed: {type(exc).__name__}: {exc}",
                "metrics": {},
                "symbolic_work": 0,
            }
        )


def verify_with_limits(
    task: Dict[str, Any],
    candidate: Dict[str, Any],
    *,
    timeout_seconds: int,
    memory_mb: int,
) -> Dict[str, Any]:
    context = multiprocessing.get_context("spawn")
    queue = context.Queue(maxsize=1)
    process = context.Process(
        target=_verify_worker,
        args=(task, candidate, queue, memory_mb, max(1, timeout_seconds)),
    )
    process.start()
    process.join(timeout_seconds + 2)
    if process.is_alive():
        process.terminate()
        process.join(5)
        return {
            "math_valid": False,
            "objective_pass": False,
            "official_pass": False,
            "error": f"verification exceeded {timeout_seconds} seconds",
            "metrics": {},
            "symbolic_work": 0,
        }
    try:
        return queue.get(timeout=1)
    except queue_module.Empty:
        return {
            "math_valid": False,
            "objective_pass": False,
            "official_pass": False,
            "error": f"verifier worker exited with code {process.exitcode}",
            "metrics": {},
            "symbolic_work": 0,
        }


def syntax_example(dimension: int, point_count: int) -> Dict[str, Any]:
    coordinate_map: List[List[Dict[str, Any]]] = []
    for variable in range(dimension):
        exponent = [0] * dimension
        exponent[variable] = 1
        coordinate_map.append([{"c": 1, "e": exponent}])

    zero_point: List[Any] = [0] * dimension
    points: List[List[Any]] = [list(zero_point)]
    for index in range(1, point_count):
        point: List[Any] = [0] * dimension
        point[(index - 1) % dimension] = {"a": [0, index]}
        points.append(point)
    return {
        "kind": "map_collision",
        "dimension": dimension,
        "field": {"minimal_polynomial": [-2, 0, 1]},
        "map": coordinate_map,
        "points": points,
    }


def build_prompt(task: Mapping[str, Any], include_hint: bool) -> str:
    constraints = task["constraints"]
    dimension = constraints["dimension"]
    min_points = constraints["min_points"]
    generic_fiber_note = ""
    if constraints.get("generic_fiber_degree") is not None:
        generic_fiber_note = (
            "\n- The exact generic-fiber degree is a research requirement. "
            "The current\n  deterministic verifier checks the submitted "
            "finite fiber witness and degree\n  bound, and reports the exact "
            "generic-fiber condition as not_machine_verified."
        )
    example = json.dumps(
        syntax_example(dimension, min_points),
        ensure_ascii=False,
        indent=2,
    )
    pieces = [
        str(task["context"]).strip(),
        f"Task:\n{str(task['question']).strip()}",
    ]
    if include_hint:
        pieces.append(f"Hint:\n{str(task['hint']).strip()}")
    pieces.append(
        f"""Submission requirements:
- Work exactly over Q or over one explicitly declared finite extension of Q.
- The optional field.minimal_polynomial is listed low-to-high, must be monic,
  and must be irreducible over Q. If field is omitted, every value is rational.
- A rational is an integer or [numerator, denominator]. In a declared field,
  c_0+...+c_(s-1) alpha^(s-1) is encoded as {{"a":[c_0,...,c_(s-1)]}}.
- A polynomial is a sparse list of terms {{"c": COEFFICIENT, "e": [e_1,...,e_d]}}.
  Expression strings are not accepted. Repeated exponent vectors are combined.
- Supply exactly {dimension} coordinate polynomials and at least {min_points}
  pairwise-distinct exact points in one common fiber.{generic_fiber_note}
- The verifier differentiates the submitted map, expands its Jacobian determinant,
  and evaluates all points using exact arithmetic. Natural-language assertions,
  executable code, floating-point evidence, and random tests are ignored.
- Certificates are capped at 5 MB; each polynomial at 5,000 normalized terms;
  each map at 20,000 normalized terms; exponents at 256; a number field at
  degree 256; and integer numerators and denominators at 16,384 bits.

Output format:
End the response with the literal marker

{CERTIFICATE_MARKER}

followed by exactly one JSON object and no trailing text.

The following object is a syntax-only encoding example. It is not a solution
and will fail the common-fiber requirement:
{example}"""
    )
    prompt = "\n\n".join(pieces)
    if BANNED_PROMPT_PHRASE in prompt.lower():
        raise AssertionError(f"banned name appears in prompt for {task['id']}")
    return prompt


def read_dataset(path: Path) -> List[Dict[str, Any]]:
    tasks: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                task = json.loads(line)
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{path}:{line_number}: invalid JSON: {exc}") from exc
            if not isinstance(task, dict):
                raise SystemExit(f"{path}:{line_number}: each line must be an object")
            tasks.append(task)
    return tasks


def validate_dataset(tasks: Sequence[Mapping[str, Any]]) -> None:
    expected_ids = [f"jacobian_conjecture_{index}" for index in range(1, 6)]
    actual_ids = [task.get("id") for task in tasks]
    if actual_ids != expected_ids:
        raise SystemExit(
            f"dataset ids must be exactly {expected_ids}; found {actual_ids}"
        )
    expected_keys = {"id", "context", "question", "hint", "constraints", "objective"}
    contexts: List[str] = []
    for task in tasks:
        if set(task) != expected_keys:
            raise SystemExit(
                f"{task.get('id')}: fields must be exactly {sorted(expected_keys)}"
            )
        for field_name in ("context", "question", "hint"):
            value = task.get(field_name)
            if not isinstance(value, str) or not value.strip():
                raise SystemExit(f"{task['id']}: {field_name} must be nonempty text")
            if BANNED_PROMPT_PHRASE in value.lower():
                raise SystemExit(f"{task['id']}: banned name in {field_name}")
        contexts.append(task["context"])
        constraints = task.get("constraints")
        if not isinstance(constraints, dict):
            raise SystemExit(f"{task['id']}: constraints must be an object")
        if constraints.get("dimension") not in (2, 3):
            raise SystemExit(f"{task['id']}: dimension must be 2 or 3")
        if (
            not isinstance(constraints.get("min_points"), int)
            or isinstance(constraints.get("min_points"), bool)
            or constraints["min_points"] < 2
        ):
            raise SystemExit(f"{task['id']}: min_points must be at least 2")
        if constraints.get("coefficient_domain") != "algebraic":
            raise SystemExit(f"{task['id']}: coefficient_domain must be algebraic")
        allowed_constraint_keys = {
            "dimension",
            "min_points",
            "coefficient_domain",
            "generic_fiber_degree",
            "known_degree",
        }
        if set(constraints) - allowed_constraint_keys:
            raise SystemExit(f"{task['id']}: unsupported constraint field")
        if task["id"] == "jacobian_conjecture_4":
            if constraints.get("generic_fiber_degree") != 4:
                raise SystemExit(
                    f"{task['id']}: generic_fiber_degree must equal 4"
                )
            if constraints.get("known_degree") != 12:
                raise SystemExit(f"{task['id']}: known_degree must equal 12")
        elif "generic_fiber_degree" in constraints or "known_degree" in constraints:
            raise SystemExit(
                f"{task['id']}: generic-fiber metadata is only valid for task 4"
            )
        objective = task.get("objective")
        if not isinstance(objective, dict) or objective.get("kind") not in {
            "counterexample",
            "max_degree",
        }:
            raise SystemExit(f"{task['id']}: invalid objective")
        if objective["kind"] == "max_degree" and (
            not isinstance(objective.get("value"), int)
            or isinstance(objective.get("value"), bool)
            or objective["value"] < 1
        ):
            raise SystemExit(f"{task['id']}: invalid maximum degree")
    if len(set(contexts)) != 1:
        raise SystemExit("all five tasks must use exactly the same context")
    for task in tasks:
        build_prompt(task, False)
        build_prompt(task, True)


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(
        f".{path.name}.tmp-{os.getpid()}-{time.time_ns()}"
    )
    temporary.write_text(content, encoding="utf-8")
    os.replace(temporary, path)


def atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    atomic_write_text(
        path,
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
    )


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_path_component(value: str) -> str:
    result = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return result or "model"


def _value(container: Any, name: str, default: Any = None) -> Any:
    if isinstance(container, Mapping):
        return container.get(name, default)
    return getattr(container, name, default)


def coerce_openai_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        pieces: List[str] = []
        for item in value:
            if isinstance(item, str):
                pieces.append(item)
            elif isinstance(text_value := _value(item, "text"), str):
                pieces.append(text_value)
            else:
                try:
                    pieces.append(json.dumps(item, ensure_ascii=False))
                except TypeError:
                    pieces.append(str(item))
        return "".join(pieces)
    if isinstance(value, Mapping):
        try:
            return json.dumps(value, ensure_ascii=False)
        except TypeError:
            return str(value)
    return str(value)


def response_usage(response: Any) -> Dict[str, Optional[int]]:
    usage = _value(response, "usage")
    details = _value(usage, "completion_tokens_details")
    values = {
        "prompt_tokens": _value(usage, "prompt_tokens"),
        "completion_tokens": _value(usage, "completion_tokens"),
        "reasoning_tokens": (
            _value(details, "reasoning_tokens")
            if _value(details, "reasoning_tokens") is not None
            else _value(usage, "reasoning_tokens")
        ),
        "total_tokens": _value(usage, "total_tokens"),
    }
    return {
        key: value if isinstance(value, int) and not isinstance(value, bool) else None
        for key, value in values.items()
    }


def check_runtime_dependencies(*, require_openai: bool) -> None:
    modules = ["sympy"]
    if require_openai:
        modules.extend(["openai", "tqdm"])
    missing = []
    for module_name in modules:
        try:
            __import__(module_name)
        except ModuleNotFoundError:
            missing.append(module_name)
    if missing:
        raise SystemExit(
            "missing runtime dependencies: "
            + ", ".join(missing)
            + "; install them before running"
        )
    if require_openai and not API_KEY:
        raise SystemExit("configure API_KEY or ROLLOUT_API_KEY before running")


def openai_client(timeout_seconds: int, max_retries: int) -> Any:
    from openai import OpenAI

    kwargs: Dict[str, Any] = {
        "api_key": API_KEY,
        "timeout": timeout_seconds,
        "max_retries": max_retries,
    }
    if BASE_URL:
        kwargs["base_url"] = BASE_URL
    return OpenAI(**kwargs)


def selected_hint_modes() -> List[Tuple[bool, str]]:
    modes: List[Tuple[bool, str]] = []
    if RUN_NOHINT:
        modes.append((False, "nohint"))
    if RUN_HINT:
        modes.append((True, "hint"))
    if not modes:
        raise SystemExit("at least one of RUN_NOHINT and RUN_HINT must be enabled")
    return modes


def result_path(
    run_dir: Path,
    task_id: str,
    include_hint: bool,
    repeat_index: int,
) -> Path:
    mode = "hint" if include_hint else "nohint"
    return run_dir / f"{task_id}_{mode}_{repeat_index:02d}.json"


def novelty_fields(task_id: str) -> Tuple[str, str]:
    if task_id in {"jacobian_conjecture_1", "jacobian_conjecture_2"}:
        return "required", "not_machine_verified"
    return "not_required", "not_applicable"


def generic_fiber_fields(task_id: str) -> Tuple[str, str]:
    if task_id == "jacobian_conjecture_4":
        return "degree_4_required", "not_machine_verified"
    return "not_required", "not_applicable"


def base_evaluation_record(
    task: Mapping[str, Any],
    include_hint: bool,
    repeat_index: int,
    args: argparse.Namespace,
) -> Dict[str, Any]:
    novelty_requirement, novelty_status = novelty_fields(str(task["id"]))
    generic_fiber_requirement, generic_fiber_status = generic_fiber_fields(
        str(task["id"])
    )
    retry_max_tokens = getattr(args, "retry_max_tokens", None)
    request_max_tokens = (
        retry_max_tokens if retry_max_tokens is not None else args.max_tokens
    )
    return {
        "id": task["id"],
        "hint": include_hint,
        "repeat_index": repeat_index,
        "model": args.model,
        "parameters": {
            "temperature": args.temperature,
            "top_p": args.top_p,
            "max_tokens": request_max_tokens,
        },
        "output": "",
        "content": "",
        "reasoning_content": "",
        "eval": {
            "certificate_parsed": False,
            "math_valid": False,
            "objective_pass": False,
            "official_pass": False,
            "novelty_requirement": novelty_requirement,
            "novelty_status": novelty_status,
            "generic_fiber_requirement": generic_fiber_requirement,
            "generic_fiber_status": generic_fiber_status,
            "error": None,
            "metrics": {},
            "symbolic_work": 0,
        },
        "timing": {
            "inference_seconds": 0.0,
            "verification_seconds": 0.0,
        },
        "usage": {
            "prompt_tokens": None,
            "completion_tokens": None,
            "reasoning_tokens": None,
            "total_tokens": None,
        },
    }


def evaluate_once(
    task: Dict[str, Any],
    include_hint: bool,
    repeat_index: int,
    args: argparse.Namespace,
    run_dir: Path,
    inference_completed: Callable[[], None],
) -> Dict[str, Any]:
    path = result_path(run_dir, task["id"], include_hint, repeat_index)
    record = base_evaluation_record(task, include_hint, repeat_index, args)
    prompt = build_prompt(task, include_hint)

    inference_started = time.perf_counter()
    try:
        client = openai_client(args.api_timeout, args.api_max_retries)
        response = client.chat.completions.create(
            model=args.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=args.temperature,
            top_p=args.top_p,
            max_tokens=record["parameters"]["max_tokens"],
        )
        message = response.choices[0].message
        record["content"] = coerce_openai_text(_value(message, "content"))
        reasoning_value = (
            _value(message, "reasoning_content")
            or _value(message, "reasoning")
            or _value(message, "reasoning_details")
        )
        record["reasoning_content"] = coerce_openai_text(reasoning_value)
        record["usage"] = response_usage(response)
    except Exception as exc:
        record["eval"]["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        record["timing"]["inference_seconds"] = round(
            time.perf_counter() - inference_started, 6
        )
        inference_completed()

    if record["eval"]["error"] is not None:
        atomic_write_json(path, record)
        return record

    verification_started = time.perf_counter()
    try:
        output = extract_output(record["content"])
        record["output"] = output
        candidate = parse_certificate_output(output)
        record["eval"]["certificate_parsed"] = True
    except CertificateError as exc:
        record["eval"]["error"] = str(exc)
    else:
        verifier_result = verify_with_limits(
            dict(task),
            candidate,
            timeout_seconds=args.verify_timeout,
            memory_mb=args.verify_memory_mb,
        )
        for key in (
            "math_valid",
            "objective_pass",
            "official_pass",
            "error",
            "metrics",
            "symbolic_work",
        ):
            record["eval"][key] = verifier_result[key]
    record["timing"]["verification_seconds"] = round(
        time.perf_counter() - verification_started, 6
    )
    atomic_write_json(path, record)
    return record


def record_is_reusable(
    record: Any,
    task: Mapping[str, Any],
    include_hint: bool,
    repeat_index: int,
    args: argparse.Namespace,
) -> bool:
    if not isinstance(record, dict):
        return False
    expected_parameters = {
        "temperature": args.temperature,
        "top_p": args.top_p,
        "max_tokens": args.max_tokens,
    }
    record_parameters = record.get("parameters")
    parameters_compatible = record_parameters == expected_parameters
    if (
        getattr(args, "retry_max_tokens", None) is not None
        and isinstance(record_parameters, Mapping)
    ):
        record_max_tokens = record_parameters.get("max_tokens")
        parameters_compatible = (
            record_parameters.get("temperature") == args.temperature
            and record_parameters.get("top_p") == args.top_p
            and isinstance(record_max_tokens, int)
            and not isinstance(record_max_tokens, bool)
            and 1 <= record_max_tokens <= args.max_tokens
        )
    usage = record.get("usage")
    has_api_response = (
        bool(record.get("content"))
        or bool(record.get("reasoning_content"))
        or (
            isinstance(usage, Mapping)
            and any(
                isinstance(value, int) and not isinstance(value, bool)
                for value in usage.values()
            )
        )
    )
    return (
        record.get("id") == task["id"]
        and record.get("hint") is include_hint
        and record.get("repeat_index") == repeat_index
        and record.get("model") == args.model
        and parameters_compatible
        and isinstance(record.get("eval"), dict)
        and has_api_response
    )


def build_summary(
    records: Sequence[Mapping[str, Any]],
    tasks: Sequence[Mapping[str, Any]],
    expected_count: int,
    wall_seconds: float,
) -> Dict[str, Any]:
    grouped: Dict[Tuple[str, str], List[Mapping[str, Any]]] = defaultdict(list)
    for record in records:
        mode = "hint" if record.get("hint") is True else "nohint"
        grouped[(str(record.get("id")), mode)].append(record)

    task_stats: Dict[str, Any] = {}
    for task in tasks:
        task_id = str(task["id"])
        task_stats[task_id] = {}
        for _, mode in selected_hint_modes():
            mode_records = grouped.get((task_id, mode), [])
            correct = sum(
                record.get("eval", {}).get("official_pass") is True
                for record in mode_records
            )
            task_stats[task_id][mode] = {
                "completed": len(mode_records),
                "deterministic_passes": correct,
                "accuracy": (
                    correct / len(mode_records) if mode_records else 0.0
                ),
            }

    usage_totals = {
        token_name: sum(
            value
            for record in records
            if isinstance(
                value := record.get("usage", {}).get(token_name), int
            )
            and not isinstance(value, bool)
        )
        for token_name in (
            "prompt_tokens",
            "completion_tokens",
            "reasoning_tokens",
            "total_tokens",
        )
    }
    deterministic_passes = sum(
        record.get("eval", {}).get("official_pass") is True
        for record in records
    )
    return {
        "expected_records": expected_count,
        "completed_records": len(records),
        "deterministic_passes": deterministic_passes,
        "deterministic_accuracy": (
            deterministic_passes / expected_count if expected_count else 0.0
        ),
        "novelty_not_machine_verified": sum(
            record.get("eval", {}).get("novelty_status")
            == "not_machine_verified"
            for record in records
        ),
        "generic_fiber_not_machine_verified": sum(
            record.get("eval", {}).get("generic_fiber_status")
            == "not_machine_verified"
            for record in records
        ),
        "task_stats": task_stats,
        "usage_totals": usage_totals,
        "timing": {
            "wall_seconds": round(wall_seconds, 6),
            "sum_inference_seconds": round(
                sum(
                    float(record.get("timing", {}).get("inference_seconds", 0.0))
                    for record in records
                ),
                6,
            ),
            "sum_verification_seconds": round(
                sum(
                    float(
                        record.get("timing", {}).get("verification_seconds", 0.0)
                    )
                    for record in records
                ),
                6,
            ),
        },
    }


def compact_metrics(record: Mapping[str, Any]) -> str:
    evaluation = record.get("eval", {})
    metrics = evaluation.get("metrics", {})
    keys = (
        "dimension",
        "component_degrees",
        "max_component_degree",
        "total_monomials",
        "point_count",
        "field_degree",
        "coefficient_domain",
        "jacobian_determinant",
    )
    return ", ".join(f"{key}={metrics[key]}" for key in keys if key in metrics)


def print_record(record: Mapping[str, Any], write: Callable[[str], None]) -> None:
    evaluation = record.get("eval", {})
    mode = "hint" if record.get("hint") is True else "nohint"
    status = "PASS" if evaluation.get("official_pass") is True else "FAIL"
    write(
        f"{record.get('id')} | {mode} | repeat={record.get('repeat_index'):02d} "
        f"| {status} | math_valid={evaluation.get('math_valid')} "
        f"| objective_pass={evaluation.get('objective_pass')} "
        f"| novelty={evaluation.get('novelty_status')}"
    )
    metrics = compact_metrics(record)
    if metrics:
        write(f"  metrics: {metrics}")
    if evaluation.get("error"):
        write(f"  error: {evaluation['error']}")


def evaluation_config(
    args: argparse.Namespace,
    dataset_hash: str,
    expected_count: int,
) -> Dict[str, Any]:
    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model": args.model,
        "base_url": BASE_URL,
        "parameters": {
            "temperature": args.temperature,
            "top_p": args.top_p,
            "max_tokens": args.max_tokens,
        },
        "retry_max_tokens": getattr(args, "retry_max_tokens", None),
        "api_timeout_seconds": args.api_timeout,
        "api_max_retries": args.api_max_retries,
        "verify_timeout_seconds": args.verify_timeout,
        "verify_memory_mb": args.verify_memory_mb,
        "max_concurrency": args.concurrency,
        "repeats_per_task": args.repeats,
        "hint_modes": [mode for _, mode in selected_hint_modes()],
        "expected_records": expected_count,
        "dataset_path": str(Path(args.dataset).resolve()),
        "dataset_sha256": dataset_hash,
        "pure_reasoning": True,
        "tools_supplied": False,
        "llm_judge": False,
    }


def run_evaluation(
    args: argparse.Namespace, tasks: Sequence[Dict[str, Any]]
) -> None:
    check_runtime_dependencies(require_openai=True)
    validate_dataset(tasks)
    if args.concurrency < 1:
        raise SystemExit("--concurrency must be at least 1")
    if args.repeats < 1:
        raise SystemExit("--repeats must be at least 1")
    if args.api_max_retries < 0:
        raise SystemExit("--api-max-retries must be nonnegative")
    if args.retry_max_tokens is not None and args.retry_max_tokens < 1:
        raise SystemExit("--retry-max-tokens must be at least 1")

    modes = selected_hint_modes()
    units = [
        (dict(task), include_hint, repeat_index)
        for task in tasks
        for include_hint, _ in modes
        for repeat_index in range(1, args.repeats + 1)
    ]
    expected = len(units)
    run_dir = Path(args.output_root) / safe_path_component(args.model)
    run_dir.mkdir(parents=True, exist_ok=True)
    dataset_hash = file_sha256(Path(args.dataset))
    config = evaluation_config(args, dataset_hash, expected)
    config_path = run_dir / "run_config.json"
    reusable_not_before = time.time()
    if config_path.is_file() and not args.overwrite:
        try:
            old_config = json.loads(config_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            old_config = None
        comparable_keys = (
            "model",
            "parameters",
            "repeats_per_task",
            "hint_modes",
            "dataset_sha256",
        )
        if not isinstance(old_config, dict) or any(
            old_config.get(key) != config.get(key) for key in comparable_keys
        ):
            raise SystemExit(
                f"{run_dir} contains a different run; use --overwrite explicitly"
            )
        try:
            reusable_not_before = datetime.fromisoformat(
                str(old_config["created_at"])
            ).timestamp()
        except (KeyError, TypeError, ValueError) as exc:
            raise SystemExit(
                f"{config_path} has an invalid created_at; use --overwrite explicitly"
            ) from exc
        config["created_at"] = old_config["created_at"]
    atomic_write_json(config_path, config)

    from tqdm import tqdm

    progress = tqdm(total=expected, desc="Inference", unit="run", dynamic_ncols=True)
    progress_lock = threading.Lock()

    def inference_completed() -> None:
        with progress_lock:
            progress.update(1)

    records: List[Dict[str, Any]] = []
    pending: List[Tuple[Dict[str, Any], bool, int]] = []
    for task, include_hint, repeat_index in units:
        path = result_path(run_dir, task["id"], include_hint, repeat_index)
        if (
            path.is_file()
            and not args.overwrite
            and path.stat().st_mtime >= reusable_not_before
        ):
            try:
                record = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                record = None
            if record_is_reusable(
                record, task, include_hint, repeat_index, args
            ):
                records.append(record)
                progress.update(1)
                print_record(record, tqdm.write)
                continue
        pending.append((task, include_hint, repeat_index))

    run_started = time.perf_counter()
    partial = build_summary(records, tasks, expected, 0.0)
    atomic_write_json(run_dir / "summary.json", partial)

    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {
            executor.submit(
                evaluate_once,
                task,
                include_hint,
                repeat_index,
                args,
                run_dir,
                inference_completed,
            ): (task, include_hint, repeat_index)
            for task, include_hint, repeat_index in pending
        }
        for future in as_completed(futures):
            task, include_hint, repeat_index = futures[future]
            try:
                record = future.result()
            except BaseException as exc:
                record = base_evaluation_record(
                    task, include_hint, repeat_index, args
                )
                record["eval"]["error"] = (
                    f"runner failure: {type(exc).__name__}: {exc}"
                )
                atomic_write_json(
                    result_path(
                        run_dir, task["id"], include_hint, repeat_index
                    ),
                    record,
                )
            records.append(record)
            summary = build_summary(
                records,
                tasks,
                expected,
                time.perf_counter() - run_started,
            )
            atomic_write_json(run_dir / "summary.json", summary)
            print_record(record, tqdm.write)

    progress.close()
    summary = build_summary(
        records, tasks, expected, time.perf_counter() - run_started
    )
    atomic_write_json(run_dir / "summary.json", summary)
    if len(records) != expected:
        raise SystemExit(
            f"incomplete evaluation: expected {expected}, found {len(records)}"
        )
    print(
        f"completed {len(records)}/{expected}; deterministic passes "
        f"{summary['deterministic_passes']}/{expected}; results: {run_dir}",
        flush=True,
    )


def known_threefold_candidate() -> Dict[str, Any]:
    def terms(raw: Sequence[Tuple[int, Sequence[int]]]) -> List[Dict[str, Any]]:
        return [{"c": coefficient, "e": list(exponent)} for coefficient, exponent in raw]

    return {
        "kind": "map_collision",
        "dimension": 3,
        "map": [
            terms(
                [
                    (1, (0, 0, 1)),
                    (3, (1, 1, 1)),
                    (3, (2, 2, 1)),
                    (1, (3, 3, 1)),
                    (4, (0, 2, 0)),
                    (7, (1, 3, 0)),
                    (3, (2, 4, 0)),
                ]
            ),
            terms(
                [
                    (1, (0, 1, 0)),
                    (3, (1, 0, 1)),
                    (6, (2, 1, 1)),
                    (3, (3, 2, 1)),
                    (12, (1, 2, 0)),
                    (9, (2, 3, 0)),
                ]
            ),
            terms([(2, (1, 0, 0)), (-3, (2, 1, 0)), (-1, (3, 0, 1))]),
        ],
        "points": [
            [0, 0, [-1, 4]],
            [1, [-3, 2], [13, 2]],
            [-1, [3, 2], [13, 2]],
        ],
    }


def algebraic_scaled_threefold_candidate() -> Dict[str, Any]:
    candidate = json.loads(json.dumps(known_threefold_candidate()))
    candidate["field"] = {"minimal_polynomial": [-2, 0, 1]}
    for term in candidate["map"][0]:
        coefficient = term["c"]
        candidate_coefficient = (
            Fraction(coefficient[0], coefficient[1])
            if isinstance(coefficient, list)
            else Fraction(coefficient)
        )
        term["c"] = {"a": [0, rational_json(candidate_coefficient)]}
    return candidate


def run_self_tests(tasks: Sequence[Dict[str, Any]]) -> None:
    validate_dataset(tasks)
    assert len(tasks) == 5
    assert len({task["context"] for task in tasks}) == 1
    for task in tasks:
        without_hint = build_prompt(task, False)
        with_hint = build_prompt(task, True)
        assert "\n\nHint:\n" not in without_hint
        assert task["hint"] not in without_hint
        assert task["hint"] in with_hint
        assert BANNED_PROMPT_PHRASE not in without_hint.lower()
        assert BANNED_PROMPT_PHRASE not in with_hint.lower()
    assert generic_fiber_fields("jacobian_conjecture_4") == (
        "degree_4_required",
        "not_machine_verified",
    )

    known = known_threefold_candidate()
    first = verify_candidate(tasks[0], known)
    assert first["official_pass"], first
    second = verify_candidate(tasks[1], known)
    assert second["official_pass"], second
    third = verify_candidate(tasks[2], known)
    assert third["math_valid"] and not third["objective_pass"], third
    fourth = verify_candidate(tasks[3], known)
    assert not fourth["math_valid"] and "at least 4 points" in fourth["error"], fourth
    fifth = verify_candidate(tasks[4], known)
    assert not fifth["math_valid"] and "dimension must equal 2" in fifth["error"], fifth

    algebraic = algebraic_scaled_threefold_candidate()
    algebraic_first = verify_candidate(tasks[0], algebraic)
    assert algebraic_first["official_pass"], algebraic_first
    assert algebraic_first["metrics"]["field_degree"] == 2
    assert algebraic_first["metrics"]["coefficient_domain"] == "number_field_degree_2"
    algebraic_second = verify_candidate(tasks[1], algebraic)
    assert algebraic_second["official_pass"], algebraic_second

    reducible = algebraic_scaled_threefold_candidate()
    reducible["field"] = {"minimal_polynomial": [-1, 0, 1]}
    reducible_result = verify_candidate(tasks[0], reducible)
    assert (
        not reducible_result["math_valid"]
        and "reducible" in reducible_result["error"]
    ), reducible_result

    duplicate = json.loads(json.dumps(known))
    duplicate["points"][1] = duplicate["points"][0]
    duplicate_result = verify_candidate(tasks[0], duplicate)
    assert not duplicate_result["math_valid"], duplicate_result

    corrupted = json.loads(json.dumps(known))
    corrupted["map"][0][0]["c"] = 2
    corrupted_result = verify_candidate(tasks[0], corrupted)
    assert not corrupted_result["math_valid"], corrupted_result

    encoded = "reasoning\n" + CERTIFICATE_MARKER + "\n" + json.dumps(known)
    output = extract_output(encoded)
    assert parse_certificate_output(output)["kind"] == "map_collision"
    try:
        parse_certificate_output(output + "\ntrailing")
    except CertificateError:
        pass
    else:
        raise AssertionError("trailing text after certificate JSON was accepted")

    isolated = verify_with_limits(
        dict(tasks[0]),
        known,
        timeout_seconds=30,
        memory_mb=1_024,
    )
    assert isolated["official_pass"], isolated

    mock_response = {
        "usage": {
            "prompt_tokens": 11,
            "completion_tokens": 23,
            "completion_tokens_details": {"reasoning_tokens": 17},
            "total_tokens": 34,
        }
    }
    assert response_usage(mock_response) == {
        "prompt_tokens": 11,
        "completion_tokens": 23,
        "reasoning_tokens": 17,
        "total_tokens": 34,
    }

    mock_args = argparse.Namespace(
        model="mock-model",
        temperature=1.0,
        top_p=0.95,
        max_tokens=128_000,
    )
    record = base_evaluation_record(tasks[0], False, 1, mock_args)
    assert set(record) == {
        "id",
        "hint",
        "repeat_index",
        "model",
        "parameters",
        "output",
        "content",
        "reasoning_content",
        "eval",
        "timing",
        "usage",
    }
    assert (
        result_path(Path("/tmp/results"), tasks[0]["id"], False, 1).name
        == "jacobian_conjecture_1_nohint_01.json"
    )
    assert (
        result_path(Path("/tmp/results"), tasks[0]["id"], True, 1).name
        == "jacobian_conjecture_1_hint_01.json"
    )
    assert not record_is_reusable(record, tasks[0], False, 1, mock_args)
    record["content"] = "model response"
    assert record_is_reusable(record, tasks[0], False, 1, mock_args)

    retry_args = argparse.Namespace(
        model="mock-model",
        temperature=1.0,
        top_p=0.95,
        max_tokens=65_536,
        retry_max_tokens=32_768,
    )
    retry_record = base_evaluation_record(tasks[0], False, 1, retry_args)
    assert retry_record["parameters"]["max_tokens"] == 32_768
    retry_record["usage"] = {"total_tokens": 32_768}
    assert record_is_reusable(retry_record, tasks[0], False, 1, retry_args)
    retry_record["parameters"]["max_tokens"] = 65_536
    assert record_is_reusable(retry_record, tasks[0], False, 1, retry_args)
    lower_retry_args = argparse.Namespace(
        model="mock-model",
        temperature=1.0,
        top_p=0.95,
        max_tokens=65_536,
        retry_max_tokens=16_384,
    )
    retry_record["parameters"]["max_tokens"] = 32_768
    assert record_is_reusable(
        retry_record, tasks[0], False, 1, lower_retry_args
    )

    certificate_text = json.dumps(known)
    fake_response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content=(
                        "visible answer\n"
                        + CERTIFICATE_MARKER
                        + "\n"
                        + certificate_text
                    ),
                    reasoning_content="native reasoning trace",
                )
            )
        ],
        usage=SimpleNamespace(
            prompt_tokens=101,
            completion_tokens=202,
            completion_tokens_details=SimpleNamespace(reasoning_tokens=151),
            total_tokens=303,
        ),
    )

    class FakeCompletions:
        def create(self, **_: Any) -> Any:
            return fake_response

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(completions=FakeCompletions())
    )
    original_openai_client = globals()["openai_client"]
    globals()["openai_client"] = lambda _timeout, _max_retries: fake_client
    try:
        with tempfile.TemporaryDirectory(prefix="jacobian-eval-self-test-") as temp_dir:
            mock_run_args = argparse.Namespace(
                model="mock-model",
                temperature=1.0,
                top_p=0.95,
                max_tokens=128_000,
                api_timeout=30,
                api_max_retries=0,
                verify_timeout=30,
                verify_memory_mb=1_024,
            )
            progress_updates: List[bool] = []
            evaluated = evaluate_once(
                dict(tasks[0]),
                False,
                1,
                mock_run_args,
                Path(temp_dir),
                lambda: progress_updates.append(True),
            )
            saved_path = result_path(
                Path(temp_dir), tasks[0]["id"], False, 1
            )
            saved = json.loads(saved_path.read_text(encoding="utf-8"))
            assert progress_updates == [True]
            assert evaluated["eval"]["official_pass"]
            assert saved["content"].startswith("visible answer")
            assert saved["reasoning_content"] == "native reasoning trace"
            assert saved["output"] == certificate_text
            assert saved["usage"]["reasoning_tokens"] == 151
    finally:
        globals()["openai_client"] = original_openai_client

    print("self-test: PASS")
    print("  five-task dataset and prompt modes: PASS")
    print("  exact Q and finite-number-field verification: PASS")
    print("  degree, dimension, point-count, and malformed-certificate paths: PASS")
    print("  isolated resource-limited verifier: PASS")
    print("  mocked inference, result schema, usage accounting, and filenames: PASS")


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--step",
        choices=("run", "self-test"),
        default="run",
    )
    parser.add_argument("--dataset", default=str(DATASET_PATH))
    parser.add_argument("--output-root", default=str(OUTPUT_ROOT))
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--repeats", type=int, default=REPEATS_PER_TASK)
    parser.add_argument("--concurrency", type=int, default=MAX_CONCURRENCY)
    parser.add_argument("--temperature", type=float, default=TEMPERATURE)
    parser.add_argument("--top-p", type=float, default=TOP_P)
    parser.add_argument("--max-tokens", type=int, default=MAX_TOKENS)
    parser.add_argument("--retry-max-tokens", type=int)
    parser.add_argument("--api-timeout", type=int, default=API_TIMEOUT_SEC)
    parser.add_argument("--api-max-retries", type=int, default=API_MAX_RETRIES)
    parser.add_argument("--verify-timeout", type=int, default=VERIFY_TIMEOUT_SEC)
    parser.add_argument("--verify-memory-mb", type=int, default=VERIFY_MEMORY_MB)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    tasks = read_dataset(Path(args.dataset))
    if args.step == "self-test":
        check_runtime_dependencies(require_openai=False)
        run_self_tests(tasks)
        return 0
    run_evaluation(args, tasks)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
