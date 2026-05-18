export function curveRowKey(row) {
  return `${row.channel}:${Number(row.tone).toFixed(3)}`;
}

export function applyCurveOverrides(rows, overrides = {}) {
  return rows.map((row) => {
    const key = curveRowKey(row);
    const autoOutputTone = Number.isFinite(row.autoOutputTone) ? row.autoOutputTone : row.outputTone;
    const override = overrides[key];
    if (!override?.locked || !Number.isFinite(Number(override.outputTone))) {
      return {
        ...row,
        autoOutputTone,
        outputTone: autoOutputTone,
        productionOutputTone: autoOutputTone,
        correction: autoOutputTone - row.tone,
        overrideLocked: false,
      };
    }

    const outputTone = clamp(Number(override.outputTone), 0, 100);
    return {
      ...row,
      autoOutputTone,
      outputTone,
      productionOutputTone: outputTone,
      correction: outputTone - row.tone,
      overrideLocked: true,
    };
  });
}

export function pruneCurveOverrides(rows, overrides = {}) {
  const validKeys = new Set(rows.map(curveRowKey));
  return Object.fromEntries(
    Object.entries(overrides)
      .filter(([key, override]) => validKeys.has(key) && override?.locked && Number.isFinite(Number(override.outputTone)))
      .map(([key, override]) => [key, {
        locked: true,
        outputTone: clamp(Number(override.outputTone), 0, 100),
      }])
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
