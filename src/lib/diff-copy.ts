export type DiffCopyCell = {
  text: string;
  side?: string | null;
  layout?: string | null;
};

export type DiffCopyBoundary = {
  startSide?: string | null;
  endSide?: string | null;
  startLayout?: string | null;
  endLayout?: string | null;
};

export function copyTextFromSelectedDiffCells(
  cells: DiffCopyCell[],
  boundary: DiffCopyBoundary,
): string | null {
  const constrainedSide = selectedSplitSide(boundary);
  const lines = cells
    .filter((cell) => {
      if (!constrainedSide) {
        return true;
      }
      return cell.layout !== "split" || cell.side === constrainedSide;
    })
    .map((cell) => cell.text);

  if (lines.length === 0) {
    return null;
  }

  return lines.join("\n");
}

function selectedSplitSide(boundary: DiffCopyBoundary): string | null {
  if (
    boundary.startLayout !== "split" ||
    boundary.endLayout !== "split" ||
    !boundary.startSide ||
    boundary.startSide !== boundary.endSide
  ) {
    return null;
  }

  return boundary.startSide;
}
