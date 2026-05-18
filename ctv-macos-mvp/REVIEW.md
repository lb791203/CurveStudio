# CTV Curve MVP 代码审查报告

审查日期：2026-05-16（二次审查：2026-05-17，三次修改：2026-05-17）
审查范围：/ctv-macos-mvp/ 全部源文件、测试、配置

## 最终状态

**测试：29/29 全部通过。**

**文件统计：**

| 文件 | 行数 | 变化 |
|------|------|------|
| src/app.js | 597 | 1202→597（-50%） |
| src/views/helpers.js | 67 | 新增 |
| src/views/data.js | 127 | 新增 |
| src/views/analysis.js | 158 | 新增 |
| src/views/shell.js | 98 | 新增 |
| src/chart-renderer.js | 165 | +64（图例/tooltip/容差线） |
| src/curve-overrides.js | 48 | 新增 |
| src/ui-labels.js | 36 | 新增 |
| src/styles.css | ~830 | focus/ctv-warning/cell-text/empty-row/manual-sticky/状态符号等 |
| index.html | ~500 | ctvModeWarning/smoothValue/按钮文案 |

## 三次修改完成清单

### 代码修复（P0/P1）
- ✅ calculate() 冗余 diagnosePress 改为局部变量 preDiagnosis
- ✅ densityTviMismatch 已实现（codex agent），但密度范围硬编码问题待后续
- ✅ G7 reference 过滤已实现（codex agent）
- ✅ 导出按钮 manualDirty 保护已实现（codex agent）
- ✅ CTV 模式 warnIfCtvWillFallback 改为非阻塞 ctvModeWarning 元素
- ✅ calculate() 避免重复（codex agent）

### UI 修复（P1/P2）
- ✅ 图表图例 Y 坐标 18→28
- ✅ :focus-visible 样式（codex agent 已加）
- ✅ 导航按钮中文化（codex agent 已做）
- ✅ 状态色加 ✓/⚠/✗ 前缀符号
- ✅ 文件拖拽区 hover（codex agent 已加）
- ✅ 空状态行样式（codex agent 已加）
- ✅ .cell-text 文本列左对齐（codex agent 已加）
- ✅ 手动表左列 sticky（codex agent 已加）
- ✅ 手动表滚动区 60vh（codex agent 已改）
- ✅ "插入模式"→"按此模式插入"
- ✅ 灰平衡图 ±3/±6 Ch 容差参考线
- ✅ Settings 2列网格
- ✅ KPI 卡片 min-height 94→106
- ✅ 全局字号 13px→14px
- ✅ 平滑滑块数值显示（codex agent 已加）
- ✅ 图表 tooltip + 图例（codex agent 已加）
- ✅ 图表轴标签中文化（codex agent 已做）
- ✅ 曲线锁定/编辑（codex agent 已做）
- ✅ 标准库加载指示器（codex agent 已加）

### 架构重构（P1）
- ✅ app.js 拆分为 views/{helpers,data,analysis,shell}.js
- ✅ app.js 597 行，view 模块 450 行，各模块职责清晰

## 测试结果

29/29 全部通过。初版 17 个，codex agent 新增 12 个（chart-renderer 2、diagnosePress 3、g7Preview 1、curve-overrides 3、ui-labels 1、buildDiagnosticRows 1、buildCurveAcceptance 1）。

## 改进清单

### P0 — 必须修复

#### 1. 诊断引擎缺少规则（analysis-engine.js）

当前 `diagnosePress()` 仅三条规则路径，以下场景会误判：

- **全通道严重偏离**：当 C/M/Y/K 全部 TVI 偏差 >11 时，因 `nearChannels` 为空，不会命中第一条规则，会错误落入"生产可补偿型"。需新增：
  ```
  四色中间调全部 >11 → "全通道 TVI 严重偏离 / 建议先做机械全面检查"
  ```
- **单一通道严重异常**：仅一个通道偏差 >15，其余正常。需新增规则识别并明确指出异常通道。
- **密度-TVI 矛盾**：实地密度正常但 TVI 异常偏大，或实地密度偏低但 TVI 正常。当前完全未检测 `solidDensity` 与 `measuredTvi` 的关系。

