export const MODEL_FEATURE_NAMES = [
  'age',
  'sex',
  'hypertension_history',
  'BMI',
  'glucose',
  'TG',
  'HDL',
  'temperature_mean_365d',
  'temperature_variability_sd_365d',
  'HW_P95_D3_heatwave_days_365d',
  'CS_P5_D3_coldspell_days_365d',
  'CMA_coldwave_onsets_365d',
  'PM25_cumavg_lag1',
] as const

export const FEATURE_LABELS: Record<ModelFeatureName, string> = {
  age: '年龄',
  sex: '生理性别',
  hypertension_history: '既往高血压史',
  BMI: 'BMI',
  glucose: '原表 glucose（单位待确认）',
  TG: '甘油三酯 TG（原表单位待确认）',
  HDL: '高密度脂蛋白 HDL（原表单位待确认）',
  temperature_mean_365d: '365 天平均气温',
  temperature_variability_sd_365d: '365 天温度波动',
  HW_P95_D3_heatwave_days_365d: '365 天热浪天数',
  CS_P5_D3_coldspell_days_365d: '365 天寒冷过程天数',
  CMA_coldwave_onsets_365d: '365 天寒潮启动次数',
  PM25_cumavg_lag1: 'PM25 累计均值（滞后 1 年）',
}

export type ModelFeatureName = typeof MODEL_FEATURE_NAMES[number]
export type SexValue = '男' | '女'

export type RawModelInput = {
  age: number | null
  sex: SexValue | null
  hypertension_history: 0 | 1 | null
  BMI: number | null
  glucose: number | null
  TG: number | null
  HDL: number | null
  temperature_mean_365d: number | null
  temperature_variability_sd_365d: number | null
  HW_P95_D3_heatwave_days_365d: number | null
  CS_P5_D3_coldspell_days_365d: number | null
  CMA_coldwave_onsets_365d: number | null
  PM25_cumavg_lag1: number | null
}

export type ArtifactFeature = {
  name: ModelFeatureName
  label: string
  kind: 'continuous' | 'binary'
  encoding?: Record<string, number>
  coefficient: number
  missingIndicator?: boolean
  missingIndicatorCoefficient?: number
  impute?: number
  clipLow?: number
  clipHigh?: number
  center?: number
  scale?: number
  observedMin?: number | null
  observedMax?: number | null
  p01?: number | null
  p99?: number | null
  unit?: string | null
}

export type ModelArtifact = {
  schemaVersion: string
  modelVersion: string
  generatedAt: string
  sourceFingerprint: { sha256: string; rowCount: number; subjectCount: number; dateMin?: string; dateMax?: string }
  horizonYears: number
  algorithm: { family: string; link: string; alpha: number; formula: string; formulaVersion?: string }
  intercept: number
  features: ArtifactFeature[]
  defaultEnvironment: {
    selection?: string
    selectionMethod?: string
    candidateCount: number
    visitDate: string
    weatherWindowStart: string
    weatherWindowEnd: string
    pollutionWindow: { startYear: number; endYear: number; nYears: number }
    values: Record<string, number>
    provenance?: { candidateCount: number; algorithm: string }
  }
  researchQuantiles?: { q33: number; q67: number; source: string; referencePopulation: string; labels?: string[] }
  thresholds?: { q33: number; q67: number; source: string; labels?: string[] }
  trainingSummary: Record<string, unknown>
  evaluation: Record<string, unknown>
  limitations: string[]
}

export type InputValidation = {
  errors: string[]
  warnings: string[]
}

export type FeatureContribution = {
  name: string
  label: string
  value: number | null
  standardizedValue: number
  coefficient: number
  contribution: number
  missing: boolean
}

export type ModelResult = {
  p3: number
  hazardPerYear: number
  linearScore: number
  quantileLabel: string
  quantilePosition: 'low' | 'middle' | 'high'
  contributions: FeatureContribution[]
  warnings: string[]
}

