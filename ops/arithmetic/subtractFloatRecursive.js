/**
 * Error-free transformation (Knuth's TwoSum): computes `[s, e]` such that
 * `s = fl(a + b)` and `a + b === s + e` exactly in real arithmetic
 * (assuming `s` is finite).
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
  const s = a + b;
  if (!Number.isFinite(s)) {
    return [s, 0];
  }
  const v = s - a;
  const e = (a - (s - v)) + (b - v);
  return [s, Number.isFinite(e) ? e : 0];
}

/**
 * Error-free transformation (Knuth's TwoDiff): computes `[s, e]` such that
 * `s = fl(a - b)` and `a - b === s + e` exactly in real arithmetic
 * (assuming `s` is finite).
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoDiff(a, b) {
  const s = a - b;
  if (!Number.isFinite(s)) {
    return [s, 0];
  }
  const v = s - a;
  const e = (a - (s - v)) - (b + v);
  return [s, Number.isFinite(e) ? e : 0];
}

/**
 * Validates that a value is a finite IEEE-754 float64 number.
 *
 * @param {unknown} value
 * @param {string} label
 * @throws {TypeError} If `value` is not of type `number`.
 * @throws {RangeError} If `value` is `NaN`, `Infinity`, or `-Infinity`.
 */
function assertFiniteNumber(value, label) {
  if (typeof value !== 'number') {
    throw new TypeError(`${label} must be a number, received ${value === null ? 'null' : typeof value}`);
  }
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, received ${value}`);
  }
}

/**
 * Computes a compensated pairwise recursive (divide-and-conquer) sum over
 * `values[start..end-1]`, optionally multiplying each leaf by an exact power-of-2
 * `scale` factor. Returns a `[sum, error]` pair representing `sum + error`.
 *
 * Recursion depth is `O(log n)` and rounding error is compensated via TwoSum
 * at each divide-and-conquer merge step.
 *
 * @param {readonly number[]} values
 * @param {number} start
 * @param {number} end
 * @param {number} [scale=1]
 * @returns {[number, number]}
 */
function pairwiseRecursiveSum(values, start, end, scale = 1) {
  const length = end - start;
  if (length === 0) {
    return [0, 0];
  }
  if (length === 1) {
    return [values[start] * scale, 0];
  }
  if (length === 2) {
    return twoSum(values[start] * scale, values[start + 1] * scale);
  }

  const mid = start + (length >>> 1);
  const [leftSum, leftErr] = pairwiseRecursiveSum(values, start, mid, scale);
  const [rightSum, rightErr] = pairwiseRecursiveSum(values, mid, end, scale);

  const [sum, sumErr] = twoSum(leftSum, rightSum);
  if (!Number.isFinite(sum)) {
    return [sum, 0];
  }

  const [errSum, errResidual] = twoSum(leftErr, rightErr);
  const totalErr = sumErr + errSum + errResidual;
  if (totalErr === 0) {
    return [sum, 0];
  }

  return twoSum(sum, totalErr);
}

/**
 * Subtracts one or more IEEE-754 float64 numbers from `minuend` using a
 * recursive divide-and-conquer algorithm with error-free transformations
 * (Knuth's TwoSum and TwoDiff).
 *
 * Supports:
 * - Single argument: `subtractFloatRecursive(a)` returns `a`
 * - Binary subtraction: `subtractFloatRecursive(a, b)` returns `a - b`
 * - Variadic subtraction: `subtractFloatRecursive(a, b, c, ...)` computes `a - (b + c + ...)`
 * - Array of subtrahends: `subtractFloatRecursive(a, [b, c, ...])` computes `a - (b + c + ...)`
 *
 * Subtrahends are accumulated with a `O(log n)`-depth recursive pairwise sum
 * using TwoSum error compensation, then subtracted from `minuend` via TwoDiff
 * so rounding errors from subtrahend accumulation and binary subtraction are
 * both accounted for. If summing large finite subtrahends causes intermediate
 * overflow, an exact power-of-2 rescaling fallback prevents spurious `NaN` or
 * premature overflow while remaining faithful to IEEE-754 float64 semantics.
 *
 * @param {number} minuend - The finite float64 starting value.
 * @param {...(number | number[])} subtrahends - One or more finite float64 numbers to subtract,
 *   or a single array of finite float64 numbers.
 * @returns {number} The IEEE-754 float64 result of `minuend - sum(subtrahends)`.
 * @throws {TypeError} If `minuend` or any subtrahend is not a number.
 * @throws {RangeError} If `minuend` or any subtrahend is `NaN`, `Infinity`, or `-Infinity`.
 */
export function subtractFloatRecursive(minuend, ...subtrahends) {
  assertFiniteNumber(minuend, 'minuend');

  let list;
  if (subtrahends.length === 1 && Array.isArray(subtrahends[0])) {
    list = subtrahends[0];
  } else {
    list = subtrahends;
  }

  for (let i = 0; i < list.length; i++) {
    assertFiniteNumber(list[i], `subtrahends[${i}]`);
  }

  if (list.length === 0) {
    return minuend;
  }

  let [subSum, subErr] = pairwiseRecursiveSum(list, 0, list.length, 1);

  if (!Number.isFinite(subSum)) {
    // Intermediate overflow occurred while summing finite subtrahends.
    // Rescale by an exact power of 2 to avoid spurious overflow or Infinity - Infinity = NaN.
    const shift = Math.min(512, Math.ceil(Math.log2(list.length + 2)));
    const scale = 2 ** -shift;
    const invScale = 2 ** shift;

    const [scaledSum, scaledErr] = pairwiseRecursiveSum(list, 0, list.length, scale);
    const unscaledSum = scaledSum * invScale;
    const unscaledErr = scaledErr * invScale;

    if (Number.isFinite(unscaledSum) && Number.isFinite(unscaledErr)) {
      subSum = unscaledSum;
      subErr = unscaledErr;
    } else {
      const [scaledDiff, scaledDiffErr] = twoDiff(minuend * scale, scaledSum);
      const scaledResidual = scaledDiffErr - scaledErr;
      const scaledResult = scaledResidual === 0 ? scaledDiff : scaledDiff + scaledResidual;
      return scaledResult * invScale;
    }
  }

  const [diff, diffErr] = twoDiff(minuend, subSum);
  if (!Number.isFinite(diff)) {
    return diff;
  }

  const residual = diffErr - subErr;
  return residual === 0 ? diff : diff + residual;
}
