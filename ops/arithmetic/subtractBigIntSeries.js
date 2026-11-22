/**
 * Computes the exact difference `a - b` of two arbitrary-precision `BigInt`
 * integers using binary borrow-propagation and carry-propagation recurrence
 * series on non-negative magnitudes with exact sign handling.
 *
 * Also applies directly to fixed-point `BigInt` representations scaled by
 * `10^18` (since `(x * 10^18) - (y * 10^18) = (x - y) * 10^18`).
 *
 * Algorithm / Identity:
 * - For non-negative magnitudes `x >= y >= 0n`, the binary borrow-propagation
 *   series iterates:
 *     `diff = x ^ y`
 *     `borrow = (~x & y) << 1n`
 *   maintaining the exact bit-level identity
 *     `x - y === (x ^ y) - ((~x & y) << 1n)`.
 *   Because `x >= y >= 0n`, both operands stay bounded below `2^bitLength(x)`
 *   while the lowest set bit of `borrow` strictly shifts left each iteration,
 *   guaranteeing termination in at most `bitLength(x)` steps.
 * - For opposite-sign operands where `a - b = ±(|a| + |b|)`, the dual binary
 *   carry-propagation series iterates:
 *     `sum = x ^ y`
 *     `carry = (x & y) << 1n`
 *   maintaining the identity
 *     `x + y === (x ^ y) + ((x & y) << 1n)`.
 *
 * @param {bigint} a - The minuend (exact BigInt integer).
 * @param {bigint} b - The subtrahend (exact BigInt integer).
 * @returns {bigint} The exact difference `a - b`.
 * @throws {TypeError} If `a` or `b` is not a primitive `bigint`.
 */
export function subtractBigIntSeries(a, b) {
  if (typeof a !== 'bigint') {
    throw new TypeError(`Expected parameter "a" to be a bigint, got ${typeof a}`);
  }
  if (typeof b !== 'bigint') {
    throw new TypeError(`Expected parameter "b" to be a bigint, got ${typeof b}`);
  }

  if (b === 0n) {
    return a;
  }
  if (a === 0n) {
    return -b;
  }
  if (a === b) {
    return 0n;
  }

  const aNeg = a < 0n;
  const bNeg = b < 0n;
  const absA = aNeg ? -a : a;
  const absB = bNeg ? -b : b;

  // Same sign: a - b reduces to a magnitude difference.
  if (aNeg === bNeg) {
    if (!aNeg) {
      // Both positive: |a| - |b|
      return absA >= absB
        ? subUnsignedSeries(absA, absB)
        : -subUnsignedSeries(absB, absA);
    }
    // Both negative: (-|a|) - (-|b|) = |b| - |a|
    return absB >= absA
      ? subUnsignedSeries(absB, absA)
      : -subUnsignedSeries(absA, absB);
  }

  // Opposite signs: a - b reduces to ±(|a| + |b|).
  const magnitudeSum = addUnsignedSeries(absA, absB);
  return aNeg ? -magnitudeSum : magnitudeSum;
}

/**
 * Computes `x - y` for non-negative BigInts `x >= y >= 0n` via binary
 * borrow-propagation recurrence.
 *
 * @param {bigint} x - Non-negative minuend (`x >= y`).
 * @param {bigint} y - Non-negative subtrahend (`0n <= y <= x`).
 * @returns {bigint} Exact non-negative difference `x - y`.
 */
function subUnsignedSeries(x, y) {
  let minuend = x;
  let subtrahend = y;
  while (subtrahend !== 0n) {
    const borrow = (~minuend & subtrahend) << 1n;
    minuend = minuend ^ subtrahend;
    subtrahend = borrow;
  }
  return minuend;
}

/**
 * Computes `x + y` for non-negative BigInts `x >= 0n, y >= 0n` via binary
 * carry-propagation recurrence.
 *
 * @param {bigint} x - Non-negative augend.
 * @param {bigint} y - Non-negative addend.
 * @returns {bigint} Exact non-negative sum `x + y`.
 */
function addUnsignedSeries(x, y) {
  let augend = x;
  let addend = y;
  while (addend !== 0n) {
    const carry = (augend & addend) << 1n;
    augend = augend ^ addend;
    addend = carry;
  }
  return augend;
}
