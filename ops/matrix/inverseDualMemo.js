/**
 * @fileoverview Table-driven, memoized matrix inverse over dual numbers.
 *
 * A dual number `{ v, d }` represents `v + ε·d` where `ε² = 0`, carrying a
 * forward-mode first derivative `d` alongside its primal value `v`.
 *
 * For a square matrix of dual numbers `A = V + ε·D`, `A` is invertible if and
 * only if its primal matrix `V` is invertible, in which case:
 *
 *     A⁻¹ = V⁻¹ - ε · (V⁻¹ · D · V⁻¹)
 *
 * Small dimensions (`1×1`, `2×2`, `3×3`) are dispatched via a precomputed
 * table of specialized solvers backed by precomputed determinant and cofactor
 * index/sign tables. General `N×N` matrices (`N ≥ 4`) use Gauss-Jordan
 * elimination with partial pivoting. Results are cached in a bounded LRU map
 * and returned as fresh deep copies to preserve cache isolation.
 *
 * @module ops/matrix/inverseDualMemo
 */

/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (must be finite).
 * @property {number} d - Dual / forward-mode derivative component (must be finite).
 */

/** Relative tolerance used to detect singular or near-singular primal matrices. */
const SINGULARITY_EPS = 1e-12;

/** Maximum number of entries retained in the bounded LRU memoization cache. */
const MAX_CACHE_SIZE = 256;

/**
 * Precomputed 2×2 determinant term table: `[r0, c0, r1, c1, sign]`.
 * @type {ReadonlyArray<readonly [number, number, number, number, number]>}
 */
const DET_TABLE_2X2 = Object.freeze([
	Object.freeze([0, 0, 1, 1, 1]),
	Object.freeze([0, 1, 1, 0, -1]),
]);

/**
 * Precomputed 2×2 adjugate index/sign table: `[outRow, outCol, srcRow, srcCol, sign]`.
 * @type {ReadonlyArray<readonly [number, number, number, number, number]>}
 */
const ADJUGATE_TABLE_2X2 = Object.freeze([
	Object.freeze([0, 0, 1, 1, 1]),
	Object.freeze([0, 1, 0, 1, -1]),
	Object.freeze([1, 0, 1, 0, -1]),
	Object.freeze([1, 1, 0, 0, 1]),
]);

/**
 * Precomputed 3×3 determinant permutation table (Levi-Civita): `[c0, c1, c2, sign]`.
 * @type {ReadonlyArray<readonly [number, number, number, number]>}
 */
const DET_TABLE_3X3 = Object.freeze([
	Object.freeze([0, 1, 2, 1]),
	Object.freeze([1, 2, 0, 1]),
	Object.freeze([2, 0, 1, 1]),
	Object.freeze([0, 2, 1, -1]),
	Object.freeze([1, 0, 2, -1]),
	Object.freeze([2, 1, 0, -1]),
]);

/**
 * Precomputed 3×3 adjugate (transposed cofactor) minor table:
 * `[outRow, outCol, r0, r1, c0, c1, sign]` where
 * `adj[outRow][outCol] = sign * (V[r0][c0] * V[r1][c1] - V[r0][c1] * V[r1][c0])`.
 * @type {ReadonlyArray<readonly [number, number, number, number, number, number, number]>}
 */
const ADJUGATE_TABLE_3X3 = Object.freeze([
	Object.freeze([0, 0, 1, 2, 1, 2, 1]),
	Object.freeze([0, 1, 0, 2, 1, 2, -1]),
	Object.freeze([0, 2, 0, 1, 1, 2, 1]),
	Object.freeze([1, 0, 1, 2, 0, 2, -1]),
	Object.freeze([1, 1, 0, 2, 0, 2, 1]),
	Object.freeze([1, 2, 0, 1, 0, 2, -1]),
	Object.freeze([2, 0, 1, 2, 0, 1, 1]),
	Object.freeze([2, 1, 0, 2, 0, 1, -1]),
	Object.freeze([2, 2, 0, 1, 0, 1, 1]),
]);

/**
 * Bounded LRU cache mapping canonical matrix keys to cached dual-matrix inverses.
 * @type {Map<string, DualNumber[][]>}
 */
const memoCache = new Map();

