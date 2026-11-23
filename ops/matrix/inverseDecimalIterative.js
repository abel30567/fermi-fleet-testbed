/**
 * @fileoverview Matrix inversion over arbitrary-precision decimal strings using
 * iterative Gauss-Jordan elimination with partial pivoting over exact BigInt rationals.
 */

const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

const ZERO = Object.freeze({ n: 0n, d: 1n });
const ONE = Object.freeze({ n: 1n, d: 1n });

/**
 * Computes the greatest common divisor of two BigInts iteratively.
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
 * Constructs a normalized exact rational `{ n, d }` with `d > 0n` and `gcd(|n|, d) === 1n`.
 * @param {bigint} n
 * @param {bigint} d
 * @returns {{ n: bigint, d: bigint }}
 */
function makeRational(n, d) {
  if (d === 0n) {
    throw new RangeError('Division by zero');
  }
  if (n === 0n) {
    return ZERO;
  }
  let num = n;
  let den = d;
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return { n: num / g, d: den / g };
}

/**
 * Subtracts two exact rationals (`a - b`).
 * @param {{ n: bigint, d: bigint }} a
 * @param {{ n: bigint, d: bigint }} b
 * @returns {{ n: bigint, d: bigint }}
 */
function ratSub(a, b) {
  if (b.n === 0n) return a;
  if (a.n === 0n) return { n: -b.n, d: b.d };
  return makeRational(a.n * b.d - b.n * a.d, a.d * b.d);
}

/**
 * Multiplies two exact rationals (`a * b`) with cross-cancellation.
 * @param {{ n: bigint, d: bigint }} a
 * @param {{ n: bigint, d: bigint }} b
 * @returns {{ n: bigint, d: bigint }}
 */
function ratMul(a, b) {
  if (a.n === 0n || b.n === 0n) return ZERO;
  const g1 = gcd(a.n, b.d);
  const g2 = gcd(b.n, a.d);
  return {
    n: (a.n / g1) * (b.n / g2),
    d: (a.d / g2) * (b.d / g1),
  };
}

/**
 * Divides two exact rationals (`a / b`) with cross-cancellation.
 * @param {{ n: bigint, d: bigint }} a
 * @param {{ n: bigint, d: bigint }} b
 * @returns {{ n: bigint, d: bigint }}
 */
function ratDiv(a, b) {
  if (b.n === 0n) {
    throw new RangeError('Division by zero');
  }
  if (a.n === 0n) return ZERO;
  const sign = b.n < 0n ? -1n : 1n;
  const bn = b.n < 0n ? -b.n : b.n;
  const g1 = gcd(a.n, bn);
  const g2 = gcd(b.d, a.d);
  return {
    n: sign * (a.n / g1) * (b.d / g2),
    d: (a.d / g2) * (bn / g1),
  };
}

/**
 * Compares absolute values of two exact rationals.
 * Returns > 0 if |a| > |b|, < 0 if |a| < |b|, or 0 if equal.
 * @param {{ n: bigint, d: bigint }} a
 * @param {{ n: bigint, d: bigint }} b
 * @returns {number}
 */
function ratAbsCompare(a, b) {
  const lhs = (a.n < 0n ? -a.n : a.n) * b.d;
  const rhs = (b.n < 0n ? -b.n : b.n) * a.d;
  if (lhs > rhs) return 1;
  if (lhs < rhs) return -1;
  return 0;
}

/**
 * Parses an arbitrary-precision decimal string (optionally in scientific notation)
 * into an exact BigInt rational.
 * @param {string} value
 * @param {number} row
 * @param {number} col
 * @returns {{ n: bigint, d: bigint }}
 */
function parseDecimal(value, row, col) {
  if (typeof value !== 'string') {
    throw new TypeError(`Matrix element at [${row}][${col}] must be a decimal string`);
  }
  const trimmed = value.trim();
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match) {
    throw new RangeError(`Invalid decimal string "${value}" at [${row}][${col}]`);
  }

  const sign = match[1] === '-' ? -1n : 1n;
  const intDigits = match[2] ?? '';
  const fracDigits = match[3] ?? match[4] ?? '';
  const expStr = match[5];

  const digits = (intDigits + fracDigits).replace(/^0+/, '');
  if (digits.length === 0) {
    return ZERO;
  }

  let exp = 0;
  if (expStr !== undefined) {
    exp = Number(expStr);
    if (!Number.isSafeInteger(exp)) {
      throw new RangeError(`Exponent out of safe integer range in "${value}" at [${row}][${col}]`);
    }
  }

  const netScale = exp - fracDigits.length;
  const num = sign * BigInt(digits);

  if (netScale >= 0) {
    return { n: num * (10n ** BigInt(netScale)), d: 1n };
  }
  return makeRational(num, 10n ** BigInt(-netScale));
}

/**
 * Formats an exact rational as a decimal string rounded half away from zero
 * to `precision` fractional digits, stripping trailing fractional zeros.
 * @param {{ n: bigint, d: bigint }} rat
 * @param {number} precision
 * @returns {string}
 */