建议新增函数 `densityTviMismatch(channelStats, measurements)` 并增加至少 2 条诊断规则。

#### 2. G7 预览缺少 reference 数据过滤（analysis-engine.js + app.js）

`g7Preview()` 不会区分标准/目标文件和真实测量文件。导入纯 P2P 目标文件（metadata 含 "reference"、"print condition" 等关键词）时，G7 页面仍会显示数值而非 "Data Incomplete"。

修复方式：在 `g7Preview()` 调用前检查 `importInfo` 的 `kind` 是否为 "reference"，若是则跳过计算、直接返回 Data Incomplete。或者复用 `curve-engine.js` 中已有的 `metadataLooksReference()` 函数。

#### 3. 导出按钮在数据过期时未禁用（app.js）

用户修改手动表后若未点「应用测量表」，results 仍为旧数据，导出按钮仍是 enabled——导出的是过期结果。修复：在手动表变更事件中清空 results 或标记 dirty。

### P1 — 建议尽快处理

#### 4. app.js 拆分（1103行 → 多模块）

当前一个文件混合了状态管理、视图渲染、事件绑定、业务编排。建议拆分为：

```
src/
  app.js          → 入口+初始化（~50行）
  state.js        → state 对象 + 所有状态变更
  events.js       → attachEvents 集中事件绑定
  views/
    job.js        → renderJob / renderRuns
    standard.js   → renderStandard
    measurement.js
    analyze.js
    curve.js
    g7.js
    export.js
    settings.js
```

每个 views 模块控制在一二百行，export 相同名称的 render 函数。

#### 5. calculate() 重复计算（app.js:379-411）

当 `ratioAuto` 为 true 且首次计算结果的比例与 diagnosis 建议不同时，`calculateCompensation()` 被连续调用两次。建议改为一次计算，在计算前先判断比例。

#### 6. CTV 模式无前置校验（app.js）

`handleModeChange()` 切换到 CTV 时，如果缺少纸白 Lab 或实地 Lab，应弹出提示告知用户将使用 TVI fallback，而非静默降级。

### P2 — 改善体验

#### 7. 图表缺乏交互（chart-renderer.js）

三张 SVG 图表（测量 TVI、补偿曲线、G7 NPDC/灰平衡）完全静态。建议增加：
- hover 时显示 tooltip（通道、输入网点、数值）
- 图例标注各通道颜色

#### 8. 手动表渲染性能（app.js + manual-table.js）

`renderManualTable()` 每次重建整个 `<tbody>` innerHTML。完整阶调（52行）下每次输入都触发。建议：
- `updateManualCell` 做局部 DOM 更新（只更新当前行）
- 或用 `requestAnimationFrame` 合并渲染

#### 9. 曲线锁定/编辑 UI 缺失（app.js + curve-engine.js）

规格文档要求支持"锁定某个点"和"人工调整后保留原始自动值"。当前曲线表是只读的。建议在 Curve 页表格中增加一列锁定复选框，锁定后对应点的 outputTone 不从算法生成。

#### 10. 标准库加载无 loading 指示器（app.js）

`loadStandard()` 中 `fetch()` 没有 loading 状态。建议在加载期间显示加载提示。

### P3 — 后续补充

#### 11. 测试覆盖不足

缺失的关键测试：
- `diagnosePress()` 4 种诊断路径独立测试
- `parseCgatsText()` 真实 CGATS 格式解析
- `smoothChannel()` 极端锯齿数据
- `protectToneEnds()` 边界补偿量
- `enforceMonotonic()` 反折修复
- JSON 项目存档完整 round-trip

当前 17 → 建议 ≥30。

#### 12. 文档补充

缺少 ARCHITECTURE.md 描述数据流。建议新增：

```
手动表 / 文件导入 → parseImportText() → measurements[]
  → calculateCompensation() → results[]
  → diagnosePress() → diagnosis
  → g7Preview() → g7
  → buildLabVerificationRows() → labRows
  → analyzeCurveSafety() → safetyIssues
  → 各 render*() 渲染到对应视图
```

