// How many open tasks use each label, for the Labels page (checkpoint 9,
// decision 025). Open means not completed and not deleted. Pure, no runtime
// imports; see labelUsage.test.ts.
export function openTaskCounts(
  tasks: { projectKey?: string; completed?: boolean; deletedAt?: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (t.deletedAt || t.completed || !t.projectKey) continue;
    counts.set(t.projectKey, (counts.get(t.projectKey) ?? 0) + 1);
  }
  return counts;
}

export function openCountText(n: number): string {
  return n === 0 ? 'No open tasks' : n === 1 ? '1 open task' : `${n} open tasks`;
}
