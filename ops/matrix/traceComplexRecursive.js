/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes `-0` to `0` while leaving all other numbers unchanged.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} entry
 * @param {number} row
 * @param {number} col
 * @returns {void}
 */
function validateComplex(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(
			`Expected complex number object { re, im } at matrix[${row}][${col}]`
		);
	}

	const { re, im } = /** @type {Record<string, unknown>} */ (entry);

	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Expected numeric 're' and 'im' properties at matrix[${row}][${col}]`
		);
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Expected finite 're' and 'im' values at matrix[${row}][${col}]`
		);
	}
}

/**
 * Validates that the input is a square matrix of finite complex numbers `{ re, im }`.
 *
 * @param {unknown} matrix
 * @returns {void}
 */
function validateComplexSquareMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array of complex numbers');
	}

	const n = matrix.length;
	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected matrix[${i}] to be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`Expected square matrix of size ${n}x${n}, but row ${i} has length ${row.length}`
			);
		}
		for (let j = 0; j < n; j++) {
			validateComplex(row[j], i, j);
		}
	}
}

/**
 * Recursively computes the complex trace over the principal diagonal slice `[start, end)`
 * using divide-and-conquer block partitioning: `tr(M) = tr(A) + tr(D)`.
 *
 * @param {Complex[][]} matrix
 * @param {number} start - Inclusive starting diagonal index.
 * @param {number} end - Exclusive ending diagonal index.
 * @returns {Complex}
 */
function traceDivideAndConquer(matrix, start, end) {
	const span = end - start;
	if (span === 0) {
		return { re: 0, im: 0 };
	}
	if (span === 1) {
		const diag = matrix[start][start];
		return {
			re: normalizeZero(diag.re),
			im: normalizeZero(diag.im),
		};
	}

	const mid = start + Math.floor(span / 2);
	const topLeft = traceDivideAndConquer(matrix, start, mid);
	const bottomRight = traceDivideAndConquer(matrix, mid, end);

	return {
		re: normalizeZero(topLeft.re + bottomRight.re),
		im: normalizeZero(topLeft.im + bottomRight.im),
	};
}

/**
 * Computes the trace of a square matrix over complex numbers `{ re, im }`
 * using a recursive divide-and-conquer algorithm (pairwise summation of
 * leading and trailing principal submatrix traces, achieving O(log n) recursion depth).
 *
 * For an empty `0x0` matrix (`[]`), returns `{ re: 0, im: 0 }`.
 *
 * @param {Complex[][]} matrix - Square `n x n` matrix of complex numbers `{ re, im }`.
 * @returns {Complex} The complex trace `{ re, im }` of the matrix.
 * @throws {TypeError} If `matrix` is not a 2D array or any element is not a `{ re, im }` object with numeric fields.
 * @throws {RangeError} If `matrix` is not square or any component is `NaN` or non-finite.
 */
export function traceComplexRecursive(matrix) {
	validateComplexSquareMatrix(matrix);
	return traceDivideAndConquer(matrix, 0, matrix.length);
}