/**
 * Normalize `-0` to `0` so outputs have canonical IEEE-754 zeros.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Create a fresh deep copy of a 2D matrix of dual numbers.
 * @param {DualNumber[][]} matrix
 * @returns {DualNumber[][]}
 */
function cloneDualMatrix(matrix) {
	const n = matrix.length;
	const copy = new Array(n);
	for (let i = 0; i < n; i++) {
		const srcRow = matrix[i];
		const dstRow = new Array(n);
		for (let j = 0; j < n; j++) {
			const cell = srcRow[j];
			dstRow[j] = { v: cell.v, d: cell.d };
		}
		copy[i] = dstRow;
	}
	return copy;
}

/**
 * Validate input matrix `M`, extract primal matrix `V`, derivative matrix `D`,
 * maximum primal magnitude `maxAbs`, and canonical cache key.
 *
 * @param {unknown} M
 * @returns {{ n: number, V: number[][], D: number[][], maxAbs: number, key: string }}
 */
function validateAndExtract(M) {
	if (!Array.isArray(M)) {
		throw new TypeError('Input matrix must be a non-empty square 2D array of dual numbers');
	}
	const n = M.length;
	if (n === 0) {
		throw new RangeError('Input matrix must be non-empty');
	}

	const V = new Array(n);
	const D = new Array(n);
	const keyParts = new Array(n * n * 2 + 1);
	keyParts[0] = String(n);

	let maxAbs = 0;
	let k = 1;

	for (let i = 0; i < n; i++) {
		const row = M[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Row ${i} must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(`Input matrix must be square (expected row ${i} length ${n}, got ${row.length})`);
		}

		const vRow = new Array(n);
		const dRow = new Array(n);

		for (let j = 0; j < n; j++) {
			const entry = row[j];
			if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
				throw new TypeError(`Entry at (${i}, ${j}) must be a dual number object { v, d }`);
			}
			const { v, d } = entry;
			if (typeof v !== 'number' || typeof d !== 'number') {
				throw new TypeError(`Entry at (${i}, ${j}) must have numeric v and d properties`);
			}
			if (!Number.isFinite(v) || !Number.isFinite(d)) {
				throw new RangeError(`Entry at (${i}, ${j}) must have finite v and d values`);
			}

			const nv = normalizeZero(v);
			const nd = normalizeZero(d);
			vRow[j] = nv;
			dRow[j] = nd;

			const absV = Math.abs(nv);
			if (absV > maxAbs) {
				maxAbs = absV;
			}

			keyParts[k++] = String(nv);
			keyParts[k++] = String(nd);
		}

		V[i] = vRow;
		D[i] = dRow;
	}

	return { n, V, D, maxAbs, key: keyParts.join(',') };
}

/**
 * Invert a 1×1 primal matrix.
 * @param {number[][]} V
 * @param {number} maxAbs
 * @returns {number[][]}
 */
function invertPrimal1x1(V, maxAbs) {
	if (maxAbs === 0) {
		throw new RangeError('Matrix is singular');
	}
	const inv = 1 / V[0][0];
	if (!Number.isFinite(inv)) {
		throw new RangeError('Matrix is singular or inverse overflowed');
	}
	return [[inv]];
}

/**
 * Invert a 2×2 primal matrix using precomputed determinant and adjugate tables.
 * @param {number[][]} V
 * @param {number} maxAbs
 * @returns {number[][]}
 */
function invertPrimal2x2(V, maxAbs) {
	if (maxAbs === 0) {
		throw new RangeError('Matrix is singular');
	}

	// Normalize if squaring maxAbs would risk overflow or subnormal underflow.
	const needsScale = maxAbs < 1e-100 || maxAbs > 1e100;
	const scaleSq = needsScale ? 1 : maxAbs * maxAbs;
	const s = needsScale ? maxAbs : 1;
	const W = needsScale
		? [
			[V[0][0] / s, V[0][1] / s],
			[V[1][0] / s, V[1][1] / s],
		]
		: V;

	let det = 0;
	for (let t = 0; t < DET_TABLE_2X2.length; t++) {
		const [r0, c0, r1, c1, sign] = DET_TABLE_2X2[t];
		det += sign * W[r0][c0] * W[r1][c1];
	}

	const tol = needsScale ? SINGULARITY_EPS : SINGULARITY_EPS * scaleSq;
	if (!Number.isFinite(det) || Math.abs(det) <= tol) {
		throw new RangeError('Matrix is singular or nearly singular');
	}

	const invDet = 1 / det;
	const inv = [[0, 0], [0, 0]];
	for (let t = 0; t < ADJUGATE_TABLE_2X2.length; t++) {
		const [outRow, outCol, srcRow, srcCol, sign] = ADJUGATE_TABLE_2X2[t];
		const val = (sign * W[srcRow][srcCol] * invDet) / s;
		if (!Number.isFinite(val)) {
			throw new RangeError('Matrix inverse overflowed to a non-finite value');
		}
		inv[outRow][outCol] = val;
	}
	return inv;
}

