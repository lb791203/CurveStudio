import assert from "node:assert/strict";
import test from "node:test";

import { renderCompensationSimulationChart, renderCurveChart, renderG7Charts, renderLabChromaticityChart, renderMeasurementChart } from "../src/chart-renderer.js";

test("renderCurveChart includes legend, point tooltip, and locked point marker", () => {
  const svg = { innerHTML: "" };

  renderCurveChart(svg, [{
    channel: "C",
    tone: 50,
    outputTone: 43.5,
    overrideLocked: true,
  }]);

  assert.match(svg.innerHTML, /chart-legend/);
  assert.match(svg.innerHTML, /C 50% -&gt; 43\.5% \(locked\)/);
  assert.match(svg.innerHTML, /理论输出/);
  assert.match(svg.innerHTML, /chart-dot locked/);
});

test("renderCurveChart marks risky points and explains quality warnings", () => {
  const svg = { innerHTML: "" };

  renderCurveChart(svg, [{
    channel: "K",
    tone: 70,
    outputTone: 62.4,
    measuredTone: 86.2,
    targetTone: 83,
    theoreticalOutputTone: 66.8,
    productionOutputTone: 68.5,
  }], [{
    level: "warning",
    channel: "K",
    tone: 70,
    type: "折点突变",
    message: "K 70% 前后斜率差过大。",
  }]);

  assert.match(svg.innerHTML, /chart-dot warning/);
  assert.match(svg.innerHTML, /曲线检查: 折点突变/);
});

test("renderMeasurementChart includes target and measured point titles", () => {
  const svg = { innerHTML: "" };

  renderMeasurementChart(svg, [{
    channel: "K",
    tone: 50,
    measuredTvi: 18,
    targetTvi: 14,
  }], [{ tone: 50, value: 14 }], "tvi");

  assert.match(svg.innerHTML, /目标 TVI 50%: 14%/);
  assert.match(svg.innerHTML, /K 50% TVI: [+]18\.0%, target 14%/);
});

test("renderMeasurementChart scales CTV deviations tightly around tolerance", () => {
  const svg = { innerHTML: "" };

  renderMeasurementChart(svg, [
    { channel: "C", tone: 50, measuredTvi: 8.8, targetTvi: 0 },
    { channel: "M", tone: 50, measuredTvi: -2.1, targetTvi: 0 },
  ], [{ tone: 0, value: 0 }, { tone: 50, value: 0 }, { tone: 100, value: 0 }], "ctv");

  assert.match(svg.innerHTML, /CTV 偏差 %/);
  assert.match(svg.innerHTML, /目标偏差 50%: 0%/);
  assert.doesNotMatch(svg.innerHTML, />35</);
});

test("renderCompensationSimulationChart shows dot gain instead of printed tone", () => {
  const svg = { innerHTML: "" };

  renderCompensationSimulationChart(svg, [{
    channel: "K",
    tone: 50,
    measuredTone: 66,
    targetTone: 64,
    simulatedTone: 64.5,
    afterDelta: 0.5,
    status: "Pass",
  }]);

  assert.match(svg.innerHTML, /网点扩大 %/);
  assert.match(svg.innerHTML, /目标容差/);
  assert.match(svg.innerHTML, /目标网点扩大/);
  assert.match(svg.innerHTML, /stroke-dasharray="6 5"/);
  assert.match(svg.innerHTML, /当前网点扩大/);
  assert.match(svg.innerHTML, /补偿后网点扩大/);
  assert.match(svg.innerHTML, />0</);
  assert.doesNotMatch(svg.innerHTML, />-5</);
  assert.doesNotMatch(svg.innerHTML, /印出网点/);
});

test("renderCompensationSimulationChart overlays current dot gain for all channels", () => {
  const svg = { innerHTML: "" };

  renderCompensationSimulationChart(svg, [
    { channel: "C", tone: 50, measuredTone: 70, targetTone: 66, simulatedTone: 67, afterDelta: 1, status: "Pass" },
    { channel: "M", tone: 50, measuredTone: 64, targetTone: 66, simulatedTone: 65.5, afterDelta: -0.5, status: "Pass" },
  ]);

  assert.match(svg.innerHTML, /当前 C/);
  assert.match(svg.innerHTML, /当前 M/);
  assert.match(svg.innerHTML, /stroke-dasharray="3 5"/);
  assert.match(svg.innerHTML, /目标容差/);
});