---

# 界面 UI 审查

审查范围：index.html（492行）+ styles.css（688行）+ chart-renderer.js（101行）的 UI 渲染逻辑

## 一、可访问性

### 字号偏小（styles.css）

正文和表格统一 13px，标签 13px。印刷机台操作环境光线复杂、操作员年龄跨度大，13px 在高分屏上约等于 9-10pt，长时间阅读疲劳度高。

建议：基准字号提升到 14px，表格内容 14px，KPI 数值保持 21px 不变。

涉及位置：
- `body` 隐式 13px（未设 font-size，依赖浏览器默认）
- `table` 显式 `font-size: 13px`（:364）
- `.subtle, .chart-title span, .table-title span, #jobMeta` 显式 13px（:93-96）
- `label, .job-grid label, .stack label, .field-label` 显式 13px（:142-157）
- `.summary-box` 显式 13px（:306）
- `.status-pill, .status` 显式 12px（:574）

### 无 focus 样式（styles.css）

CSS 中完全没有 `:focus` 或 `:focus-visible` 规则。键盘 Tab 导航时用户看不到焦点在哪个控件上。

建议新增：
```css
:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
button:focus-visible, select:focus-visible {
  outline-offset: 1px;
}
```

### 状态色仅靠颜色区分（styles.css :577-605）

pass/warning/danger 只用绿/琥珀/红区分，色觉障碍者无法辨识。

建议：状态标签文字加前缀符号 —— ✓ Pass / ⚠ Warning / ✗ Fail。符号与颜色双重编码。

涉及类：`.status.pass` `.status.warning` `.status.fail` `.status-pill.*`

## 二、导航与信息层级

### 导航按钮为英文（index.html :18-26）

8 个导航按钮：Job / Standard / Measurement / Analyze / Curve / G7 / Export / Settings，而界面其他地方全是中文。

建议改为中文或中英双语：
```
工作 / 标准 / 测量 / 分析 / 曲线 / G7 / 导出 / 设置
```

### 平滑滑块无当前值显示（index.html :44）

```html
<input id="smoothInput" type="range" min="0" max="4" step="1" value="2" />
```

只有滑块轨道，没有数值标签。用户不知道当前选的是几。

建议：在滑块右侧加 `<span>` 显示当前值，或改用数字输入 + 步进按钮（0~4 范围很小，数字输入更直观）。

### 主操作按钮与次要按钮区分不足（styles.css :205-225）

主操作（`#calculateButton` 等）用 teal，导出按钮用 blue，仅靠颜色区分。当界面中有多个不同颜色的按钮时，哪个是"最重要操作"不够明确。

建议：主操作按钮加粗且字号稍大（如 14px → 15px），或左侧加 3px 竖线装饰，与 KPI 卡片的设计语言呼应。

## 三、表格

### 空状态行无视觉区分（app.js 多处）

无数据时表格显示单行文字，但用普通 `<tr><td colspan="n">`，与表头之间仅隔一行，不醒目。

涉及位置：`resultBody`（:576）、`ripEntryBody`（:609）、`runBody`（:678）、`labBody`（:570）、`g7NpdcBody`（:646）、`g7GrayBody`（:657）、`targetCurveBody`（无数据显示 "无"）

建议：增加 `.empty-row` 样式——居中、灰色文字 `color: var(--text-muted)`、padding 加大到 24px、可选加虚线边框 `border: 1px dashed var(--line-soft)`。

### 手动表滚动区偏小（styles.css :355-361）

```css
.manual-wrap {
  max-height: 388px;
}
```

完整阶调 52 行下只能同时看到约 12-14 行，频繁滚动手动录入 50+ 个点的密度/Lab 时操作体验差。

建议：改为 `max-height: 60vh`（随窗口自适应），或在标题栏加展开/折叠按钮切换全高模式。

### 手动表缺少左侧列冻结（styles.css + manual-table.js）

