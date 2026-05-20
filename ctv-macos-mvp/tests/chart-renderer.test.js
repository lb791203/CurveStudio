import assert from "node:assert/strict";
import test from "node:test";

import { renderCurveChart, renderG7Charts, renderMeasurementChart } from "../src/chart-renderer.js";

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
