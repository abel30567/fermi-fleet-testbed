/**
 * @fileoverview Square matrix inversion over flat row-major Float64Array inputs
 * using table-driven dimension dispatch, Gauss-Jordan elimination with partial
 * pivoting, and bounded LRU memoization.
 */

const SINGULAR_TOLERANCE = 1e-12;
const MAX_CACHE_ENTRIES = 256;

/**
 * Bounded LRU memoization cache mapping canonical matrix keys to defensive
 * Float64Array inverse buffers.
 * @type {Map<string, Float64Array>}
 */
const inverseCache = new Map();

/**
 * Normalizes negative zero to positive zero.
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Builds a canonical cache key for a validated square Float64Array matrix.
 * @param {Float64Array} matrix
 * @param {number} n
 * @returns {string}
 */
function buildCacheKey(matrix, n) {
	const parts = new Array(matrix.length);
	for (let i = 0; i < matrix.length; i++) {
		const v = matrix[i];
		parts[i] = v === 0 ? '0' : String(v);
	}
	return `${n}:${parts.join(',')}`;
}

/**
 * Looks up a cached inverse and refreshes its LRU position, returning a fresh copy.
 * @param {string} key
 * @returns {Float64Array | null}
 */
function getCachedInverse(key) {
	const cached = inverseCache.get(key);
	if (cached === undefined) {
		return null;
	}
	inverseCache.delete(key);
	inverseCache.set(key, cached);
	return new Float64Array(cached);
}

/**
 * Stores a defensive copy of a computed inverse in the bounded LRU cache.
 * @param {string} key
 * @param {Float64Array} inverse
 */
function setCachedInverse(key, inverse) {
	if (inverseCache.has(key)) {
		inverseCache.delete(key);
	} else if (inverseCache.size >= MAX_CACHE_ENTRIES) {
		const oldestKey = inverseCache.keys().next().value;
		inverseCache.delete(oldestKey);
	}
	inverseCache.set(key, new Float64Array(inverse));
}

/**
 * Computes the maximum absolute entry of a matrix.
 * @param {Float64Array} matrix
 * @returns {number}
 */
function maxAbsEntry(matrix) {
	let max = 0;
	for (let i = 0; i < matrix.length; i++) {
		const abs = Math.abs(matrix[i]);
		if (abs > max) {
			max = abs;
		}
	}
	return max;
}

/**
 * Specialized 1x1 matrix inverter.
 * @param {Float64Array} m
 * @returns {Float64Array}
 */
function invert1x1(m) {
	const a = m[0];
	if (a === 0) {
		throw new Error('Matrix is singular and cannot be inverted.');
	}
	const inv = 1 / a;
	if (!Number.isFinite(inv)) {
		throw new Error('Matrix is singular and cannot be inverted.');
	}
	const out = new Float64Array(1);
	out[0] = normalizeZero(inv);
	return out;
}

/**
 * Specialized 2x2 matrix inverter using closed-form adjugate formula.
 * @param {Float64Array} m
 * @returns {Float64Array}
 */
function invert2x2(m) {
	const a = m[0];
	const b = m[1];
	const c = m[2];
	const d = m[3];

	const scale = maxAbsEntry(m);
	const det = a * d - b * c;
	if (scale === 0 || Math.abs(det) <= SINGULAR_TOLERANCE * scale * scale) {
		throw new Error('Matrix is singular and cannot be inverted.');
	}

	const invDet = 1 / det;
	if (!Number.isFinite(invDet)) {
		throw new Error('Matrix is singular and cannot be inverted.');
	}

	const out = new Float64Array(4);
	out[0] = normalizeZero(d * invDet);
	out[1] = normalizeZero(-b * invDet);
	out[2] = normalizeZero(-c * invDet);
	out[3] = normalizeZero(a * invDet);
	return out;
}

/**
 * Specialized 3x3 matrix inverter using closed-form cofactor formula.
 * @param {Float64Array} m
 * @returns {Float64Array}
 */
function invert3x3(m) {
	const a00 = m[0], a01 = m[1], a02 = m[2];
	const a10 = m[3], a11 = m[4], a12 = m[5];
	const a20 = m[6], a21 = m[7], a22 = m[8];

	const c00 = a11 * a22 - a12 * a21;
	const c01 = a12 * a20 - a10 * a22;
	const c02 = a10 * a21 - a11 * a20;

	const det = a00 * c00 + a01 * c01 + a02 * c02;
	const scale = maxAbsEntry(m);
	if (scale === 0 || Math.abs(det) <= SINGULAR_TOLERANCE * scale * scale * scale) {
		throw new Error('Matrix is singular and cannot be inverted.');
	}

	const invDet = 1 / det;
	if (!Number.isFinite(invDet)) {
		throw new Error('Matrix is singular and cannot be inverted.');
	}

	const out = new Float64Array(9);
	out[0] = normalizeZero(c00 * invDet);
	out[1] = normalizeZero((a02 * a21 - a01 * a22) * invDet);
	out[2] = normalizeZero((a01 * a12 - a02 * a11) * invDet);

	out[3] = normalizeZero(c01 * invDet);
	out[4] = normalizeZero((a00 * a22 - a02 * a20) * invDet);
	out[5] = normalizeZero((a02 * a10 - a00 * a12) * invDet);

	out[6] = normalizeZero(c02 * invDet);
	out[7] = normalizeZero((a01 * a20 - a00 * a21) * invDet);
	out[8] = normalizeZero((a00 * a11 - a01 * a10) * invDet);
	return out;
}

/**
 * General n x n matrix inverter using Gauss-Jordan elimination with partial pivoting.
 * @param {Float64Array} m
 * @param {number} n
 * @returns {Float64Array}
 */
