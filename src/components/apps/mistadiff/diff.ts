import { diffLines } from 'diff';

export type LineKind = 'equal' | 'added' | 'removed';

export type DiffLine = {
  kind: LineKind;
  text: string;
};

export type DiffHunk = DiffLine[];

export function computeDiff(left: string, right: string): DiffHunk {
  const changes = diffLines(left, right);
  const result: DiffLine[] = [];

  for (const change of changes) {
    const kind: LineKind = change.added ? 'added' : change.removed ? 'removed' : 'equal';
    const lines = (change.value ?? '').split('\n');
    // diffLines includes a trailing empty string when the chunk ends with \n
    if (lines.at(-1) === '') lines.pop();
    for (const text of lines) {
      result.push({ kind, text });
    }
  }

  return result;
}
