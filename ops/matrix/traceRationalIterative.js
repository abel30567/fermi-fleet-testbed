/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number represented as a numerator and non-zero denominator
 * of type `bigint`.
 */

/**
 * Computes the greatest common divisor of two BigInts iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdBigInt(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

/**
 * Validates that a value is a well-formed rational `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} value
 * @param {number} row
 * @param {number} col
 * @throws {TypeError} If `value` is not an object with `bigint` `num` and `den`.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateRational(value, row, col) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Matrix entry at [${row}][${col}] must be a rational object { num: bigint, den: bigint }`);
  }
  const { num, den } = value;
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError(`Matrix entry at [${row}][${col}] must have bigint num and den`);
  }
  if (den === 0n) {
    throw new RangeError(`Matrix entry at [${row}][${col}] has zero denominator`);
  }
}

/**
 * Normalizes a rational pair `(num, den)` to canonical lowest terms with `den > 0n`.
 * Zero is always represented as `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  let n = num;
  let d = den;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcdBigInt(n, d);
  return { num: n / g, den: d / g };
}

/**
 * Computes the trace (sum of main diagonal entries) of a non-empty square matrix
 * of exact rational numbers `{ num: bigint, den: bigint }` using a straightforward
 * iterative loop.
 *
 * The returned rational is reduced to canonical lowest terms with a positive
 * denominator (and `{ num: 0n, den: 1n }` when the trace is zero).
 *
 * @param {Rational[][]} matrix Non-empty square matrix of exact rational entries.
 * @returns {Rational} Exact trace of `matrix` in lowest terms.
 * @throws {TypeError} If `matrix` is not an array of arrays of valid rational objects.
 * @throws {RangeError} If `matrix` is empty, non-square, or contains a zero denominator.
 */
export function traceRationalIterative(matrix) {
  if (!Array.isArray(matrix)) {
    throw new TypeError('Matrix must be an array of rows');
  }
  const n = matrix.length;
  if (n === 0) {
    throw new RangeError('Matrix must be non-empty');
  }

  for (let i = 0; i < n; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`Matrix row ${i} must be an array`);
    }
    if (row.length !== n) {
      throw new RangeError(`Matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`);
    }
    for (let j = 0; j < n; j++) {
      validateRational(row[j], i, j);
    }
  }

  let accNum = 0n;
  let accDen = 1n;

  for (let i = 0; i < n; i++) {
    const entry = normalizeRational(matrix[i][i].num, matrix[i][i].den);
    if (entry.num === 0n) {
      continue;
    }
    const g = gcdBigInt(accDen, entry.den);
    const nextNum = accNum * (entry.den / g) + entry.num * (accDen / g);
    const nextDen = (accDen / g) * entry.den;
    const reduced = normalizeRational(nextNum, nextDen);
    accNum = reduced.num;
    accDen = reduced.den;
  }

  return { num: accNum, den: accDen };
}