/**
 * Invert a 3×3 primal matrix using precomputed determinant and adjugate tables.
 * @param {number[][]} V
 * @param {number} maxAbs
 * @returns {number[][]}
 */
function invertPrimal3x3(V, maxAbs) {
	if (maxAbs === 0) {
		throw new RangeError('Matrix is singular');
	}

	// Normalize if cubing maxAbs would risk overflow or subnormal underflow.
	const needsScale = maxAbs < 1e-70 || maxAbs > 1e70;
	const scaleCube = needsScale ? 1 : maxAbs * maxAbs * maxAbs;
	const s = needsScale ? maxAbs : 1;
	const W = needsScale
		? [
			[V[0][0] / s, V[0][1] / s, V[0][2] / s],
			[V[1][0] / s, V[1][1] / s, V[1][2] / s],
			[V[2][0] / s, V[2][1] / s, V[2][2] / s],
		]
		: V;

	let det = 0;
	for (let t = 0; t < DET_TABLE_3X3.length; t++) {
		const [c0, c1, c2, sign] = DET_TABLE_3X3[t];
		det += sign * W[0][c0] * W[1][c1] * W[2][c2];
	}

	const tol = needsScale ? SINGULARITY_EPS : SINGULARITY_EPS * scaleCube;
	if (!Number.isFinite(det) || Math.abs(det) <= tol) {
		throw new RangeError('Matrix is singular or nearly singular');
	}

	const invDet = 1 / det;
	const inv = [
		[0, 0, 0],
		[0, 0, 0],
		[0, 0, 0],
	];
	for (let t = 0; t < ADJUGATE_TABLE_3X3.length; t++) {
		const [outRow, outCol, r0, r1, c0, c1, sign] = ADJUGATE_TABLE_3X3[t];
		const minor = W[r0][c0] * W[r1][c1] - W[r0][c1] * W[r1][c0];
		const val = (sign * minor * invDet) / s;
		if (!Number.isFinite(val)) {
			throw new RangeError('Matrix inverse overflowed to a non-finite value');
		}
		inv[outRow][outCol] = val;
	}
	return inv;
}

/**
 * Invert a general N×N primal matrix via Gauss-Jordan elimination with partial pivoting.
 * @param {number[][]} V
 * @param {number} maxAbs
 * @returns {number[][]}
 */
function invertPrimalGaussJordan(V, maxAbs) {
	if (maxAbs === 0) {
		throw new RangeError('Matrix is singular');
	}

	const n = V.length;
	const width = 2 * n;
	const aug = new Array(n);

	for (let i = 0; i < n; i++) {
		const row = new Array(width).fill(0);
		const vRow = V[i];
		for (let j = 0; j < n; j++) {
			row[j] = vRow[j];
		}
		row[n + i] = 1;
		aug[i] = row;
	}

	const pivotTol = SINGULARITY_EPS * maxAbs;

	for (let col = 0; col < n; col++) {
		// Partial pivoting: find row with largest absolute pivot in column `col`.
		let pivotRow = col;
		let pivotAbs = Math.abs(aug[col][col]);
		for (let r = col + 1; r < n; r++) {
			const candidate = Math.abs(aug[r][col]);
			if (candidate > pivotAbs) {
				pivotAbs = candidate;
				pivotRow = r;
			}
		}

		if (!Number.isFinite(pivotAbs) || pivotAbs <= pivotTol) {
			throw new RangeError('Matrix is singular or nearly singular');
		}

		if (pivotRow !== col) {
			const tmp = aug[col];
			aug[col] = aug[pivotRow];
			aug[pivotRow] = tmp;
		}

		const pRow = aug[col];
		const invPivot = 1 / pRow[col];
		pRow[col] = 1;
		for (let j = col + 1; j < width; j++) {
			pRow[j] *= invPivot;
		}

		// Eliminate all other rows in this column.
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const row = aug[r];
			const factor = row[col];
			if (factor === 0) continue;
			row[col] = 0;
			for (let j = col + 1; j < width; j++) {
				row[j] -= factor * pRow[j];
			}
		}
	}

	const inv = new Array(n);
	for (let i = 0; i < n; i++) {
		const row = new Array(n);
		const src = aug[i];
		for (let j = 0; j < n; j++) {
			const val = src[n + j];
			if (!Number.isFinite(val)) {
				throw new RangeError('Matrix inverse overflowed to a non-finite value');
			}
			row[j] = val;
		}
		inv[i] = row;
	}
	return inv;
}