手动表 13 列，横向滚动后"类型"和"通道"列会滚出视野，编辑时不知道当前行是哪条通道。

建议：前 2 列加 `position: sticky; left: 0; z-index: 2; background: white;`，同时给表头对应列同步处理。

### 文本列被强制右对齐（styles.css :369-380）

```css
th, td {
  text-align: right;
}
th:first-child, td:first-child {
  text-align: left;
}
```

全部列默认右对齐，仅首列左对齐。但"算法来源"、"来源"、"备注"、"操作"这些文本列右对齐阅读不自然。

建议：给文本类列加 class（如 `.cell-text`）设 `text-align: left`，仅保留数值列右对齐。或在渲染时为文本列加 `style="text-align:left"`。

### 曲线表缺少"锁定"列（app.js + curve-engine.js）

规格文档明确要求支持锁定某个点、人工调整后保留原始自动值。当前 Curve 页面表格是纯展示，无交互列。

建议：在 `resultBody` 渲染中增加一列 `<input type="checkbox">`，勾选后该行 outputTone 冻结不受 calculate 覆盖。锁定状态存入 `state.lockedPoints`。

## 四、图表

### 无图例（chart-renderer.js :47-101）

三张 SVG 图中的 4 条通道曲线用不同颜色区分，但没有图例标注。用户只能靠记颜色常量（C=青、M=品红、Y=黄、K=黑）来辨别。

建议：在图表右上角渲染图例方块 + 通道字母，使用与曲线相同的颜色。

### 无 hover tooltip（chart-renderer.js :68-70）

SVG circle 数据点没有任何 title 或 tooltip。操作员需要精确数值时只能到下方表格查找对应行。

建议：在每个 `<circle>` 上加 `<title>` 子元素，内容为"通道 输入% → 值%"。

### Y 轴标签为英文（chart-renderer.js :78）

三处硬编码英文：
- `"TVI %"` → 建议 `"网点扩大 %"`
- `"Output %"` → 建议 `"输出网点 %"`
- `"a* / b*"` → 可保留（印刷行业通用符号）

### 灰平衡图缺容差参考圆（chart-renderer.js :33-44）

G7 灰平衡 a\*/b\* 散点图只有一条中性灰十字参考线。G7 规范中灰平衡的 pass/fail 阈值是 Ch ≤ 3 和 Ch ≤ 6。

建议：画两个同心虚线参考圆（半径对应 Ch=3 和 Ch=6），圆心在 (0,0)，让操作员一眼判断散点是否在容差内。

### X 轴标签为英文（chart-renderer.js :77）

`"Input tone %"` 与中文界面不一致。建议改为 `"输入网点 %"`。

## 五、交互反馈

### 文件拖拽区无 hover 反馈（styles.css :227-240）

```css
.file-drop { cursor: pointer; }
```

设置了指针样式但没有 `:hover` 规则。用户鼠标移入时视觉无变化，不确定"这里可以点"。

建议：
```css
.file-drop:hover {
  border-color: var(--blue);
  background: #eef2ff;
}
```

### 模式切换静默降级（app.js :413-421）

`handleModeChange()` 从 TVI 切换到 CTV 时，如果缺少 Lab 数据会静默使用 TVI fallback——没有任何即时提示。用户要切到 Curve 页才发现。

建议：在侧边栏计算设置区底部加一行状态文字，实时显示当前模式的计算条件是否满足。缺失时用橙色文字说明。

### "插入模式"按钮表意模糊（index.html :218）

按钮文字"插入模式"——用户可能理解为"切换到某种模式"，实际功能是"按选定模式生成模板行"。

建议：按钮文字改为 `按此模式插入`，并将下拉框和按钮用浅色边框框在一起表示关联。

### 缺少"未应用修改"提醒（app.js）

手动表编辑后如果忘记点"应用测量表"就切到其他页面操作，修改丢失且无提示。

建议：手动表变更后如果未应用，在"应用测量表"按钮上显示橙色圆点 + 计数。切换页面时如果未应用则弹出确认对话框。

### 标准加载无 loading 指示器（app.js :224-245）

