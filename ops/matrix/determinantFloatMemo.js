/**
 * Precomputed, table-driven, and memoized matrix determinant over IEEE-754 float64 Numbers.
 *
 * Strategy by matrix dimension `n`:
 * - `n === 0`: returns `1` (empty product convention).
 * - `n === 1`: returns `matrix[0][0]` (normalized so `-0` becomes `0`).
 * - `2 <= n <= 3`: table-driven Leibniz formula using precomputed permutation and parity tables.
 * - `4 <= n <= 10`: bottom-up bitmask dynamic programming (memoized minor table) accelerated by
 *   precomputed popcount and lowest-set-bit index lookup tables, avoiding divisions and preserving
 *   exact integer determinants up to `Number.MAX_SAFE_INTEGER`.
 * - `n > 10`: partial-pivoting LU decomposition with log-magnitude fallback to avoid spurious
 *   intermediate overflow/underflow.
 *
 * Additionally, results for `n >= 2` are memoized in a bounded LRU cache keyed by exact canonical
 * float64 matrix values so repeated queries return in O(n^2) key-lookup time.
 *
 * @module ops/matrix/determinantFloatMemo
 */

const LEIBNIZ_MAX_DIM = 3;
const MEMO_MAX_DIM = 10;
const MEMO_TABLE_SIZE = 1 << MEMO_MAX_DIM;
const MAX_CACHE_SIZE = 1024;

/**
 * Precompute all permutations of `[0..n-1]` and their Levi-Civita parity signs (`+1` or `-1`).
 *
 * @param {number} n - Matrix dimension.
 * @returns {{ count: number, cols: Int8Array, signs: Int8Array }}
 */
function buildPermutationTable(n) {
	let count = 1;
	for (let i = 2; i <= n; i++) {
		count *= i;
	}

	const cols = new Int8Array(count * n);
	const signs = new Int8Array(count);
	const current = new Int8Array(n);
	const used = new Uint8Array(n);
	let entryIndex = 0;

	function generate(depth, inversions) {
		if (depth === n) {
			const base = entryIndex * n;
			for (let i = 0; i < n; i++) {
				cols[base + i] = current[i];
			}
			signs[entryIndex] = (inversions & 1) === 0 ? 1 : -1;
			entryIndex++;
			return;
		}
		for (let col = 0; col < n; col++) {
			if (used[col]) continue;
			let addedInversions = 0;
			for (let prev = 0; prev < depth; prev++) {
				if (current[prev] > col) addedInversions++;
			}
			used[col] = 1;
			current[depth] = col;
			generate(depth + 1, inversions + addedInversions);
			used[col] = 0;
		}
	}

	generate(0, 0);
	return Object.freeze({ count, cols, signs });
}

/** Precomputed permutation tables for small dimensions (n = 2, 3). */
const PERMUTATION_TABLES = Object.freeze({
	2: buildPermutationTable(2),
	3: buildPermutationTable(3),
});

/** Precomputed popcount lookup table for bitmasks in `[0, 2^MEMO_MAX_DIM)`. */
const POPCOUNT_TABLE = new Uint8Array(MEMO_TABLE_SIZE);
for (let mask = 1; mask < MEMO_TABLE_SIZE; mask++) {
	POPCOUNT_TABLE[mask] = POPCOUNT_TABLE[mask >> 1] + (mask & 1);
}

/** Precomputed lookup table mapping a single-bit power of two `1 << c` to its bit index `c`. */
const LSB_INDEX_TABLE = new Int8Array((1 << (MEMO_MAX_DIM - 1)) + 1);
for (let bit = 0; bit < MEMO_MAX_DIM; bit++) {
	LSB_INDEX_TABLE[1 << bit] = bit;
}

/** Reusable bottom-up minor memoization table for `4 <= n <= MEMO_MAX_DIM`. */
const MINOR_MEMO = new Float64Array(MEMO_TABLE_SIZE);

/** Bounded LRU cache mapping canonical matrix keys to computed float64 determinants. */
const RESULT_CACHE = new Map();

/**
 * Normalize `-0` to `+0` while leaving all other numbers unchanged.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validate that `matrix` is a square 2D array of finite IEEE-754 float64 numbers.
 *
 * @param {unknown} matrix
 * @returns {number} Matrix dimension `n`.
 */
function validateMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array of finite numbers');
	}
	const n = matrix.length;
	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} to be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`Expected a square ${n}x${n} matrix, but row ${i} has length ${row.length}`,
			);
		}
		for (let j = 0; j < n; j++) {
			const val = row[j];
			if (typeof val !== 'number') {
				throw new TypeError(
					`Expected finite number at [${i}][${j}], received ${typeof val}`,
				);
			}
			if (!Number.isFinite(val)) {
				throw new RangeError(
					`Expected finite number at [${i}][${j}], received ${val}`,
				);
			}
		}
	}
	return n;
}

/**
 * Build a canonical cache key uniquely representing a validated `n x n` float64 matrix.
 *
 * @param {number[][]} matrix
 * @param {number} n
 * @returns {string}
 */
function buildCacheKey(matrix, n) {
	let key = `${n}:`;
	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		for (let j = 0; j < n; j++) {
			const val = row[j] === 0 ? 0 : row[j];
			key += i === 0 && j === 0 ? `${val}` : `,${val}`;
		}
	}
	return key;
}

/**
 * Retrieve a cached determinant and refresh its LRU position.
 *
 * @param {string} key
 * @returns {number | undefined}
 */
function cacheGet(key) {
	if (!RESULT_CACHE.has(key)) return undefined;
	const value = RESULT_CACHE.get(key);
	RESULT_CACHE.delete(key);
	RESULT_CACHE.set(key, value);
	return value;
}

