/**
 * Matrix multiplication over IEEE-754 float64 numbers using compensated summation.
 *
 * Computes the matrix product `C = A * B`, where `A` is an `m × p` matrix and
 * `B` is a `p × n` matrix, producing an `m × n` matrix `C` whose entries are
 * evaluated via the Ogita–Rump–Oishi `Dot2` compensated inner-product series
 * (Dekker/Veltkamp `TwoProd` error-free product splitting combined with
 * Knuth's `TwoSum` error-free transformation) to preserve precision under
 * catastrophic cancellation and intermediate rounding.
 *
 * Zero dependencies; pure ESM (Node 20+).
 *
 * @module ops/matrix/matMulFloatSeries
 */

/** Veltkamp splitting factor 2^27 + 1 for IEEE-754 binary64 (53-bit significand). */
const SPLIT_FACTOR = 134217729;

/**
 * Safe magnitude bound below which Veltkamp splitting and product formation
 * cannot overflow (1e150 * (2^27 + 1) < 1.4e158 and (1e150)^2 = 1e300 < Number.MAX_VALUE).
 */
const SPLIT_SAFE_BOUND = 1e150;

/**
 * Validates that `matrix` is a non-empty rectangular 2D array of finite float64 numbers.
 *
 * @param {unknown} matrix - Candidate matrix value.
 * @param {string} name - Parameter name for error diagnostics.
 * @returns {{ rows: number, cols: number }} Validated dimensions.
 * @throws {TypeError} If `matrix` is not a 2D array of finite numbers.
 * @throws {RangeError} If `matrix` is empty or ragged (inconsistent row lengths).
 */
function validateMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of finite numbers`);
	}
	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError(`${name} must be a non-empty 2D matrix`);
	}

	let cols = -1;
	for (let i = 0; i < rows; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array of finite numbers`);
		}
		if (row.length === 0) {
			throw new RangeError(`${name}[${i}] must be non-empty`);
		}
		if (cols === -1) {
			cols = row.length;
		} else if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular: row 0 has length ${cols}, but row ${i} has length ${row.length}`
			);
		}
		for (let j = 0; j < cols; j++) {
			const val = row[j];
			if (typeof val !== 'number' || !Number.isFinite(val)) {
				throw new TypeError(
					`${name}[${i}][${j}] must be a finite float64 number`
				);
			}
		}
	}

	return { rows, cols };
}

/**
 * Computes the compensated inner product of two equal-length float64 vectors
 * using Ogita–Rump–Oishi `Dot2` (TwoProd + TwoSum) accumulation.
 *
 * @param {readonly number[]} vecA - Left vector (row of A).
 * @param {Float64Array} vecB - Right vector (column of B).
 * @param {number} length - Inner dimension.
 * @returns {number} Compensated dot product.
 */
function compensatedDot(vecA, vecB, length) {
	let sum = 0;
	let comp = 0;

	for (let k = 0; k < length; k++) {
		const x = vecA[k];
		const y = vecB[k];
		const p = x * y;

		// Error-free transformation of x * y = p + pErr via Veltkamp-Dekker TwoProd
		// when operands are within the overflow-safe bound.
		let pErr = 0;
		if (
			Math.abs(x) <= SPLIT_SAFE_BOUND &&
			Math.abs(y) <= SPLIT_SAFE_BOUND &&
			Number.isFinite(p)
		) {
			const cx = SPLIT_FACTOR * x;
			const xHi = cx - (cx - x);
			const xLo = x - xHi;

			const cy = SPLIT_FACTOR * y;
			const yHi = cy - (cy - y);
			const yLo = y - yHi;

			pErr = ((xHi * yHi - p) + xHi * yLo + xLo * yHi) + xLo * yLo;
		}

		// Knuth's TwoSum error-free transformation for sum + p = t + sErr
		const t = sum + p;
		if (Number.isFinite(t)) {
			const z = t - sum;
			const sErr = (sum - (t - z)) + (p - z);
			comp += sErr + pErr;
			sum = t;
		} else {
			sum = t;
		}
	}

	const total = sum + comp;
	return total === 0 ? 0 : total;
}

/**
 * Multiplies two rectangular matrices `a` (`m × p`) and `b` (`p × n`) over
 * IEEE-754 float64 numbers, computing each inner product with compensated
 * summation (`Dot2`: TwoProd + TwoSum).
 *
 * @param {number[][]} a - Left matrix of shape `m × p` with finite float64 entries.
 * @param {number[][]} b - Right matrix of shape `p × n` with finite float64 entries.
 * @returns {number[][]} Product matrix `a * b` of shape `m × n`.
 * @throws {TypeError} If either input is not a 2D array of finite numbers.
 * @throws {RangeError} If either matrix is empty, ragged, or has incompatible inner dimensions (`a[0].length !== b.length`).
 */
export function matMulFloatSeries(a, b) {
	const dimA = validateMatrix(a, 'a');
	const dimB = validateMatrix(b, 'b');

	if (dimA.cols !== dimB.rows) {
		throw new RangeError(
			`Incompatible matrix dimensions for multiplication: (${dimA.rows}x${dimA.cols}) and (${dimB.rows}x${dimB.cols})`
		);
	}

	const m = dimA.rows;
	const p = dimA.cols;
	const n = dimB.cols;

	// Extract columns of B into contiguous Float64Arrays for cache-friendly inner products.
	const bCols = new Array(n);
	for (let j = 0; j < n; j++) {
		const col = new Float64Array(p);
		for (let k = 0; k < p; k++) {
			col[k] = b[k][j];
		}
		bCols[j] = col;
	}

	const result = new Array(m);
	for (let i = 0; i < m; i++) {
		const rowA = a[i];
		const rowOut = new Array(n);
		for (let j = 0; j < n; j++) {
			rowOut[j] = compensatedDot(rowA, bCols[j], p);
		}
		result[i] = rowOut;
	}

	return result;
}