`loadStandard()` 中 `fetch()` 没有加载状态。网络慢时用户面对空白面板，不知道是否在加载。

建议：fetch 前在 `standardSummary` 中显示"加载中..."，完成后替换为标准信息。

## 六、响应式布局

### 小屏下侧边栏占用过多空间（styles.css :639-661）

@1180px 断点将侧边栏转为顶部栏，8 个导航按钮变为 4 列 + 计算设置区，合计占用约 300px 垂直高度，主内容区被严重压缩。

建议：小屏下将计算设置区改为可折叠面板（默认收起），用"⚙ 计算设置"按钮展开。

### Settings 页不规则排列（styles.css :621-626）

Settings 4 张卡片用 3 列网格排列，形成 2+1+1 的不规则布局。

建议：Settings 网格改为 2 列：
```css
.settings-grid {
  grid-template-columns: repeat(2, minmax(180px, 1fr));
}
```

### KPI 卡片高度不齐（styles.css :438-483）

4 列 KPI 网格中，不同卡片文字行数不同导致视觉上参差不齐。

建议：`.kpi-card` 加 `min-height: 106px` 保证高度一致，或用 `align-items: stretch` 在 grid 层面强制等高等宽。

---

## UI 问题汇总

| # | 问题 | 位置 | 优先级 |
|---|------|------|--------|
| 1 | 字号偏小（全局 13px） | styles.css | P1 |
| 2 | 无 focus 样式 | styles.css | P1 |
| 3 | 状态色仅靠颜色区分 | styles.css | P1 |
| 4 | 导航按钮为英文 | index.html :18-26 | P1 |
| 5 | 图表无图例 | chart-renderer.js | P1 |
| 6 | 图表无 hover tooltip | chart-renderer.js | P1 |
| 7 | 手动表缺少左列冻结 | styles.css | P1 |
| 8 | 模式切换静默降级 | app.js :413-421 | P1 |
| 9 | 缺少未应用修改提醒 | app.js | P1 |
| 10 | 平滑滑块无当前值 | index.html :44 | P2 |
| 11 | 手动表滚动区偏小 | styles.css :355 | P2 |
| 12 | 空状态行无视觉区分 | app.js 多处 | P2 |
| 13 | 文件拖拽区无 hover | styles.css :227 | P2 |
| 14 | 图表轴标签为英文 | chart-renderer.js | P2 |
| 15 | 灰平衡图缺容差参考圆 | chart-renderer.js | P2 |
| 16 | 文本列被强制右对齐 | styles.css :369 | P2 |
| 17 | 插入模式按钮表意模糊 | index.html :218 | P2 |
| 18 | 标准加载无 loading | app.js :224 | P2 |
| 19 | 主按钮层级区分不足 | styles.css :205 | P3 |
| 20 | 曲线表缺锁定列 | app.js Curve 渲染 | P3 |
| 21 | Settings 页排列不齐 | styles.css :621 | P3 |
| 22 | KPI 卡片高度不齐 | styles.css :438 | P3 |
| 23 | 小屏侧边栏占空间过多 | styles.css :639 | P3 |

---

# 二次审查（2026-05-17）

codex agent 在初版审查和 29 个新测试的基础上完成了以下修改。本节标记已解决项、列出新引入问题、指明仍待处理项。

## 已解决项

