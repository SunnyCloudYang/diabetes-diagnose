#!/usr/bin/env python3
"""Train the offline interval-censored constant-hazard research model.

This script is intentionally the only project code that reads the source CSV.
It writes an aggregate artifact suitable for browser inference and never writes
subject-level rows, identifiers, or coordinates to the artifact.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

SEED = 20260929
HORIZON_YEARS = 3.0
FEATURE_NAMES = [
    "age",
    "sex",
    "hypertension_history",
    "BMI",
    "glucose",
    "TG",
    "HDL",
    "temperature_mean_365d",
    "temperature_variability_sd_365d",
    "HW_P95_D3_heatwave_days_365d",
    "CS_P5_D3_coldspell_days_365d",
    "CMA_coldwave_onsets_365d",
    "PM25_cumavg_lag1",
]
BINARY_FEATURES = {"sex", "hypertension_history"}
CONTINUOUS_FEATURES = [name for name in FEATURE_NAMES if name not in BINARY_FEATURES]
MODEL_ENVIRONMENT_FEATURES = FEATURE_NAMES[7:]
DEFAULT_ENVIRONMENT_FIELDS = [
    "temperature_mean_365d",
    "temperature_variability_sd_365d",
    "DTR_mean_365d",
    "DTR_sd_365d",
    "humidity_mean_365d",
    "wind_speed_mean_365d",
    "HW_P95_D3_heatwave_days_365d",
    "HW_P95_D3_heatwave_events_365d",
    "HW_P95_D3_heatwave_intensity_c_days_365d",
    "CS_P5_D3_coldspell_days_365d",
    "CS_P5_D3_coldspell_events_365d",
    "CS_P5_D3_coldspell_intensity_c_days_365d",
    "CMA_coldwave_onsets_365d",
    "CO_cumavg_lag1",
    "NO2_cumavg_lag1",
    "O3_cumavg_lag1",
    "PM10_cumavg_lag1",
    "PM25_cumavg_lag1",
    "SO2_cumavg_lag1",
]
REQUIRED_SOURCE_COLUMNS = {
    "subject_id",
    "visit_id",
    "visit_seq",
    "visit_date",
    "visit_year",
    "cohort_visit_event",
    *FEATURE_NAMES,
    *DEFAULT_ENVIRONMENT_FIELDS,
    "weather_window_start",
    "weather_window_end",
    "weather_window_n_days",
    "pollution_cumavg_start_year",
    "pollution_cumavg_end_year",
    "pollution_cumavg_n_years",
}


@dataclass
class IntervalData:
    frame: pd.DataFrame
    subjects: np.ndarray


def finite_or_none(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def json_number(value: Any) -> float | int | None:
    result = finite_or_none(value)
    if result is None:
        return None
    if result.is_integer():
        return int(result)
    return result


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def encode_binary(series: pd.Series, feature: str) -> pd.Series:
    if feature == "sex":
        mapped = series.map({"男": 1.0, "女": 0.0, "male": 1.0, "female": 0.0, "M": 1.0, "F": 0.0})
        numeric = pd.to_numeric(series, errors="coerce")
        return mapped.where(mapped.notna(), numeric)
    mapped = series.map({"有": 1.0, "无": 0.0, "是": 1.0, "否": 0.0, True: 1.0, False: 0.0})
    numeric = pd.to_numeric(series, errors="coerce")
    return mapped.where(mapped.notna(), numeric)


def prepare_raw_frame(frame: pd.DataFrame) -> pd.DataFrame:
    result = pd.DataFrame(index=frame.index)
    for feature in FEATURE_NAMES:
        if feature in BINARY_FEATURES:
            result[feature] = encode_binary(frame[feature], feature)
        else:
            result[feature] = pd.to_numeric(frame[feature], errors="coerce")
    return result


def build_intervals(source: pd.DataFrame) -> IntervalData:
    """Create one row per adjacent valid interval from a subject's timeline."""
    work = source.copy()
    work["_parsed_date"] = pd.to_datetime(work["visit_date"], errors="coerce")
    work = work.dropna(subset=["_parsed_date"])
    records: list[dict[str, Any]] = []
    subject_ids: list[str] = []
    for subject_id, group in work.groupby("subject_id", sort=True):
        ordered = group.sort_values(["_parsed_date", "visit_seq", "visit_id"], kind="mergesort")
        rows = ordered.to_dict("records")
        for start, end in zip(rows, rows[1:]):
            if int(start["cohort_visit_event"]) != 0:
                continue
            delta_days = int((end["_parsed_date"] - start["_parsed_date"]).days)
            if delta_days <= 0:
                continue
            record = {feature: start[feature] for feature in FEATURE_NAMES}
            for field in DEFAULT_ENVIRONMENT_FIELDS:
                record[field] = start[field]
            record.update(
                {
                    "subject_key": subject_id,
                    "start_date": start["_parsed_date"],
                    "end_date": end["_parsed_date"],
                    "delta_days": delta_days,
                    "delta_years": delta_days / 365.2425,
                    "y": int(end["cohort_visit_event"]) == 1,
                }
            )
            records.append(record)
            subject_ids.append(subject_id)
    result = pd.DataFrame.from_records(records)
    if result.empty:
        raise ValueError("No valid adjacent intervals were found")
    result["y"] = result["y"].astype(int)
    return IntervalData(result, np.asarray(subject_ids, dtype=object))


