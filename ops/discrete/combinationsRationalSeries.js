/**
 * Computes the greatest common divisor of two BigInts (always non-negative).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Computes the exact integer binomial coefficient C(n, m) for integers 0 <= m <= n
 * using the multiplicative identity:
 *   C(n, m) = prod_{j=1}^{m} (n - m + j) / j
 * where each intermediate quotient is an exact integer C(n - m + j, j).
 *
 * @param {bigint} n
 * @param {bigint} m
 * @returns {bigint}
 */
function integerBinomial(n, m) {
  let result = 1n;
  const base = n - m;
  for (let j = 1n; j <= m; j++) {
    result = (result * (base + j)) / j;
  }
  return result;
}

/**
 * Validates and normalizes an exact rational `{ num: bigint, den: bigint }`
 * into lowest terms with `den > 0n` and zero represented as `{ num: 0n, den: 1n }`.
 *
 * @param {{ num: bigint, den: bigint }} r
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(r) {
  if (
    r === null ||
    typeof r !== 'object' ||
    typeof r.num !== 'bigint' ||
    typeof r.den !== 'bigint'
  ) {
    throw new TypeError('x must be an exact rational object { num: bigint, den: bigint }');
  }
  if (r.den === 0n) {
    throw new RangeError('x.den must not be zero');
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
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/**
 * Validates and converts `k` (non-negative safe integer or non-negative BigInt) to BigInt.
 *
 * @param {number | bigint} k
 * @returns {bigint}
 */
function normalizeIndex(k) {
  if (typeof k === 'bigint') {
    if (k < 0n) {
      throw new RangeError('k must be a non-negative integer');
    }
    return k;
  }
  if (typeof k === 'number') {
    if (!Number.isSafeInteger(k) || k < 0) {
      throw new RangeError('k must be a non-negative safe integer');
    }
    return BigInt(k);
  }
  throw new TypeError('k must be a non-negative integer (number or bigint)');
}

/**
 * Computes the generalized binomial coefficient (combinations) C(x, k) over exact rationals
 * using the Newton binomial series / falling-factorial closed-form identity:
 *
 *   C(x, k) = (1 / k!) * prod_{j=0}^{k-1} (x - j)
 *
 * For an exact rational x = p / q in lowest terms (q > 0, gcd(|p|, q) = 1):
 *   - Base case: C(x, 0) = 1.
 *   - Non-negative integer x = n (q = 1, p >= 0):
 *       C(n, k) = 0 for k > n, and C(n, k) = C(n, min(k, n - k)) via multiplicative identity.
 *   - Negative integer x = -n (q = 1, p < 0):
 *       Upper negation identity C(-n, k) = (-1)^k * C(n + k - 1, min(k, n - 1)).
 *   - General rational x = p / q (q > 1):
 *       C(p/q, k) = (1 / q^k) * prod_{j=0}^{k-1} ((p - j*q) / (j + 1)),
 *       with step-wise GCD cross-cancellation; since gcd(|p|, q) = 1 implies
 *       gcd(|p - j*q|, q) = 1 for all j, the factor q^k is coprime to the numerator
 *       and yields a result directly in lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} x - Upper argument as an exact rational `{ num: bigint, den: bigint }` with `den !== 0n`.
 * @param {number | bigint} k - Lower discrete index (non-negative integer).
 * @returns {{ num: bigint, den: bigint }} Exact rational C(x, k) in lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `x` is not a `{ num: bigint, den: bigint }` object or `k` is not a number/bigint.
 * @throws {RangeError} If `x.den === 0n`, or `k` is negative or not a safe integer.
 */
export function combinationsRationalSeries(x, k) {
  const { num: p, den: q } = normalizeRational(x);
  const K = normalizeIndex(k);

  if (K === 0n) {
    return { num: 1n, den: 1n };
  }

  // Integer upper argument x = p
  if (q === 1n) {
    if (p >= 0n) {
      if (K > p) {
        return { num: 0n, den: 1n };
      }
      const m = K <= p - K ? K : p - K;
      return { num: integerBinomial(p, m), den: 1n };
    }

    // Negative integer x = -n: C(-n, K) = (-1)^K * C(n + K - 1, K)
    const n = -p;
    const upper = n + K - 1n;
    const m = K <= n - 1n ? K : n - 1n;
    const mag = integerBinomial(upper, m);
    return { num: (K & 1n) === 1n ? -mag : mag, den: 1n };
  }

  // Non-integer rational x = p / q with q > 1 and gcd(|p|, q) = 1
  let num = 1n;
  let den = 1n;

  for (let j = 0n; j < K; j++) {
    let a = p - j * q;
    let step = j + 1n;

    const g0 = gcd(a, step);
    if (g0 > 1n) {
      a /= g0;
      step /= g0;
    }

    const g1 = gcd(a, den);
    if (g1 > 1n) {
      a /= g1;
      den /= g1;
    }

    const g2 = gcd(num, step);
    if (g2 > 1n) {
      num /= g2;
      step /= g2;
    }

    num *= a;
    den *= step;
  }

  den *= q ** K;
  return { num, den };
}
