/**
 * Exact discrete linear convolution of two exact rational sequences via the
 * Cauchy product of formal power series and Karatsuba polynomial multiplication.
 *
 * Mathematical foundation:
 * Given rational sequences a = [a_0, ..., a_{m-1}] and b = [b_0, ..., b_{n-1}]
 * representing formal power series (polynomials) over Q:
 *
 *   A(x) = sum_{i=0}^{m-1} (p_i / q_i) x^i,   B(x) = sum_{j=0}^{n-1} (r_j / s_j) x^j
 *
 * Let L_A = lcm(q_0, ..., q_{m-1}) and L_B = lcm(s_0, ..., s_{n-1}) so that
 *
 *   A(x) = (1 / L_A) * A_int(x),   B(x) = (1 / L_B) * B_int(x)
 *
 * with A_int, B_int in Z[x]. Their Cauchy product is
 *
 *   C(x) = A(x) * B(x) = (1 / (L_A * L_B)) * (A_int(x) * B_int(x))
 *        = sum_{k=0}^{m+n-2} c_k x^k,   c_k = sum_{i+j=k} a_i * b_j.
 *
 * The integer polynomial product A_int(x) * B_int(x) is computed using the
 * Karatsuba polynomial identity:
 *   P(x) = P_0(x) + x^h P_1(x),   Q(x) = Q_0(x) + x^h Q_1(x)
 *   P(x)Q(x) = Z_0(x) + x^h (Z_1(x) - Z_0(x) - Z_2(x)) + x^{2h} Z_2(x)
 * where Z_0 = P_0 Q_0, Z_2 = P_1 Q_1, Z_1 = (P_0 + P_1)(Q_0 + Q_1), with
 * overlap-add chunking for highly asymmetric lengths and direct Cauchy product
 * at small sizes. Every output coefficient is reduced to lowest terms.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

const KARATSUBA_THRESHOLD = 16;

/**
 * Compute absolute value of a BigInt.
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
  return x < 0n ? -x : x;
}

/**
 * Compute non-negative greatest common divisor of two BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
  let x = absBigInt(a);
  let y = absBigInt(b);
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Compute least common multiple of two positive BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function lcmBigInt(a, b) {
  if (a === 0n || b === 0n) {
    return 0n;
  }
  return (absBigInt(a) / gcdBigInt(a, b)) * absBigInt(b);
}

/**
 * Normalize a rational (num / den) to lowest terms with den > 0n and zero as { num: 0n, den: 1n }.
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
 * Validate and normalize an array of exact rationals.
 * @param {unknown} seq
 * @param {string} name
 * @returns {Rational[]}
 */
function validateSequence(seq, name) {
  if (!Array.isArray(seq)) {
    throw new TypeError(`${name} must be an Array of { num: BigInt, den: BigInt }`);
  }
  const out = new Array(seq.length);
  for (let i = 0; i < seq.length; i++) {
    if (!(i in seq)) {
      throw new TypeError(`${name}[${i}] must be an object { num: BigInt, den: BigInt }`);
    }
    const item = seq[i];
    if (item === null || typeof item !== 'object') {
      throw new TypeError(`${name}[${i}] must be an object { num: BigInt, den: BigInt }`);
    }
    if (typeof item.num !== 'bigint' || typeof item.den !== 'bigint') {
      throw new TypeError(`${name}[${i}] must have BigInt num and den properties`);
    }
    if (item.den === 0n) {
      throw new RangeError(`${name}[${i}] denominator cannot be 0n`);
    }
    out[i] = normalizeRational(item.num, item.den);
  }
  return out;
}

/**
 * Add two integer coefficient arrays representing polynomials in Z[x].
 * @param {bigint[]} p
 * @param {bigint[]} q
 * @returns {bigint[]}
 */
function polyAddInt(p, q) {
  const len = Math.max(p.length, q.length);
  const res = new Array(len);
  for (let i = 0; i < len; i++) {
    res[i] = (i < p.length ? p[i] : 0n) + (i < q.length ? q[i] : 0n);
  }
  return res;
}

/**
 * Direct Cauchy product of two integer polynomials in Z[x].
 * @param {bigint[]} p
 * @param {bigint[]} q
 * @returns {bigint[]}
 */
function polyMulDirectInt(p, q) {
  const m = p.length;
  const n = q.length;
  if (m === 0 || n === 0) {
    return [];
  }
  const res = new Array(m + n - 1).fill(0n);
  for (let i = 0; i < m; i++) {
    const pi = p[i];
    if (pi === 0n) {
      continue;
    }
    for (let j = 0; j < n; j++) {
      res[i + j] += pi * q[j];
    }
  }
  return res;
}