def split_subjects(source: pd.DataFrame) -> tuple[set[str], set[str], set[str]]:
    """Split the full subject roster before deriving interval rows."""
    subject_frame = source.groupby("subject_id", sort=True)["cohort_visit_event"].max().reset_index()
    subject_frame = subject_frame.rename(columns={"subject_id": "subject_key", "cohort_visit_event": "y"})
    rng = np.random.default_rng(SEED)
    splits: dict[str, list[str]] = {"train": [], "validation": [], "test": []}
    for event_flag in (0, 1):
        layer = subject_frame.loc[subject_frame["y"] == event_flag, "subject_key"].astype(str).sort_values().to_numpy()
        rng.shuffle(layer)
        train_end = math.floor(len(layer) * 0.70)
        validation_end = train_end + math.floor(len(layer) * 0.15)
        splits["train"].extend(layer[:train_end])
        splits["validation"].extend(layer[train_end:validation_end])
        splits["test"].extend(layer[validation_end:])
    return set(splits["train"]), set(splits["validation"]), set(splits["test"])


@dataclass
class Preprocessor:
    metadata: list[dict[str, Any]]
    columns: list[str]

    @classmethod
    def fit(cls, frame: pd.DataFrame) -> "Preprocessor":
        metadata: list[dict[str, Any]] = []
        columns: list[str] = []
        for feature in FEATURE_NAMES:
            values = pd.to_numeric(frame[feature], errors="coerce")
            if feature in BINARY_FEATURES:
                valid = values.dropna()
                fill = float(valid.mode().iloc[0]) if not valid.empty else 0.0
                metadata.append(
                    {
                        "name": feature,
                        "kind": "binary",
                        "encoding": {"女": 0, "男": 1} if feature == "sex" else {"无": 0, "有": 1},
                        "center": 0.0,
                        "scale": 1.0,
                        "impute": json_number(fill),
                        "missingIndicator": False,
                        "observedMin": json_number(valid.min()) if not valid.empty else None,
                        "observedMax": json_number(valid.max()) if not valid.empty else None,
                        "p01": json_number(valid.quantile(0.01)) if not valid.empty else None,
                        "p99": json_number(valid.quantile(0.99)) if not valid.empty else None,
                        "label": "生理性别" if feature == "sex" else "既往高血压史",
                        "unit": None,
                    }
                )
                columns.append(feature)
                continue
            valid = values.dropna()
            impute = float(valid.median()) if not valid.empty else 0.0
            clip_low = float(valid.quantile(0.01)) if not valid.empty else 0.0
            clip_high = float(valid.quantile(0.99)) if not valid.empty else 0.0
            if not math.isfinite(clip_low) or not math.isfinite(clip_high) or clip_high < clip_low:
                raise ValueError(f"Invalid training clip bounds for {feature}")
            filled = values.fillna(impute)
            clipped = filled.clip(lower=clip_low, upper=clip_high)
            center = float(clipped.mean()) if not clipped.empty else 0.0
            scale = float(clipped.std(ddof=0)) if len(clipped) > 1 else 1.0
            if not math.isfinite(scale) or scale <= 1e-12:
                raise ValueError(f"Training scale for {feature} is not positive")
            has_missing = bool(values.isna().any())
            metadata.append(
                {
                    "name": feature,
                    "kind": "continuous",
                        "center": json_number(center),
                        "scale": json_number(scale),
                        "impute": json_number(impute),
                        "clipLow": json_number(clip_low),
                        "clipHigh": json_number(clip_high),
                    "missingIndicator": has_missing,
                    "observedMin": json_number(valid.min()) if not valid.empty else None,
                    "observedMax": json_number(valid.max()) if not valid.empty else None,
                    "p01": json_number(valid.quantile(0.01)) if not valid.empty else None,
                    "p99": json_number(valid.quantile(0.99)) if not valid.empty else None,
                    "label": feature,
                    "unit": None,
                }
            )
            columns.append(feature)
            if has_missing:
                columns.append(f"{feature}__missing")
        return cls(metadata, columns)

    def transform(self, frame: pd.DataFrame) -> np.ndarray:
        design: list[np.ndarray] = []
        for metadata in self.metadata:
            values = pd.to_numeric(frame[metadata["name"]], errors="coerce").to_numpy(dtype=float)
            missing = ~np.isfinite(values)
            values = np.where(missing, float(metadata["impute"]), values)
            if metadata["kind"] == "continuous":
                values = np.clip(values, float(metadata["clipLow"]), float(metadata["clipHigh"]))
                values = (values - float(metadata["center"])) / float(metadata["scale"])
            design.append(values)
            if metadata["missingIndicator"]:
                design.append(missing.astype(float))
        return np.column_stack(design)

    def attach_coefficients(self, coefficients: np.ndarray) -> list[dict[str, Any]]:
        position = 0
        result: list[dict[str, Any]] = []
        for metadata in self.metadata:
            item = dict(metadata)
            item["coefficient"] = json_number(coefficients[position])
            position += 1
            if metadata["missingIndicator"]:
                item["missingIndicatorCoefficient"] = json_number(coefficients[position])
                position += 1
            result.append(item)
        if position != len(coefficients):
            raise ValueError("Preprocessor columns do not match coefficient vector")
        return result


