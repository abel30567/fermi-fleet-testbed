/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number represented in lowest terms with `den > 0n`,
 * `gcd(|num|, den) === 1n`, and zero represented as `{ num: 0n, den: 1n }`.
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts using
 * the iterative Euclidean algorithm (safe for arbitrarily large BigInts).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
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
 * Validates and normalizes a rational entry `{ num: bigint, den: bigint }`
 * into lowest terms with `den > 0n` and zero as `{ num: 0n, den: 1n }`.
 *
 * @param {unknown} entry
 * @param {string} label
 * @returns {Rational}
 */
function validateAndNormalizeRational(entry, label) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError(`${label} must be an object with bigint num and den properties`);
  }
  const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (entry);
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError(`${label} must have bigint num and den properties`);
  }
  if (den === 0n) {
    throw new RangeError(`${label} must have a non-zero denominator`);
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  let n = num;
  let d = den;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

/**
 * Validates that `matrix` is a non-empty rectangular 2D array of valid rationals
 * and returns a fresh normalized copy.
 *
 * @param {unknown} matrix
 * @param {string} name
 * @returns {Rational[][]}
 */
function validateAndNormalizeMatrix(matrix, name) {
  if (!Array.isArray(matrix)) {
    throw new TypeError(`${name} must be a non-empty 2D array of rationals`);
  }
  const rows = matrix.length;
  if (rows === 0) {
    throw new RangeError(`${name} must not be empty`);
  }

  let cols = -1;
  const normalized = new Array(rows);

  for (let i = 0; i < rows; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`${name}[${i}] must be an array`);
    }
    if (cols === -1) {
      cols = row.length;
      if (cols === 0) {
        throw new RangeError(`${name} rows must not be empty`);
      }
    } else if (row.length !== cols) {
      throw new RangeError(`${name} must be rectangular: row ${i} has length ${row.length}, expected ${cols}`);
    }

    const normRow = new Array(cols);
    for (let j = 0; j < cols; j++) {
      normRow[j] = validateAndNormalizeRational(row[j], `${name}[${i}][${j}]`);
    }
    normalized[i] = normRow;
  }

  return normalized;
}

/**
 * Exact multiplication of two normalized rationals, returning a lowest-terms rational.
 * Uses cross-cancellation before multiplying to keep intermediate BigInts small.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratMul(a, b) {
  if (a.num === 0n || b.num === 0n) {
    return { num: 0n, den: 1n };
  }
  const g1 = gcd(a.num, b.den);
  const g2 = gcd(b.num, a.den);
  return {
    num: (a.num / g1) * (b.num / g2),
    den: (a.den / g2) * (b.den / g1),
  };
}

/**
 * Exact addition of two normalized rationals, returning a lowest-terms rational.
 * Factors out `g = gcd(a.den, b.den)` before combining to preserve lowest terms cleanly.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratAdd(a, b) {
  if (a.num === 0n) {
    return { num: b.num, den: b.den };
  }
  if (b.num === 0n) {
    return { num: a.num, den: a.den };
  }
  const g = gcd(a.den, b.den);
  const ad = a.den / g;
  const bd = b.den / g;
  const num = a.num * bd + b.num * ad;
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }
  const g2 = gcd(num, g);
  return {
    num: num / g2,
    den: ad * bd * (g / g2),
  };
}

/**
 * Allocates an `m x n` 2D array to hold rational results.
 *
 * @param {number} m
 * @param {number} n
 * @returns {Rational[][]}
 */
function allocMatrix(m, n) {
  const mat = new Array(m);
  for (let i = 0; i < m; i++) {
    mat[i] = new Array(n);
  }
  return mat;
}

/**
 * Recursively adds submatrix `rhs[rRow..rRow+m][rCol..rCol+n]` into
 * `dst[dRow..dRow+m][dCol..dCol+n]` using divide-and-conquer splitting
 * along the larger dimension.
 *
 * @param {Rational[][]} dst
 * @param {number} dRow
 * @param {number} dCol
 * @param {Rational[][]} rhs
 * @param {number} rRow
 * @param {number} rCol
 * @param {number} m
 * @param {number} n
 */
function addIntoRecursive(dst, dRow, dCol, rhs, rRow, rCol, m, n) {
  if (m === 1 && n === 1) {
    dst[dRow][dCol] = ratAdd(dst[dRow][dCol], rhs[rRow][rCol]);
    return;
  }
  if (m >= n) {
    const m1 = m >> 1;
    addIntoRecursive(dst, dRow, dCol, rhs, rRow, rCol, m1, n);
    addIntoRecursive(dst, dRow + m1, dCol, rhs, rRow + m1, rCol, m - m1, n);
    return;
  }
  const n1 = n >> 1;
  addIntoRecursive(dst, dRow, dCol, rhs, rRow, rCol, m, n1);
  addIntoRecursive(dst, dRow, dCol + n1, rhs, rRow, rCol + n1, m, n - n1);
}

