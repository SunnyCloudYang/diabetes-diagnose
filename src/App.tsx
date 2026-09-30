import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  ChevronDown,
  CircleAlert,
  CloudSun,
  Database,
  Info,
  LockKeyhole,
  Menu,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  inferModel,
  loadModelArtifact,
  validateModelInput,
  withDefaultEnvironment,
  type ModelArtifact,
  type ModelResult,
  type RawModelInput,
} from "./model";
import { ResultInsights } from "./ResultInsights";

type View = "assessment" | "method";
type FormData = {
  age: string;
  sex: string;
  hypertensionHistory: string;
  bmi: string;
  glucose: string;
  triglycerides: string;
  hdl: string;
  diagnosedStatus: string;
};
const initialForm: FormData = {
  age: "",
  sex: "",
  hypertensionHistory: "",
  bmi: "",
  glucose: "",
  triglycerides: "",
  hdl: "",
  diagnosedStatus: "",
};

function App() {
  const [view, setView] = useState<View>("assessment");
  const [form, setForm] = useState<FormData>(initialForm);
  const [artifact, setArtifact] = useState<ModelArtifact | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [result, setResult] = useState<ModelResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [furthestStep, setFurthestStep] = useState<0 | 1 | 2 | 3>(0);
  const ageInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    loadModelArtifact()
      .then(setArtifact)
      .catch((error: unknown) =>
        setModelError(
          error instanceof Error ? error.message : "模型文件加载失败。",
        ),
      );
  }, []);

  useEffect(() => {
    if (!result) return;
    const frame = requestAnimationFrame(() => {
      resultRef.current?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 860px)").matches) {
        resultRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [result]);

  const update = (key: keyof FormData, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFurthestStep(step);
    setResult(null);
    setErrors([]);
    setWarnings([]);
  };
  const reset = () => {
    setForm(initialForm);
    setResult(null);
    setErrors([]);
    setWarnings([]);
    setStep(0);
    setFurthestStep(0);
  };
  const useExample = () => {
    setForm({
      age: "42",
      sex: "男",
      hypertensionHistory: "无",
      bmi: "24.6",
      glucose: "5.3",
      triglycerides: "1.2",
      hdl: "1.4",
      diagnosedStatus: "否",
    });
    setResult(null);
    setErrors([]);
    setWarnings([]);
    setStep(0);
    setFurthestStep(0);
  };
  const calculate = () => {
    if (!artifact) {
      setErrors([modelError ?? "模型文件仍在加载，请稍后重试。"]);
      return;
    }
    if (!form.diagnosedStatus) {
      setErrors(["请选择是否已有糖尿病诊断。"]);
      return;
    }
    if (form.diagnosedStatus !== "否") {
      setErrors(["当前已确诊或确诊状态不确定，不进入新发事件研究估计。"]);
      return;
    }
    const input = toModelInput(form, artifact);
    const validation = validateModelInput(artifact, input);
    if (validation.errors.length) {
      setErrors(validation.errors);
      setWarnings(validation.warnings);
      return;
    }
    try {
      setResult(inferModel(artifact, input));
      setErrors([]);
      setWarnings(validation.warnings);
      setStep(3);
    } catch (error: unknown) {
      setErrors([error instanceof Error ? error.message : "模型推断失败。"]);
      setResult(null);
    }
  };

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="top-nav-inner">
          <a
            className="brand"
            href="#top"
            aria-label="返回风险估计"
            onClick={(event) => {
              event.preventDefault();
              setView("assessment");
              setMobileOpen(false);
            }}
          >
            <span className="brand-mark">
              <span />
            </span>
            <strong>兰州代谢环境</strong>
            <small>研究工具</small>
          </a>
          <nav className="main-nav" aria-label="页面导航">
            <button
              type="button"
              className={view === "assessment" ? "nav-active" : ""}
              onClick={() => {
                setView("assessment");
                setMobileOpen(false);
              }}
            >
              风险估计
            </button>
            <button
              type="button"
              className={view === "method" ? "nav-active" : ""}
              onClick={() => {
                setView("method");
                setMobileOpen(false);
              }}
            >
              研究方法
            </button>
          </nav>
          <div className="top-status" title={modelError ?? undefined}>
            <span
              className={
                modelError
                  ? "status-failed"
                  : artifact
                    ? "status-ready"
                    : "status-loading"
              }
            />
            {modelError ? "模型加载失败" : artifact ? "模型已载入" : "载入中"}
          </div>
          <button
            className="mobile-menu"
            type="button"
            aria-label={mobileOpen ? "关闭菜单" : "打开菜单"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((current) => !current)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        {mobileOpen && (
          <div className="mobile-nav">
            <button
              type="button"
              onClick={() => {
                setView("assessment");
                setMobileOpen(false);
              }}
            >
              风险估计
            </button>
            <button
              type="button"
              onClick={() => {
                setView("method");
                setMobileOpen(false);
              }}
            >
              研究方法
            </button>
          </div>
        )}
      </header>
      {view === "assessment" ? (
        <Assessment
          form={form}
          artifact={artifact}
          result={result}
          errors={errors}
          warnings={warnings}
          modelError={modelError}
          ageInputRef={ageInputRef}
          resultRef={resultRef}
          onUpdate={update}
          onCalculate={calculate}
          onValidationErrors={(nextErrors) => {
            setErrors(nextErrors);
            setWarnings([]);
          }}
          step={step}
          furthestStep={furthestStep}
          onStepChange={(nextStep) => {
            setStep(nextStep);
            setFurthestStep(
              (current) => Math.max(current, nextStep) as 0 | 1 | 2 | 3,
            );
            setErrors([]);
          }}
          onReset={reset}
          onExample={useExample}
          onEdit={() => {
            setResult(null);
            setStep(0);
            requestAnimationFrame(() => ageInputRef.current?.focus());
          }}
        />
      ) : (
        <Method artifact={artifact} />
      )}
    </div>
  );
}

function toNullableNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function toModelInput(form: FormData, artifact: ModelArtifact): RawModelInput {
  return withDefaultEnvironment(artifact, {
    age: toNullableNumber(form.age),
    sex: form.sex === "男" || form.sex === "女" ? form.sex : null,
    hypertension_history:
      form.hypertensionHistory === "有"
        ? 1
        : form.hypertensionHistory === "无"
          ? 0
          : null,
    BMI: toNullableNumber(form.bmi),
    glucose: toNullableNumber(form.glucose),
    TG: toNullableNumber(form.triglycerides),
    HDL: toNullableNumber(form.hdl),
  });
}

type AssessmentProps = {
  form: FormData;
  artifact: ModelArtifact | null;
  result: ModelResult | null;
  errors: string[];
  warnings: string[];
  modelError: string | null;
  ageInputRef: React.RefObject<HTMLInputElement | null>;
  resultRef: React.RefObject<HTMLElement | null>;
  onUpdate: (key: keyof FormData, value: string) => void;
  onCalculate: () => void;
  onValidationErrors: (errors: string[]) => void;
  step: 0 | 1 | 2 | 3;
  furthestStep: 0 | 1 | 2 | 3;
  onStepChange: (step: 0 | 1 | 2 | 3) => void;
  onReset: () => void;
  onExample: () => void;
  onEdit: () => void;
};
function Assessment({
  form,
  artifact,
  result,
  errors,
  warnings,
  modelError,
  ageInputRef,
  resultRef,
  onUpdate,
  onCalculate,
  onValidationErrors,
  step,
  furthestStep,
  onStepChange,
  onReset,
  onExample,
  onEdit,
}: AssessmentProps) {
  const questionRef = useRef<HTMLDivElement>(null);
  const previousPage = useRef(step);
  const hadResult = useRef(Boolean(result));
  useEffect(() => {
    if (!result && (previousPage.current !== step || hadResult.current)) {
      questionRef.current?.focus({ preventScroll: true });
      questionRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "auto",
      });
    }
    previousPage.current = step;
    hadResult.current = Boolean(result);
  }, [step, result]);
  const environment = artifact?.defaultEnvironment;
  const steps = ["基本信息", "体检指标", "血脂", "核对计算"];
  const validateCurrentStep = () => {
    const nextErrors: string[] = [];
    const number = (value: string) =>
      value.trim() === "" ? null : Number(value);
    const requireNumber = (value: string, label: string) => {
      const parsed = number(value);
      if (parsed === null || !Number.isFinite(parsed)) {
        nextErrors.push(`请填写有效的${label}。`);
      }
      return parsed;
    };

    if (step === 0) {
      const age = requireNumber(form.age, "年龄");
      if (age !== null && Number.isFinite(age) && (age < 0 || age > 120)) {
        nextErrors.push("年龄应在 0–120 岁范围内。");
      }
      if (!form.sex) nextErrors.push("请选择生理性别。");
      if (!form.hypertensionHistory) nextErrors.push("请选择既往高血压史。");
    }
    if (step === 1) {
      const glucose = requireNumber(form.glucose, "血糖 glucose");
      if (glucose !== null && Number.isFinite(glucose) && glucose < 0) {
        nextErrors.push("血糖不能为负数。");
      }
      if (glucose !== null && Number.isFinite(glucose) && glucose >= 7) {
        nextErrors.push(
          "血糖 glucose ≥ 7，超出无事件起点训练域，本演示不适用。",
        );
      }
      const bmi = number(form.bmi);
      if (bmi !== null && (!Number.isFinite(bmi) || bmi < 0)) {
        nextErrors.push("BMI 应为非负数，或留空由训练集规则插补。");
      }
      if (!form.diagnosedStatus) nextErrors.push("请选择是否已有糖尿病诊断。");
      else if (form.diagnosedStatus !== "否")
        nextErrors.push(
          "当前已确诊或确诊状态不确定，不进入新发事件研究估计。请结合原始报告咨询医生。",
        );
    }
    if (step === 2) {
      const tgEmpty = form.triglycerides.trim() === "";
      const hdlEmpty = form.hdl.trim() === "";
      if (tgEmpty !== hdlEmpty) {
        nextErrors.push("TG 与 HDL 需同时填写或同时留空。");
      }
      if (!tgEmpty) {
        const tg = requireNumber(form.triglycerides, "甘油三酯 TG");
        const hdl = requireNumber(form.hdl, "高密度脂蛋白 HDL");
        if (tg !== null && Number.isFinite(tg) && tg < 0) {
          nextErrors.push("甘油三酯 TG 不能为负数。");
        }
        if (hdl !== null && Number.isFinite(hdl) && hdl < 0) {
          nextErrors.push("高密度脂蛋白 HDL 不能为负数。");
        }
      }
    }
    const pageFields = [
      [["age", form.age, "年龄"]],
      [
        ["glucose", form.glucose, "血糖"],
        ["BMI", form.bmi, "BMI"],
      ],
      [
        ["TG", form.triglycerides, "TG"],
        ["HDL", form.hdl, "HDL"],
      ],
      [],
    ][step];
    for (const [name, raw, label] of pageFields) {
      if (!raw.trim()) continue;
      const value = Number(raw);
      const feature = artifact?.features.find((item) => item.name === name);
      if (
        Number.isFinite(value) &&
        feature &&
        ((feature.observedMin != null && value < feature.observedMin) ||
          (feature.observedMax != null && value > feature.observedMax))
      ) {
        nextErrors.push(
          `${label}超出训练起点观测范围（${feature.observedMin}–${feature.observedMax}）。`,
        );
      }
    }
    onValidationErrors(nextErrors);
    return nextErrors.length === 0;
  };
  const nextStep = () => {
    if (!validateCurrentStep()) return;
    if (step < 3) {
      onStepChange((step + 1) as 0 | 1 | 2 | 3);
    } else {
      onCalculate();
    }
  };
  const handleStepClick = (target: number) => {
    if (target <= furthestStep && (target <= step || validateCurrentStep())) {
      onStepChange(target as 0 | 1 | 2 | 3);
    }
  };

  if (result && artifact) {
    return (
      <main className="workspace" id="top">
        <div className="page-toolbar">
          <div>
            <div className="breadcrumb">研究工具 / 风险估计</div>
            <h1>3 年研究估计</h1>
          </div>
          <span className="toolbar-note">固定历史环境 · 本地推断</span>
        </div>
        <section
          className="result-page-wide"
          ref={resultRef}
          tabIndex={-1}
          aria-label="计算结果"
        >
          <ResultPanel
            form={form}
            result={result}
            artifact={artifact}
            warnings={warnings}
            onEdit={onEdit}
            onReset={onReset}
          />
          <ResultInsights form={form} result={result} artifact={artifact} />
        </section>
      </main>
    );
  }

  return (
    <main className="workspace" id="top">
      <div className="page-toolbar">
        <div>
          <div className="breadcrumb">研究工具 / 风险估计</div>
          <h1>糖尿病风险估计</h1>
        </div>
        <span className="toolbar-note">3 年 · 科研演示</span>
      </div>
      <div className="tool-layout">
        <section className="input-column">
          <form
            className="panel panel-form"
            onSubmit={(event) => {
              event.preventDefault();
              nextStep();
            }}
          >
            <div className="panel-head">
              <div>
                <h2>输入信息</h2>
              </div>
              <span className="required-note">
                <i />
                必填
              </span>
            </div>
            <StepProgress
              labels={steps}
              current={step}
              furthest={furthestStep}
              onSelect={handleStepClick}
            />
            <div className="step-question" ref={questionRef} tabIndex={-1}>
              <span>第 {step + 1} / 4 步</span>
              <h3>
                {
                  [
                    "你的基本信息是什么？",
                    "最近一次体检指标是什么？",
                    "血脂指标是否可用？",
                    "核对输入与固定环境",
                  ][step]
                }
              </h3>
            </div>
            {step === 0 && (
              <div className="form-block step-block">
                <div className="field-grid three">
                  <Field id="age" label="年龄" required unit="岁">
                    <input
                      ref={ageInputRef}
                      id="age"
                      type="number"
                      min="0"
                      max="120"
                      inputMode="numeric"
                      placeholder="例如 42"
                      value={form.age}
                      onChange={(event) => onUpdate("age", event.target.value)}
                    />
                  </Field>
                  <ChoiceField
                    label="生理性别"
                    required
                    options={["女", "男"]}
                    value={form.sex}
                    onChange={(value) => onUpdate("sex", value)}
                  />
                  <ChoiceField
                    label="既往高血压史"
                    required
                    options={["无", "有"]}
                    value={form.hypertensionHistory}
                    onChange={(value) => onUpdate("hypertensionHistory", value)}
                  />
                </div>
              </div>
            )}
            {step === 1 && (
              <div className="form-block step-block">
                <div className="field-grid three">
                  <Field
                    id="glucose"
                    label="血糖 glucose"
                    required
                    helper="原表单位待确认"
                  >
                    <input
                      id="glucose"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="必填"
                      value={form.glucose}
                      onChange={(event) =>
                        onUpdate("glucose", event.target.value)
                      }
                    />
                  </Field>
                  <Field id="bmi" label="BMI" helper="可留空">
                    <input
                      id="bmi"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="可选"
                      value={form.bmi}
                      onChange={(event) => onUpdate("bmi", event.target.value)}
                    />
                  </Field>
                  <Field id="diagnosed" label="已有糖尿病诊断" required>
                    <SelectField
                      id="diagnosed"
                      ariaLabel="是否已有糖尿病诊断"
                      value={form.diagnosedStatus}
                      onChange={(value) => onUpdate("diagnosedStatus", value)}
                      options={["否", "是", "不确定"]}
                    />
                  </Field>
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="form-block step-block">
                <div className="field-grid two">
                  <Field
                    id="tg"
                    label="甘油三酯 TG"
                    helper="与 HDL 同时填写或同时留空"
                  >
                    <input
                      id="tg"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="可选"
                      value={form.triglycerides}
                      onChange={(event) =>
                        onUpdate("triglycerides", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    id="hdl"
                    label="高密度脂蛋白 HDL"
                    helper="与 TG 同时填写或同时留空"
                  >
                    <input
                      id="hdl"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="可选"
                      value={form.hdl}
                      onChange={(event) => onUpdate("hdl", event.target.value)}
                    />
                  </Field>
                </div>
                <p className="step-note">
                  血脂单位和检测条件请以原始体检报告为准。
                </p>
              </div>
            )}
            {step === 3 && (
              <div className="form-block step-block review-block">
                <div className="review-grid">
                  <Metric
                    label="年龄 / 性别"
                    value={`${form.age || "—"} / ${form.sex || "—"}`}
                  />
                  <Metric
                    label="高血压史"
                    value={form.hypertensionHistory || "—"}
                  />
                  <Metric label="血糖 glucose" value={form.glucose || "—"} />
                  <Metric label="BMI" value={form.bmi || "训练规则插补"} />
                  <Metric
                    label="TG / HDL"
                    value={`${form.triglycerides || "插补"} / ${form.hdl || "插补"}`}
                  />
                  <Metric
                    label="已有诊断"
                    value={form.diagnosedStatus || "—"}
                  />
                </div>
                <details className="environment-details">
                  <summary>
                    <span>
                      <CloudSun size={16} />
                      固定历史环境情景
                    </span>
                    <b>
                      {environment
                        ? `${environment.visitDate} · 365 天`
                        : "模型载入后显示"}
                    </b>
                    <ChevronDown size={16} />
                  </summary>
                  {environment && <EnvironmentDetails artifact={artifact} />}
                </details>
              </div>
            )}
            {(modelError || errors.length > 0) && (
              <AlertBox
                tone="error"
                items={[
                  ...new Set([...(modelError ? [modelError] : []), ...errors]),
                ]}
              />
            )}
            {!result && warnings.length > 0 && (
              <AlertBox tone="warning" items={[...new Set(warnings)]} />
            )}
            <div className="form-footer">
              <div className="form-pagination">
                {step === 0 ? (
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={onExample}
                  >
                    <Sparkles size={15} />
                    载入合成人工示例
                  </button>
                ) : (
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => onStepChange((step - 1) as 0 | 1 | 2 | 3)}
                  >
                    上一步
                  </button>
                )}
                <div className="footer-actions">
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={onReset}
                  >
                    <RotateCcw size={15} />
                    重置
                  </button>
                  <button className="button button-primary" type="submit">
                    <Activity size={16} />
                    {step === 3 ? "计算 3 年估计" : "下一步"}
                  </button>
                </div>
              </div>
            </div>
            <div className="form-footnote">
              <ShieldCheck size={13} />
              仅在当前页面内存计算，不写入本地存储或外部接口。
            </div>
          </form>
        </section>
        <aside className="result-column" aria-label="计算结果">
          <EmptyResult artifact={artifact} />
        </aside>
      </div>
    </main>
  );
}

