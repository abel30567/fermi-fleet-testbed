/**
 * @fileoverview Table-driven and memoized tensor product (outer / Kronecker product)
 * over `Float64Array` inputs.
 */

/** Maximum number of memoized result entries retained in the LRU cache. */
const MAX_RESULT_CACHE_ENTRIES = 256;

/** Maximum output element count eligible for result memoization. */
const MAX_MEMO_ELEMENTS = 65536;

/** Maximum output element count eligible for precomputed index lookup tables. */
const MAX_TABLE_ELEMENTS = 4096;

/** Upper bound on output TypedArray length to guard against integer/memory overflow. */
const MAX_OUTPUT_ELEMENTS = 134_217_728; // 2^27 (~1 GiB as Float64Array)

/** Maximum number of shape index tables cached in the LRU table store. */
const MAX_INDEX_TABLE_ENTRIES = 128;

/**
 * Bounded LRU cache mapping canonical input keys to precomputed `Float64Array` outputs.
 * @type {Map<string, Float64Array>}
 */
const resultCache = new Map();

/**
 * Bounded LRU cache mapping `"m,n"` shape keys to precomputed row/column index tables.
 * @type {Map<string, { rowIdx: Uint32Array, colIdx: Uint32Array }>}
 */
const indexTableCache = new Map();

/**
 * Builds precomputed flat row and column index lookup tables for an `m x n` tensor product.
 *
 * @param {number} m - Length of the left operand.
 * @param {number} n - Length of the right operand.
 * @returns {{ rowIdx: Uint32Array, colIdx: Uint32Array }}
 */
function buildIndexTable(m, n) {
	const len = m * n;
	const rowIdx = new Uint32Array(len);
	const colIdx = new Uint32Array(len);
	let k = 0;
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			rowIdx[k] = i;
			colIdx[k] = j;
			k++;
		}
	}
	return { rowIdx, colIdx };
}

// Eagerly precompute index lookup tables for common small shapes (1x1 through 4x4).
for (let m = 1; m <= 4; m++) {
	for (let n = 1; n <= 4; n++) {
		indexTableCache.set(`${m},${n}`, buildIndexTable(m, n));
	}
}

/**
 * Retrieves or computes the precomputed index table for shape `(m, n)`.
 *
 * @param {number} m - Length of the left operand.
 * @param {number} n - Length of the right operand.
 * @returns {{ rowIdx: Uint32Array, colIdx: Uint32Array }}
 */
function getIndexTable(m, n) {
	const key = `${m},${n}`;
	const existing = indexTableCache.get(key);
	if (existing !== undefined) {
		indexTableCache.delete(key);
		indexTableCache.set(key, existing);
		return existing;
	}
	const table = buildIndexTable(m, n);
	if (indexTableCache.size >= MAX_INDEX_TABLE_ENTRIES) {
		const oldestKey = indexTableCache.keys().next().value;
		indexTableCache.delete(oldestKey);
	}
	indexTableCache.set(key, table);
	return table;
}

/**
 * Encodes a `Float64Array` into an exact IEEE-754 bit-level canonical key string.
 * Preserves `-0` vs `+0`, subnormals, `Infinity`, and `NaN` bit patterns.
 *
 * @param {Float64Array} arr - Input typed array.
 * @returns {string}
 */
function encodeFloat64Key(arr) {
	const n = arr.length;
	if (n === 0) {
		return '0:';
	}
	const bits = new BigUint64Array(arr.buffer, arr.byteOffset, n);
	const parts = new Array(n);
	for (let i = 0; i < n; i++) {
		parts[i] = bits[i].toString(36);
	}
	return `${n}:${parts.join(',')}`;
}

/**
 * Validates that a value is a non-detached `Float64Array`.
 *
 * @param {unknown} value - Candidate argument.
 * @param {number} index - Zero-based parameter index for error reporting.
 * @throws {TypeError} If `value` is not a `Float64Array` or its buffer is detached.
 */
