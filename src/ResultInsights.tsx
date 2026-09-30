import {
  ClipboardList,
  FileCheck2,
  Footprints,
  Utensils,
  ExternalLink,
  Stethoscope,
} from "lucide-react";
import type { ModelArtifact, ModelResult } from "./model";
import "./ResultInsights.css";

type InsightForm = {
  age: string;
  sex: string;
  hypertensionHistory: string;
  bmi: string;
  glucose: string;
  triglycerides: string;
  hdl: string;
};
const sources = {
  prevention: "https://www.who.int/news-room/fact-sheets/detail/diabetes",
  diet: "https://www.who.int/news-room/fact-sheets/detail/healthy-diet",
  tests:
    "https://www.niddk.nih.gov/health-information/diabetes/overview/tests-diagnosis",
};
const interpretations: Record<ModelResult["quantilePosition"], string> = {
  low: "模型输出位于训练参考分布的较低组。较低分位不能排除糖尿病，也不能代替血糖检查。",
  middle:
    "模型输出位于训练参考分布的中间组。这是研究中的相对分组，不是临床诊断标准。",
  high: "模型输出位于训练参考分布的较高组。它表示相对模型评分较高，不能据此诊断糖尿病或判断病情严重程度。",
};
const personalNames = new Set([
  "age",
  "sex",
  "hypertension_history",
  "BMI",
  "glucose",
  "TG",
  "HDL",
]);

