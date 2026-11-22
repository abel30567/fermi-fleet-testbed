/**
 * Computes the greatest common divisor of two non-negative safe integers
 * using the iterative Euclidean algorithm.
 *
 * @param {number} a - First non-negative safe integer.
 * @param {number} b - Second non-negative safe integer.
 * @returns {number} The greatest common divisor of `a` and `b`.
 */
function gcdIterative(a, b) {
  let x = a;
  let y = b;
  while (y !== 0) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

/**
 * Computes element-wise binomial coefficients C(n, k) ("n choose k") over
 * equal-length `Float64Array` inputs `nArr` and `kArr` using an iterative
 * multiplicative formula that exploits symmetry `r = min(k, n - k)`.
 *
 * Algorithm:
 * For each valid pair `(n, k)`:
 * - If `k > n`, `C(n, k) = 0`.
 * - Otherwise let `r = min(k, n - k)`. If `r === 0`, `C(n, k) = 1`.
 * - Iteratively evaluate `prod_{j=1..r} (n - r + j) / j`, reducing each step
 *   by `d = gcd(n - r + j, j)` and dividing `res` by `j / d` before multiplying
 *   by `(n - r + j) / d`. This keeps intermediate values minimal, guarantees
 *   exact integer results for all `C(n, k) <= Number.MAX_SAFE_INTEGER`, avoids
 *   premature floating-point overflow up to `Number.MAX_VALUE`, and terminates
 *   early if the accumulator overflows to `Infinity`.
 *
 * @param {Float64Array} nArr - Non-negative safe integer `n` values.
 * @param {Float64Array} kArr - Non-negative safe integer `k` values, same length as `nArr`.
 * @returns {Float64Array} New `Float64Array` containing `C(nArr[i], kArr[i])` for each index `i`.
 * @throws {TypeError} If `nArr` or `kArr` is not a `Float64Array`.
 * @throws {RangeError} If `nArr` and `kArr` have different lengths, or if any
 *   element is non-finite, non-integer, negative, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function combinationsTypedIterative(nArr, kArr) {
  if (!(nArr instanceof Float64Array)) {
    throw new TypeError('nArr must be a Float64Array');
  }
  if (!(kArr instanceof Float64Array)) {
    throw new TypeError('kArr must be a Float64Array');
  }
  if (nArr.length !== kArr.length) {
    throw new RangeError(
      `nArr and kArr must have the same length (got ${nArr.length} and ${kArr.length})`
    );
  }

  const len = nArr.length;
  const out = new Float64Array(len);

  for (let i = 0; i < len; i++) {
    const n = nArr[i];
    const k = kArr[i];

    if (!Number.isFinite(n)) {
      throw new RangeError(`nArr[${i}] must be a finite integer, got ${n}`);
    }
    if (!Number.isInteger(n)) {
      throw new RangeError(`nArr[${i}] must be an integer, got ${n}`);
    }
    if (n < 0) {
      throw new RangeError(`nArr[${i}] must be non-negative, got ${n}`);
    }
    if (!Number.isSafeInteger(n)) {
      throw new RangeError(
        `nArr[${i}] must be a safe integer (<= ${Number.MAX_SAFE_INTEGER}), got ${n}`
      );
    }

    if (!Number.isFinite(k)) {
      throw new RangeError(`kArr[${i}] must be a finite integer, got ${k}`);
    }
    if (!Number.isInteger(k)) {
      throw new RangeError(`kArr[${i}] must be an integer, got ${k}`);
    }
    if (k < 0) {
      throw new RangeError(`kArr[${i}] must be non-negative, got ${k}`);
    }
    if (!Number.isSafeInteger(k)) {
      throw new RangeError(
        `kArr[${i}] must be a safe integer (<= ${Number.MAX_SAFE_INTEGER}), got ${k}`
      );
    }

    if (k > n) {
      out[i] = 0;
      continue;
    }

    const diff = n - k;
    const r = k < diff ? k : diff;

    if (r === 0) {
      out[i] = 1;
      continue;
    }

    let res = 1;
    for (let j = 1; j <= r; j++) {
      const m = n - r + j;
      const d = gcdIterative(m, j);
      res = (res / (j / d)) * (m / d);
      if (!Number.isFinite(res)) {
        break;
      }
    }

    out[i] = res;
  }

  return out;
}