function assertFloat64Array(value, index) {
	if (!(value instanceof Float64Array)) {
		throw new TypeError(
			`tensorProductTypedMemo: argument ${index} must be a Float64Array`
		);
	}
	if (value.buffer.detached) {
		throw new TypeError(
			`tensorProductTypedMemo: argument ${index} has a detached ArrayBuffer`
		);
	}
}

/**
 * Computes the binary tensor product `a ⊗ b` of two `Float64Array`s using
 * precomputed index lookup tables and bounded LRU result memoization.
 *
 * @param {Float64Array} a - Left operand of length `m`.
 * @param {Float64Array} b - Right operand of length `n`.
 * @returns {Float64Array} Flat row-major `Float64Array` of length `m * n`.
 * @throws {RangeError} If `m * n` exceeds `MAX_OUTPUT_ELEMENTS`.
 */
function binaryTensorProductMemo(a, b) {
	const m = a.length;
	const n = b.length;

	if (m === 0 || n === 0) {
		return new Float64Array(0);
	}

	const totalLen = m * n;
	if (!Number.isSafeInteger(totalLen) || totalLen > MAX_OUTPUT_ELEMENTS) {
		throw new RangeError(
			`tensorProductTypedMemo: output length ${totalLen} exceeds maximum supported size ${MAX_OUTPUT_ELEMENTS}`
		);
	}

	const canMemoize = totalLen <= MAX_MEMO_ELEMENTS;
	let cacheKey = '';
	if (canMemoize) {
		cacheKey = `${encodeFloat64Key(a)}|${encodeFloat64Key(b)}`;
		const cached = resultCache.get(cacheKey);
		if (cached !== undefined) {
			resultCache.delete(cacheKey);
			resultCache.set(cacheKey, cached);
			return cached.slice();
		}
	}

	const out = new Float64Array(totalLen);

	if (totalLen <= MAX_TABLE_ELEMENTS) {
		const { rowIdx, colIdx } = getIndexTable(m, n);
		for (let k = 0; k < totalLen; k++) {
			out[k] = a[rowIdx[k]] * b[colIdx[k]];
		}
	} else {
		for (let i = 0; i < m; i++) {
			const ai = a[i];
			const rowOffset = i * n;
			for (let j = 0; j < n; j++) {
				out[rowOffset + j] = ai * b[j];
			}
		}
	}

	if (canMemoize) {
		if (resultCache.size >= MAX_RESULT_CACHE_ENTRIES) {
			const oldestKey = resultCache.keys().next().value;
			resultCache.delete(oldestKey);
		}
		resultCache.set(cacheKey, out.slice());
	}

	return out;
}

/**
 * Computes the tensor product (outer / Kronecker product) over `Float64Array` inputs
 * using a table-driven, precomputed-index, and LRU-memoized implementation.
 *
 * For two inputs `a` (length `m`) and `b` (length `n`), returns a row-major
 * `Float64Array` of length `m * n` where `result[i * n + j] = a[i] * b[j]`.
 * When more than two `Float64Array` inputs are provided, reduces left-to-right
 * associatively: `((a ⊗ b) ⊗ c) ...`.
 *
 * @param {Float64Array} a - First `Float64Array` operand.
 * @param {Float64Array} b - Second `Float64Array` operand.
 * @param {...Float64Array} rest - Optional additional `Float64Array` operands.
 * @returns {Float64Array} Resulting tensor product as a new `Float64Array`.
 * @throws {TypeError} If fewer than two arguments are passed or any argument is not a valid `Float64Array`.
 * @throws {RangeError} If the resulting tensor product exceeds the maximum supported length.
 */
export function tensorProductTypedMemo(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			'tensorProductTypedMemo: at least two Float64Array arguments are required'
		);
	}

	assertFloat64Array(a, 0);
	assertFloat64Array(b, 1);
	for (let i = 0; i < rest.length; i++) {
		assertFloat64Array(rest[i], i + 2);
	}

	let acc = binaryTensorProductMemo(a, b);
	for (let i = 0; i < rest.length; i++) {
		acc = binaryTensorProductMemo(acc, rest[i]);
	}
	return acc;
}
