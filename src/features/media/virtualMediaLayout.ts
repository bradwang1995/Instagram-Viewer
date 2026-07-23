export type VirtualMediaLayout = {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type GridMetrics = {
  columns: number;
  itemWidth: number;
  itemHeight: number;
  columnGap: number;
  rowGap: number;
  paddingX: number;
  paddingY: number;
  rowStride: number;
  totalHeight: number;
};

export type RibbonMetrics = {
  layouts: VirtualMediaLayout[];
  totalWidth: number;
};

const GRID_RENDERED_ROWS = 3;
const RIBBON_OVERSCAN_ITEMS = 3;

export function getGridMetrics(
  itemCount: number,
  viewportWidth: number,
  viewportHeight: number,
): GridMetrics {
  const safeWidth = Math.max(320, viewportWidth);
  const safeHeight = Math.max(320, viewportHeight);
  const columns = safeWidth <= 640 ? 1 : safeWidth <= 1100 ? 2 : 4;
  const paddingX = columns === 1 ? 14 : clamp(safeWidth * 0.03, 24, 64);
  const paddingY = columns === 1 ? 12 : 14;
  const columnGap = columns === 1 ? 0 : clamp(safeWidth * 0.018, 18, 36);
  const rowGap = columns === 1 ? 14 : clamp(safeHeight * 0.025, 18, 26);
  const itemWidth =
    (safeWidth - paddingX * 2 - columnGap * (columns - 1)) / columns;
  // A square card matches the unresolved Instagram preview surface and avoids
  // stretching each Grid row to nearly a full viewport. Three rendered rows
  // keep visible content plus a bounded ahead-of-scroll preload window.
  const itemHeight = itemWidth;
  const rowStride = itemHeight + rowGap;
  const rowCount = Math.ceil(itemCount / columns);
  const totalHeight = rowCount
    ? paddingY * 2 + rowCount * itemHeight + (rowCount - 1) * rowGap
    : safeHeight;

  return {
    columns,
    itemWidth,
    itemHeight,
    columnGap,
    rowGap,
    paddingX,
    paddingY,
    rowStride,
    totalHeight,
  };
}

export function getGridWindow(
  itemCount: number,
  scrollTop: number,
  metrics: GridMetrics,
): VirtualMediaLayout[] {
  if (itemCount === 0) return [];

  const rowCount = Math.ceil(itemCount / metrics.columns);
  const firstRow = clamp(
    Math.floor(Math.max(0, scrollTop - metrics.paddingY) / metrics.rowStride),
    0,
    Math.max(0, rowCount - 1),
  );
  const lastRow = Math.min(rowCount, firstRow + GRID_RENDERED_ROWS);
  const layouts: VirtualMediaLayout[] = [];

  for (let row = firstRow; row < lastRow; row += 1) {
    for (let column = 0; column < metrics.columns; column += 1) {
      const index = row * metrics.columns + column;
      if (index >= itemCount) break;
      layouts.push({
        index,
        left:
          metrics.paddingX + column * (metrics.itemWidth + metrics.columnGap),
        top: metrics.paddingY + row * metrics.rowStride,
        width: metrics.itemWidth,
        height: metrics.itemHeight,
      });
    }
  }

  return layouts;
}

export function getRibbonMetrics(
  aspects: number[],
  viewportWidth: number,
  viewportHeight: number,
): RibbonMetrics {
  const safeWidth = Math.max(320, viewportWidth);
  const safeHeight = Math.max(320, viewportHeight);
  const mediaHeight = clamp(safeHeight * 0.98, 300, 1040);
  const gap = clamp(safeWidth * 0.022, 18, 44);
  const widths = aspects.map((aspect) =>
    clamp(clamp(aspect, 0.62, 1.65) * mediaHeight, 240, safeWidth * 0.82),
  );
  const firstWidth = widths[0] ?? safeWidth * 0.62;
  let cursor = Math.max(24, (safeWidth - firstWidth) / 2);
  const layouts = widths.map((width, index) => {
    const layout: VirtualMediaLayout = {
      index,
      left: cursor,
      top: Math.max(4, (safeHeight - mediaHeight) / 2),
      width,
      height: mediaHeight,
    };
    cursor += width + gap;
    return layout;
  });
  const lastWidth = widths[widths.length - 1] ?? firstWidth;
  const trailing = Math.max(24, (safeWidth - lastWidth) / 2);
  const totalWidth = layouts.length ? cursor - gap + trailing : safeWidth;

  return { layouts, totalWidth };
}

export function getRibbonWindow(
  layouts: VirtualMediaLayout[],
  scrollLeft: number,
  viewportWidth: number,
): VirtualMediaLayout[] {
  if (layouts.length === 0) return [];

  const viewportStart = Math.max(0, scrollLeft);
  const viewportEnd = viewportStart + Math.max(320, viewportWidth);
  const firstVisible = findFirstLayoutEndingAfter(layouts, viewportStart);
  const lastVisible = findLastLayoutStartingBefore(layouts, viewportEnd);
  const start = Math.max(0, firstVisible - RIBBON_OVERSCAN_ITEMS);
  const end = Math.min(
    layouts.length,
    Math.max(firstVisible, lastVisible) + RIBBON_OVERSCAN_ITEMS + 1,
  );

  return layouts.slice(start, end);
}

export function getClosestRibbonIndex(
  layouts: VirtualMediaLayout[],
  viewportCenter: number,
): number {
  if (layouts.length === 0) return 0;

  let low = 0;
  let high = layouts.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const center = layouts[middle].left + layouts[middle].width / 2;
    if (center < viewportCenter) low = middle + 1;
    else high = middle;
  }

  const current = layouts[low];
  const previous = layouts[Math.max(0, low - 1)];
  return Math.abs(previous.left + previous.width / 2 - viewportCenter) <=
    Math.abs(current.left + current.width / 2 - viewportCenter)
    ? previous.index
    : current.index;
}

function findFirstLayoutEndingAfter(
  layouts: VirtualMediaLayout[],
  position: number,
): number {
  let low = 0;
  let high = layouts.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const layout = layouts[middle];
    if (layout.left + layout.width < position) low = middle + 1;
    else high = middle;
  }
  return low;
}

function findLastLayoutStartingBefore(
  layouts: VirtualMediaLayout[],
  position: number,
): number {
  let low = 0;
  let high = layouts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (layouts[middle].left > position) high = middle - 1;
    else low = middle;
  }
  return low;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
