/**
 * Computes the orthogonal vector projection of vector `a` onto vector `b`:
 *   proj_b(a) = ((a · b) / (b · b)) * b
 *
 * Uses infinity-norm scaling of both `a` and `b` combined with Neumaier
 * compensated summation to prevent overflow/underflow and reduce rounding
 * error across extreme magnitudes and long series.
 *
 * @param {Float64Array} a - Input vector to project.
 * @param {Float64Array} b - Non-zero target vector onto which `a` is projected.
 * @returns {Float64Array} A new Float64Array containing `proj_b(a)`.
 * @throws {TypeError} If either `a` or `b` is not a Float64Array.
 * @throws {RangeError} If lengths differ, inputs are empty, any element is non-finite, or `b` is the zero vector.
 */
export function projectionTypedSeries(a, b) {
  if (!(a instanceof Float64Array)) {
    throw new TypeError('Expected first argument "a" to be a Float64Array');
  }
  if (!(b instanceof Float64Array)) {
    throw new TypeError('Expected second argument "b" to be a Float64Array');
  }

  const n = a.length;
  if (n !== b.length) {
    throw new RangeError(`Vector length mismatch: a has length ${n}, b has length ${b.length}`);
  }
  if (n === 0) {
    throw new RangeError('Input vectors must be non-empty');
  }

  let maxA = 0;
  let maxB = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[i];
    const bi = b[i];
    if (!Number.isFinite(ai) || !Number.isFinite(bi)) {
      throw new RangeError('Input vectors must contain only finite numbers');
    }
    const absA = Math.abs(ai);
    const absB = Math.abs(bi);
    if (absA > maxA) maxA = absA;
    if (absB > maxB) maxB = absB;
  }

  if (maxB === 0) {
    throw new RangeError('Target vector "b" must be non-zero');
  }

  const out = new Float64Array(n);
  if (maxA === 0) {
    return out;
  }

  // Scaled closed-form identity:
  // With v = a / maxA and u = b / maxB,
  //   ((a · b) / (b · b)) * b = maxA * ((v · u) / (u · u)) * u
  // where maxB cancels analytically and all intermediate products stay in [-1, 1].
  let dotVU = 0;
  let compVU = 0;
  let dotUU = 0;
  let compUU = 0;

  for (let i = 0; i < n; i++) {
    const vi = a[i] / maxA;
    const ui = b[i] / maxB;

    const pvu = vi * ui;
    const tvu = dotVU + pvu;
    compVU += Math.abs(dotVU) >= Math.abs(pvu)
      ? (dotVU - tvu) + pvu
      : (pvu - tvu) + dotVU;
    dotVU = tvu;

    const puu = ui * ui;
    const tuu = dotUU + puu;
    compUU += Math.abs(dotUU) >= Math.abs(puu)
      ? (dotUU - tuu) + puu
      : (puu - tuu) + dotUU;
    dotUU = tuu;
  }

  const coeff = (dotVU + compVU) / (dotUU + compUU);

  for (let i = 0; i < n; i++) {
    const val = maxA * (coeff * (b[i] / maxB));
    out[i] = val === 0 ? 0 : val;
  }

  return out;
}
