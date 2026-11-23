/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator of the rational number.
 * @property {bigint} den - Non-zero denominator of the rational number.
 */

const GCD_TABLE_MAX = 64;
const GCD_TABLE_STRIDE = GCD_TABLE_MAX + 1;

/**
 * Precomputed small-integer GCD lookup table for values in [0, 64].
 * Indexed as `GCD_TABLE[a * GCD_TABLE_STRIDE + b]`.
 */
const GCD_TABLE = (() => {
	const table = new Uint8Array(GCD_TABLE_STRIDE * GCD_TABLE_STRIDE);
	for (let a = 0; a <= GCD_TABLE_MAX; a++) {
		for (let b = 0; b <= GCD_TABLE_MAX; b++) {
			let x = a;
			let y = b;
			while (y !== 0) {
				const t = x % y;
				x = y;
				y = t;
			}
			table[a * GCD_TABLE_STRIDE + b] = x;
		}
	}
	return table;
})();

const GCD_LIMIT_BIGINT = BigInt(GCD_TABLE_MAX);
const ZERO_RATIONAL = Object.freeze({ num: 0n, den: 1n });

/**
 * Bounded canonical memoization caches for matrix pairs and row-column dot products.
 */
const MAX_MATRIX_CACHE_ENTRIES = 256;
const MAX_DOT_CACHE_ENTRIES = 2048;

/** @type {Map<string, ReadonlyArray<ReadonlyArray<Readonly<Rational>>>>} */
const matrixPairCache = new Map();

/** @type {Map<string, Readonly<Rational>>} */
const dotProductCache = new Map();

/**
 * Compute greatest common divisor of two BigInts using the precomputed small-GCD
 * lookup table when values fall within range.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;

	while (y !== 0n) {
		if (x <= GCD_LIMIT_BIGINT && y <= GCD_LIMIT_BIGINT) {
			return BigInt(GCD_TABLE[Number(x) * GCD_TABLE_STRIDE + Number(y)]);
		}
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

/**
 * Reduce a rational (num / den) to canonical lowest terms with positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Readonly<Rational>}
 */
function reduceRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be 0n');
	}
	if (num === 0n) {
		return ZERO_RATIONAL;
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcdBigInt(n, d);
	return Object.freeze({ num: n / g, den: d / g });
}

/**
 * Validate and normalize a single rational entry.
 *
 * @param {unknown} entry
 * @param {string} label
 * @param {number} rowIdx
 * @param {number} colIdx
 * @returns {Readonly<Rational>}
 */
function normalizeEntry(entry, label, rowIdx, colIdx) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(
			`${label}[${rowIdx}][${colIdx}] must be a rational object {num: bigint, den: bigint}`,
		);
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (entry);
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`${label}[${rowIdx}][${colIdx}] must have BigInt num and den properties`,
		);
	}
	if (den === 0n) {
		throw new RangeError(
			`${label}[${rowIdx}][${colIdx}] has zero denominator (0n)`,
		);
	}
	return reduceRational(num, den);
}

/**
 * Validate a 2D rational matrix and return its dimensions and normalized row table.
 *
 * @param {unknown} matrix
 * @param {string} label
 * @returns {{ rows: number, cols: number, table: Readonly<Rational>[][], rowKeys: string[] }}
 */
