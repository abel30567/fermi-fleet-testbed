/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Maximum matrix dimension whose diagonal-coordinate lookup table is
 * precomputed at module load time.
 */
const PRECOMPUTED_MAX_DIM = 64;

/**
 * Maximum number of dynamically cached diagonal-coordinate tables for
 * dimensions exceeding {@link PRECOMPUTED_MAX_DIM}.
 */
const MAX_DYNAMIC_TABLE_CACHE = 128;

/**
 * Maximum number of memoized trace results stored in the bounded LRU cache.
 */
const MAX_TRACE_CACHE_SIZE = 1024;

/**
 * Builds a flat Int32Array of interleaved `(row, col)` diagonal coordinates
 * `[0, 0, 1, 1, ..., n - 1, n - 1]` for an `n x n` square matrix.
 *
 * @param {number} n - Positive integer matrix dimension.
 * @returns {Int32Array} Interleaved diagonal coordinates of length `2 * n`.
 */
function buildDiagonalTable(n) {
	const coords = new Int32Array(n * 2);
	for (let i = 0; i < n; i++) {
		const offset = i * 2;
		coords[offset] = i;
		coords[offset + 1] = i;
	}
	return coords;
}

/**
 * Precomputed diagonal-coordinate tables indexed by dimension `1..PRECOMPUTED_MAX_DIM`.
 * Entry `0` is unused (`null`).
 *
 * @type {ReadonlyArray<Int32Array | null>}
 */
const DIAGONAL_INDEX_TABLE = Object.freeze(
	Array.from({ length: PRECOMPUTED_MAX_DIM + 1 }, (_, n) =>
		n === 0 ? null : buildDiagonalTable(n)
	)
);

/**
 * Bounded LRU cache for diagonal-coordinate tables of large dimensions (`n > PRECOMPUTED_MAX_DIM`).
 *
 * @type {Map<number, Int32Array>}
 */
const dynamicDiagonalTables = new Map();

/**
 * Retrieves the precomputed or cached diagonal-coordinate table for dimension `n`.
 *
 * @param {number} n - Positive integer matrix dimension.
 * @returns {Int32Array} Interleaved `(row, col)` diagonal coordinates.
 */
function getDiagonalTable(n) {
	if (n <= PRECOMPUTED_MAX_DIM) {
		return /** @type {Int32Array} */ (DIAGONAL_INDEX_TABLE[n]);
	}
	let table = dynamicDiagonalTables.get(n);
	if (table !== undefined) {
		dynamicDiagonalTables.delete(n);
		dynamicDiagonalTables.set(n, table);
		return table;
	}
	table = buildDiagonalTable(n);
	if (dynamicDiagonalTables.size >= MAX_DYNAMIC_TABLE_CACHE) {
		const oldestDim = dynamicDiagonalTables.keys().next().value;
		dynamicDiagonalTables.delete(oldestDim);
	}
	dynamicDiagonalTables.set(n, table);
	return table;
}

/**
 * Bounded LRU memoization map from canonical diagonal signature to frozen `{ re, im }` trace.
 *
 * @type {Map<string, Readonly<Complex>>}
 */
const traceCache = new Map();

/**
 * Normalizes IEEE-754 negative zero (`-0`) to `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Validates that a value is a well-formed complex object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} entry - Candidate matrix entry.
 * @param {number} row - Row index for error diagnostics.
 * @param {number} col - Column index for error diagnostics.
 * @throws {TypeError} If `entry` is not a valid finite complex object `{ re, im }`.
 */
function assertValidComplex(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(
			`Invalid complex entry at [${row}][${col}]: expected an object { re, im }`
		);
	}
	const { re, im } = /** @type {{ re?: unknown, im?: unknown }} */ (entry);
	if (typeof re !== 'number' || !Number.isFinite(re)) {
		throw new TypeError(
			`Invalid complex entry at [${row}][${col}]: "re" must be a finite number`
		);
	}
	if (typeof im !== 'number' || !Number.isFinite(im)) {
		throw new TypeError(
			`Invalid complex entry at [${row}][${col}]: "im" must be a finite number`
		);
	}
}

/**
 * Validates that `M` is a non-empty square `n x n` matrix of valid complex `{ re, im }` entries.
 *
 * @param {unknown} M - Candidate square complex matrix.
 * @returns {number} Matrix dimension `n`.
 * @throws {TypeError} If `M` is not an array of arrays or contains invalid complex entries.
 * @throws {RangeError} If `M` is empty, jagged, or non-square.
 */
function validateSquareComplexMatrix(M) {
	if (!Array.isArray(M)) {
		throw new TypeError('Matrix must be an array of row arrays');
	}
	const n = M.length;
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty');
	}
	for (let r = 0; r < n; r++) {
		const row = M[r];
		if (!Array.isArray(row)) {
			throw new TypeError(`Row ${r} must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`Matrix must be square (${n}x${n}), but row ${r} has length ${row.length}`
			);
		}
		for (let c = 0; c < n; c++) {
			assertValidComplex(row[c], r, c);
		}
	}
	return n;
}

/**
 * Builds a collision-free cache key from the diagonal entries using the
 * precomputed diagonal-coordinate table.
 *
 * @param {Complex[][]} M - Validated `n x n` complex matrix.
 * @param {number} n - Matrix dimension.
 * @param {Int32Array} diagTable - Interleaved `(row, col)` diagonal coordinates.
 * @returns {string} Canonical cache key.
 */
function buildDiagonalKey(M, n, diagTable) {
	const parts = new Array(n);
	for (let i = 0; i < n; i++) {
		const entry = M[diagTable[i * 2]][diagTable[i * 2 + 1]];
		const re = normalizeZero(entry.re);
		const im = normalizeZero(entry.im);
		parts[i] = `${re},${im}`;
	}
	return `${n}|${parts.join(';')}`;
}

/**
 * Computes the trace (sum of main diagonal entries) of an `n x n` square matrix
 * over complex numbers represented as `{ re, im }` objects.
 *
 * Uses a precomputed diagonal-coordinate table for table-driven diagonal traversal
 * combined with a bounded LRU `Map` memoization cache. Always returns a fresh
 * `{ re, im }` object so caller mutations cannot corrupt cached values.
 *
 * @param {Complex[][]} M - Non-empty `n x n` square matrix of `{ re, im }` complex numbers.
 * @returns {Complex} Fresh `{ re, im }` object equal to `sum_{i=0}^{n-1} M[i][i]`.
 * @throws {TypeError} If `M` is not an array of arrays or any entry is not a finite `{ re, im }` object.
 * @throws {RangeError} If `M` is empty, jagged, or non-square.
 */
export function traceComplexMemo(M) {
	const n = validateSquareComplexMatrix(M);
	const diagTable = getDiagonalTable(n);
	const key = buildDiagonalKey(M, n, diagTable);

	const cached = traceCache.get(key);
	if (cached !== undefined) {
		traceCache.delete(key);
		traceCache.set(key, cached);
		return { re: cached.re, im: cached.im };
	}

	let sumRe = 0;
	let sumIm = 0;
	for (let k = 0; k < diagTable.length; k += 2) {
		const entry = M[diagTable[k]][diagTable[k + 1]];
		sumRe += entry.re;
		sumIm += entry.im;
	}

	const result = Object.freeze({
		re: normalizeZero(sumRe),
		im: normalizeZero(sumIm),
	});

	if (traceCache.size >= MAX_TRACE_CACHE_SIZE) {
		const oldestKey = traceCache.keys().next().value;
		traceCache.delete(oldestKey);
	}
	traceCache.set(key, result);

	return { re: result.re, im: result.im };
}