/**
 * Multiply two integer polynomials in Z[x] using Karatsuba's polynomial
 * identity with overlap-add chunking for asymmetric degrees.
 * Preserves exact output length p.length + q.length - 1.
 *
 * @param {bigint[]} p
 * @param {bigint[]} q
 * @returns {bigint[]}
 */
function polyMulKaratsubaInt(p, q) {
  const m = p.length;
  const n = q.length;
  if (m === 0 || n === 0) {
    return [];
  }
  if (m <= KARATSUBA_THRESHOLD || n <= KARATSUBA_THRESHOLD) {
    return polyMulDirectInt(p, q);
  }

  // Overlap-add decomposition when one polynomial is more than twice as long.
  if (m > 2 * n) {
    const res = new Array(m + n - 1).fill(0n);
    for (let offset = 0; offset < m; offset += n) {
      const chunk = p.slice(offset, Math.min(offset + n, m));
      const prod = polyMulKaratsubaInt(chunk, q);
      for (let k = 0; k < prod.length; k++) {
        res[offset + k] += prod[k];
      }
    }
    return res;
  }
  if (n > 2 * m) {
    return polyMulKaratsubaInt(q, p);
  }

  // Balanced Karatsuba split:
  // P(x) = P_0(x) + x^h P_1(x), Q(x) = Q_0(x) + x^h Q_1(x)
  const len = Math.max(m, n);
  const half = Math.floor(len / 2);

  const p0 = p.slice(0, half);
  const p1 = p.slice(half);
  const q0 = q.slice(0, half);
  const q1 = q.slice(half);

  const z0 = polyMulKaratsubaInt(p0, q0);
  const z2 = polyMulKaratsubaInt(p1, q1);
  const z1 = polyMulKaratsubaInt(polyAddInt(p0, p1), polyAddInt(q0, q1));

  const resLen = m + n - 1;
  const res = new Array(resLen).fill(0n);

  for (let i = 0; i < z0.length; i++) {
    res[i] += z0[i];
  }

  const midLen = Math.max(z1.length, z0.length, z2.length);
  for (let i = 0; i < midLen; i++) {
    const midCoeff =
      (i < z1.length ? z1[i] : 0n) -
      (i < z0.length ? z0[i] : 0n) -
      (i < z2.length ? z2[i] : 0n);
    if (midCoeff !== 0n) {
      res[half + i] += midCoeff;
    }
  }

  const twoHalf = 2 * half;
  for (let i = 0; i < z2.length; i++) {
    res[twoHalf + i] += z2[i];
  }

  return res;
}

/**
 * Compute the exact discrete linear convolution of two rational sequences.
 *
 * Each element of `a` and `b` is an exact rational `{ num: BigInt, den: BigInt }`
 * with `den !== 0n`. Returns an array of length `a.length + b.length - 1`
 * (or `[]` if either input is empty), with every entry normalized to lowest
 * terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 *
 * @param {Rational[]} a - First exact rational sequence.
 * @param {Rational[]} b - Second exact rational sequence.
 * @returns {Rational[]} Exact linear convolution `a * b` in lowest terms.
 * @throws {TypeError} If `a` or `b` is not an Array, or any element is not `{ num: BigInt, den: BigInt }`.
 * @throws {RangeError} If any element has `den === 0n`.
 */
export function convolutionRationalSeries(a, b) {
  const normA = validateSequence(a, 'a');
  const normB = validateSequence(b, 'b');

  if (normA.length === 0 || normB.length === 0) {
    return [];
  }

  let lcmA = 1n;
  for (let i = 0; i < normA.length; i++) {
    lcmA = lcmBigInt(lcmA, normA[i].den);
  }

  let lcmB = 1n;
  for (let j = 0; j < normB.length; j++) {
    lcmB = lcmBigInt(lcmB, normB[j].den);
  }

  const intA = new Array(normA.length);
  for (let i = 0; i < normA.length; i++) {
    intA[i] = normA[i].num * (lcmA / normA[i].den);
  }

  const intB = new Array(normB.length);
  for (let j = 0; j < normB.length; j++) {
    intB[j] = normB[j].num * (lcmB / normB[j].den);
  }

  const prodInt = polyMulKaratsubaInt(intA, intB);
  const commonDen = lcmA * lcmB;

  const result = new Array(prodInt.length);
  for (let k = 0; k < prodInt.length; k++) {
    result[k] = normalizeRational(prodInt[k], commonDen);
  }

  return result;
}
