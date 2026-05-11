/** Build a CSS clip-path with a zigzag tooth pattern at the bottom edge. */
export function buildZigzagClipPath(teeth = 30, toothHeight = 6): string {
  const baseY = `calc(100% - ${toothHeight}px)`;
  const peakY = "100%";
  const points: string[] = ["0 0", "100% 0", `100% ${baseY}`];
  // Walk right → left along the bottom, alternating peak / valley.
  const totalSegments = teeth * 2;
  for (let i = 1; i < totalSegments; i++) {
    const xPct = (1 - i / totalSegments) * 100;
    const isPeak = i % 2 === 1;
    points.push(`${xPct.toFixed(2)}% ${isPeak ? peakY : baseY}`);
  }
  points.push(`0 ${baseY}`);
  return `polygon(${points.join(", ")})`;
}
