export function patchName(row) {
  return row?.sample_name || row?.sampleid || row?.sample_id || row?.patch_name || row?.id || row?.name || "";
}

export function patchCoordinate(name) {
  const match = String(name || "").trim().match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  const row = match[1].toUpperCase();
  const column = Number(match[2]);
  if (!Number.isFinite(column) || column < 1) return null;
  return { row, rowIndex: letterIndex(row), column };
}

export function letterIndex(value) {
  return [...String(value || "").toUpperCase()].reduce((acc, char) =>
    acc * 26 + char.charCodeAt(0) - 64, 0);
}

export function buildPatchLayout(patches) {
  const profile = detectPatchLayoutProfile(patches);
  if (profile.coordinate) return buildCoordinateLayout(patches, profile);
  return buildFileOrderLayout(patches, profile);
}

function detectPatchLayoutProfile(patches) {
  const count = patches.length;
  const coordinates = patches
    .map((patch, index) => ({ index, coordinate: patchCoordinate(patchName(patch.row)) }))
    .filter((item) => item.coordinate);
  const uniqueCoordinateCount = new Set(coordinates.map((item) =>
    `${item.coordinate.row}:${item.coordinate.column}`)).size;
  const duplicateCoordinates = coordinates.length - uniqueCoordinateCount;
  const rowNames = [...new Set(coordinates.map((item) => item.coordinate.row))]
    .sort((a, b) => letterIndex(a) - letterIndex(b));
  const maxColumn = coordinates.length ? Math.max(...coordinates.map((item) => item.coordinate.column)) : 0;

  if (count === 300 && coordinates.length === 300 && rowNames.length === 25 && maxColumn === 12) {
    return {
      id: "p2p51",
      name: "P2P51",
      coordinate: true,
      columns: 12,
      rows: 25,
      cellSize: 18,
      note: "按 P2P51 SAMPLE_NAME A1-Y12 坐标排列。",
    };
  }

  if (count === 1617 && coordinates.length >= 1200 && duplicateCoordinates === 0 && rowNames.length >= 24 && maxColumn >= 45) {
    return {
      id: "tc1617",
      name: "TC1617 / IT8.7-4",
      coordinate: true,
      columns: maxColumn,
      rows: rowNames.length,
      cellSize: 10,
      note: `按 ${rowNames[0]}1-${rowNames.at(-1)}${maxColumn} 坐标区排列，非坐标色块追加在后。`,
    };
  }

  if (count === 1485) {
    return {
      id: "fogra39",
      name: "FOGRA39 / IT8.7-4",
      coordinate: false,
      columns: 45,
      rows: 33,
      cellSize: 10,
      note: "未发现稳定坐标名，按 45 x 33 文件顺序显示。",
    };
  }

  if (count === 1617) {
    return {
      id: "it874",
      name: "TC1617 / IT8.7-4",
      coordinate: false,
      columns: 49,
      rows: 33,
      cellSize: 10,
      note: duplicateCoordinates > 0
        ? "检测到重复坐标名，按 49 x 33 文件顺序显示，避免误合并色块。"
        : "未发现完整坐标区，按 49 x 33 文件顺序显示。",
    };
  }

  const coordinateRatio = count ? coordinates.length / count : 0;
  if (count >= 25 && coordinateRatio >= 0.8 && duplicateCoordinates === 0 && maxColumn > 0) {
    return {
      id: "coordinate",
      name: "坐标色块表",
      coordinate: true,
      columns: maxColumn,
      rows: rowNames.length,
      cellSize: cellSizeFor(count, maxColumn),
      note: `按 SAMPLE_NAME ${rowNames[0]}1-${rowNames.at(-1)}${maxColumn} 坐标排列。`,
    };
  }

  const columns = defaultColumns(count);
  return {
    id: "file-order",
    name: "未知色块表",
    coordinate: false,
    columns,
    rows: Math.ceil(count / columns),
    cellSize: cellSizeFor(count, columns),
    note: "未知导表类型，按文件顺序显示。",
  };
}

function buildCoordinateLayout(patches, profile) {
  const coordinates = patches
    .map((patch, index) => ({ patch, index, coordinate: patchCoordinate(patchName(patch.row)) }))
    .filter((item) => item.coordinate);
  const rowNames = [...new Set(coordinates.map((item) => item.coordinate.row))]
    .sort((a, b) => letterIndex(a) - letterIndex(b));
  const rowIndexMap = new Map(rowNames.map((row, index) => [row, index]));
  const gridCellCount = rowNames.length * profile.columns;
  const cells = Array.from({ length: gridCellCount }, () => null);
  const placedIndexes = new Set();

  for (const item of coordinates) {
    const rowIndex = rowIndexMap.get(item.coordinate.row);
    const columnIndex = item.coordinate.column - 1;
    if (rowIndex === undefined || columnIndex < 0 || columnIndex >= profile.columns) continue;
    const cellIndex = rowIndex * profile.columns + columnIndex;
    if (cells[cellIndex]) continue;
    cells[cellIndex] = { patch: item.patch, index: item.index, section: "coordinate" };
    placedIndexes.add(item.index);
  }

  const tail = patches
    .map((patch, index) => ({ patch, index }))
    .filter((item) => !placedIndexes.has(item.index))
    .map((item) => ({ ...item, section: "extra" }));

  return {
    mode: "target-coordinate",
    profileId: profile.id,
    name: profile.name,
    columns: profile.columns,
    rows: Math.ceil((cells.length + tail.length) / profile.columns),
    cellSize: profile.cellSize,
    cells: [...cells, ...tail],
    caption: `${patches.length} 个色块 / ${profile.columns} 列 x ${profile.rows} 行${tail.length ? ` + ${tail.length} 个追加色块` : ""}`,
    note: profile.note,
  };
}

function buildFileOrderLayout(patches, profile) {
  return {
    mode: "file-order",
    profileId: profile.id,
    name: profile.name,
    columns: profile.columns,
    rows: Math.ceil(patches.length / profile.columns),
    cellSize: profile.cellSize,
    cells: patches.map((patch, index) => ({ patch, index, section: "file" })),
    caption: `${patches.length} 个色块 / ${profile.columns} 列 x ${Math.ceil(patches.length / profile.columns)} 行`,
    note: profile.note,
  };
}

function defaultColumns(count) {
  if (count >= 200) return 25;
  if (count >= 80) return 14;
  return Math.max(6, Math.min(12, Math.ceil(Math.sqrt(count || 1))));
}

function cellSizeFor(count, columns) {
  if (count === 300 && columns === 12) return 18;
  if (count === 300) return 16;
  if (columns >= 45) return 10;
  if (columns >= 25) return 12;
  if (columns >= 14) return 16;
  return 24;
}