def nll_and_gradient(beta: np.ndarray, x: np.ndarray, dt: np.ndarray, y: np.ndarray, alpha: float) -> tuple[float, np.ndarray]:
    raw_eta = beta[0] + x @ beta[1:]
    eta = np.clip(raw_eta, -40.0, 40.0)
    z = np.exp(eta) * dt
    exp_neg_z = np.exp(-z)
    event_probability = np.maximum(-np.expm1(-z), 1e-300)
    losses = np.where(y == 1, -np.log(event_probability), z)
    value = float(np.sum(losses) + 0.5 * alpha * np.sum(beta[1:] ** 2))
    dz_deta = z
    derivative_z = np.where(y == 1, -exp_neg_z / event_probability, 1.0)
    gradient_eta = derivative_z * dz_deta
    gradient_eta = np.where((raw_eta >= -40.0) & (raw_eta <= 40.0), gradient_eta, 0.0)
    gradient = np.empty_like(beta)
    gradient[0] = np.sum(gradient_eta)
    gradient[1:] = (x.T @ gradient_eta) + alpha * beta[1:]
    if not math.isfinite(value) or not np.isfinite(gradient).all():
        raise FloatingPointError("Non-finite interval objective or gradient")
    return value, gradient


def fit_model(x: np.ndarray, dt: np.ndarray, y: np.ndarray, alpha: float) -> np.ndarray:
    initial = np.zeros(x.shape[1] + 1, dtype=float)
    initial[0] = math.log(max(float(y.sum()), 1e-5) / max(float(dt.sum()), 1e-5))
    result = minimize(
        lambda beta: nll_and_gradient(beta, x, dt, y, alpha),
        initial,
        jac=True,
        method="L-BFGS-B",
        options={"maxiter": 2_000, "ftol": 1e-13, "gtol": 1e-8, "maxls": 50},
    )
    if not result.success or not np.isfinite(result.fun) or not np.isfinite(result.x).all():
        raise RuntimeError(f"Model optimization failed for alpha={alpha}: {result.message}")
    return np.asarray(result.x, dtype=float)


def predict_interval(beta: np.ndarray, x: np.ndarray, dt: np.ndarray) -> np.ndarray:
    hazard = np.exp(np.clip(beta[0] + x @ beta[1:], -40.0, 40.0))
    return -np.expm1(-hazard * dt)


def predict_horizon(beta: np.ndarray, x: np.ndarray, years: float = HORIZON_YEARS) -> np.ndarray:
    hazard = np.exp(np.clip(beta[0] + x @ beta[1:], -40.0, 40.0))
    return -np.expm1(-hazard * years)


def interval_nll(y: np.ndarray, probabilities: np.ndarray) -> float:
    probabilities = np.clip(probabilities, 1e-15, 1 - 1e-15)
    return float(-np.mean(y * np.log(probabilities) + (1 - y) * np.log1p(-probabilities)))


