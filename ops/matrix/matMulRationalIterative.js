/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the greatest common divisor of two BigInts using the iterative
 * Euclidean algorithm. Always returns a non-negative BigInt.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x;
}

/**
 * Reduces a rational number `num / den` to canonical lowest terms with
 * `den > 0n` and `{ num: 0n, den: 1n }` for zero.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
  if (den === 0n) {
    throw new RangeError('Rational denominator must be non-zero');
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
  const g = gcdBigInt(n, d);
  return { num: n / g, den: d / g };
}

/**
 * Validates and normalizes a rational object `{ num: BigInt, den: BigInt }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateRational(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object with BigInt num and den properties`);
  }
  const { num, den } = value;
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError(`${label} must have BigInt num and den properties`);
  }
  if (den === 0n) {
    throw new RangeError(`${label} denominator must be non-zero`);
  }
  return normalizeRational(num, den);
}

/**
 * Validates that a matrix is a non-empty rectangular 2D array of valid
 * rational numbers and returns its dimensions and normalized copy.
 *
 * @param {unknown} matrix
 * @param {string} name
 * @returns {{ rows: number, cols: number, data: Rational[][] }}
 */
function validateMatrix(matrix, name) {
  if (!Array.isArray(matrix)) {
    throw new TypeError(`${name} must be a 2D array of rationals`);
  }
  if (matrix.length === 0) {
    throw new RangeError(`${name} must be a non-empty matrix`);
  }
  const firstRow = matrix[0];
  if (!Array.isArray(firstRow)) {
    throw new TypeError(`${name}[0] must be an array`);
  }
  const cols = firstRow.length;
  if (cols === 0) {
    throw new RangeError(`${name} rows must be non-empty`);
  }

  const rows = matrix.length;
  const data = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`${name}[${i}] must be an array`);
    }
    if (row.length !== cols) {
      throw new RangeError(
        `${name} must be rectangular: row ${i} has length ${row.length}, expected ${cols}`
      );
    }
    const normalizedRow = new Array(cols);
    for (let j = 0; j < cols; j++) {
      normalizedRow[j] = validateRational(row[j], `${name}[${i}][${j}]`);
    }
    data[i] = normalizedRow;
  }

  return { rows, cols, data };
}

/**
 * Multiplies two normalized rationals and returns the reduced product.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function mulRational(x, y) {
  if (x.num === 0n || y.num === 0n) {
    return { num: 0n, den: 1n };
  }
  return normalizeRational(x.num * y.num, x.den * y.den);
}

/**
 * Adds two normalized rationals and returns the reduced sum.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function addRational(x, y) {
  if (x.num === 0n) {
    return { num: y.num, den: y.den };
  }
  if (y.num === 0n) {
    return { num: x.num, den: x.den };
  }
  const g = gcdBigInt(x.den, y.den);
  const num = x.num * (y.den / g) + y.num * (x.den / g);
  const den = (x.den / g) * y.den;
  return normalizeRational(num, den);
}

/**
 * Multiplies two matrices `a` (m x n) and `b` (n x p) of exact rational
 * numbers `{ num: BigInt, den: BigInt }` using straightforward triple-nested
 * iterative loops.
 *
 * All entries in the returned m x p matrix are reduced to lowest terms with
 * `den > 0n` (and `{ num: 0n, den: 1n }` for zero). Input matrices are not
 * mutated.
 *
 * @param {Rational[][]} a Left matrix of shape m x n.
 * @param {Rational[][]} b Right matrix of shape n x p.
 * @returns {Rational[][]} Product matrix `a * b` of shape m x p.
 * @throws {TypeError} If `a` or `b` is not a 2D array of `{ num: BigInt, den: BigInt }` objects.
 * @throws {RangeError} If either matrix is empty, ragged, has a zero denominator, or has incompatible inner dimensions (`a[0].length !== b.length`).
 */
export function matMulRationalIterative(a, b) {
  const matA = validateMatrix(a, 'a');
  const matB = validateMatrix(b, 'b');

  if (matA.cols !== matB.rows) {
    throw new RangeError(
      `Incompatible matrix dimensions for multiplication: (${matA.rows}x${matA.cols}) and (${matB.rows}x${matB.cols})`
    );
  }

  const m = matA.rows;
  const n = matA.cols;
  const p = matB.cols;

  const result = new Array(m);
  for (let i = 0; i < m; i++) {
    const row = new Array(p);
    for (let j = 0; j < p; j++) {
      let sum = { num: 0n, den: 1n };
      for (let k = 0; k < n; k++) {
        const product = mulRational(matA.data[i][k], matB.data[k][j]);
        sum = addRational(sum, product);
      }
      row[j] = sum;
    }
    result[i] = row;
  }

  return result;
}