| 初版编号 | 内容 | 解决方式 |
|----------|------|----------|
| P0-1 | 诊断引擎缺少规则 | `analysis-engine.js` `diagnosePress()` 新增：全通道严重偏离、单通道严重异常、密度-TVI矛盾 三条规则。新增辅助函数 `densityTviMismatch()` 和 `solidDensityForChannel()` |
| P0-2 | G7 reference 过滤 | `g7Preview()` 签名改为 `options = {}`，新增 `importKind` 和 `metadata` 参数。当 `importKind === "reference"` 或 `metadataLooksReference()` 时返回 `emptyG7Preview()` |
| P0-3 | 导出按钮过期数据 | 新增 `state.manualDirty` 标志。手动表变更时标记 dirty，导出/保存前检查并弹窗阻断。`renderShell()` 中导出按钮改用 `hasFreshResults` |
| P1-5 | calculate() 重复计算 | 新增 `buildDiagnosticRows()`（curve-engine.js）独立产出诊断输入行。`calculate()` 先做诊断、对齐比例、再一次性 compute+override |
| P1-6 | CTV 无前置校验 | 新增 `warnIfCtvWillFallback()`（app.js），切换 CTV 模式时若缺色度数据则 alert 提示 |
| P2-7 | 图表无交互 | `chart-renderer.js` 全面重写：每条曲线/数据点加 `<title>` tooltip、`legendItems()` 渲染图例、锁定点加 `locked` CSS class 区分 |
| P2-9 | 曲线锁定/编辑 | 新文件 `src/curve-overrides.js`：`applyCurveOverrides()` 合并手动锁定值、`pruneCurveOverrides()` 清理过期条目、`curveRowKey()` 生成唯一键。Curve 表格新增锁定复选框 + 手动输出输入框 + 自动输出列 |
| — | 图表轴标签中文化 | Y 轴 "网点扩大 %" / "输出网点 %" / "CTV 偏差 %"，X 轴 "输入网点 %" |
| — | 标准加载指示 | `renderStandard()` 中 `state.standardLoading` 显示 "正在加载标准参考数据..." |
| — | 平滑滑块数值 | HTML 新增 `<span id="smoothValue">`，`renderControlValues()` 实时同步显示 |
| — | UI 标签模块化 | 新文件 `src/ui-labels.js`：`deltaFormulaLabel()`、`algorithmDescription()`、`methodLabel()` 从 app.js 提取 |

## 新引入的问题

### 1. calculate() 调用两次 diagnosePress（app.js:397 + :408）

```js
state.diagnosis = diagnosePress(diagnosticRows);       // L397
// ... calculateCompensation ...
state.diagnosis = diagnosePress(state.results.length    // L408
  ? state.results : diagnosticRows);
```

L397 的结果必然被 L408 覆盖（因为 calculateCompensation 总有输出）。L397 完全冗余。删掉即可。

### 2. densityTviMismatch 硬编码密度范围（analysis-engine.js:413-419）

CMYK 实地密度的"正常范围"写死为铜版纸标准（C/M 1.25-1.65, Y 0.85-1.15, K 1.45-1.9）。对于非铜版纸（如 FOGRA 未涂布纸 Y 可达 1.10）或新闻纸（K 约 1.05），这个范围会系统性地误判。

建议：在 `standards.js` 每个标准条目中增加 `solidDensityRanges` 字段，`densityTviMismatch` 改为接收标准配置参数，按当前选中标准读取对应范围。

### 3. 曲线锁定需要两步操作（curve-overrides.js + app.js:856-867）

用户必须同时勾选锁定框 AND 输入手动值。`pruneCurveOverrides` 只保留 `locked: true` 的条目。如果用户先输入数值再勾锁定、或勾了锁定但没改数值（想保持自动值不变），行为都不直观。

建议：输入框 onchange 时自动勾选同行锁定框；或改为"输入过手动值即视为锁定"，去掉独立的锁定复选框。

### 4. warnIfCtvWillFallback 使用 window.alert（app.js:1041）

阻塞式弹窗打断操作，而 `visibleWarnings()` 已有非阻塞的 CTV 降级提示（app.js:1133-1134）。应删除 alert，复用已有 warning 管道。保留 alert 仅作第一次交互时的强提醒，但需加"不再提示"选项。

### 5. 图表图例 Y 坐标偏上（chart-renderer.js:111）

```js
transform="translate(${pad.left + index * 88} 18)"
```

`pad.top` 已从 24 扩到 42px，但图例位置仍为 y=18（文字在 y=22）。靠近 SVG 上边缘，部分渲染器可能裁切。建议改为 `translate(…, 28)`。

### 6. app.js 行数反增（1103 → ~1170）

