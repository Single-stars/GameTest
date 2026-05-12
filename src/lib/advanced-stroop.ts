type RandomSource = () => number;

type BuildAdvancedStroopMismatchIndexesInput = {
  itemCount: number;
  random?: RandomSource;
  roundIndex: number;
  variant: string;
};

export function buildAdvancedStroopMismatchIndexes({
  itemCount,
  random = Math.random,
  roundIndex,
  variant,
}: BuildAdvancedStroopMismatchIndexesInput): number[] {
  const normalizedItemCount = Math.max(0, Math.floor(itemCount));
  if (normalizedItemCount <= 0) return [];

  const countMode = variant === "stroop-moving-count" || variant === "stroop-boss";
  const mismatchCount = countMode ? ((roundIndex + Math.floor(random() * normalizedItemCount)) % normalizedItemCount) + 1 : 1;
  const indexes = Array.from({ length: normalizedItemCount }, (_, index) => index);

  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }

  return indexes.slice(0, mismatchCount).sort((left, right) => left - right);
}