def interval_nll_from_beta(beta: np.ndarray, x: np.ndarray, dt: np.ndarray, y: np.ndarray) -> float:
    raw_eta = beta[0] + x @ beta[1:]
    eta = np.clip(raw_eta, -40.0, 40.0)
    z = np.exp(eta) * dt
    event_probability = np.maximum(-np.expm1(-z), 1e-300)
    losses = np.where(y == 1, -np.log(event_probability), z)
    return float(np.mean(losses))


def interval_metrics(y: np.ndarray, probabilities: np.ndarray) -> dict[str, Any]:
    return {"n": int(len(y)), "eventCount": int(y.sum()), "nll": json_number(interval_nll(y, probabilities))}


def first_landmark_outcome(group: pd.DataFrame, horizon_years: float = HORIZON_YEARS) -> tuple[str, pd.Series | None]:
    ordered = group.sort_values(["_parsed_date", "visit_seq", "visit_id"], kind="mergesort")
    non_events = ordered[ordered["cohort_visit_event"] == 0]
    if non_events.empty:
        return "censored_before_H", None
    landmark = non_events.iloc[0]
    t0 = landmark["_parsed_date"]
    cutoff = t0 + pd.Timedelta(days=horizon_years * 365.2425)
    after_landmark = ordered[ordered["_parsed_date"] > t0]
    events = after_landmark[after_landmark["cohort_visit_event"] == 1]
    first_event_date = events["_parsed_date"].iloc[0] if not events.empty else None
    if first_event_date is not None and first_event_date <= cutoff:
        return "positive", landmark
    post_cutoff_non_events = after_landmark[(after_landmark["_parsed_date"] >= cutoff) & (after_landmark["cohort_visit_event"] == 0)]
    if not post_cutoff_non_events.empty:
        return "negative", landmark
    if first_event_date is not None and first_event_date > cutoff:
        return "interval_straddles_H", landmark
    return "censored_before_H", landmark


def build_landmark_frame(source: pd.DataFrame, allowed_subjects: set[str]) -> tuple[pd.DataFrame, dict[str, int]]:
    work = source.copy()
    work["_parsed_date"] = pd.to_datetime(work["visit_date"], errors="coerce")
    records: list[dict[str, Any]] = []
    status_counts = {"positive": 0, "negative": 0, "censored_before_H": 0, "interval_straddles_H": 0}
    for subject_id, group in work[work["subject_id"].isin(allowed_subjects)].groupby("subject_id", sort=True):
        status, landmark = first_landmark_outcome(group)
        status_counts[status] += 1
        if landmark is None or status not in {"positive", "negative"}:
            continue
        record = {feature: landmark[feature] for feature in FEATURE_NAMES}
        record["y"] = int(status == "positive")
        record["status"] = status
        records.append(record)
    return pd.DataFrame.from_records(records), status_counts


def calibration_table(y: np.ndarray, probabilities: np.ndarray, boundaries: np.ndarray) -> list[dict[str, Any]]:
    bins: list[dict[str, Any]] = []
    edges = np.asarray(boundaries, dtype=float)
    if len(edges) != 11 or not np.isfinite(edges).all() or not np.all(np.diff(edges) >= 0):
        raise ValueError("Calibration boundaries must contain 11 finite non-decreasing values")
    indices = np.digitize(probabilities, edges[1:-1], right=False)
    for index in range(10):
        lower, upper = edges[index], edges[index + 1]
        mask = indices == index
        bins.append(
            {
                "bin": index + 1,
                "lower": json_number(lower),
                "upper": json_number(upper),
                "n": int(mask.sum()),
                "eventCount": int(y[mask].sum()),
                "positiveRate": json_number(y[mask].mean()) if mask.any() else None,
                "predictedMean": json_number(probabilities[mask].mean()) if mask.any() else None,
                "observedRate": json_number(y[mask].mean()) if mask.any() else None,
            }
        )
    if sum(item["n"] for item in bins) != len(y):
        raise AssertionError("Calibration bins do not cover each landmark observation exactly once")
    return bins