function normalizeRowTable(matrix, label) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${label} must be a 2D array of rational objects`);
	}
	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError(`${label} must be a non-empty matrix`);
	}

	let cols = -1;
	/** @type {Readonly<Rational>[][]} */
	const table = new Array(rows);
	/** @type {string[]} */
	const rowKeys = new Array(rows);

	for (let i = 0; i < rows; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`${label}[${i}] must be an array`);
		}
		if (i === 0) {
			cols = row.length;
			if (cols === 0) {
				throw new RangeError(`${label} rows must be non-empty`);
			}
		} else if (row.length !== cols) {
			throw new RangeError(
				`${label} must be rectangular: row ${i} has length ${row.length}, expected ${cols}`,
			);
		}

		/** @type {Readonly<Rational>[]} */
		const normRow = new Array(cols);
		/** @type {string[]} */
		const parts = new Array(cols);
		for (let j = 0; j < cols; j++) {
			const r = normalizeEntry(row[j], label, i, j);
			normRow[j] = r;
			parts[j] = `${r.num}/${r.den}`;
		}
		table[i] = normRow;
		rowKeys[i] = parts.join(',');
	}

	return { rows, cols, table, rowKeys };
}

/**
 * Build a pre-normalized transposed column table and canonical column keys from matrix B.
 *
 * @param {unknown} matrix
 * @param {string} label
 * @returns {{ rows: number, cols: number, colTable: Readonly<Rational>[][], colKeys: string[] }}
 */
function normalizeColumnTable(matrix, label) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${label} must be a 2D array of rational objects`);
	}
	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError(`${label} must be a non-empty matrix`);
	}

	let cols = -1;
	/** @type {Readonly<Rational>[][]} */
	let colTable = [];
	/** @type {string[][]} */
	let colKeyParts = [];

	for (let i = 0; i < rows; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`${label}[${i}] must be an array`);
		}
		if (i === 0) {
			cols = row.length;
			if (cols === 0) {
				throw new RangeError(`${label} rows must be non-empty`);
			}
			colTable = Array.from({ length: cols }, () => new Array(rows));
			colKeyParts = Array.from({ length: cols }, () => new Array(rows));
		} else if (row.length !== cols) {
			throw new RangeError(
				`${label} must be rectangular: row ${i} has length ${row.length}, expected ${cols}`,
			);
		}

		for (let j = 0; j < cols; j++) {
			const r = normalizeEntry(row[j], label, i, j);
			colTable[j][i] = r;
			colKeyParts[j][i] = `${r.num}/${r.den}`;
		}
	}

	const colKeys = colKeyParts.map((parts) => parts.join(','));
	return { rows, cols, colTable, colKeys };
}

/**
 * Exact product of two reduced rationals using cross-cancellation.
 *
 * @param {Readonly<Rational>} a
 * @param {Readonly<Rational>} b
 * @returns {Readonly<Rational>}
 */
function mulReduced(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return ZERO_RATIONAL;
	}
	const g1 = gcdBigInt(a.num, b.den);
	const g2 = gcdBigInt(b.num, a.den);
	const num = (a.num / g1) * (b.num / g2);
	const den = (a.den / g2) * (b.den / g1);
	return Object.freeze({ num, den });
}

/**
 * Exact sum of two reduced rationals with denominator GCD scaling.
 *
 * @param {Readonly<Rational>} a
 * @param {Readonly<Rational>} b
 * @returns {Readonly<Rational>}
 */
function addReduced(a, b) {
	if (a.num === 0n) {
		return b;
	}
	if (b.num === 0n) {
		return a;
	}
	const g = gcdBigInt(a.den, b.den);
	const aDenDivG = a.den / g;
	const bDenDivG = b.den / g;
	const num = a.num * bDenDivG + b.num * aDenDivG;
	if (num === 0n) {
		return ZERO_RATIONAL;
	}
	const den = aDenDivG * b.den;
	return reduceRational(num, den);
}

/**
 * Compute and memoize the exact rational dot product of a normalized row and column.
 *
 * @param {Readonly<Rational>[]} row
 * @param {string} rowKey
 * @param {Readonly<Rational>[]} col
 * @param {string} colKey
 * @returns {Readonly<Rational>}
 */
function dotProductMemo(row, rowKey, col, colKey) {
	const key = `${rowKey}|${colKey}`;
	const cached = dotProductCache.get(key);
	if (cached !== undefined) {
		return cached;
	}

	let acc = ZERO_RATIONAL;
	for (let k = 0; k < row.length; k++) {
		const term = mulReduced(row[k], col[k]);
		if (term.num !== 0n) {
			acc = addReduced(acc, term);
		}
	}

	if (dotProductCache.size >= MAX_DOT_CACHE_ENTRIES) {
		const oldestKey = dotProductCache.keys().next().value;
		if (oldestKey !== undefined) {
			dotProductCache.delete(oldestKey);
		}
	}
	dotProductCache.set(key, acc);
	return acc;
}