/**
 * Store a determinant in the bounded LRU cache.
 *
 * @param {string} key
 * @param {number} value
 */
function cacheSet(key, value) {
	if (RESULT_CACHE.has(key)) {
		RESULT_CACHE.delete(key);
	} else if (RESULT_CACHE.size >= MAX_CACHE_SIZE) {
		const oldestKey = RESULT_CACHE.keys().next().value;
		RESULT_CACHE.delete(oldestKey);
	}
	RESULT_CACHE.set(key, value);
}

/**
 * Evaluate determinant for small matrices using the precomputed Leibniz permutation table.
 *
 * @param {number[][]} matrix
 * @param {number} n
 * @returns {number}
 */
function detLeibnizTable(matrix, n) {
	const table = PERMUTATION_TABLES[n];
	const { count, cols, signs } = table;
	let sum = 0;
	for (let p = 0; p < count; p++) {
		const base = p * n;
		let prod = signs[p];
		for (let row = 0; row < n; row++) {
			prod *= matrix[row][cols[base + row]];
		}
		sum += prod;
	}
	return normalizeZero(sum);
}

/**
 * Evaluate determinant for `4 <= n <= MEMO_MAX_DIM` using bottom-up bitmask DP
 * over memoized trailing minors and precomputed bit lookup tables.
 *
 * @param {number[][]} matrix
 * @param {number} n
 * @returns {number}
 */
function detBitmaskMemo(matrix, n) {
	const totalMasks = 1 << n;
	MINOR_MEMO[0] = 1;

	for (let mask = 1; mask < totalMasks; mask++) {
		const row = matrix[n - POPCOUNT_TABLE[mask]];
		let sum = 0;
		let sign = 1;
		let remaining = mask;
		while (remaining !== 0) {
			const lsb = remaining & -remaining;
			const col = LSB_INDEX_TABLE[lsb];
			sum += sign * row[col] * MINOR_MEMO[mask ^ lsb];
			sign = -sign;
			remaining ^= lsb;
		}
		MINOR_MEMO[mask] = sum;
	}

	return normalizeZero(MINOR_MEMO[totalMasks - 1]);
}

/**
 * Evaluate determinant for large matrices (`n > MEMO_MAX_DIM`) via partial-pivoting LU decomposition.
 * Uses a flat Float64Array working copy and falls back to log-magnitude accumulation if
 * intermediate products overflow or underflow.
 *
 * @param {number[][]} matrix
 * @param {number} n
 * @returns {number}
 */
function detLU(matrix, n) {
	const a = new Float64Array(n * n);
	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		const offset = i * n;
		for (let j = 0; j < n; j++) {
			a[offset + j] = row[j];
		}
	}

	let det = 1;
	let sign = 1;
	let logAbsDet = 0;
	let needsLogFallback = false;

	for (let k = 0; k < n; k++) {
		let pivotRow = k;
		let maxAbs = Math.abs(a[k * n + k]);
		for (let r = k + 1; r < n; r++) {
			const absVal = Math.abs(a[r * n + k]);
			if (absVal > maxAbs) {
				maxAbs = absVal;
				pivotRow = r;
			}
		}

		if (maxAbs === 0) {
			return 0;
		}

		if (pivotRow !== k) {
			const rowK = k * n;
			const rowP = pivotRow * n;
			for (let j = k; j < n; j++) {
				const tmp = a[rowK + j];
				a[rowK + j] = a[rowP + j];
				a[rowP + j] = tmp;
			}
			det = -det;
			sign = -sign;
		}

		const pivotOffset = k * n;
		const pivot = a[pivotOffset + k];
		if (!Number.isFinite(pivot)) {
			return pivot;
		}
		if (pivot < 0) {
			sign = -sign;
		}
		logAbsDet += Math.log(Math.abs(pivot));
		det *= pivot;
		if (!Number.isFinite(det) || det === 0) {
			needsLogFallback = true;
		}

		for (let i = k + 1; i < n; i++) {
			const rowI = i * n;
			const factor = a[rowI + k] / pivot;
			if (factor === 0) continue;
			for (let j = k + 1; j < n; j++) {
				a[rowI + j] -= factor * a[pivotOffset + j];
			}
		}
	}

	const result = needsLogFallback ? sign * Math.exp(logAbsDet) : det;
	return normalizeZero(result);
}

/**
 * Compute the determinant of a square matrix of IEEE-754 float64 numbers using a
 * precomputed, table-driven, and memoized implementation.
 *
 * @param {number[][]} matrix - Square `n x n` 2D array of finite float64 numbers.
 *   An empty `0 x 0` matrix (`[]`) has determinant `1`.
 * @returns {number} The determinant as an IEEE-754 float64 number (with `-0` normalized to `0`).
 * @throws {TypeError} If `matrix` is not a 2D array of numbers.
 * @throws {RangeError} If `matrix` is not square or contains non-finite numbers (`NaN`, `±Infinity`).
 */
export function determinantFloatMemo(matrix) {
	const n = validateMatrix(matrix);

	if (n === 0) return 1;
	if (n === 1) return normalizeZero(matrix[0][0]);

	const cacheKey = buildCacheKey(matrix, n);
	const cached = cacheGet(cacheKey);
	if (cached !== undefined) {
		return cached;
	}

	let result;
	if (n <= LEIBNIZ_MAX_DIM) {
		result = detLeibnizTable(matrix, n);
	} else if (n <= MEMO_MAX_DIM) {
		result = detBitmaskMemo(matrix, n);
	} else {
		result = detLU(matrix, n);
	}

	cacheSet(cacheKey, result);
	return result;
}
