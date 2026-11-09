/** Display change from a historical presidential count; raw ratios stay unchanged. */
export function presidentialVoteDeviation(ratioPercent) {
  return Number.isFinite(ratioPercent) && ratioPercent >= 0 ? ratioPercent - 100 : null;
}

export function formatVoteDeviation(value) {
  if (!Number.isFinite(value)) return '';
  const magnitude = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (magnitude === '0.0' ? '' : value < 0 ? '−' : '+') + magnitude + '%';
}

/** The same below/equal/above colors apply to either selected party. */
export function deviationFill(value) {
  if (!Number.isFinite(value)) return null;
  const neutral = [245, 243, 240], end = value < 0 ? [188, 126, 65] : [111, 76, 154];
  const fraction = Math.min(1, Math.abs(value) / 100);
  return 'rgb(' + end.map((channel, index) => Math.round(neutral[index] + (channel - neutral[index]) * fraction)).join(',') + ')';
}