function StepProgress({
  labels,
  current,
  furthest,
  onSelect,
}: {
  labels: string[];
  current: number;
  furthest: number;
  onSelect: (step: number) => void;
}) {
  return (
    <nav className="step-progress" aria-label="输入步骤">
      {labels.map((label, index) => (
        <button
          key={label}
          type="button"
          className={index === current ? "step-current" : ""}
          aria-current={index === current ? "step" : undefined}
          disabled={index > furthest}
          onClick={() => onSelect(index)}
        >
          <span>{index + 1}</span>
          {label}
        </button>
      ))}
    </nav>
  );
}

function Field({
  id,
  label,
  unit,
  helper,
  required,
  children,
}: {
  id?: string;
  label: string;
  unit?: string;
  helper?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">
        <b>{label}</b>
        {required && <i>必填</i>}
        {unit && <small>{unit}</small>}
      </span>
      {children}
      {helper && <span className="field-helper">{helper}</span>}
    </label>
  );
}
function ChoiceField({
  label,
  value,
  options,
  onChange,
  required,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <fieldset className="field choice-field">
      <legend className="field-label">
        <b>{label}</b>
        {required && <i>必填</i>}
      </legend>
      <div className="choice-group">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            className={value === option ? "choice-selected" : ""}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
function SelectField({
  id,
  value,
  options,
  onChange,
  ariaLabel,
}: {
  id: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="select-field">
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">请选择</option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <ChevronDown size={15} />
    </div>
  );
}
function EnvironmentDetails({ artifact }: { artifact: ModelArtifact | null }) {
  if (!artifact) return null;
  const values = artifact.defaultEnvironment.values;
  return (
    <div className="environment-content">
      <div className="environment-meta">
        <span>气象窗口</span>
        <b>
          {artifact.defaultEnvironment.weatherWindowStart} —{" "}
          {artifact.defaultEnvironment.weatherWindowEnd}
        </b>
        <span>污染累计</span>
        <b>
          {artifact.defaultEnvironment.pollutionWindow.startYear}–
          {artifact.defaultEnvironment.pollutionWindow.endYear}（
          {artifact.defaultEnvironment.pollutionWindow.nYears} 年）
        </b>
      </div>
      <div className="environment-values">
        <Metric
          label="平均气温"
          value={values.temperature_mean_365d.toFixed(2)}
        />
        <Metric
          label="温度波动"
          value={values.temperature_variability_sd_365d.toFixed(2)}
        />
        <Metric
          label="热浪天数"
          value={String(values.HW_P95_D3_heatwave_days_365d)}
        />
        <Metric
          label="寒冷天数"
          value={String(values.CS_P5_D3_coldspell_days_365d)}
        />
        <Metric
          label="寒潮启动"
          value={String(values.CMA_coldwave_onsets_365d)}
        />
        <Metric label="PM25 累计" value={values.PM25_cumavg_lag1.toFixed(2)} />
      </div>
      <p className="small-note">
        固定于一条真实完整历史环境向量；不代表当前天气、位置或未来暴露。
      </p>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
function AlertBox({
  tone,
  items,
}: {
  tone: "error" | "warning";
  items: string[];
}) {
  return (
    <div
      className={`alert-box ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <CircleAlert size={15} />
      <div>
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}
function EmptyResult({ artifact }: { artifact: ModelArtifact | null }) {
  return (
    <div className="empty-result panel">
      <div className="empty-icon">
        <BarChart3 size={22} />
      </div>
      <h2>等待计算</h2>
      <p>填写信息后，结果会显示在这里。</p>
      <div className="empty-row">
        <span>预测期限</span>
        <b>3 年</b>
      </div>
      <div className="empty-row">
        <span>环境情景</span>
        <b>
          {artifact
            ? `${artifact.defaultEnvironment.visitDate} · 365 天`
            : "载入中"}
        </b>
      </div>
      <div className="empty-row">
        <span>输出</span>
        <b>研究估计 / 研究分位</b>
      </div>
    </div>
  );
}
function ResultPanel({
  form,
  result,
  artifact,
  warnings,
  onEdit,
  onReset,
}: {
  form: FormData;
  result: ModelResult;
  artifact: ModelArtifact;
  warnings: string[];
  onEdit: () => void;
  onReset: () => void;
}) {
  const contributions = [...result.contributions].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
  );
  const selected = [
    ...contributions.filter((item) => item.contribution > 0).slice(0, 3),
    ...contributions.filter((item) => item.contribution < 0).slice(0, 3),
  ];
  return (
    <div className="result-stack">
      <div className="panel result-main">
        <div className="result-topline">
          <span className="label-overline">模型输出 · 3 年</span>
          <span className="result-local">
            <LockKeyhole size={13} />
            本地推断
          </span>
        </div>
        <div className="result-number">{(result.p3 * 100).toFixed(1)}%</div>
        <div className="result-level">
          <span className={`quantile ${result.quantilePosition}`}>
            {result.quantileLabel}
          </span>
          <span>固定历史环境情景</span>
        </div>
        <p className="result-caption">
          当前输入对应的模型关联估计，不是临床诊断。
        </p>
        {warnings.length > 0 && (
          <AlertBox tone="warning" items={[...new Set(warnings)]} />
        )}
        <div className="result-meta-grid">
          <div>
            <span>模型版本</span>
            <b>{artifact.modelVersion}</b>
          </div>
          <div>
            <span>环境记录</span>
            <b>{artifact.defaultEnvironment.visitDate}</b>
          </div>
          <div>
            <span>年龄 / 性别</span>
            <b>
              {form.age || "—"} / {form.sex || "—"}
            </b>
          </div>
          <div>
            <span>环境窗口</span>
            <b>365 天</b>
          </div>
        </div>
        <div className="result-buttons">
          <button
            className="button button-quiet"
            type="button"
            onClick={onEdit}
          >
            返回输入
          </button>
          <button
            className="button button-quiet"
            type="button"
            onClick={onReset}
          >
            重置
          </button>
        </div>
      </div>
      <div className="panel contribution-panel">
        <div className="panel-head compact">
          <div>
            <h2>因素贡献</h2>
            <p>对线性评分的方向与大小；不表示因果效应。</p>
          </div>
          <Info size={16} />
        </div>
        <div className="contribution-list">
          {selected.map((item) => (
            <div className="contribution" key={item.name}>
              <span>{item.label}</span>
              <b className={item.contribution >= 0 ? "up" : "down"}>
                {item.contribution >= 0 ? "+" : ""}
                {item.contribution.toFixed(3)}
              </b>
            </div>
          ))}
        </div>
        <p className="reference-note">
          参考点：连续变量标准化 0；女=0；无高血压史=0；缺失指示=0。
        </p>
      </div>
    </div>
  );
}

function Method({ artifact }: { artifact: ModelArtifact | null }) {
  const summary = artifact?.trainingSummary ?? {};
  const evaluation = artifact?.evaluation ?? {};
  const interval = (evaluation.intervalTest ?? {}) as Record<string, unknown>;
  const landmark = (evaluation.landmark3Year ?? {}) as Record<string, unknown>;
  const metrics = (landmark.metrics ?? {}) as Record<string, unknown>;
  const counts = (landmark.counts ?? {}) as Record<string, unknown>;
  const metric = (value: unknown) =>
    typeof value === "number" ? value.toFixed(3) : "—";
  const count = (value: unknown) =>
    value === undefined || value === null ? "—" : String(value);
  const excluded =
    Number(counts.censored_before_H ?? 0) +
    Number(counts.interval_straddles_H ?? 0);
  return (
    <main className="workspace method-page">
      <div className="page-toolbar">
        <div>
          <div className="breadcrumb">研究工具 / 研究方法</div>
          <h1>模型、数据与限制</h1>
        </div>
        <span className="toolbar-note">
          <Database size={14} />
          离线产物
        </span>
      </div>
      <div className="method-layout">
        <section className="method-content">
          <div className="panel method-card">
            <div className="method-card-head">
              <span className="method-index">01</span>
              <div>
                <h2>数据与环境</h2>
                <p>
                  仅使用本地纵向体检队列与历史环境聚合字段。浏览器不接收原始患者行、ID、坐标或
                  CSV。
                </p>
              </div>
            </div>
            <div className="method-facts">
              <Metric
                label="来源行数"
                value={String(artifact?.sourceFingerprint.rowCount ?? "—")}
              />
              <Metric
                label="受试者"
                value={count(summary.sourceSubjectCount)}
              />
              <Metric label="有效区间" value={count(summary.intervalCount)} />
              <Metric
                label="环境记录"
                value={artifact?.defaultEnvironment.visitDate ?? "—"}
              />
            </div>
          </div>
          <div className="panel method-card">
            <div className="method-card-head">
              <span className="method-index">02</span>
              <div>
                <h2>区间模型</h2>
                <p>
                  每人按访问日期排序，以相邻有效访问构造区间；起点特征不读取结局访问数据。固定输出
                  3 年研究估计。
                </p>
              </div>
            </div>
            <div className="formula">
              P<sub>3y</sub> = 1 − exp(−exp(β₀ + βx) × 3)
            </div>
            <div className="method-tags">
              <span>cloglog</span>
              <span>constant hazard</span>
              <span>L2 ridge</span>
              <span>α = {artifact?.algorithm.alpha ?? "—"}</span>
            </div>
          </div>
          <div className="panel method-card">
            <div className="method-card-head">
              <span className="method-index">03</span>
              <div>
                <h2>内部评估</h2>
                <p>
                  test 区间与严格 3 年 landmark
                  可判定子集。以下为内部描述性指标，不代表外部验证或临床准确率。
                </p>
              </div>
            </div>
            <div className="method-facts metrics-facts">
              <Metric label="Test interval NLL" value={metric(interval.nll)} />
              <Metric label="Landmark AUROC" value={metric(metrics.auroc)} />
              <Metric label="Landmark AUPRC" value={metric(metrics.auprc)} />
              <Metric label="Brier" value={metric(metrics.brier)} />
              <Metric label="ECE" value={metric(metrics.ece)} />
              <Metric label="可判定样本" value={count(metrics.n)} />
            </div>
            <p className="method-note">
              可判定：{count(counts.positive)} 阳性 / {count(counts.negative)}{" "}
              阴性；排除 {excluded}（随访不足或区间跨越 3 年）。
            </p>
          </div>
          <details className="panel limitations">
            <summary>
              <Settings2 size={15} />
              完整限制
            </summary>
            <ul>
              {(artifact?.limitations ?? ["模型文件尚未载入。"]).map((item) => (
                <li key={item}>
                  {item.replace(
                    "不提供健康建议",
                    "仅提供一般健康教育，不提供个体化治疗建议",
                  )}
                </li>
              ))}
            </ul>
          </details>
        </section>
        <aside className="method-side">
          <div className="side-block">
            <span className="label-overline">实现</span>
            <b>{artifact?.modelVersion ?? "模型载入中"}</b>
            <span>
              日期范围：{artifact?.sourceFingerprint.dateMin ?? "—"} —{" "}
              {artifact?.sourceFingerprint.dateMax ?? "—"}
            </span>
          </div>
          <div className="side-block">
            <span className="label-overline">特征</span>
            <b>13 个起点字段</b>
            <span>个人指标 + 365 天环境字段</span>
          </div>
          <div className="side-block">
            <span className="label-overline">隐私</span>
            <b>浏览器内存</b>
            <span>刷新或关闭页面后清除</span>
          </div>
          <div className="side-block">
            <span className="label-overline">来源</span>
            <span>
              本地离线训练产物
              <br />
              无外部请求 / 无数据库
            </span>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default App;