function invertGaussJordan(m, n) {
	const scale = maxAbsEntry(m);
	if (scale === 0) {
		throw new Error('Matrix is singular and cannot be inverted.');
	}
	const pivotThreshold = SINGULAR_TOLERANCE * scale;

	// Precompute row base offsets for fast table-driven indexing.
	const rowOffsets = new Int32Array(n);
	for (let r = 0; r < n; r++) {
		rowOffsets[r] = r * n;
	}

	const work = new Float64Array(m);
	const inv = new Float64Array(n * n);
	for (let i = 0; i < n; i++) {
		inv[rowOffsets[i] + i] = 1;
	}

	for (let col = 0; col < n; col++) {
		// Partial pivoting: select row with maximum absolute value in current column.
		let pivotRow = col;
		let maxPivot = Math.abs(work[rowOffsets[col] + col]);
		for (let row = col + 1; row < n; row++) {
			const candidate = Math.abs(work[rowOffsets[row] + col]);
			if (candidate > maxPivot) {
				maxPivot = candidate;
				pivotRow = row;
			}
		}

		if (maxPivot <= pivotThreshold) {
			throw new Error('Matrix is singular and cannot be inverted.');
		}

		const colRowOffset = rowOffsets[col];
		if (pivotRow !== col) {
			const pivotRowOffset = rowOffsets[pivotRow];
			for (let j = 0; j < n; j++) {
				const tmpWork = work[colRowOffset + j];
				work[colRowOffset + j] = work[pivotRowOffset + j];
				work[pivotRowOffset + j] = tmpWork;

				const tmpInv = inv[colRowOffset + j];
				inv[colRowOffset + j] = inv[pivotRowOffset + j];
				inv[pivotRowOffset + j] = tmpInv;
			}
		}

		const pivot = work[colRowOffset + col];
		const invPivot = 1 / pivot;
		if (!Number.isFinite(invPivot)) {
			throw new Error('Matrix is singular and cannot be inverted.');
		}

		// Scale pivot row so pivot entry becomes 1.
		for (let j = col; j < n; j++) {
			work[colRowOffset + j] *= invPivot;
		}
		work[colRowOffset + col] = 1;
		for (let j = 0; j < n; j++) {
			inv[colRowOffset + j] *= invPivot;
		}

		// Eliminate current column across all other rows.
		for (let row = 0; row < n; row++) {
			if (row === col) {
				continue;
			}
			const rOffset = rowOffsets[row];
			const factor = work[rOffset + col];
			if (factor === 0) {
				continue;
			}
			work[rOffset + col] = 0;
			for (let j = col + 1; j < n; j++) {
				work[rOffset + j] -= factor * work[colRowOffset + j];
			}
			for (let j = 0; j < n; j++) {
				inv[rOffset + j] -= factor * inv[colRowOffset + j];
			}
		}
	}

	for (let i = 0; i < inv.length; i++) {
		if (!Number.isFinite(inv[i])) {
			throw new Error('Matrix is singular and cannot be inverted.');
		}
		inv[i] = normalizeZero(inv[i]);
	}

	return inv;
}

/**
 * Table-driven dispatch map for specialized small matrix dimensions.
 * @type {Readonly<Record<number, (matrix: Float64Array, n: number) => Float64Array>>}
 */
const DIMENSION_DISPATCH_TABLE = Object.freeze({
	1: invert1x1,
	2: invert2x2,
	3: invert3x3,
});

/**
 * Computes the inverse of a square matrix represented as a flat row-major
 * `Float64Array`, using table-driven dispatch for small sizes (1x1, 2x2, 3x3),
 * Gauss-Jordan elimination with partial pivoting for larger sizes, and
 * bounded LRU memoization.
 *
 * Always returns a new `Float64Array` instance so callers cannot mutate the
 * memoized cache.
 *
 * @param {Float64Array} matrix - Flat row-major square matrix of finite numbers.
 * @param {number} [n] - Optional matrix dimension (rows/columns). Inferred as `Math.sqrt(matrix.length)` if omitted.
 * @returns {Float64Array} A new flat row-major `Float64Array` containing the inverse matrix.
 * @throws {TypeError} If `matrix` is not a `Float64Array` or `n` is provided and not a number.
 * @throws {RangeError} If `matrix` is empty, non-square, contains non-finite values, or `n` is invalid/mismatched.
 * @throws {Error} If the matrix is singular (non-invertible).
 */
export function inverseTypedMemo(matrix, n) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('Expected matrix to be a Float64Array.');
	}

	const len = matrix.length;
	if (len === 0) {
		throw new RangeError('Matrix cannot be empty.');
	}

	let dim;
	if (n === undefined) {
		const root = Math.sqrt(len);
		if (!Number.isInteger(root) || root * root !== len) {
			throw new RangeError(`Matrix length ${len} is not a perfect square.`);
		}
		dim = root;
	} else {
		if (typeof n !== 'number' || Number.isNaN(n)) {
			throw new TypeError('Dimension n must be a valid integer.');
		}
		if (!Number.isInteger(n) || n <= 0) {
			throw new RangeError('Dimension n must be a positive integer.');
		}
		if (n * n !== len) {
			throw new RangeError(`Matrix length ${len} does not match n*n (${n * n}).`);
		}
		dim = n;
	}

	for (let i = 0; i < len; i++) {
		if (!Number.isFinite(matrix[i])) {
			throw new RangeError(`Matrix contains non-finite value at index ${i}.`);
		}
	}

	const key = buildCacheKey(matrix, dim);
	const cached = getCachedInverse(key);
	if (cached !== null) {
		return cached;
	}

	const solver = DIMENSION_DISPATCH_TABLE[dim] ?? invertGaussJordan;
	const result = solver(matrix, dim);
	setCachedInverse(key, result);
	return result;
}
