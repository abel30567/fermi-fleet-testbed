/**
 * Arbitrary-precision decimal matrix inversion using iterative Gauss-Jordan
 * elimination over exact BigInt rationals with partial pivoting.
 */

const DECIMAL_REGEX = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

const ZERO = Object.freeze({ num: 0n, den: 1n });
const ONE = Object.freeze({ num: 1n, den: 1n });

/**
 * Computes the non-negative greatest common divisor of two BigInts iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const rem = x % y;
    x = y;
    y = rem;
  }
  return x;
}

/**
 * Constructs a normalized reduced rational `{ num, den }` with `den > 0n` and
 * `gcd(|num|, den) === 1n`.
 *
 * @param {bigint} num
 * @param {bigint} [den=1n]
 * @returns {{ num: bigint, den: bigint }}
 */
function makeRational(num, den = 1n) {
  if (den === 0n) {
    throw new RangeError('Division by zero in rational arithmetic');
  }
  if (num === 0n) {
    return ZERO;
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
 * Parses a validated decimal string (including optional sign and scientific
 * notation) into an exact reduced BigInt rational.
 *
 * @param {string} str
 * @param {number} row
 * @param {number} col
 * @returns {{ num: bigint, den: bigint }}
 */
function parseDecimalToRational(str, row, col) {
  if (typeof str !== 'string') {
    throw new TypeError(
      `Expected matrix[${row}][${col}] to be a decimal string, got ${typeof str}`,
    );
  }
  const match = DECIMAL_REGEX.exec(str);
  if (!match) {
    throw new RangeError(
      `Invalid decimal string at matrix[${row}][${col}]: ${JSON.stringify(str)}`,
    );
  }

  const [, sign, intPart = '', fracAfterInt = '', fracOnly = '', expStr] = match;
  const fracPart = fracAfterInt || fracOnly;
  const digits = intPart + fracPart;

  let exp = -fracPart.length;
  if (expStr !== undefined) {
    const parsedExp = Number(expStr);
    if (!Number.isSafeInteger(parsedExp) || !Number.isSafeInteger(parsedExp + exp)) {
      throw new RangeError(
        `Exponent out of supported range at matrix[${row}][${col}]: ${JSON.stringify(str)}`,
      );
    }
    exp += parsedExp;
  }

  let num = BigInt(digits);
  if (num === 0n) {
    return ZERO;
  }
  if (sign === '-') {
    num = -num;
  }

  if (exp >= 0) {
    return { num: num * 10n ** BigInt(exp), den: 1n };
  }
  return makeRational(num, 10n ** BigInt(-exp));
}

/**
 * Subtracts two reduced rationals: `a - b`.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratSub(a, b) {
  if (b.num === 0n) {
    return a;
  }
  if (a.num === 0n) {
    return { num: -b.num, den: b.den };
  }
  const g = gcdBigInt(a.den, b.den);
  const aDenReduced = a.den / g;
  const bDenReduced = b.den / g;
  const num = a.num * bDenReduced - b.num * aDenReduced;
  const den = aDenReduced * b.den;
  return makeRational(num, den);
}

/**
 * Multiplies two reduced rationals: `a * b`.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratMul(a, b) {
  if (a.num === 0n || b.num === 0n) {
    return ZERO;
  }
  const g1 = gcdBigInt(a.num, b.den);
  const g2 = gcdBigInt(b.num, a.den);
  return {
    num: (a.num / g1) * (b.num / g2),
    den: (a.den / g2) * (b.den / g1),
  };
}

/**
 * Divides two reduced rationals: `a / b`.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratDiv(a, b) {
  if (b.num === 0n) {
    throw new RangeError('Division by zero in rational arithmetic');
  }
  if (a.num === 0n) {
    return ZERO;
  }
  const invB =
    b.num < 0n ? { num: -b.den, den: -b.num } : { num: b.den, den: b.num };
  return ratMul(a, invB);
}

/**
 * Compares absolute values of two reduced rationals `|a|` and `|b|`.
 * Returns `-1`, `0`, or `1`.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {number}
 */
function ratAbsCompare(a, b) {
  const lhs = (a.num < 0n ? -a.num : a.num) * b.den;
  const rhs = (b.num < 0n ? -b.num : b.num) * a.den;
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

/**
 * Converts a reduced rational to a normalized decimal string rounded
 * half-away-from-zero to `precision` fractional digits.
 *
 * @param {{ num: bigint, den: bigint }} rat
 * @param {number} precision
 * @returns {string}
 */
function rationalToDecimalString(rat, precision) {
  if (rat.num === 0n) {
    return '0';
  }

  const negative = rat.num < 0n;
  const absNum = negative ? -rat.num : rat.num;
  const scale = 10n ** BigInt(precision);
  const scaled = absNum * scale;

  let quotient = scaled / rat.den;
  const remainder = scaled % rat.den;

  if (remainder * 2n >= rat.den) {
    quotient += 1n;
  }

  if (quotient === 0n) {
    return '0';
  }

  const signPrefix = negative ? '-' : '';
  if (precision === 0) {
    return signPrefix + quotient.toString();
  }

  const raw = quotient.toString().padStart(precision + 1, '0');
  const splitIdx = raw.length - precision;
  const intPart = raw.slice(0, splitIdx);
  let fracPart = raw.slice(splitIdx);

  let end = fracPart.length;
  while (end > 0 && fracPart.charCodeAt(end - 1) === 48) {
    end -= 1;
  }
  fracPart = fracPart.slice(0, end);

  if (fracPart.length === 0) {
    return signPrefix + intPart;
  }
  return `${signPrefix}${intPart}.${fracPart}`;
}

/**
 * Computes the inverse of an invertible square matrix of arbitrary-precision
 * decimal strings using iterative Gauss-Jordan elimination over exact BigInt
 * rationals (with GCD reduction) and partial pivoting.
 *
 * Intermediate arithmetic is performed exactly over rational numbers without
 * IEEE-754 floating-point precision loss. Each resulting rational entry is then
 * rounded half-away-from-zero to `precision` fractional decimal digits and
 * normalized (trailing fractional zeros removed, no `-0`).
 *
 * @param {string[][]} matrix - Non-empty square `n x n` matrix of decimal strings.
 *   Accepts optional leading `+`/`-`, integer or fractional decimals, and
 *   optional scientific notation (e.g. `"-1.25"`, `"0.5"`, `"1e-30"`).
 * @param {number} [precision=20] - Non-negative integer number of fractional
 *   decimal digits to round each output entry to.
 * @returns {string[][]} The `n x n` inverse matrix as normalized decimal strings.
 * @throws {TypeError} If `matrix` is not an array of arrays of strings, or if
 *   `precision` is not a number.
 * @throws {RangeError} If `matrix` is empty, not square, contains an invalid
 *   decimal string, is singular (non-invertible), or if `precision` is not a
 *   non-negative safe integer.
 */
export function inverseDecimalIterative(matrix, precision = 20) {
  if (typeof precision !== 'number') {
    throw new TypeError(`Expected precision to be a number, got ${typeof precision}`);
  }
  if (!Number.isInteger(precision) || precision < 0) {
    throw new RangeError(
      `Expected precision to be a non-negative integer, got ${precision}`,
    );
  }

  if (!Array.isArray(matrix)) {
    throw new TypeError(`Expected matrix to be an array, got ${typeof matrix}`);
  }
  const n = matrix.length;
  if (n === 0) {
    throw new RangeError('Expected matrix to be non-empty');
  }

  const left = new Array(n);
  const right = new Array(n);

  for (let i = 0; i < n; i += 1) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`Expected matrix[${i}] to be an array, got ${typeof row}`);
    }
    if (row.length !== n) {
      throw new RangeError(
        `Expected a square ${n}x${n} matrix, but row ${i} has length ${row.length}`,
      );
    }

    const leftRow = new Array(n);
    const rightRow = new Array(n);
    for (let j = 0; j < n; j += 1) {
      leftRow[j] = parseDecimalToRational(row[j], i, j);
      rightRow[j] = i === j ? ONE : ZERO;
    }
    left[i] = leftRow;
    right[i] = rightRow;
  }

  // Iterative Gauss-Jordan elimination with partial pivoting
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let pivotAbs = left[col][col];

    for (let r = col + 1; r < n; r += 1) {
      if (ratAbsCompare(left[r][col], pivotAbs) > 0) {
        pivotAbs = left[r][col];
        pivotRow = r;
      }
    }

    if (pivotAbs.num === 0n) {
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

    const pivotVal = left[col][col];
    left[col][col] = ONE;
    for (let j = col + 1; j < n; j += 1) {
      if (left[col][j].num !== 0n) {
        left[col][j] = ratDiv(left[col][j], pivotVal);
      }
    }
    for (let j = 0; j < n; j += 1) {
      if (right[col][j].num !== 0n) {
        right[col][j] = ratDiv(right[col][j], pivotVal);
      }
    }

    for (let r = 0; r < n; r += 1) {
      if (r === col) {
        continue;
      }
      const factor = left[r][col];
      if (factor.num === 0n) {
        continue;
      }
      left[r][col] = ZERO;

      for (let j = col + 1; j < n; j += 1) {
        if (left[col][j].num !== 0n) {
          left[r][j] = ratSub(left[r][j], ratMul(factor, left[col][j]));
        }
      }
      for (let j = 0; j < n; j += 1) {
        if (right[col][j].num !== 0n) {
          right[r][j] = ratSub(right[r][j], ratMul(factor, right[col][j]));
        }
      }
    }
  }

  const result = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const outRow = new Array(n);
    for (let j = 0; j < n; j += 1) {
      outRow[j] = rationalToDecimalString(right[i][j], precision);
    }
    result[i] = outRow;
  }

  return result;
}
