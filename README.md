# 兰州代谢环境研究工作台

这是一个只面向科研演示的离线模型与浏览器工作台。原始 CSV 只在训练命令中从 Downloads 目录读取；浏览器只读取聚合后的 `public/model-artifact.json`，不接收患者行、ID、坐标或外部接口。

## 本地运行

项目已包含训练后的模型产物，仅体验网站时运行 `npm ci` 和 `npm run dev` 即可；以下 Python 步骤用于重新训练和数值验证。

验证环境为 Node 24.19+（Node 26 亦可）与 Python 3.14。干净环境可先安装依赖：

```bash
npm ci
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

```bash
./.venv/bin/python scripts/train_model.py \
  --csv /path/to/兰州气象糖尿病研究数据_含寒潮温差累计污染物_完整版.csv \
  --output public/model-artifact.json
npm run build
npm run dev
```

项目内 Python 环境使用 `requirements.txt` 中固定版本。训练脚本记录源数据 SHA-256，并校验日期与 365 天窗口、相邻区间计数、受试者隔离拆分、严格 landmark 分类和 artifact 隐私边界。

```bash
./.venv/bin/python scripts/test_model.py
npm run test:inference
```

`test:inference` 使用 20 组人工合成输入，对照 Python 与 TypeScript/浏览器推断公式，另检查无效输入、极端线性评分和损坏 artifact 的拒绝行为。

模型是区间删失的常数风险模型，固定展示 3 年研究估计。结果中的研究分位和内部验证指标不能解释为临床风险、诊断或治疗建议。页面中的示例值是明确标记的人工合成值。

输入按基本信息、体检指标、血脂指标、核对计算分为四页。结果页给出分层解读、缺失数据提示和一般健康教育；教育内容使用固定模板并附 WHO / NIDDK 来源，与附件训练的预测模型分开，不调用外部模型或数据接口。

## GitHub Pages

Pages 入口：https://sunnycloudyang.github.io/diabetes-diagnose/

账号已配置 Pages 自定义域名，本站沿用：https://origakid.top/diabetes-diagnose/

推送 `main` 后，`.github/workflows/pages.yml` 使用 Node 24 安装锁定依赖、构建 `dist` 并发布至 Pages。仓库的 Pages 发布源须设为 GitHub Actions。部署读取已提交的聚合模型产物，不运行训练、不上传原始 CSV。

工作流根据 Pages 元数据设置资源前缀，模型 JSON 与页面资源使用相同路径。模拟项目子路径部署：

```bash
npm run build -- --base /diabetes-diagnose/
npm run preview -- --host 127.0.0.1 --base /diabetes-diagnose/
```
