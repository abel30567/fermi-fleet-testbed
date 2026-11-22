/**
 * Compute the greatest common divisor of two BigInts using an iterative
 * Euclidean algorithm.
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
 * Validate and normalize an exact rational `{ num: bigint, den: bigint }`
 * into lowest terms with `den > 0n` (and `0n / 1n` for zero).
 *
 * @param {{ num: bigint, den: bigint }} r
 * @returns {{ num: bigint, den: bigint }}
 * @throws {TypeError} If `r` is not an object with BigInt `num` and `den` fields.
 * @throws {RangeError} If `r.den === 0n`.
 */
function normalizeRational(r) {
  if (typeof r !== 'object' || r === null || Array.isArray(r)) {
    throw new TypeError('Input must be a rational object { num: bigint, den: bigint }');
  }
  if (typeof r.num !== 'bigint' || typeof r.den !== 'bigint') {
    throw new TypeError('Rational num and den must both be BigInt values');
  }
  if (r.den === 0n) {
    throw new RangeError('Rational denominator must not be zero');
  }
  if (r.num === 0n) {
    return { num: 0n, den: 1n };
  }

  let num = r.num;
  let den = r.den;
  if (den < 0n) {
    num = -num;
    den = -den;
  }

  const g = gcdBigInt(num, den);
  return { num: num / g, den: den / g };
}

/**
 * Compute the discrete factorial `n!` iteratively for an exact rational
 * `n = { num: BigInt, den: BigInt }` representing a non-negative integer.
 *
 * The input rational is first validated and reduced to lowest terms with
 * `den > 0n`. If the reduced value is not an integer (`den !== 1n`) or is
 * negative (`num < 0n`), a `RangeError` is thrown.
 *
 * @param {{ num: bigint, den: bigint }} n - Exact rational representing a non-negative integer.
 * @returns {{ num: bigint, den: bigint }} Exact rational `{ num: n!, den: 1n }` in lowest terms.
 * @throws {TypeError} If `n` is not a valid rational object with BigInt `num` and `den`.
 * @throws {RangeError} If `n.den === 0n`, or if `n` is negative or not an integer.
 */
export function factorialRationalIterative(n) {
  const reduced = normalizeRational(n);

  if (reduced.den !== 1n) {
    throw new RangeError(
      `Factorial is only defined for integers; received ${reduced.num}/${reduced.den}`
    );
  }
  if (reduced.num < 0n) {
    throw new RangeError(
      `Factorial is only defined for non-negative integers; received ${reduced.num}`
    );
  }

  let result = 1n;
  for (let i = 2n; i <= reduced.num; i += 1n) {
    result *= i;
  }

  return { num: result, den: 1n };
}
