#!/usr/bin/env python3
"""Small deterministic contract tests for training math and label boundaries."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from train_model import (
    HORIZON_YEARS,
    assert_safe_artifact,
    first_landmark_outcome,
    nll_and_gradient,
    predict_horizon,
)


def finite_difference(beta: np.ndarray, x: np.ndarray, dt: np.ndarray, y: np.ndarray, alpha: float, epsilon: float = 1e-6) -> np.ndarray:
    result = np.zeros_like(beta)
    for index in range(len(beta)):
        plus = beta.copy()
        minus = beta.copy()
        plus[index] += epsilon
        minus[index] -= epsilon
        result[index] = (nll_and_gradient(plus, x, dt, y, alpha)[0] - nll_and_gradient(minus, x, dt, y, alpha)[0]) / (2 * epsilon)
    return result


def visit(date: str, event: int) -> dict[str, object]:
    return {"_parsed_date": pd.Timestamp(date), "visit_seq": 1, "visit_id": date, "cohort_visit_event": event}


def assert_landmark_cases() -> None:
    cases = [
        ([visit("2020-01-01", 0), visit("2022-01-01", 1)], "positive"),
        ([visit("2020-01-01", 0), visit("2023-01-01", 0), visit("2024-01-02", 0)], "negative"),
        ([visit("2020-01-01", 0), visit("2022-01-01", 0), visit("2024-01-02", 1)], "interval_straddles_H"),
        ([visit("2020-01-01", 0), visit("2022-01-01", 0)], "censored_before_H"),
        ([visit("2020-01-01", 0), visit("2022-12-31", 1)], "positive"),
    ]
    for rows, expected in cases:
        status, landmark = first_landmark_outcome(pd.DataFrame(rows))
        assert status == expected, (status, expected)
        assert landmark is not None


def assert_math() -> None:
    constant_hazard = np.array([math.log(0.1)])
    input_matrix = np.zeros((1, 0))
    probability = float(predict_horizon(constant_hazard, input_matrix)[0])
    assert abs(probability - 0.2591817793) < 1e-10, probability
    interval_probability = 1 - math.exp(-0.1 * 2)
    assert abs(interval_probability - 0.1812692469) < 1e-10

    x = np.array([[0.2, -0.5], [1.1, 0.7], [-0.4, 0.3]], dtype=float)
    dt = np.array([0.7, 2.0, 1.4])
    y = np.array([0, 1, 0])
    beta = np.array([-2.1, 0.4, -0.2])
    analytic = nll_and_gradient(beta, x, dt, y, 0.1)[1]
    numeric = finite_difference(beta, x, dt, y, 0.1)
    assert np.allclose(analytic, numeric, atol=2e-5, rtol=2e-5), (analytic, numeric)
    for eta in (-50.0, 50.0):
        edge_beta = np.array([eta, 0.25, -0.1])
        analytic_edge = nll_and_gradient(edge_beta, x, dt, y, 0.1)[1]
        assert np.allclose(analytic_edge, np.array([0.0, 0.025, -0.01]), atol=1e-10)


def assert_artifact_safe() -> None:
    artifact_path = Path("public/model-artifact.json")
    if artifact_path.exists():
        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
        assert_safe_artifact(artifact)
        assert artifact["trainingSummary"]["intervalCount"] == 14055
        assert artifact["defaultEnvironment"]["candidateCount"] == 6514


if __name__ == "__main__":
    assert_landmark_cases()
    assert_math()
    assert_artifact_safe()
    print("model contract tests: ok")