test("renderLabChromaticityChart uses reference-style target sample vectors", () => {
  const svg = { innerHTML: "" };

  renderLabChromaticityChart(svg, [{
    label: "M 50%",
    lab: { a: 46, b: -7 },
    referenceLab: { a: 44, b: -5 },
    deltaE: 2.8,
    status: "Pass",
  }]);

  assert.match(svg.innerHTML, /labVectorArrow/);
  assert.match(svg.innerHTML, /class="lab-vector"/);
  assert.match(svg.innerHTML, />目标</);
  assert.match(svg.innerHTML, />实测</);
  assert.match(svg.innerHTML, />偏移</);
  assert.doesNotMatch(svg.innerHTML, />Target</);
  assert.doesNotMatch(svg.innerHTML, />Sample</);
});

test("renderLabChromaticityChart does not draw a false gamut triangle from incomplete colors", () => {
  const svg = { innerHTML: "" };
  const rows = [
    ["C 50%", { c: 50, m: 0, y: 0, k: 0 }, { a: -22, b: -30 }, { a: -21, b: -29 }],
    ["C", { c: 100, m: 0, y: 0, k: 0 }, { a: -36, b: -48 }, { a: -34, b: -47 }],
    ["M 50%", { c: 0, m: 50, y: 0, k: 0 }, { a: 42, b: -4 }, { a: 40, b: -3 }],
    ["M", { c: 0, m: 100, y: 0, k: 0 }, { a: 72, b: -2 }, { a: 70, b: -1 }],
    ["Y 50%", { c: 0, m: 0, y: 50, k: 0 }, { a: -4, b: 46 }, { a: -5, b: 44 }],
    ["Y", { c: 0, m: 0, y: 100, k: 0 }, { a: -5, b: 88 }, { a: -6, b: 86 }],
  ].map(([label, cmyk, lab, referenceLab]) => ({ label, cmyk, lab, referenceLab, deltaE: 2, status: "Pass" }));

  renderLabChromaticityChart(svg, rows);

  assert.doesNotMatch(svg.innerHTML, /lab-gamut/);
  assert.match(svg.innerHTML, /lab-tone-path/);
});

test("renderG7Charts labels positive and negative gray tolerances distinctly", () => {
  const npdcChart = { innerHTML: "" };
  const grayChart = { innerHTML: "" };

  renderG7Charts({ npdcChart, grayChart }, { npdcRows: [], grayBalanceRows: [] }, []);

  assert.match(grayChart.innerHTML, />[+]Ch 3</);
  assert.match(grayChart.innerHTML, />-Ch 3</);
  assert.match(grayChart.innerHTML, />[+]Ch 6</);
  assert.match(grayChart.innerHTML, />-Ch 6</);
  assert.match(grayChart.innerHTML, /stroke-dasharray="3 5"/);
});

test("renderG7Charts uses report-style G7 scales", () => {
  const npdcChart = { innerHTML: "" };
  const grayChart = { innerHTML: "" };
  const cmyNpdcChart = { innerHTML: "" };
  const weightedChart = { innerHTML: "" };

  renderG7Charts({
    npdcChart,
    grayChart,
    cmyNpdcChart,
    weightedChart,
  }, {
    npdcVerification: [
      { tone: 50, measuredNpdc: 0.72, targetNpdc: 0.62, deltaL: -1.2, signedWeightedDeltaL: -1.2 },
    ],
    grayVerification: [
      { tone: 50, measuredNpdc: 0.68, targetNpdc: 0.62, a: 2.5, b: -3.5, deltaA: 1.5, deltaB: -2.5, chroma: 2.9, signedWeightedDeltaL: 0.8 },
    ],
  }, []);

  assert.match(npdcChart.innerHTML, />0\.4</);
  assert.match(npdcChart.innerHTML, />1\.6</);
  assert.match(grayChart.innerHTML, /Δa\* \/ Δb\*/);
  assert.match(grayChart.innerHTML, />-3</);
  assert.match(grayChart.innerHTML, />3</);
  assert.match(weightedChart.innerHTML, />-6</);
  assert.match(weightedChart.innerHTML, />6</);
});