/**
 * Return a fresh mutable deep clone of a cached rational matrix so callers cannot
 * mutate internal memoized state.
 *
 * @param {ReadonlyArray<ReadonlyArray<Readonly<Rational>>>} matrix
 * @returns {Rational[][]}
 */
function cloneMatrix(matrix) {
	const rows = matrix.length;
	const out = new Array(rows);
	for (let i = 0; i < rows; i++) {
		const srcRow = matrix[i];
		const cols = srcRow.length;
		const dstRow = new Array(cols);
		for (let j = 0; j < cols; j++) {
			const cell = srcRow[j];
			dstRow[j] = { num: cell.num, den: cell.den };
		}
		out[i] = dstRow;
	}
	return out;
}

/**
 * Multiply two matrices of exact rational numbers `{ num: bigint, den: bigint }`
 * using a table-driven, pre-normalized, and memoized implementation.
 *
 * Algorithm highlights:
 * - Precomputes a small-integer GCD lookup table for fast rational reduction.
 * - Validates and normalizes `A` into a canonical row table and `B` into a
 *   transposed canonical column table once per call.
 * - Memoizes both canonical matrix-pair products and individual row-column dot
 *   products in bounded caches; returns fresh deep copies so external mutation
 *   never corrupts cached entries.
 *
 * @param {Rational[][]} A - Left matrix of shape `m x k`.
 * @param {Rational[][]} B - Right matrix of shape `k x n`.
 * @returns {Rational[][]} Exact product matrix `A * B` of shape `m x n`, with
 *   every entry reduced to lowest terms (`den > 0n`, zero represented as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `A` or `B` is not a 2D array of valid `{ num: bigint, den: bigint }` objects.
 * @throws {RangeError} If `A` or `B` is empty, jagged, has incompatible inner dimensions,
 *   or contains a rational with denominator `0n`.
 */
export function matMulRationalMemo(A, B) {
	const normA = normalizeRowTable(A, 'A');
	const normB = normalizeColumnTable(B, 'B');

	if (normA.cols !== normB.rows) {
		throw new RangeError(
			`Incompatible matrix dimensions: A is ${normA.rows}x${normA.cols}, B is ${normB.rows}x${normB.cols}`,
		);
	}

	const pairKey = `${normA.rows}x${normA.cols}:${normA.rowKeys.join(';')}*${normB.rows}x${normB.cols}:${normB.colKeys.join(';')}`;
	const cachedMatrix = matrixPairCache.get(pairKey);
	if (cachedMatrix !== undefined) {
		return cloneMatrix(cachedMatrix);
	}

	/** @type {ReadonlyArray<Readonly<Rational>>[]} */
	const result = new Array(normA.rows);
	for (let i = 0; i < normA.rows; i++) {
		const rowA = normA.table[i];
		const rowKeyA = normA.rowKeys[i];
		/** @type {Readonly<Rational>[]} */
		const resRow = new Array(normB.cols);
		for (let j = 0; j < normB.cols; j++) {
			resRow[j] = dotProductMemo(rowA, rowKeyA, normB.colTable[j], normB.colKeys[j]);
		}
		result[i] = Object.freeze(resRow);
	}

	const frozenResult = Object.freeze(result);
	if (matrixPairCache.size >= MAX_MATRIX_CACHE_ENTRIES) {
		const oldestKey = matrixPairCache.keys().next().value;
		if (oldestKey !== undefined) {
			matrixPairCache.delete(oldestKey);
		}
	}
	matrixPairCache.set(pairKey, frozenResult);

	return cloneMatrix(frozenResult);
}
