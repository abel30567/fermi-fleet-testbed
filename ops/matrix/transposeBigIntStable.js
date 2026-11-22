/**
 * Default fixed-point scaling factor (10^18) for rational/real matrix entries
 * represented as exact scaled BigInts.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

/**
 * Default tile size used for cache-blocked matrix transposition.
 * @type {number}
 */
const DEFAULT_BLOCK_SIZE = 32;

/**
 * Validates and normalizes optional transpose configuration.
 *
 * @param {object} [options] - Optional configuration object.
 * @param {number} [options.blockSize=32] - Positive safe integer tile size for cache-blocked traversal.
 * @param {bigint} [options.scale] - Optional positive BigInt fixed-point scale factor to validate (e.g. `SCALE = 10n ** 18n`).
 * @returns {{ blockSize: number, scale: bigint | undefined }} Normalized options.
 * @throws {TypeError} If `options` is not a plain object, `blockSize` is not a number, or `scale` is not a BigInt.
 * @throws {RangeError} If `blockSize` is not a positive safe integer, or `scale` is not strictly positive (`> 0n`).
 */
function parseOptions(options) {
  if (options === undefined) {
    return { blockSize: DEFAULT_BLOCK_SIZE, scale: undefined };
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be a plain object when provided');
  }

  let blockSize = DEFAULT_BLOCK_SIZE;
  if (options.blockSize !== undefined) {
    if (typeof options.blockSize !== 'number') {
      throw new TypeError('options.blockSize must be a number');
    }
    if (!Number.isSafeInteger(options.blockSize) || options.blockSize < 1) {
      throw new RangeError('options.blockSize must be a positive safe integer');
    }
    blockSize = options.blockSize;
  }

  let scale = undefined;
  if (options.scale !== undefined) {
    if (typeof options.scale !== 'bigint') {
      throw new TypeError('options.scale must be a BigInt');
    }
    if (options.scale <= 0n) {
      throw new RangeError('options.scale must be a positive BigInt (> 0n)');
    }
    scale = options.scale;
  }

  return { blockSize, scale };
}

/**
 * Validates that the input is a non-empty, dense, rectangular 2D array of BigInts.
 *
 * @param {unknown} matrix - Candidate matrix to validate.
 * @returns {{ rows: number, cols: number }} Validated matrix dimensions.
 * @throws {TypeError} If `matrix` is not an Array, any row is not an Array, or any entry is missing or not a BigInt.
 * @throws {RangeError} If `matrix` has 0 rows, 0 columns, or jagged (mismatched) row lengths.
 */
function validateBigIntMatrix(matrix) {
  if (!Array.isArray(matrix)) {
    throw new TypeError('matrix must be a 2D array of BigInt values');
  }

  const rows = matrix.length;
  if (rows === 0) {
    throw new RangeError('matrix must be non-empty (at least 1 row)');
  }

  let cols = -1;
  for (let i = 0; i < rows; i++) {
    if (!(i in matrix)) {
      throw new TypeError(`matrix row ${i} is missing (sparse array not allowed)`);
    }
    const row = matrix[i];
    if (!Array.isArray(row)) {
      throw new TypeError(`matrix row ${i} must be an array`);
    }
    if (i === 0) {
      cols = row.length;
      if (cols === 0) {
        throw new RangeError('matrix rows must be non-empty (at least 1 column)');
      }
    } else if (row.length !== cols) {
      throw new RangeError(
        `matrix must be rectangular: row ${i} has length ${row.length}, expected ${cols}`
      );
    }

    for (let j = 0; j < cols; j++) {
      if (!(j in row)) {
        throw new TypeError(`matrix entry at (${i}, ${j}) is missing (sparse row not allowed)`);
      }
      if (typeof row[j] !== 'bigint') {
        throw new TypeError(
          `matrix entry at (${i}, ${j}) must be a BigInt, got ${typeof row[j]}`
        );
      }
    }
  }

  return { rows, cols };
}

/**
 * Computes the exact, lossless transpose of a rectangular BigInt matrix using a
 * cache-blocked (tiled), immutable traversal.
 *
 * Scaling & Precision Conventions:
 * - Operates directly on arbitrary-precision `bigint` entries (either exact integers or
 *   fixed-point BigInts scaled by `SCALE = 10n ** 18n`, or any positive custom `options.scale`).
 * - Because transposition is a pure coordinate permutation `(A^T)[j][i] = A[i][j]`, every
 *   fixed-point value preserves its exact scale factor with zero rounding, zero truncation,
 *   and zero overflow regardless of magnitude.
 *
 * Numerical Robustness Guarantees:
 * - Zero error bound (`0n` entrywise error): no floating-point conversion ever occurs.
 * - Preserves algebraic and spectral invariants exactly: involution `(A^T)^T = A`,
 *   element sum, L1 norm, squared Frobenius norm `sum(a_ij^2)`, and trace for square matrices.
 * - Cache-blocked tiling (`blockSize` x `blockSize`) improves memory locality on large matrices
 *   without sacrificing determinism or immutability (the input matrix is never mutated and no
 *   row references are shared with the returned matrix).
 *
 * @param {readonly (readonly bigint[])[]} matrix - Non-empty `m x n` rectangular matrix of BigInts.
 * @param {object} [options] - Optional configuration.
 * @param {number} [options.blockSize=32] - Positive safe integer block size for tiled transposition.
 * @param {bigint} [options.scale] - Optional positive BigInt fixed-point scale factor to validate.
 * @returns {bigint[][]} Newly allocated `n x m` transposed BigInt matrix.
 * @throws {TypeError} If `matrix` is not a 2D array of BigInts, contains sparse holes, or `options` has invalid types.
 * @throws {RangeError} If `matrix` is empty (`0` rows or `0` columns), ragged/non-rectangular, or `options` values are out of range.
 */
export function transposeBigIntStable(matrix, options) {
  const { blockSize } = parseOptions(options);
  const { rows, cols } = validateBigIntMatrix(matrix);

  /** @type {bigint[][]} */
  const result = new Array(cols);
  for (let j = 0; j < cols; j++) {
    result[j] = new Array(rows);
  }

  // Cache-blocked (tiled) copy: result[j][i] = matrix[i][j]
  for (let i0 = 0; i0 < rows; i0 += blockSize) {
    const iMax = Math.min(i0 + blockSize, rows);
    for (let j0 = 0; j0 < cols; j0 += blockSize) {
      const jMax = Math.min(j0 + blockSize, cols);
      for (let i = i0; i < iMax; i++) {
        const srcRow = matrix[i];
        for (let j = j0; j < jMax; j++) {
          result[j][i] = srcRow[j];
        }
      }
    }
  }

  return result;
}