/**
 * Recursively multiplies submatrix `A[aRow..aRow+m][aCol..aCol+p]` (size `m x p`)
 * by submatrix `B[bRow..bRow+p][bCol..bCol+n]` (size `p x n`), storing the result
 * into `out[oRow..oRow+m][oCol..oCol+n]` (size `m x n`).
 *
 * At each step, the largest dimension among `m`, `p`, and `n` is split in half:
 * - Splitting `m` partitions `A` horizontally into two independent subproblems.
 * - Splitting `n` partitions `B` vertically into two independent subproblems.
 * - Splitting `p` partitions `A` vertically and `B` horizontally, recursively
 *   computing both partial products and summing them via `addIntoRecursive`
 *   (yielding balanced binary-tree rational summation along the inner dimension).
 *
 * @param {Rational[][]} A
 * @param {number} aRow
 * @param {number} aCol
 * @param {Rational[][]} B
 * @param {number} bRow
 * @param {number} bCol
 * @param {Rational[][]} out
 * @param {number} oRow
 * @param {number} oCol
 * @param {number} m
 * @param {number} p
 * @param {number} n
 */
function mulBlocksRecursive(A, aRow, aCol, B, bRow, bCol, out, oRow, oCol, m, p, n) {
  if (m === 1 && p === 1 && n === 1) {
    out[oRow][oCol] = ratMul(A[aRow][aCol], B[bRow][bCol]);
    return;
  }

  if (m >= p && m >= n) {
    const m1 = m >> 1;
    mulBlocksRecursive(A, aRow, aCol, B, bRow, bCol, out, oRow, oCol, m1, p, n);
    mulBlocksRecursive(A, aRow + m1, aCol, B, bRow, bCol, out, oRow + m1, oCol, m - m1, p, n);
    return;
  }

  if (n >= m && n >= p) {
    const n1 = n >> 1;
    mulBlocksRecursive(A, aRow, aCol, B, bRow, bCol, out, oRow, oCol, m, p, n1);
    mulBlocksRecursive(A, aRow, aCol, B, bRow, bCol + n1, out, oRow, oCol + n1, m, p, n - n1);
    return;
  }

  const p1 = p >> 1;
  mulBlocksRecursive(A, aRow, aCol, B, bRow, bCol, out, oRow, oCol, m, p1, n);
  const rightProd = allocMatrix(m, n);
  mulBlocksRecursive(A, aRow, aCol + p1, B, bRow + p1, bCol, rightProd, 0, 0, m, p - p1, n);
  addIntoRecursive(out, oRow, oCol, rightProd, 0, 0, m, n);
}

/**
 * Multiplies two rectangular matrices `A` (`m x k`) and `B` (`k x n`) of exact
 * rational numbers `{ num: bigint, den: bigint }` using recursive divide-and-conquer
 * block matrix multiplication.
 *
 * Algorithm:
 * 1. Validates both inputs are non-empty rectangular matrices of valid rational
 *    objects with compatible inner dimensions (`A[0].length === B.length`) and
 *    normalizes all entries to lowest terms (`den > 0n`) without mutating inputs.
 * 2. Recursively splits the largest of the three dimensions `(m, k, n)` in half
 *    until reaching `1 x 1` scalar base cases, combining partial products across
 *    inner-dimension splits using recursive divide-and-conquer matrix addition.
 * 3. Uses exact BigInt rational arithmetic with cross-cancellation and denominator
 *    GCD factoring so every returned entry is in lowest terms.
 *
 * @param {Rational[][]} A - Left matrix of dimensions `m x k`.
 * @param {Rational[][]} B - Right matrix of dimensions `k x n`.
 * @returns {Rational[][]} Product matrix `A * B` of dimensions `m x n` with every
 *   entry reduced to lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `A` or `B` is not a 2D array or contains invalid rational entries.
 * @throws {RangeError} If `A` or `B` is empty, ragged, has incompatible inner dimensions,
 *   or contains a rational with a zero denominator.
 */
export function matMulRationalRecursive(A, B) {
  const normA = validateAndNormalizeMatrix(A, 'A');
  const normB = validateAndNormalizeMatrix(B, 'B');

  const m = normA.length;
  const kA = normA[0].length;
  const kB = normB.length;
  const n = normB[0].length;

  if (kA !== kB) {
    throw new RangeError(
      `Incompatible matrix dimensions for multiplication: A is ${m}x${kA} and B is ${kB}x${n}`
    );
  }

  const out = allocMatrix(m, n);
  mulBlocksRecursive(normA, 0, 0, normB, 0, 0, out, 0, 0, m, kA, n);
  return out;
}
