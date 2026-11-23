/**
 * Numerically robust IEEE-754 float64 matrix inversion.
 *
 * Uses:
 *  1. Simultaneous power-of-2 Ruiz row/column equilibration (exact in IEEE-754
 *     mantissa arithmetic, preventing overflow/underflow across extreme scales).
 *  2. LU factorization with complete pivoting (minimizing element growth factor).
 *  3. Ogita-Rump-Oishi compensated dot products (`Dot2` via Veltkamp-Dekker
 *     `TwoProd` and Knuth `TwoSum`) for triangular solves and residual evaluation.
 *  4. Monotonic iterative refinement in simulated double-double precision.
 *
 * @module ops/matrix/inverseFloatStable
 */

const TWO_POW_512 = 2 ** 512;
const TWO_POW_NEG_512 = 2 ** -512;
// Veltkamp splitting factor 2^27 + 1 for IEEE-754 binary64 (53-bit significand)
const VELTKAMP_SPLIT = 134217729;
// Guard threshold so VELTKAMP_SPLIT * x never overflows binary64 (~1.34e300)
const SPLIT_SAFE_LIMIT = 1e150;

/**
 * Multiplies a finite float64 number by 2^exp without intermediate overflow or
 * underflow of the power-of-2 factor itself.
 *
 * @param {number} x
 * @param {number} exp - Integer base-2 exponent.
 * @returns {number}
 */
function scaleByPow2(x, exp) {
	if (x === 0 || exp === 0) return x === 0 ? 0 : x;
	let v = x;
	let e = exp;
	while (e > 512) {
		v *= TWO_POW_512;
		e -= 512;
	}
	while (e < -512) {
		v *= TWO_POW_NEG_512;
		e += 512;
	}
	return v * (2 ** e);
}

/**
 * Knuth's error-free transformation for floating-point addition.
 * Computes s and e such that s = fl(a + b) and s + e === a + b exactly.
 *
 * @param {number} a
 * @param {number} b
 * @param {Float64Array} out - 2-element scratch buffer [s, e].
 */
function twoSum(a, b, out) {
	const s = a + b;
	const bb = s - a;
	const e = (a - (s - bb)) + (b - bb);
	out[0] = s;
	out[1] = e;
}

/**
 * Veltkamp-Dekker error-free transformation for floating-point multiplication.
 * Computes p and e such that p = fl(a * b) and p + e === a * b exactly
 * (when no overflow/underflow occurs).
 *
 * @param {number} a
 * @param {number} b
 * @param {Float64Array} out - 2-element scratch buffer [p, e].
 */
function twoProd(a, b, out) {
	const p = a * b;
	if (
		p === 0 ||
		!Number.isFinite(p) ||
		Math.abs(a) > SPLIT_SAFE_LIMIT ||
		Math.abs(b) > SPLIT_SAFE_LIMIT
	) {
		out[0] = p;
		out[1] = 0;
		return;
	}
	const ca = VELTKAMP_SPLIT * a;
	const ah = ca - (ca - a);
	const al = a - ah;

	const cb = VELTKAMP_SPLIT * b;
	const bh = cb - (cb - b);
	const bl = b - bh;

	const e = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
	out[0] = p;
	out[1] = e;
}

/**
 * Validates that `matrix` is a non-empty square 2D array of finite float64 numbers.
 *
 * @param {unknown} matrix
 * @returns {number} Dimension n of the n x n matrix.
 */
function validateMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array of finite numbers');
	}
	const n = matrix.length;
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty');
	}
	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Row ${i} must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`Matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			);
		}
		for (let j = 0; j < n; j++) {
			const val = row[j];
			if (typeof val !== 'number') {
				throw new TypeError(
					`Matrix entry [${i}][${j}] must be a number, got ${typeof val}`
				);
			}
			if (!Number.isFinite(val)) {
				throw new RangeError(
					`Matrix entry [${i}][${j}] must be a finite number, got ${val}`
				);
			}
		}
	}
	return n;
}

/**
 * Validates optional configuration parameters.
 *
 * @param {unknown} options
 * @param {number} n
 * @returns {{ tolerance: number, refinementSteps: number }}
 */
function validateOptions(options, n) {
	if (options === undefined) {
		return {
			tolerance: Number.EPSILON * Math.max(n, 1) * 8,
			refinementSteps: 3
		};
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('Options must be a plain object');
	}

	let tolerance = Number.EPSILON * Math.max(n, 1) * 8;
	if (options.tolerance !== undefined) {
		if (typeof options.tolerance !== 'number') {
			throw new TypeError('options.tolerance must be a number');
		}
		if (!Number.isFinite(options.tolerance) || options.tolerance < 0) {
			throw new RangeError('options.tolerance must be a non-negative finite number');
		}
		tolerance = options.tolerance;
	}

	let refinementSteps = 3;
	if (options.refinementSteps !== undefined) {
		if (typeof options.refinementSteps !== 'number') {
			throw new TypeError('options.refinementSteps must be a number');
		}
		if (!Number.isInteger(options.refinementSteps) || options.refinementSteps < 0) {
			throw new RangeError('options.refinementSteps must be a non-negative integer');
		}
		refinementSteps = options.refinementSteps;
	}

	return { tolerance, refinementSteps };
}

/**
 * Performs simultaneous power-of-2 Ruiz row/column equilibration:
 *   B[i][j] = A[i][j] * 2^(rowExp[i] + colExp[j])
 *
 * Because all scaling factors are exact powers of 2, no mantissa rounding error
 * is introduced. Throws RangeError if any row or column is identically zero.
 *
 * @param {number[][]} matrix
 * @param {number} n
 * @returns {{ B: Float64Array[], rowExp: Int32Array, colExp: Int32Array }}
 */
function equilibrate(matrix, n) {
	const rowExp = new Int32Array(n);
	const colExp = new Int32Array(n);
	const B = new Array(n);
	for (let i = 0; i < n; i++) {
		const row = new Float64Array(n);
		const src = matrix[i];
		for (let j = 0; j < n; j++) {
			row[j] = src[j];
		}
		B[i] = row;
	}

	const rowMax = new Float64Array(n);
	const colMax = new Float64Array(n);
	const maxPasses = 6;

	for (let pass = 0; pass < maxPasses; pass++) {
		rowMax.fill(0);
		colMax.fill(0);

		for (let i = 0; i < n; i++) {
			const row = B[i];
			let rMax = 0;
			for (let j = 0; j < n; j++) {
				const a = Math.abs(row[j]);
				if (a > rMax) rMax = a;
				if (a > colMax[j]) colMax[j] = a;
			}
			rowMax[i] = rMax;
		}

		let changed = false;
		for (let i = 0; i < n; i++) {
			if (rowMax[i] === 0) {
				throw new RangeError('Matrix is singular (zero row detected)');
			}
			const shift = -Math.trunc(Math.log2(rowMax[i]) * 0.5);
			if (shift !== 0) {
				rowExp[i] += shift;
				changed = true;
			}
		}

		for (let j = 0; j < n; j++) {
			if (colMax[j] === 0) {
				throw new RangeError('Matrix is singular (zero column detected)');
			}
			const shift = -Math.trunc(Math.log2(colMax[j]) * 0.5);
			if (shift !== 0) {
				colExp[j] += shift;
				changed = true;
			}
		}

		if (!changed) break;

		// Recompute directly from original matrix entries to prevent transient underflow/overflow
		for (let i = 0; i < n; i++) {
			const row = B[i];
			const src = matrix[i];
			const rExp = rowExp[i];
			for (let j = 0; j < n; j++) {
				row[j] = scaleByPow2(src[j], rExp + colExp[j]);
			}
		}
	}

	return { B, rowExp, colExp };
}

/**
 * Computes LU factorization with complete pivoting:
 *   (L * U)[i][j] = B[P[i]][Q[j]]
 * where L is unit lower triangular (stored below the diagonal of LU)
 * and U is upper triangular (stored on and above the diagonal of LU).
 *
 * @param {Float64Array[]} B
 * @param {number} n
 * @param {number} tolerance
 * @returns {{ LU: Float64Array[], P: Int32Array, Q: Int32Array }}
 */
function luCompletePivot(B, n, tolerance) {
	const LU = new Array(n);
	const P = new Int32Array(n);
	const Q = new Int32Array(n);

	for (let i = 0; i < n; i++) {
		LU[i] = new Float64Array(B[i]);
		P[i] = i;
		Q[i] = i;
	}

	let maxPivot = 0;

	for (let k = 0; k < n; k++) {
		let pivRow = k;
		let pivCol = k;
		let pivAbs = 0;

		for (let i = k; i < n; i++) {
			const row = LU[i];
			for (let j = k; j < n; j++) {
				const a = Math.abs(row[j]);
				if (a > pivAbs) {
					pivAbs = a;
					pivRow = i;
					pivCol = j;
				}
			}
		}

		if (k === 0) {
			maxPivot = pivAbs;
		}

		if (pivAbs === 0 || !Number.isFinite(pivAbs) || pivAbs <= tolerance * maxPivot) {
			throw new RangeError('Matrix is singular or numerically singular');
		}

		// Row swap
		if (pivRow !== k) {
			const tmpRow = LU[k];
			LU[k] = LU[pivRow];
			LU[pivRow] = tmpRow;

			const tmpP = P[k];
			P[k] = P[pivRow];
			P[pivRow] = tmpP;
		}

		// Column swap across all rows
		if (pivCol !== k) {
			for (let i = 0; i < n; i++) {
				const row = LU[i];
				const tmp = row[k];
				row[k] = row[pivCol];
				row[pivCol] = tmp;
			}

			const tmpQ = Q[k];
			Q[k] = Q[pivCol];
			Q[pivCol] = tmpQ;
		}

		const rowK = LU[k];
		const pivot = rowK[k];

		for (let i = k + 1; i < n; i++) {
			const rowI = LU[i];
			const factor = rowI[k] / pivot;
			rowI[k] = factor;
			for (let j = k + 1; j < n; j++) {
				rowI[j] -= factor * rowK[j];
			}
		}
	}

	return { LU, P, Q };
}

/**
 * Solves B * x = rhs using precomputed complete-pivoting LU factors and
 * compensated dot products (`Dot2`) in the triangular solves.
 *
 * @param {Float64Array[]} LU
 * @param {Int32Array} P
 * @param {Int32Array} Q
 * @param {Float64Array} rhs - Input right-hand side of length n.
 * @param {Float64Array} y - Scratch buffer of length n.
 * @param {Float64Array} out - Output solution vector of length n.
 * @param {Float64Array} prodBuf - 2-element scratch buffer for twoProd.
 * @param {Float64Array} sumBuf - 2-element scratch buffer for twoSum.
 */
function solveLU(LU, P, Q, rhs, y, out, prodBuf, sumBuf) {
	const n = P.length;

	// Forward substitution: L * y = P * rhs (L has implicit 1s on diagonal)
	for (let i = 0; i < n; i++) {
		const row = LU[i];
		let s = rhs[P[i]];
		let c = 0;
		for (let k = 0; k < i; k++) {
			twoProd(-row[k], y[k], prodBuf);
			twoSum(s, prodBuf[0], sumBuf);
			s = sumBuf[0];
			c += sumBuf[1] + prodBuf[1];
		}
		y[i] = s + c;
	}

	// Backward substitution: U * z = y (reusing y in-place for z)
	for (let i = n - 1; i >= 0; i--) {
		const row = LU[i];
		let s = y[i];
		let c = 0;
		for (let k = i + 1; k < n; k++) {
			twoProd(-row[k], y[k], prodBuf);
			twoSum(s, prodBuf[0], sumBuf);
			s = sumBuf[0];
			c += sumBuf[1] + prodBuf[1];
		}
		y[i] = (s + c) / row[i];
	}

	// Unpermute: x[Q[i]] = z[i]
	for (let i = 0; i < n; i++) {
		out[Q[i]] = y[i];
	}
}

/**
 * Computes the residual matrix R = I - B * X in simulated double-double
 * precision using Ogita-Rump-Oishi `Dot2`, returning its max-entry norm.
 *
 * @param {Float64Array[]} B
 * @param {Float64Array[]} X
 * @param {Float64Array[]} R - Output residual matrix (n x n).
 * @param {Float64Array} prodBuf
 * @param {Float64Array} sumBuf
 * @returns {number} Max absolute entry of R.
 */
function computeResidual(B, X, R, prodBuf, sumBuf) {
	const n = B.length;
	let maxAbs = 0;

	for (let i = 0; i < n; i++) {
		const rowB = B[i];
		const rowR = R[i];
		for (let j = 0; j < n; j++) {
			let s = i === j ? 1 : 0;
			let c = 0;
			for (let k = 0; k < n; k++) {
				twoProd(-rowB[k], X[k][j], prodBuf);
				twoSum(s, prodBuf[0], sumBuf);
				s = sumBuf[0];
				c += sumBuf[1] + prodBuf[1];
			}
			const r = s + c;
			rowR[j] = r;
			const a = Math.abs(r);
			if (a > maxAbs) maxAbs = a;
		}
	}

	return maxAbs;
}

/**
 * Computes the inverse of a square matrix over IEEE-754 float64 numbers using a
 * numerically robust algorithm combining power-of-2 Ruiz equilibration,
 * complete-pivoting LU factorization, compensated dot products, and iterative
 * refinement.
 *
 * Does not mutate the input matrix.
 *
 * @param {number[][]} matrix - Non-empty square n x n matrix of finite float64 numbers.
 * @param {object} [options] - Optional numerical controls.
 * @param {number} [options.tolerance] - Relative pivot threshold for singularity detection
 *   (default `Number.EPSILON * n * 8`).
 * @param {number} [options.refinementSteps=3] - Maximum number of iterative refinement passes.
 * @returns {number[][]} The n x n inverse matrix.
 * @throws {TypeError} If `matrix` is not a 2D array of numbers or `options` has invalid types.
 * @throws {RangeError} If `matrix` is empty, non-square, contains non-finite numbers,
 *   is singular / numerically singular, or its inverse overflows float64 range.
 */
export function inverseFloatStable(matrix, options) {
	const n = validateMatrix(matrix);
	const { tolerance, refinementSteps } = validateOptions(options, n);

	const { B, rowExp, colExp } = equilibrate(matrix, n);
	const { LU, P, Q } = luCompletePivot(B, n, tolerance);

	const prodBuf = new Float64Array(2);
	const sumBuf = new Float64Array(2);
	const rhs = new Float64Array(n);
	const y = new Float64Array(n);
	const colSol = new Float64Array(n);

	// Initial inverse X of equilibrated matrix B
	const X = new Array(n);
	for (let i = 0; i < n; i++) {
		X[i] = new Float64Array(n);
	}

	for (let j = 0; j < n; j++) {
		rhs.fill(0);
		rhs[j] = 1;
		solveLU(LU, P, Q, rhs, y, colSol, prodBuf, sumBuf);
		for (let i = 0; i < n; i++) {
			const v = colSol[i];
			if (!Number.isFinite(v)) {
				throw new RangeError('Matrix is singular or numerically singular');
			}
			X[i][j] = v;
		}
	}

	// Monotonic iterative refinement with double-double residuals
	if (refinementSteps > 0) {
		const R = new Array(n);
		const Xcand = new Array(n);
		const Rcand = new Array(n);
		for (let i = 0; i < n; i++) {
			R[i] = new Float64Array(n);
			Xcand[i] = new Float64Array(n);
			Rcand[i] = new Float64Array(n);
		}

		let resNorm = computeResidual(B, X, R, prodBuf, sumBuf);

		for (let step = 0; step < refinementSteps && resNorm > 0; step++) {
			let finiteCand = true;
			let maxDelta = 0;
			let maxX = 0;

			for (let j = 0; j < n; j++) {
				for (let i = 0; i < n; i++) {
					rhs[i] = R[i][j];
				}
				solveLU(LU, P, Q, rhs, y, colSol, prodBuf, sumBuf);
				for (let i = 0; i < n; i++) {
					const delta = colSol[i];
					const updated = X[i][j] + delta;
					if (!Number.isFinite(updated)) {
						finiteCand = false;
						break;
					}
					Xcand[i][j] = updated;
					const ad = Math.abs(delta);
					const ax = Math.abs(updated);
					if (ad > maxDelta) maxDelta = ad;
					if (ax > maxX) maxX = ax;
				}
				if (!finiteCand) break;
			}

			if (!finiteCand) break;

			const candResNorm = computeResidual(B, Xcand, Rcand, prodBuf, sumBuf);
			if (candResNorm < resNorm) {
				for (let i = 0; i < n; i++) {
					X[i].set(Xcand[i]);
					R[i].set(Rcand[i]);
				}
				resNorm = candResNorm;
				if (maxDelta <= Number.EPSILON * maxX) {
					break;
				}
			} else {
				break;
			}
		}
	}

	// Unscale: A^-1 = D_c * B^-1 * D_r  =>  (A^-1)[i][j] = X[i][j] * 2^(colExp[i] + rowExp[j])
	const result = new Array(n);
	for (let i = 0; i < n; i++) {
		const outRow = new Array(n);
		const rowX = X[i];
		const cExp = colExp[i];
		for (let j = 0; j < n; j++) {
			const val = scaleByPow2(rowX[j], cExp + rowExp[j]);
			if (!Number.isFinite(val)) {
				throw new RangeError('Matrix inverse overflows IEEE-754 float64 range');
			}
			outRow[j] = val === 0 ? 0 : val;
		}
		result[i] = outRow;
	}

	return result;
}