新增 `currentG7Preview`、`warnIfCtvWillFallback`、`currentImportAudit`、`updateCurveOverride`、`markManualDirty`、`renderControlValues` 六个函数。初版 P1-4（拆分为 views/ 模块）更紧迫了——目前所有视图渲染仍在一个文件中。

## 仍未处理的 UI 问题

以下 23 项 UI 建议在第一次审查中提出、至今均未修改：

| # | 问题 | 位置 | 优先级 |
|---|------|------|--------|
| 1 | 字号 13px 偏小 | styles.css 全局 | P1 |
| 2 | 无 :focus-visible 样式 | styles.css | P1 |
| 3 | 状态色仅靠颜色（缺符号） | styles.css :577-605 | P1 |
| 4 | 导航按钮为英文 | index.html :18-26 | P1 |
| 5 | 手动表缺左列冻结 | styles.css | P1 |
| 6 | 空状态行无视觉区分 | app.js 多处 | P2 |
| 7 | 手动表滚动区偏小 388px | styles.css :355 | P2 |
| 8 | 文件拖拽区无 hover | styles.css :227 | P2 |
| 9 | 文本列强制右对齐 | styles.css :369 | P2 |
| 10 | 灰平衡图缺容差参考圆 | chart-renderer.js | P2 |
| 11 | "插入模式"按钮表意模糊 | index.html :218 | P2 |
| 12 | 模式切换状态提示弱 | app.js | P2 |
| 13 | 主按钮层级区分不足 | styles.css :205 | P3 |
| 14 | Settings 页 3 列不齐 | styles.css :621 | P3 |
| 15 | KPI 卡片高度不齐 | styles.css :438 | P3 |
| 16 | 小屏侧边栏占空间过多 | styles.css :639 | P3 |
| 17 | 标准库加载无 loading 视觉 | 已修复 ✓ | — |
| 18 | 平滑滑块无当前值 | 已修复 ✓ | — |
| 19 | 图表无图例 | 已修复 ✓ | — |
| 20 | 图表无 tooltip | 已修复 ✓ | — |
| 21 | 图表轴标签英文 | 已修复 ✓ | — |
| 22 | 曲线表缺锁定列 | 已修复 ✓ | — |
| 23 | 缺少未应用修改提醒 | 已修复（manualDirty）✓ | — |

## 修改时请注意

- 所有模块是 ES module（`type: "module"`），import/export 语法
- `curve-engine.js` 是被依赖最多的核心模块，修改时需谨慎
- 测试运行：`node --test tests/*.test.js`
- 验证脚本：`node scripts/validate-importers.mjs`
- 本地运行：`python3 -m http.server 4173` 然后打开 http://localhost:4173
- 不要使用 file:// 协议打开，标准库 fetch 会失败

## 项目关键文件速查

| 文件 | 行数 | 职责 |
|------|------|------|
| src/curve-engine.js | ~1200 | 导入解析、TVI/CTV计算、补偿曲线生成、buildDiagnosticRows、导出格式化 |
| src/app.js | ~1170 | UI状态管理、事件绑定、视图渲染、曲线锁定交互 |
| src/analysis-engine.js | ~510 | 诊断（7条规则）、Delta E公式、G7预检 |
| src/manual-table.js | 344 | 手动测量表CRUD、粘贴解析 |
| src/chart-renderer.js | 158 | SVG图表渲染（含图例、tooltip、锁定标记） |
| src/curve-overrides.js | 48 | 曲线手动锁定/解锁/裁剪（新增文件） |
| src/import-inspector.js | 181 | 导入数据质量检查 |
| src/standards.js | 139 | 标准库定义、色块映射 |
| src/exporter.js | 92 | 导出格式：Prinergy/RIP/JSON/curveOverrides |
| src/ui-labels.js | 36 | deltaFormulaLabel、algorithmDescription、methodLabel（新增文件） |
| src/curve-acceptance.js | 41 | RIP手录验收摘要 |
| src/run-store.js | 43 | localStorage持久化 |
| src/shared.js | 30 | 通用工具函数 |
| src/formatters.js | 9 | 中文操作文本格式化 |
