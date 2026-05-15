import { performance } from "node:perf_hooks";

const FILE_COUNT = 10_000;
const MAX_FILTER_MS = 16;

const records = Array.from({ length: FILE_COUNT }, (_, index) => {
  const file = {
    id: `file-${index}`,
    path: `src/${String(index).padStart(5, "0")}/component-${index}.tsx`,
    oldPath: index % 9 === 0 ? `old/${index}.tsx` : null,
    reviewReason: index % 4 === 0 ? "component render state review reason" : null,
    viewedStatus: index % 3 === 0 ? "viewed" : "unseen",
  };

  return {
    file,
    index: index + 1,
    searchText: [file.path, file.oldPath, file.reviewReason]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
});

const workspaceState = Object.fromEntries(
  records.map((record, index) => [
    record.file.id,
    {
      status: index % 5 === 0 ? "reviewed" : record.file.viewedStatus,
    },
  ]),
);

const startedAt = performance.now();
const visible = filterQueueRecords(records, workspaceState, "src", "all");
const indexes = visible.map((record) => record.index);
const elapsedMs = performance.now() - startedAt;
const lastIndex = indexes.at(-1);

console.log(
  `review rail filter: ${elapsedMs.toFixed(2)}ms for ${FILE_COUNT} files (${visible.length} visible)`,
);

if (lastIndex !== FILE_COUNT) {
  console.error(`Expected last visible index ${FILE_COUNT}, received ${lastIndex}.`);
  process.exit(1);
}

if (elapsedMs > MAX_FILTER_MS) {
  console.error(
    `Expected filter to stay under ${MAX_FILTER_MS}ms before DOM rendering.`,
  );
  process.exit(1);
}

function filterQueueRecords(recordsToFilter, state, query, statusFilter) {
  const needle = query.trim().toLowerCase();
  return recordsToFilter.filter((record) => {
    const file = record.file;
    const status = state[file.id]?.status ?? file.viewedStatus;
    const matchesQuery = !needle || record.searchText.includes(needle);
    return matchesQuery && matchesStatus(status, statusFilter);
  });
}

function matchesStatus(status, filter) {
  const stale = status === "changedSinceReviewed" || status === "changedSinceViewed";
  if (filter === "all") {
    return true;
  }
  if (filter === "stale") {
    return stale;
  }
  if (stale) {
    return false;
  }
  return status === filter;
}