/**
 * Precomputed dispatch table mapping small matrix sizes to table-driven solvers.
 * @type {Readonly<Record<number, (V: number[][], maxAbs: number) => number[][]>>}
 */
const INVERSE_DISPATCH = Object.freeze({
	1: invertPrimal1x1,
	2: invertPrimal2x2,
	3: invertPrimal3x3,
});

/**
 * Assemble the dual inverse matrix `V⁻¹ - ε · (V⁻¹ · D · V⁻¹)`.
 * @param {number[][]} Vinv
 * @param {number[][]} D
 * @returns {DualNumber[][]}
 */
function assembleDualInverse(Vinv, D) {
	const n = Vinv.length;

	// Compute T = Vinv * D
	const T = new Array(n);
	for (let i = 0; i < n; i++) {
		const tRow = new Array(n);
		const viRow = Vinv[i];
		for (let j = 0; j < n; j++) {
			let sum = 0;
			for (let k = 0; k < n; k++) {
				sum += viRow[k] * D[k][j];
			}
			tRow[j] = sum;
		}
		T[i] = tRow;
	}

	// Compute result[i][j] = { v: Vinv[i][j], d: -(T * Vinv)[i][j] }
	const result = new Array(n);
	for (let i = 0; i < n; i++) {
		const resRow = new Array(n);
		const tRow = T[i];
		const viRow = Vinv[i];
		for (let j = 0; j < n; j++) {
			let sum = 0;
			for (let k = 0; k < n; k++) {
				sum += tRow[k] * Vinv[k][j];
			}
			const vVal = normalizeZero(viRow[j]);
			const dVal = normalizeZero(-sum);
			if (!Number.isFinite(vVal) || !Number.isFinite(dVal)) {
				throw new RangeError('Dual matrix inverse overflowed to a non-finite value');
			}
			resRow[j] = { v: vVal, d: dVal };
		}
		result[i] = resRow;
	}

	return result;
}

/**
 * Compute the matrix inverse of a square 2D array of dual numbers `{ v, d }`
 * using table-driven dispatch for small dimensions, Gauss-Jordan elimination
 * with partial pivoting for general N×N matrices, and bounded LRU memoization.
 *
 * @param {DualNumber[][]} M - Non-empty square matrix of finite dual numbers `{ v, d }`.
 * @returns {DualNumber[][]} Fresh deep-copied square matrix representing `M⁻¹`.
 * @throws {TypeError} If `M` is not a 2D array of dual number objects `{ v, d }`.
 * @throws {RangeError} If `M` is empty, non-square, contains non-finite numbers, or is singular.
 */
export function inverseDualMemo(M) {
	const { n, V, D, maxAbs, key } = validateAndExtract(M);

	if (memoCache.has(key)) {
		const cached = memoCache.get(key);
		// Refresh LRU position.
		memoCache.delete(key);
		memoCache.set(key, cached);
		return cloneDualMatrix(cached);
	}

	const invertPrimal = INVERSE_DISPATCH[n] ?? invertPrimalGaussJordan;
	const Vinv = invertPrimal(V, maxAbs);
	const result = assembleDualInverse(Vinv, D);

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(key, result);

	return cloneDualMatrix(result);
}