const optionalNames = new Set<ModelFeatureName>(['BMI', 'TG', 'HDL'])

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function withDefaultEnvironment(artifact: ModelArtifact, input: Omit<RawModelInput, 'temperature_mean_365d' | 'temperature_variability_sd_365d' | 'HW_P95_D3_heatwave_days_365d' | 'CS_P5_D3_coldspell_days_365d' | 'CMA_coldwave_onsets_365d' | 'PM25_cumavg_lag1'> & Partial<Pick<RawModelInput, 'temperature_mean_365d' | 'temperature_variability_sd_365d' | 'HW_P95_D3_heatwave_days_365d' | 'CS_P5_D3_coldspell_days_365d' | 'CMA_coldwave_onsets_365d' | 'PM25_cumavg_lag1'>>): RawModelInput {
  const values = artifact.defaultEnvironment.values
  return {
    ...input,
    temperature_mean_365d: input.temperature_mean_365d ?? values.temperature_mean_365d ?? null,
    temperature_variability_sd_365d: input.temperature_variability_sd_365d ?? values.temperature_variability_sd_365d ?? null,
    HW_P95_D3_heatwave_days_365d: input.HW_P95_D3_heatwave_days_365d ?? values.HW_P95_D3_heatwave_days_365d ?? null,
    CS_P5_D3_coldspell_days_365d: input.CS_P5_D3_coldspell_days_365d ?? values.CS_P5_D3_coldspell_days_365d ?? null,
    CMA_coldwave_onsets_365d: input.CMA_coldwave_onsets_365d ?? values.CMA_coldwave_onsets_365d ?? null,
    PM25_cumavg_lag1: input.PM25_cumavg_lag1 ?? values.PM25_cumavg_lag1 ?? null,
  }
}

export function validateModelInput(artifact: ModelArtifact, input: RawModelInput): InputValidation {
  const errors: string[] = []
  const warnings: string[] = []
  if (!finite(input.age)) errors.push('年龄为必填有限数值。')
  if (input.sex !== '男' && input.sex !== '女') errors.push('生理性别为必填项，只接受“男”或“女”。')
  if (input.hypertension_history !== 0 && input.hypertension_history !== 1) errors.push('既往高血压史为必填项。')
  if (!finite(input.glucose)) errors.push('glucose 为必填有限数值，单位按原表记录。')
  if ((input.TG === null) !== (input.HDL === null)) errors.push('TG 与 HDL 需要成对填写，或同时留空。')

  for (const feature of artifact.features) {
    const name = feature.name
    const value = rawValueFor(feature, input)
    const label = FEATURE_LABELS[name] ?? feature.label
    if (value === null || value === undefined) {
      if (!optionalNames.has(name)) errors.push(`${label}不能缺失。`)
      if (optionalNames.has(name)) warnings.push(`${label}缺失，使用训练集规则插补并启用缺失指示。`)
      continue
    }
    if (!finite(value)) {
      errors.push(`${label}必须是有限数值。`)
      continue
    }
    if (name === 'glucose' && value >= 7) {
      errors.push('glucose ≥ 7，超出无事件起点训练域，本演示不适用。')
      continue
    }
    if (feature.observedMin !== null && feature.observedMin !== undefined && value < feature.observedMin) {
      errors.push(`${label}低于训练起点观测范围。`)
    }
    if (feature.observedMax !== null && feature.observedMax !== undefined && value > feature.observedMax) {
      errors.push(`${label}高于训练起点观测范围。`)
    }
    if (feature.kind === 'continuous' && finite(feature.clipLow) && finite(feature.clipHigh) && (value < feature.clipLow || value > feature.clipHigh)) {
      warnings.push(`${label}位于训练尾部，模型将按训练边界截断。`)
    }
  }
  return { errors, warnings }
}

function rawValueFor(feature: ArtifactFeature, input: RawModelInput): number | null {
  if (feature.name === 'sex') return input.sex === '男' ? 1 : input.sex === '女' ? 0 : null
  if (feature.name === 'hypertension_history') return input.hypertension_history
  return input[feature.name]
}

