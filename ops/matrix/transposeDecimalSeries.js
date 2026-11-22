/**
 * @module ops/matrix/transposeDecimalSeries
 *
 * Exact arbitrary-precision matrix transpose over decimal strings using BigInt arithmetic.
 */

const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;
const MAX_EXPONENT_MAGNITUDE = 1_000_000;
const MAX_PRECISION = 1_000_000;

/**
 * Parses a decimal string (including optional sign and scientific notation)
 * into an exact BigInt representation: `sign * absInt * 10^(-scale)` with `scale >= 0`.
 *
 * @param {string} raw - The decimal string to parse.
 * @param {number} rowIndex - Row index for error diagnostics.
 * @param {number} colIndex - Column index for error diagnostics.
 * @returns {{ sign: 1 | -1, absInt: bigint, scale: number }} Parsed exact decimal.
 * @throws {TypeError} If `raw` is not a string.
 * @throws {RangeError} If `raw` is not a valid finite decimal string or exponent overflows bounds.
 */
function parseDecimal(raw, rowIndex, colIndex) {
  if (typeof raw !== 'string') {
    throw new TypeError(
      `Matrix entry at [${rowIndex}][${colIndex}] must be a string, received ${typeof raw}`
    );
  }

  const trimmed = raw.trim();
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match) {
    throw new RangeError(
      `Invalid decimal string at [${rowIndex}][${colIndex}]: ${JSON.stringify(raw)}`
    );
  }

  const signStr = match[1];
  const intPart = match[2] ?? '';
  const fracPart = match[3] ?? match[4] ?? '';
  const expStr = match[5];

  let exponent = 0;
  if (expStr !== undefined) {
    exponent = Number(expStr);
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT_MAGNITUDE) {
      throw new RangeError(
        `Exponent out of supported range at [${rowIndex}][${colIndex}]: ${JSON.stringify(raw)}`
      );
    }
  }

  const combinedDigits = intPart + fracPart;
  let absInt = BigInt(combinedDigits);
  const sign = signStr === '-' ? -1 : 1;

  if (absInt === 0n) {
    return { sign: 1, absInt: 0n, scale: 0 };
  }

  let scale = fracPart.length - exponent;
  if (scale < 0) {
    const shift = -scale;
    if (shift > MAX_EXPONENT_MAGNITUDE) {
      throw new RangeError(
        `Decimal magnitude out of supported range at [${rowIndex}][${colIndex}]: ${JSON.stringify(raw)}`
      );
    }
    absInt *= 10n ** BigInt(shift);
    scale = 0;
  } else if (scale > MAX_EXPONENT_MAGNITUDE) {
    throw new RangeError(
      `Decimal scale out of supported range at [${rowIndex}][${colIndex}]: ${JSON.stringify(raw)}`
    );
  }

  return { sign, absInt, scale };
}

/**
 * Rounds an exact BigInt decimal to `precision` fractional decimal places using
 * exact round-half-away-from-zero semantics, then formats it as a canonical
 * decimal string (stripping redundant trailing fractional zeros and normalizing `-0` to `"0"`).
 *
 * @param {{ sign: 1 | -1, absInt: bigint, scale: number }} parsed - Exact decimal representation.
 * @param {number} precision - Non-negative integer number of decimal places.
 * @returns {string} Canonical rounded decimal string.
 */
function formatRoundedDecimal(parsed, precision) {
  let { sign, absInt, scale } = parsed;

  if (absInt === 0n) {
    return '0';
  }

  if (scale > precision) {
    const drop = scale - precision;
    const divisor = 10n ** BigInt(drop);
    const quotient = absInt / divisor;
    const remainder = absInt % divisor;
    const half = divisor / 2n;

    absInt = remainder >= half ? quotient + 1n : quotient;
    scale = precision;
  }

  if (absInt === 0n) {
    return '0';
  }

  const digits = absInt.toString();
  const prefix = sign < 0 ? '-' : '';

  if (scale === 0) {
    return prefix + digits;
  }

  const padded = digits.length <= scale ? digits.padStart(scale + 1, '0') : digits;
  const splitIdx = padded.length - scale;
  const intPart = padded.slice(0, splitIdx);
  const fracPart = padded.slice(splitIdx).replace(/0+$/, '');

  if (fracPart.length === 0) {
    return prefix + intPart;
  }

  return `${prefix}${intPart}.${fracPart}`;
}

/**
 * Computes the closed-form transpose `T` of a rectangular `m x n` matrix `M`
 * of arbitrary-precision decimal strings, where `T[j][i] = M[i][j]` for
 * `0 <= j < n` and `0 <= i < m`.
 *
 * Every entry is parsed exactly with BigInt arithmetic, rounded using
 * round-half-away-from-zero to at most `precision` fractional decimal places,
 * and normalized (leading/trailing redundant zeros removed, `-0` normalized to `"0"`).
 * Full input precision is preserved whenever `precision` is at least the entry's
 * fractional digit count. The input matrix is never mutated.
 *
 * @param {readonly (readonly string[])[]} matrix - Non-empty rectangular 2D array of decimal strings.
 * @param {number} [precision=20] - Non-negative integer maximum number of fractional decimal places.
 * @returns {string[][]} Newly allocated `n x m` transposed matrix of normalized decimal strings.
 * @throws {TypeError} If `matrix` is not a 2D array of strings or `precision` is not a number.
 * @throws {RangeError} If `matrix` is empty, has empty rows, is ragged, contains invalid decimal strings,
 *   or `precision` is not a valid non-negative integer within supported bounds.
 */
export function transposeDecimalSeries(matrix, precision = 20) {
  if (typeof precision !== 'number') {
    throw new TypeError(`precision must be a number, received ${typeof precision}`);
  }
  if (!Number.isInteger(precision) || precision < 0 || precision > MAX_PRECISION) {
    throw new RangeError(
      `precision must be a non-negative integer <= ${MAX_PRECISION}, received ${precision}`
    );
  }

  if (!Array.isArray(matrix)) {
    throw new TypeError('matrix must be a 2D array of decimal strings');
  }
  if (matrix.length === 0) {
    throw new RangeError('matrix must be non-empty');
  }

  const rowCount = matrix.length;
  if (!Array.isArray(matrix[0])) {
    throw new TypeError('matrix row 0 must be an array');
  }
  const colCount = matrix[0].length;
  if (colCount === 0) {
    throw new RangeError('matrix rows must be non-empty');
  }

  // Validate rectangular shape and parse/normalize all entries before constructing output
  const normalizedRows = new Array(rowCount);
  for (let i = 0; i < rowCount; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`matrix row ${i} must be an array`);
    }
    if (row.length !== colCount) {
      throw new RangeError(
        `matrix must be rectangular: row ${i} has length ${row.length}, expected ${colCount}`
      );
    }

    const normalizedRow = new Array(colCount);
    for (let j = 0; j < colCount; j++) {
      const parsed = parseDecimal(row[j], i, j);
      normalizedRow[j] = formatRoundedDecimal(parsed, precision);
    }
    normalizedRows[i] = normalizedRow;
  }

  // Closed-form transpose: T[j][i] = M[i][j]
  const result = new Array(colCount);
  for (let j = 0; j < colCount; j++) {
    const transposedRow = new Array(rowCount);
    for (let i = 0; i < rowCount; i++) {
      transposedRow[i] = normalizedRows[i][j];
    }
    result[j] = transposedRow;
  }

  return result;
}
