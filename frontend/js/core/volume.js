/**
 * Volume do mixer (%) → ganho linear. Curva perceptiva (quadrática): os passos do slider
 * soam parecidos em toda a faixa, e reforçar acima de 100% é audível de verdade.
 *   0% → 0 (mudo) · 50% → 0,25 (≈ −12 dB) · 100% → 1 · 150% → 2,25 (≈ +7 dB) · 200% → 4 (≈ +12 dB)
 */
export function volumeToGain(percent) {
  const ratio = Math.max(0, Number(percent) || 0) / 100;
  return ratio * ratio;
}
