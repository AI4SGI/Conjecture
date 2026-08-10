#!/usr/bin/env python3
"""Exact offline verifier for the OPBench odd perfect number task."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


DETERMINISTIC_64_BIT_BASES = (2, 325, 9375, 28178, 450775, 9780504, 1795265022)


def _is_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _probable_prime_64(n: int) -> bool:
    if n < 2:
        return False
    for prime in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        if n % prime == 0:
            return n == prime
    d, s = n - 1, 0
    while d % 2 == 0:
        s += 1
        d //= 2
    for base in DETERMINISTIC_64_BIT_BASES:
        if base % n == 0:
            continue
        value = pow(base, d, n)
        if value in (1, n - 1):
            continue
        for _ in range(s - 1):
            value = value * value % n
            if value == n - 1:
                break
        else:
            return False
    return True


def _certified_prime(n: int, certificate: Any) -> tuple[bool, str]:
    if n < 2**64:
        passed = _probable_prime_64(n)
        return passed, "Deterministic Miller–Rabin for the 64-bit range."
    if not isinstance(certificate, dict):
        return False, "A Pocklington certificate is required for primes outside the 64-bit range."
    factors = certificate.get("factors")
    if not isinstance(factors, list) or not factors:
        return False, "The Pocklington certificate needs a nonempty factors list."
    certified_product = 1
    for factor in factors:
        if not isinstance(factor, dict):
            return False, "Each Pocklington factor must be an object."
        q, exponent, witness = factor.get("q"), factor.get("e"), factor.get("a")
        if not all(_is_integer(value) for value in (q, exponent, witness)) or exponent < 1:
            return False, "Pocklington q, e, and a fields must be integers with e positive."
        q_is_prime, reason = _certified_prime(q, factor.get("certificate"))
        if not q_is_prime:
            return False, f"Factor q={q} is not certified prime: {reason}"
        if (n - 1) % pow(q, exponent) != 0:
            return False, f"q^e={q}^{exponent} does not divide n-1."
        if pow(witness, n - 1, n) != 1:
            return False, f"Pocklington witness {witness} fails Fermat's congruence."
        if math.gcd(pow(witness, (n - 1) // q, n) - 1, n) != 1:
            return False, f"Pocklington gcd condition fails for q={q}."
        certified_product *= pow(q, exponent)
    if certified_product * certified_product <= n:
        return False, "The certified part of n-1 does not exceed sqrt(n)."
    return True, "The recursive Pocklington certificate passes."


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

    if not isinstance(candidate, dict) or tuple(candidate) != ("N", "factors"):
        add(1, "The output has exactly the declared N and factors keys.", False,
            "Expected keys ['N', 'factors'] in order.")
        return _result(conditions, output_parsing=False)
    n, factors = candidate["N"], candidate["factors"]
    valid_n = _is_integer(n) and n > 0 and n % 2 == 1
    add(1, "$N\\in\\mathbb Z_{>0}$ and $N\\equiv1\\pmod2$.", valid_n,
        f"N={n!r}." if _is_integer(n) else "N is not an integer literal.")

    factorization_valid = isinstance(factors, list) and bool(factors)
    product = 1
    seen: set[int] = set()
    factor_reasons: list[str] = []
    if factorization_valid:
        for index, factor in enumerate(factors, start=1):
            if not isinstance(factor, dict) or tuple(factor) != ("p", "e", "certificate"):
                factorization_valid = False
                factor_reasons.append(f"factor {index} has the wrong schema")
                continue
            prime, exponent = factor["p"], factor["e"]
            if not _is_integer(prime) or not _is_integer(exponent) or exponent < 1:
                factorization_valid = False
                factor_reasons.append(f"factor {index} has invalid p or e")
                continue
            prime_ok, reason = _certified_prime(prime, factor["certificate"])
            if not prime_ok or prime in seen:
                factorization_valid = False
                factor_reasons.append(f"p={prime}: {reason}" if not prime_ok else f"p={prime} is repeated")
                continue
            seen.add(prime)
            product *= pow(prime, exponent)
    if not valid_n or product != n:
        factorization_valid = False
        factor_reasons.append(f"prime-power product is {product}, expected {n}")
    add(2, "The prime-power list is a complete certified factorization of $N$.",
        factorization_valid, "; ".join(factor_reasons) or "Every prime is certified and the product equals N.")

    sigma = 1
    if factorization_valid:
        for factor in factors:
            prime, exponent = factor["p"], factor["e"]
            sigma *= (pow(prime, exponent + 1) - 1) // (prime - 1)
    perfect = factorization_valid and sigma == 2 * n
    add(3, "$\\sigma(N)=2N$.", perfect,
        f"Exact arithmetic gives sigma(N)={sigma} and 2N={2 * n}." if valid_n else "N is invalid.")
    return _result(conditions, output_parsing=True)


def _result(conditions: list[dict[str, Any]], *, output_parsing: bool) -> dict[str, Any]:
    passed = bool(conditions) and output_parsing and all(item["passed"] for item in conditions)
    return {
        "passed": passed,
        "output_parsing": output_parsing,
        "metric": None,
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
