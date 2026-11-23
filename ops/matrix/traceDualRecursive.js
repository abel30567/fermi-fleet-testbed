/**
 * @typedef {{ v: number, d: number }} Dual
 * A dual number representing `v + d * ε` where `ε² = 0`, carrying a primal
 * value `v` and its forward-mode derivative `d`.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite
 * numeric components.
 *
 * @param {unknown} entry - Candidate dual number.
 * @param {number} row - Row index for error reporting.
 * @param {number} col - Column index for error reporting.
 * @throws {TypeError} If the entry is not a dual-number object with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is not a finite number.
 */
function assertValidDual(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(
			`Expected dual number { v, d } at matrix[${row}][${col}]`
		);
	}
	if (typeof entry.v !== 'number' || typeof entry.d !== 'number') {
		throw new TypeError(
			`Expected numeric v and d at matrix[${row}][${col}]`
		);
	}
	if (!Number.isFinite(entry.v) || !Number.isFinite(entry.d)) {
		throw new RangeError(
			`Expected finite v and d at matrix[${row}][${col}]`
		);
	}
}

/**
 * Validates that the input is a square 2D array of valid dual numbers.
 *
 * @param {unknown} matrix - Candidate square matrix of dual numbers.
 * @throws {TypeError} If `matrix` or any row is not an Array, or an entry is malformed.
 * @throws {RangeError} If `matrix` is not square or any dual component is non-finite.
 */
function validateDualSquareMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array');
	}
	const n = matrix.length;
	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} to be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`Expected a square ${n}x${n} matrix, but row ${i} has length ${row.length}`
			);
		}
		for (let j = 0; j < n; j++) {
			assertValidDual(row[j], i, j);
		}
	}
}

/**
 * Adds two dual numbers: `(a.v + a.d ε) + (b.v + b.d ε)`.
 *
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function dualAdd(a, b) {
	return { v: a.v + b.v, d: a.d + b.d };
}

/**
 * Recursively computes the trace over the diagonal sub-range `[start, end)`
 * using divide-and-conquer pairwise summation:
 *   tr([A B; C D]) = tr(A) + tr(D).
 *
 * @param {Dual[][]} matrix - Validated square matrix of dual numbers.
 * @param {number} start - Inclusive start diagonal index.
 * @param {number} end - Exclusive end diagonal index.
 * @returns {Dual}
 */
function traceDivideAndConquer(matrix, start, end) {
	const span = end - start;
	if (span <= 0) {
		return { v: 0, d: 0 };
	}
	if (span === 1) {
		const diag = matrix[start][start];
		return { v: diag.v, d: diag.d };
	}
	const mid = start + (span >> 1);
	const upperLeft = traceDivideAndConquer(matrix, start, mid);
	const lowerRight = traceDivideAndConquer(matrix, mid, end);
	return dualAdd(upperLeft, lowerRight);
}

/**
 * Computes the trace of a square matrix of dual numbers `{ v, d }` using a
 * recursive divide-and-conquer summation along the main diagonal.
 *
 * For an `n × n` matrix `M` with dual entries `M[i][j] = { v, d }`, the trace
 * is the dual number `{ v: Σ M[i][i].v, d: Σ M[i][i].d }`. An empty `0 × 0`
 * matrix has trace `{ v: 0, d: 0 }`.
 *
 * @param {Dual[][]} matrix - Square matrix of dual numbers `{ v, d }`.
 * @returns {Dual} The dual-number trace `{ v, d }`.
 * @throws {TypeError} If `matrix` is not a 2D array of `{ v, d }` dual objects.
 * @throws {RangeError} If `matrix` is not square or contains non-finite numbers.
 */
export function traceDualRecursive(matrix) {
	validateDualSquareMatrix(matrix);
	return traceDivideAndConquer(matrix, 0, matrix.length);
}
