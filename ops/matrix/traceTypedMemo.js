/**
 * @fileoverview Table-driven, memoized matrix trace over row-major Float64Array inputs.
 * Zero dependencies, ESM (Node 20+).
 */

/**
 * Maximum matrix dimension whose diagonal index table is precomputed at module load.
 * Dimensions larger than this are computed on demand and cached in the table map.
 * @type {number}
 */
const PRECOMPUTED_MAX_DIM = 16;

/**
 * Maximum number of cached diagonal-to-trace entries in the LRU memoization table.
 * @type {number}
 */
const MAX_MEMO_ENTRIES = 1024;

/**
 * Table of precomputed diagonal flat indices for an n x n row-major matrix.
 * For dimension n, entry k is k * (n + 1) for k in [0, n - 1].
 * @type {Map<number, Uint32Array>}
 */
const DIAGONAL_INDEX_TABLES = new Map();

/**
 * Bounded LRU memoization cache mapping canonical diagonal keys to trace values.
 * @type {Map<string, number>}
 */
const TRACE_MEMO_CACHE = new Map();

/**
 * Build a flat diagonal index lookup table for an n x n row-major matrix.
 * @param {number} n - Positive integer matrix dimension.
 * @returns {Uint32Array} Array of length n containing indices [0, n+1, 2*(n+1), ...].
 */
function buildDiagonalIndexTable(n) {
	const table = new Uint32Array(n);
	const stride = n + 1;
	for (let i = 0, idx = 0; i < n; i++, idx += stride) {
		table[i] = idx;
	}
	return table;
}

// Precompute diagonal index tables for common small square matrix dimensions.
for (let dim = 1; dim <= PRECOMPUTED_MAX_DIM; dim++) {
	DIAGONAL_INDEX_TABLES.set(dim, buildDiagonalIndexTable(dim));
}

/**
 * Retrieve or lazily compute and memoize the diagonal index table for dimension n.
 * @param {number} n - Positive integer matrix dimension.
 * @returns {Uint32Array} Precomputed diagonal index table.
 */
function getDiagonalIndexTable(n) {
	let table = DIAGONAL_INDEX_TABLES.get(n);
	if (table === undefined) {
		table = buildDiagonalIndexTable(n);
		DIAGONAL_INDEX_TABLES.set(n, table);
	}
	return table;
}

/**
 * Build a collision-free canonical key for the diagonal elements of a Float64Array matrix.
 * Preserves IEEE-754 distinction between -0 and +0 as well as NaN / +/-Infinity.
 * @param {Float64Array} matrix - Flat row-major square matrix.
 * @param {Uint32Array} diagIndices - Precomputed diagonal index table of length n.
 * @returns {string} Canonical cache key.
 */
function buildMemoKey(matrix, diagIndices) {
	const n = diagIndices.length;
	const parts = new Array(n);
	for (let i = 0; i < n; i++) {
		const v = matrix[diagIndices[i]];
		parts[i] = v === 0 && 1 / v < 0 ? '-0' : String(v);
	}
	return `${n}:${parts.join(',')}`;
}

/**
 * Insert a trace result into the bounded LRU cache.
 * @param {string} key - Canonical diagonal key.
 * @param {number} value - Computed trace value.
 */
function setMemoCache(key, value) {
	if (TRACE_MEMO_CACHE.size >= MAX_MEMO_ENTRIES) {
		const oldestKey = TRACE_MEMO_CACHE.keys().next().value;
		TRACE_MEMO_CACHE.delete(oldestKey);
	}
	TRACE_MEMO_CACHE.set(key, value);
}

/**
 * Compute the trace (sum of main diagonal elements) of a square matrix stored
 * in row-major order inside a `Float64Array`, using precomputed diagonal index
 * lookup tables and bounded LRU result memoization.
 *
 * @param {Float64Array} matrix - Flat row-major square matrix of length `n * n`.
 * @param {number} [n] - Optional matrix dimension (number of rows/columns).
 *   When omitted, inferred as `Math.sqrt(matrix.length)` and validated to be a
 *   positive integer.
 * @returns {number} The trace of the matrix (`sum_{i=0}^{n-1} matrix[i * n + i]`).
 * @throws {TypeError} If `matrix` is not a `Float64Array`, or if `n` is provided
 *   and is not a number.
 * @throws {RangeError} If `matrix` is empty, if `n` is not a positive safe
 *   integer, or if `matrix.length !== n * n`.
 */
export function traceTypedMemo(matrix, n) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('Expected matrix to be a Float64Array');
	}

	const len = matrix.length;
	if (len === 0) {
		throw new RangeError('Matrix must not be empty');
	}

	let dim;
	if (n === undefined) {
		const inferred = Math.sqrt(len);
		if (!Number.isSafeInteger(inferred) || inferred * inferred !== len) {
			throw new RangeError(
				`Matrix length (${len}) must be a positive perfect square when n is omitted`,
			);
		}
		dim = inferred;
	} else {
		if (typeof n !== 'number') {
			throw new TypeError('Expected dimension n to be a number');
		}
		if (!Number.isSafeInteger(n) || n < 1) {
			throw new RangeError('Expected dimension n to be a positive safe integer');
		}
		if (len !== n * n) {
			throw new RangeError(
				`Matrix length (${len}) does not match n * n (${n * n}) for n = ${n}`,
			);
		}
		dim = n;
	}

	const diagIndices = getDiagonalIndexTable(dim);
	const cacheKey = buildMemoKey(matrix, diagIndices);

	if (TRACE_MEMO_CACHE.has(cacheKey)) {
		const cached = TRACE_MEMO_CACHE.get(cacheKey);
		// Refresh LRU recency.
		TRACE_MEMO_CACHE.delete(cacheKey);
		TRACE_MEMO_CACHE.set(cacheKey, cached);
		return cached;
	}

	let sum = matrix[diagIndices[0]];
	for (let i = 1; i < dim; i++) {
		sum += matrix[diagIndices[i]];
	}

	setMemoCache(cacheKey, sum);
	return sum;
}