def landmark_metrics(y: np.ndarray, probabilities: np.ndarray, boundaries: np.ndarray, seed: int = SEED) -> dict[str, Any]:
    metrics: dict[str, Any] = {
        "n": int(len(y)),
        "positiveCount": int(y.sum()),
        "negativeCount": int(len(y) - y.sum()),
        "calibration10Bin": calibration_table(y, probabilities, boundaries),
    }
    if len(np.unique(y)) < 2:
        metrics["note"] = "可判定子集只有一个类别，未计算 AUROC/AUPRC。"
        return metrics
    metrics.update(
        {
            "auroc": json_number(roc_auc_score(y, probabilities)),
            "auprc": json_number(average_precision_score(y, probabilities)),
            "brier": json_number(brier_score_loss(y, probabilities)),
        }
    )
    nonempty = [item for item in metrics["calibration10Bin"] if item["n"]]
    metrics["positiveRate"] = json_number(float(y.mean()))
    metrics["ece"] = json_number(
        sum(item["n"] * abs(float(item["predictedMean"]) - float(item["observedRate"])) for item in nonempty) / len(y)
    )
    rng = np.random.default_rng(seed)
    bootstrap: dict[str, list[float]] = {"auroc": [], "auprc": [], "brier": []}
    for _ in range(200):
        sample = rng.integers(0, len(y), len(y))
        sample_y, sample_p = y[sample], probabilities[sample]
        if len(np.unique(sample_y)) < 2:
            continue
        bootstrap["auroc"].append(float(roc_auc_score(sample_y, sample_p)))
        bootstrap["auprc"].append(float(average_precision_score(sample_y, sample_p)))
        bootstrap["brier"].append(float(brier_score_loss(sample_y, sample_p)))
    metrics["bootstrap"] = {
        "requested": 200,
        "effective": len(bootstrap["auroc"]),
        "ci95": (
            {
                key: [json_number(np.quantile(values, 0.025)), json_number(np.quantile(values, 0.975))]
                for key, values in bootstrap.items()
                if values
            }
            if len(bootstrap["auroc"]) >= 180
            else None
        ),
        "note": None if len(bootstrap["auroc"]) >= 180 else "有效重采样少于180次，省略CI。",
    }
    return metrics


def select_default_environment(source: pd.DataFrame) -> dict[str, Any]:
    candidates = source[(source["visit_year"] == 2024) & (source["cohort_visit_event"] == 0)].copy()
    numeric = candidates[DEFAULT_ENVIRONMENT_FIELDS].apply(pd.to_numeric, errors="coerce")
    complete = candidates.loc[numeric.notna().all(axis=1)].copy()
    numeric = numeric.loc[complete.index]
    if complete.empty:
        raise ValueError("No complete 2024 non-event environment rows available for defaultEnvironment")
    if len(complete) != 6514:
        raise ValueError(f"Unexpected complete 2024 environment candidate count: {len(complete)}")
    median = numeric.median()
    scale = numeric.quantile(0.75) - numeric.quantile(0.25)
    range_scale = numeric.max() - numeric.min()
    scale = scale.where(scale > 0, range_scale)
    scale = scale.where(scale > 0, 1).fillna(1)
    distance = (((numeric - median) / scale) ** 2).sum(axis=1).pow(0.5)
    complete["_distance"] = distance.to_numpy()
    complete["_parsed_date"] = pd.to_datetime(complete["visit_date"], errors="coerce")
    complete["_window_start_sort"] = complete["weather_window_start"].astype(str)
    complete["_window_end_sort"] = complete["weather_window_end"].astype(str)
    complete["_value_sort"] = complete[DEFAULT_ENVIRONMENT_FIELDS].astype(str).agg("|".join, axis=1)
    complete = complete.sort_values(
        ["_distance", "_parsed_date", "_window_start_sort", "_window_end_sort", "_value_sort"],
        kind="mergesort",
    )
    chosen = complete.iloc[0]
    values = {field: json_number(chosen[field]) for field in DEFAULT_ENVIRONMENT_FIELDS}
    return {
        "selection": "observed-row-nearest-2024-median",
        "candidateCount": int(len(complete)),
        "visitDate": chosen["_parsed_date"].strftime("%Y-%m-%d"),
        "weatherWindowStart": str(chosen["weather_window_start"]),
        "weatherWindowEnd": str(chosen["weather_window_end"]),
        "pollutionWindow": {
            "startYear": int(chosen["pollution_cumavg_start_year"]),
            "endYear": int(chosen["pollution_cumavg_end_year"]),
            "nYears": int(chosen["pollution_cumavg_n_years"]),
        },
        "values": values,
        "provenance": {
            "candidateCount": int(len(complete)),
            "algorithm": "IQR-scaled Euclidean distance to candidate medians; ties use stable date, window-bound, and environment-value ordering",
        },
    }