export function ResultInsights({
  form,
  result,
  artifact,
}: {
  form: InsightForm;
  result: ModelResult;
  artifact: ModelArtifact;
}) {
  const missing = [
    ["BMI", form.bmi],
    ["甘油三酯 TG", form.triglycerides],
    ["高密度脂蛋白 HDL", form.hdl],
  ]
    .filter(([, value]) => !value.trim())
    .map(([label]) => label);
  const positive = result.contributions
    .filter((item) => item.contribution > 0 && !item.missing)
    .sort((a, b) => b.contribution - a.contribution);
  const personal = positive.find((item) => personalNames.has(item.name));
  const environment = positive.find((item) => !personalNames.has(item.name));
  const env = artifact.defaultEnvironment;
  const quantiles = artifact.researchQuantiles ?? artifact.thresholds;
  return (
    <div className="insights-stack">
      <section
        className="panel insights-section"
        aria-labelledby="interpretation-title"
      >
        <div className="insights-heading">
          <h2 id="interpretation-title">结果解读</h2>
          <span>基于本次输入</span>
        </div>
        <div className="interpretation-grid">
          <article>
            <h3>研究分层</h3>
            <strong>{result.quantileLabel}</strong>
            <p>{interpretations[result.quantilePosition]}</p>
          </article>
          <article>
            <h3>输入完整度</h3>
            <strong>{7 - missing.length} / 7 项已填写</strong>
            <p>
              {missing.length
                ? `${missing.join("、")}未填写，模型使用训练集规则插补，并计入缺失指示。补齐后估计可能变化。`
                : "个人指标已填写。血糖和血脂的单位、检测条件仍需与原始体检报告核对。"}
            </p>
          </article>
          <article>
            <h3>适用情景</h3>
            <strong>固定历史环境 · 3 年</strong>
            <p>
              气象窗口 {env.weatherWindowStart} 至 {env.weatherWindowEnd}
              ；污染累计 {env.pollutionWindow.startYear}–
              {env.pollutionWindow.endYear}。不表示当前或未来环境暴露。
            </p>
          </article>
        </div>
        <div className="factor-notes">
          <div>
            <span>个人指标中最大的正向项</span>
            <b>{personal?.label ?? "无正向项"}</b>
          </div>
          <div>
            <span>环境指标中最大的正向项</span>
            <b>{environment?.label ?? "无正向项"}</b>
          </div>
        </div>
        <p className="insight-note">
          正向项表示相对模型参考点提高线性评分，不代表致病原因；负向项也不代表保护效果。不能据此推算改变某项后能降低多少风险。
        </p>
        <details className="insight-details">
          <summary>分层与估计依据</summary>
          <p>
            在条件风险率保持恒定、环境情景固定的假设下，本次模型估计为{" "}
            {(result.p3 * 100).toFixed(1)}%。分层依据训练参考分布的第 33 / 67
            百分位
            {quantiles
              ? `（对应概率分界约 ${(quantiles.q33 * 100).toFixed(2)}% / ${(quantiles.q67 * 100).toFixed(2)}%，分组使用未舍入值）`
              : ""}
            ，不是临床低、中、高危阈值。模型仅经单一历史队列内部评估，未完成外部临床验证。
          </p>
        </details>
      </section>
      <section
        className="panel insights-section"
        aria-labelledby="next-actions-title"
      >
        <div className="insights-heading">
          <h2 id="next-actions-title">下一步建议</h2>
          <span>资料核对与一般健康教育</span>
        </div>
        <p className="insight-note">
          以下为一般健康教育。具体检查和管理方案需结合原始报告，由医生评估。
        </p>
        <div className="advice-grid">
          <article className="advice-card" data-testid="report-advice">
            <FileCheck2 size={20} />
            <div>
              <h3>{missing.length ? "先补齐缺失资料" : "先核对原始报告"}</h3>
              <p>
                {missing.length
                  ? `优先补充${missing.join("、")}，不要用猜测值代替。`
                  : `核对本次血糖 ${form.glucose} 及血脂记录是否与报告一致。`}
                附件未确认血糖、血脂单位和空腹状态，本页不据此判定这些指标正常或异常。
              </p>
            </div>
          </article>
          <article className="advice-card">
            <Stethoscope size={20} />
            <div>
              <h3>与医生确认检查安排</h3>
              <p>
                携带原始体检报告，讨论是否需要空腹血浆血糖、HbA1c
                等检查，以及适合的复查时间。
                {form.hypertensionHistory === "有"
                  ? "你填写了既往高血压史，可同时整理近期血压记录和现有管理方案供医生参考。"
                  : "复查安排需结合既往结果和个人情况，不能仅由本次研究分位决定。"}
              </p>
              <SourceLink href={sources.tests}>NIDDK · 糖尿病检查</SourceLink>
            </div>
          </article>
          <article className="advice-card">
            <Footprints size={20} />
            <div>
              <h3>安排可持续的身体活动</h3>
              <p>
                对适宜运动的成年人，可逐步达到每周至少 150
                分钟中等强度活动，例如快走，分多次完成。体能受限或有运动不适时，先与医生讨论适合的活动量。
              </p>
              <SourceLink href={sources.prevention}>
                WHO · 糖尿病预防
              </SourceLink>
            </div>
          </article>
          <article className="advice-card">
            <Utensils size={20} />
            <div>
              <h3>调整日常饮食习惯</h3>
              <p>
                增加蔬菜、全谷物和豆类，减少含糖饮料及高糖食品。结合身体情况管理体重，与医生讨论适合的体重目标。
              </p>
              <SourceLink href={sources.diet}>WHO · 健康饮食</SourceLink>
            </div>
          </article>
        </div>
        <div className="followup-note">
          <ClipboardList size={18} />
          <p>
            如出现明显口渴、排尿增多或不明原因体重下降，应就医评估，不因本页分位较低而延误检查。
            <SourceLink href={sources.prevention}>WHO · 症状说明</SourceLink>
          </p>
        </div>
        <details className="insight-details">
          <summary>就诊前可准备的资料</summary>
          <ul>
            <li>体检日期、原始血糖与血脂报告、单位及空腹情况。</li>
            <li>既往血糖检查结果、目前使用的药物，以及近期身体变化。</li>
            <li>
              {form.hypertensionHistory === "有"
                ? "近期血压记录；本页不会调整现有治疗方案。"
                : "已知病史与家族史；本模型尚未纳入所有临床风险因素。"}
            </li>
          </ul>
        </details>
        <div className="guidance-provenance">
          健康教育来源：WHO、NIDDK · 核对日期：2026-09-30
        </div>
      </section>
    </div>
  );
}
function SourceLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      className="advice-source"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
    >
      {children}
      <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}