export function inferModel(artifact: ModelArtifact, input: RawModelInput): ModelResult {
  const validation = validateModelInput(artifact, input)
  if (validation.errors.length) throw new Error(validation.errors.join(' '))
  let linearScore = artifact.intercept
  const contributions: FeatureContribution[] = []
  for (const feature of artifact.features) {
    const raw = rawValueFor(feature, input)
    const missing = raw === null || raw === undefined
    let transformed = missing ? (feature.impute ?? 0) : raw
    if (feature.kind === 'continuous') {
      transformed = Math.min(feature.clipHigh ?? transformed, Math.max(feature.clipLow ?? transformed, transformed))
      transformed = (transformed - (feature.center ?? 0)) / (feature.scale ?? 1)
    }
    const contribution = feature.coefficient * transformed
    linearScore += contribution
    const label = FEATURE_LABELS[feature.name] ?? feature.label
    contributions.push({ name: feature.name, label, value: raw, standardizedValue: transformed, coefficient: feature.coefficient, contribution, missing })
    if (missing && feature.missingIndicator && feature.missingIndicatorCoefficient !== undefined) {
      const missingContribution = feature.missingIndicatorCoefficient
      linearScore += missingContribution
      contributions.push({ name: `${feature.name}__missing`, label: `${label}（缺失指示）`, value: null, standardizedValue: 1, coefficient: feature.missingIndicatorCoefficient, contribution: missingContribution, missing: true })
    }
  }
  if (!Number.isFinite(linearScore)) throw new Error('模型线性评分非有限，无法生成研究估计。')
  const hazardPerYear = Math.exp(Math.min(40, Math.max(-40, linearScore)))
  if (!Number.isFinite(hazardPerYear)) throw new Error('模型风险率非有限，无法生成研究估计。')
  const p3 = Math.min(1, Math.max(0, -Math.expm1(-hazardPerYear * artifact.horizonYears)))
  if (!Number.isFinite(p3)) throw new Error('模型 3 年研究估计非有限，无法生成结果。')
  const quantiles = artifact.researchQuantiles ?? artifact.thresholds
  if (!quantiles || !finite(quantiles.q33) || !finite(quantiles.q67) || quantiles.q33 < 0 || quantiles.q67 > 1 || quantiles.q33 > quantiles.q67) {
    throw new Error('模型研究分位阈值缺失或无效。')
  }
  const q33 = quantiles.q33
  const q67 = quantiles.q67
  const quantilePosition = p3 < q33 ? 'low' : p3 < q67 ? 'middle' : 'high'
  const labels = quantiles?.labels ?? ['较低研究分位', '中间研究分位', '较高研究分位']
  return {
    p3,
    hazardPerYear,
    linearScore,
    quantilePosition,
    quantileLabel: quantilePosition === 'low' ? labels[0] : quantilePosition === 'middle' ? labels[1] : labels[2],
    contributions,
    warnings: validation.warnings,
  }
}

export async function loadModelArtifact(path = `${import.meta.env?.BASE_URL ?? '/'}model-artifact.json`): Promise<ModelArtifact> {
  const response = await fetch(path, { cache: 'no-store' })
  if (!response.ok) throw new Error(`模型 artifact 加载失败（${response.status}）。`)
  const value: unknown = await response.json()
  return validateArtifact(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`模型 artifact 的 ${label} 非有限数值。`)
}

export function validateArtifact(value: unknown): ModelArtifact {
  if (!isRecord(value)) throw new Error('模型 artifact 不是对象。')
  if (value.schemaVersion !== '1.0.0' || value.horizonYears !== 3) throw new Error('模型 artifact 版本或研究期限不匹配。')
  if (!Array.isArray(value.features) || value.features.length !== MODEL_FEATURE_NAMES.length) throw new Error('模型 artifact 特征数量不匹配。')
  const names = value.features.map((feature) => isRecord(feature) ? feature.name : null)
  if (new Set(names).size !== MODEL_FEATURE_NAMES.length || MODEL_FEATURE_NAMES.some((name) => !names.includes(name))) throw new Error('模型 artifact 特征字典不完整或重复。')
  assertFiniteNumber(value.intercept, 'intercept')
  const features = value.features as ArtifactFeature[]
  for (const feature of features) {
    assertFiniteNumber(feature.coefficient, `${feature.name}.coefficient`)
    if (feature.kind === 'continuous') {
      assertFiniteNumber(feature.impute, `${feature.name}.impute`)
      assertFiniteNumber(feature.clipLow, `${feature.name}.clipLow`)
      assertFiniteNumber(feature.clipHigh, `${feature.name}.clipHigh`)
      assertFiniteNumber(feature.center, `${feature.name}.center`)
      assertFiniteNumber(feature.scale, `${feature.name}.scale`)
      if (feature.scale <= 0 || feature.clipLow > feature.clipHigh) throw new Error(`模型 artifact 的 ${feature.name} 缩放或截断边界无效。`)
    }
  }
  const quantiles = (value.researchQuantiles ?? value.thresholds) as Record<string, unknown> | undefined
  if (!quantiles) throw new Error('模型 artifact 缺少研究分位阈值。')
  assertFiniteNumber(quantiles.q33, 'researchQuantiles.q33')
  assertFiniteNumber(quantiles.q67, 'researchQuantiles.q67')
  if (quantiles.q33 < 0 || quantiles.q67 > 1 || quantiles.q33 > quantiles.q67) throw new Error('模型研究分位阈值顺序无效。')
  if (!isRecord(value.defaultEnvironment) || !isRecord(value.defaultEnvironment.values)) throw new Error('模型 artifact 缺少默认环境向量。')
  for (const name of MODEL_FEATURE_NAMES.slice(7)) assertFiniteNumber(value.defaultEnvironment.values[name], `defaultEnvironment.values.${name}`)
  return value as unknown as ModelArtifact
}