function formatRational(rat, precision) {
  if (rat.n === 0n) {
    return '0';
  }

  const neg = rat.n < 0n;
  const absNum = neg ? -rat.n : rat.n;
  const scale = 10n ** BigInt(precision);
  const scaled = absNum * scale;

  let q = scaled / rat.d;
  const r = scaled % rat.d;
  if (r * 2n >= rat.d) {
    q += 1n;
  }

  if (q === 0n) {
    return '0';
  }

  const prefix = neg ? '-' : '';
  if (precision === 0) {
    return prefix + q.toString();
  }

  const digits = q.toString().padStart(precision + 1, '0');
  const splitIdx = digits.length - precision;
  const intPart = digits.slice(0, splitIdx);
  const fracPart = digits.slice(splitIdx).replace(/0+$/, '');

  return fracPart.length > 0 ? `${prefix}${intPart}.${fracPart}` : `${prefix}${intPart}`;
}

/**
 * Computes the inverse of a square matrix of arbitrary-precision decimal strings
 * using iterative Gauss-Jordan elimination with partial pivoting over exact
 * BigInt rationals, then rounds each resulting entry to the requested decimal
 * precision (half away from zero, without trailing fractional zeros).
 *
 * @param {readonly (readonly string[])[]} matrix - Non-empty square 2D array of decimal strings.
 * @param {number} [precision=20] - Non-negative integer number of decimal places for rounding output.
 * @returns {string[][]} The inverted square matrix of decimal strings.
 * @throws {TypeError} If `matrix` is not a 2D array of strings or `precision` is not a number.
 * @throws {RangeError} If `matrix` is empty, non-square, contains invalid decimal strings,
 *   is singular, or if `precision` is not a non-negative safe integer.
 */
export function inverseDecimalIterative(matrix, precision = 20) {
  if (!Array.isArray(matrix)) {
    throw new TypeError('Matrix must be a 2D array of decimal strings');
  }
  const n = matrix.length;
  if (n === 0) {
    throw new RangeError('Matrix must not be empty');
  }

  if (typeof precision !== 'number') {
    throw new TypeError('Precision must be a non-negative integer');
  }
  if (!Number.isSafeInteger(precision) || precision < 0) {
    throw new RangeError('Precision must be a non-negative safe integer');
  }

  /** @type {{ n: bigint, d: bigint }[][]} */
  const left = new Array(n);
  /** @type {{ n: bigint, d: bigint }[][]} */
  const right = new Array(n);

  for (let i = 0; i < n; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`Matrix row ${i} must be an array`);
    }
    if (row.length !== n) {
      throw new RangeError(`Matrix must be square: expected ${n} columns in row ${i}, got ${row.length}`);
    }

    const leftRow = new Array(n);
    const rightRow = new Array(n);
    for (let j = 0; j < n; j++) {
      leftRow[j] = parseDecimal(row[j], i, j);
      rightRow[j] = i === j ? ONE : ZERO;
    }
    left[i] = leftRow;
    right[i] = rightRow;
  }

  // Iterative Gauss-Jordan elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotVal = left[col][col];

    for (let r = col + 1; r < n; r++) {
      const candidate = left[r][col];
      if (ratAbsCompare(candidate, pivotVal) > 0) {
        pivotRow = r;
        pivotVal = candidate;
      }
    }

    if (pivotVal.n === 0n) {
      throw new RangeError('Matrix is singular and cannot be inverted');
    }

    if (pivotRow !== col) {
      const tmpLeft = left[col];
      left[col] = left[pivotRow];
      left[pivotRow] = tmpLeft;

      const tmpRight = right[col];
      right[col] = right[pivotRow];
      right[pivotRow] = tmpRight;
    }

    const pivotLeftRow = left[col];
    const pivotRightRow = right[col];
    const pivot = pivotLeftRow[col];

    pivotLeftRow[col] = ONE;
    for (let j = col + 1; j < n; j++) {
      pivotLeftRow[j] = ratDiv(pivotLeftRow[j], pivot);
    }
    for (let j = 0; j < n; j++) {
      pivotRightRow[j] = ratDiv(pivotRightRow[j], pivot);
    }

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const targetLeftRow = left[r];
      const factor = targetLeftRow[col];
      if (factor.n === 0n) continue;

      targetLeftRow[col] = ZERO;
      for (let j = col + 1; j < n; j++) {
        targetLeftRow[j] = ratSub(targetLeftRow[j], ratMul(factor, pivotLeftRow[j]));
      }

      const targetRightRow = right[r];
      for (let j = 0; j < n; j++) {
        targetRightRow[j] = ratSub(targetRightRow[j], ratMul(factor, pivotRightRow[j]));
      }
    }
  }

  const result = new Array(n);
  for (let i = 0; i < n; i++) {
    const outRow = new Array(n);
    const rightRow = right[i];
    for (let j = 0; j < n; j++) {
      outRow[j] = formatRational(rightRow[j], precision);
    }
    result[i] = outRow;
  }

  return result;
}
