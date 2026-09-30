# 结论与建议的范围

用户于 2026-09-30 要求分页填写并丰富结论建议。本次扩展不更改模型参数、预测期限、研究分位或训练数据；预测仍只依赖用户附件。一般健康教育以静态模板附加，不接入 RAG 或医学大模型。

## 内容与来源

| 内容 | 来源 | 使用边界 |
| --- | --- | --- |
| 相对分组、完整度、主要正向项、历史窗口 | 本地模型产物及本次输入 | 研究分位不是临床阈值；贡献不表示因果或干预获益 |
| 核对单位、空腹状态、缺失指标 | 附件字段限制及输入状态 | 不把原始血糖/血脂数值直接判为正常或异常 |
| 血糖检查、与医生确认检查安排 | [NIDDK：Diabetes Tests & Diagnosis](https://www.niddk.nih.gov/health-information/diabetes/overview/tests-diagnosis) | 不按研究分位规定检查间隔、不下诊断 |
| 一般运动、症状识别 | [WHO：Diabetes](https://www.who.int/news-room/fact-sheets/detail/diabetes) | 面向适宜运动的成年人，不能给出个体治疗处方 |
| 饮食调整 | [WHO：Healthy diet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet) | 无减重、热量或药物处方 |

来源核对日期：2026-09-30。来源链接只在用户点击时打开，不发送表单内容。高血压史提示仅要求整理已有血压资料供就诊参考，不调整治疗。较低研究分位也不用于排除疾病；症状提示不因分位而隐藏。