def assert_safe_artifact(value: Any) -> None:
    forbidden = re.compile(r"subject[_ ]?id|visit[_ ]?id|location[_ ]?grid|lon_|lat_", re.IGNORECASE)
    encoded = json.dumps(value, ensure_ascii=False)
    if forbidden.search(encoded):
        raise AssertionError("Artifact contains a forbidden identifier or coordinate key/value")
    if re.search(r"SUBJ_[A-Z0-9_]+", encoded):
        raise AssertionError("Artifact contains a raw subject identifier value")
    def walk(node: Any) -> None:
        if isinstance(node, list):
            if len(node) > 1000:
                raise AssertionError("Artifact contains a patient-like long array")
            for child in node:
                walk(child)
        elif isinstance(node, dict):
            for child in node.values():
                walk(child)
    walk(value)


def train(source_path: Path, output_path: Path) -> dict[str, Any]:
    source = pd.read_csv(source_path)
    missing_columns = sorted(REQUIRED_SOURCE_COLUMNS.difference(source.columns))
    if missing_columns:
        raise ValueError(f"CSV is missing required columns: {missing_columns}")
    if len(source) != 24316 or source["subject_id"].nunique() != 10259:
        raise ValueError("Unexpected source row or subject count")
    if int(source["cohort_visit_event"].sum()) != 1017:
        raise ValueError("Unexpected source event count")
    source["_parsed_date"] = pd.to_datetime(source["visit_date"], errors="coerce")
    if source["_parsed_date"].isna().any():
        raise ValueError("Unparseable visit_date values found")
    if not source["cohort_visit_event"].isin([0, 1]).all():
        raise ValueError("cohort_visit_event must contain only 0/1")
    expected_weather_end = source["_parsed_date"] - pd.Timedelta(days=1)
    parsed_weather_end = pd.to_datetime(source["weather_window_end"], errors="coerce")
    parsed_weather_start = pd.to_datetime(source["weather_window_start"], errors="coerce")
    if not parsed_weather_end.eq(expected_weather_end).all():
        raise ValueError("weather_window_end must equal visit_date - 1 day")
    if not (parsed_weather_end - parsed_weather_start).dt.days.eq(364).all():
        raise ValueError("weather windows must contain exactly 365 inclusive days")
    if not pd.to_numeric(source["weather_window_n_days"], errors="coerce").eq(365).all():
        raise ValueError("weather_window_n_days must be 365")
    quality = {"sameOrNegativeDayGaps": 0, "positiveDayGaps": 0, "candidateIntervals": 0}
    for _, group in source.groupby("subject_id", sort=True):
        ordered = group.sort_values(["_parsed_date", "visit_seq", "visit_id"], kind="mergesort")
        events = ordered["cohort_visit_event"].astype(int)
        if int(events.sum()) > 1:
            raise ValueError("A subject has more than one event row")
        if (events.to_numpy().nonzero()[0].size and events.iloc[-1] != 1):
            raise ValueError("An event row must be the subject's final record")
        for start_date, end_date, start_event in zip(
            ordered["_parsed_date"].iloc[:-1], ordered["_parsed_date"].iloc[1:], ordered["cohort_visit_event"].iloc[:-1]
        ):
            if int(start_event) != 0:
                continue
            quality["candidateIntervals"] += 1
            if (end_date - start_date).days > 0:
                quality["positiveDayGaps"] += 1
            else:
                quality["sameOrNegativeDayGaps"] += 1
    if quality["candidateIntervals"] != 14057 or quality["positiveDayGaps"] != 14055 or quality["sameOrNegativeDayGaps"] != 2:
        raise ValueError(f"Unexpected interval quality counts: {quality}")
    source_fingerprint = {
        "sha256": sha256_file(source_path),
        "rowCount": int(len(source)),
        "subjectCount": int(source["subject_id"].nunique()),
        "dateMin": source["_parsed_date"].min().strftime("%Y-%m-%d"),
        "dateMax": source["_parsed_date"].max().strftime("%Y-%m-%d"),
    }
    intervals = build_intervals(source).frame
    all_subjects = set(source["subject_id"].astype(str))
    _, all_landmark_counts = build_landmark_frame(source, all_subjects)
    expected_landmark_counts = {"positive": 483, "negative": 5720, "censored_before_H": 3585, "interval_straddles_H": 471}
    if all_landmark_counts != expected_landmark_counts:
        raise ValueError(f"Unexpected full-cohort landmark classes: {all_landmark_counts}")
    train_subjects, val_subjects, test_subjects = split_subjects(source)
    if train_subjects & val_subjects or train_subjects & test_subjects or val_subjects & test_subjects:
        raise ValueError("Subject split sets overlap")
    if train_subjects | val_subjects | test_subjects != all_subjects:
        raise ValueError("Subject split sets do not cover the full source roster")
    split_lookup = {subject: "train" for subject in train_subjects}
    split_lookup.update({subject: "validation" for subject in val_subjects})
    split_lookup.update({subject: "test" for subject in test_subjects})
    split_name = intervals["subject_key"].map(split_lookup)
    if split_name.isna().any():
        raise ValueError("An eligible interval subject is absent from the full subject split")
    y = intervals["y"].to_numpy(dtype=int)
    expected_split_counts = {
        "train": {"subjects": 7180, "intervals": 9812, "events": 711},
        "validation": {"subjects": 1538, "intervals": 2090, "events": 152},
        "test": {"subjects": 1541, "intervals": 2153, "events": 154},
    }
    for split, expected in expected_split_counts.items():
        mask = split_name == split
        actual = {"subjects": len(train_subjects if split == "train" else val_subjects if split == "validation" else test_subjects), "intervals": int(mask.sum()), "events": int(y[mask].sum())}
        if actual != expected:
            raise ValueError(f"Unexpected {split} split counts: {actual}, expected {expected}")
    raw_intervals = prepare_raw_frame(intervals)
    required_training = raw_intervals.loc[split_name == "train", ["age", "sex", "hypertension_history", "glucose"]]
    if required_training.isna().any().any():
        raise ValueError("Required training feature contains missing values")
    if not required_training[["sex", "hypertension_history"]].isin([0.0, 1.0]).all().all():
        raise ValueError("Binary training feature contains values outside 0/1")
    preprocessor = Preprocessor.fit(raw_intervals.loc[split_name == "train"])
    transformed = preprocessor.transform(raw_intervals)
    train_mask, val_mask, test_mask = split_name == "train", split_name == "validation", split_name == "test"
    dt = intervals["delta_years"].to_numpy(dtype=float)
    x_train, x_val, x_test = transformed[train_mask], transformed[val_mask], transformed[test_mask]
    dt_train, dt_val, dt_test = dt[train_mask], dt[val_mask], dt[test_mask]
    y_train, y_val, y_test = y[train_mask], y[val_mask], y[test_mask]
    candidates: list[dict[str, Any]] = []
    for alpha in [0.01, 0.1, 1.0, 10.0]:
        beta = fit_model(x_train, dt_train, y_train, alpha)
        validation_probability = predict_interval(beta, x_val, dt_val)
        candidates.append({"alpha": alpha, "validationNll": interval_nll_from_beta(beta, x_val, dt_val, y_val), "beta": beta})
    best_nll = min(item["validationNll"] for item in candidates)
    selected = max((item for item in candidates if item["validationNll"] <= best_nll + 1e-6), key=lambda item: item["alpha"])
    beta = selected["beta"]
    test_probability = predict_interval(beta, x_test, dt_test)
    train_landmark_frame, train_landmark_counts = build_landmark_frame(source, train_subjects)
    train_landmark_x = preprocessor.transform(prepare_raw_frame(train_landmark_frame)) if not train_landmark_frame.empty else np.empty((0, transformed.shape[1]))
    train_landmark_p = predict_horizon(beta, train_landmark_x) if len(train_landmark_frame) else np.array([])
    if len(train_landmark_p):
        calibration_boundaries = np.quantile(train_landmark_p, np.linspace(0, 1, 11))
        calibration_boundaries[0], calibration_boundaries[-1] = 0.0, 1.0
        calibration_boundaries = np.maximum.accumulate(calibration_boundaries)
    else:
        calibration_boundaries = np.linspace(0.0, 1.0, 11)
    landmark_frame, landmark_counts = build_landmark_frame(source, test_subjects)
    landmark_metrics_payload: dict[str, Any] = {"status": "insufficient-data", "counts": landmark_counts}
    if not landmark_frame.empty:
        landmark_x = preprocessor.transform(prepare_raw_frame(landmark_frame))
        landmark_p = predict_horizon(beta, landmark_x)
        landmark_metrics_payload = {
            "status": "descriptive-test-subset",
            "counts": landmark_counts,
            "metrics": landmark_metrics(landmark_frame["y"].to_numpy(dtype=int), landmark_p, calibration_boundaries),
            "calibrationReference": "train landmark predictions; fixed empirical deciles",
        }
    train_first_rows = (
        intervals.loc[train_mask]
        .sort_values(["subject_key", "start_date"], kind="mergesort")
        .groupby("subject_key", sort=True)
        .head(1)
    )
    train_first_predictions = predict_horizon(beta, preprocessor.transform(prepare_raw_frame(train_first_rows)))
    artifact = {
        "schemaVersion": "1.0.0",
        "modelVersion": "lanzhou-interval-hazard-2026.09",
        "generatedAt": pd.Timestamp.now(tz="UTC").isoformat(),
        "sourceFingerprint": source_fingerprint,
        "horizonYears": HORIZON_YEARS,
        "algorithm": {
            "family": "interval-censored-piecewise-exponential",
            "link": "cloglog",
            "alpha": float(selected["alpha"]),
            "formula": "p_interval = 1 - exp(-exp(intercept + beta*x) * delta_years)",
            "formulaVersion": "interval-constant-hazard-v1",
            "selection": "validation interval NLL; subject-level stratified split",
        },
        "intercept": json_number(beta[0]),
        "features": preprocessor.attach_coefficients(beta[1:]),
        "defaultEnvironment": select_default_environment(source),
        "trainingSummary": {
            "seed": SEED,
            "intervalCount": int(len(intervals)),
            "eventIntervalCount": int(y.sum()),
            "sourceSubjectCount": int(source["subject_id"].nunique()),
            "eligibleIntervalSubjectCount": int(intervals["subject_key"].nunique()),
            "subjects": {"train": len(train_subjects), "validation": len(val_subjects), "test": len(test_subjects)},
            "intervals": {"train": int(train_mask.sum()), "validation": int(val_mask.sum()), "test": int(test_mask.sum())},
            "quality": quality,
            "landmarkCounts": {"train": train_landmark_counts, "test": landmark_counts},
            "missingRates": {
                feature: json_number(float(prepare_raw_frame(intervals.loc[train_mask])[feature].isna().mean()))
                for feature in CONTINUOUS_FEATURES
            },
            "validationCandidates": [
                {"alpha": float(item["alpha"]), "validationNll": json_number(item["validationNll"])} for item in candidates
            ],
        },
        "evaluation": {
            "intervalTest": {
                **interval_metrics(y_test, test_probability),
                "nll": json_number(interval_nll_from_beta(beta, x_test, dt_test, y_test)),
                "totalExposureYears": json_number(dt_test.sum()),
                "meanPredicted": json_number(test_probability.mean()),
                "observedEventFraction": json_number(y_test.mean()),
            },
            "landmark3Year": landmark_metrics_payload,
        },
        "researchQuantiles": {
            "q33": json_number(np.quantile(train_first_predictions, 1 / 3)),
            "q67": json_number(np.quantile(train_first_predictions, 2 / 3)),
            "source": "train-subject predictions; names are research quantiles",
            "referencePopulation": "train subjects with a valid first non-event interval; no 3-year label filtering",
            "labels": ["较低研究分位", "中间研究分位", "较高研究分位"],
        },
        "limitations": [
            "研究估计不是临床概率或诊断结果。",
            "模型使用相邻随访区间和固定 3 年研究期限；未观察到事件不自动视为任意未来期限阴性。",
            "环境值为历史资料窗口的研究情景，不代表实时天气或个体因果暴露。",
            "glucose 需处于训练数据范围且小于 7；已确诊者不进入新发事件研究估计。",
            "指标来自单一历史队列的受试者隔离内部评估，未经过外部队列验证。",
            "严格 landmark 指标只覆盖可判定 test 子集，不能外推为全人群 3 年校准。",
            "系数贡献表示模型关联方向，不是因果效应，也不表示改变某项会带来同等风险变化。",
            "部分实验室和污染物单位沿用原表状态；本工作台不提供健康建议、干预阈值或实时趋势。",
        ],
    }
    assert_safe_artifact(artifact)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return artifact


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("public/model-artifact.json"))
    args = parser.parse_args()
    artifact = train(args.csv, args.output)
    print(json.dumps({
        "output": str(args.output),
        "intervalCount": artifact["trainingSummary"]["intervalCount"],
        "eventIntervalCount": artifact["trainingSummary"]["eventIntervalCount"],
        "selectedAlpha": artifact["algorithm"]["alpha"],
        "testIntervalNll": artifact["evaluation"]["intervalTest"]["nll"],
        "landmark": artifact["evaluation"]["landmark3Year"].get("metrics", {}),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
