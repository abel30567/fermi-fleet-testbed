/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalize `-0` to `0` so returned complex components have clean sign representation.
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Add two complex numbers.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im };
}

/**
 * Subtract two complex numbers (a - b).
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im };
}

/**
 * Multiply two complex numbers.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

/**
 * Negate a complex number.
 * @param {Complex} a
 * @returns {Complex}
 */
function complexNeg(a) {
	return { re: -a.re, im: -a.im };
}

/**
 * Divide two complex numbers (a / b) using Smith's scaling formula to avoid overflow/underflow.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexDiv(a, b) {
	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const ratio = b.im / b.re;
		const denom = b.re + b.im * ratio;
		return {
			re: (a.re + a.im * ratio) / denom,
			im: (a.im - a.re * ratio) / denom,
		};
	}
	const ratio = b.re / b.im;
	const denom = b.im + b.re * ratio;
	return {
		re: (a.re * ratio + a.im) / denom,
		im: (a.im * ratio - a.re) / denom,
	};
}

/**
 * Validate that input is a non-empty square matrix of finite `{ re, im }` complex objects,
 * returning a defensive copy of the matrix.
 * @param {unknown} matrix
 * @returns {Complex[][]}
 */
function validateAndCloneMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Matrix must be a 2D array of complex numbers { re, im }.');
	}
	const n = matrix.length;
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty.');
	}

	const copy = new Array(n);
	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Row ${i} must be an array.`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`Matrix must be square: expected row ${i} to have length ${n}, got ${row.length}.`
			);
		}
		const rowCopy = new Array(n);
		for (let j = 0; j < n; j++) {
			const cell = row[j];
			if (cell === null || typeof cell !== 'object') {
				throw new TypeError(
					`Entry at (${i}, ${j}) must be an object with numeric { re, im } properties.`
				);
			}
			const { re, im } = cell;
			if (typeof re !== 'number' || typeof im !== 'number') {
				throw new TypeError(
					`Entry at (${i}, ${j}) must have numeric re and im properties.`
				);
			}
			if (!Number.isFinite(re) || !Number.isFinite(im)) {
				throw new RangeError(
					`Entry at (${i}, ${j}) must have finite re and im values.`
				);
			}
			rowCopy[j] = { re, im };
		}
		copy[i] = rowCopy;
	}
	return copy;
}

/**
 * Build the (n - 1) x (n - 1) minor matrix obtained by removing row 0 and column `skipCol`.
 * @param {Complex[][]} m
 * @param {number} skipCol
 * @returns {Complex[][]}
 */
function firstRowMinor(m, skipCol) {
	const n = m.length;
	const minor = new Array(n - 1);
	for (let i = 1; i < n; i++) {
		const srcRow = m[i];
		const dstRow = new Array(n - 1);
		let colIdx = 0;
		for (let j = 0; j < n; j++) {
			if (j !== skipCol) {
				dstRow[colIdx++] = srcRow[j];
			}
		}
		minor[i - 1] = dstRow;
	}
	return minor;
}

/**
 * Recursive determinant computation over complex matrices:
 * - For `n === 1` and `n === 2`: direct base cases.
 * - For `n <= 4`: recursive Laplace cofactor expansion along the first row.
 * - For `n > 4`: recursive divide-and-conquer via partial-pivoted Schur complement
 *   reduction (`det(A) = sign * pivot * det(S)`), giving O(n^3) complexity and good
 *   numerical stability while remaining strictly recursive.
 *
 * @param {Complex[][]} m
 * @returns {Complex}
 */
function computeDeterminantRecursive(m) {
	const n = m.length;

	if (n === 1) {
		return { re: m[0][0].re, im: m[0][0].im };
	}

	if (n === 2) {
		return complexSub(complexMul(m[0][0], m[1][1]), complexMul(m[0][1], m[1][0]));
	}

	if (n <= 4) {
		let total = { re: 0, im: 0 };
		for (let j = 0; j < n; j++) {
			const entry = m[0][j];
			if (entry.re === 0 && entry.im === 0) {
				continue;
			}
			const subDet = computeDeterminantRecursive(firstRowMinor(m, j));
			const term = complexMul(entry, subDet);
			total = j % 2 === 0 ? complexAdd(total, term) : complexSub(total, term);
		}
		return total;
	}

	// Partial pivoting on the first column to choose the largest-magnitude pivot.
	let pivotRow = 0;
	let maxMag = Math.hypot(m[0][0].re, m[0][0].im);
	for (let i = 1; i < n; i++) {
		const mag = Math.hypot(m[i][0].re, m[i][0].im);
		if (mag > maxMag) {
			maxMag = mag;
			pivotRow = i;
		}
	}

	if (maxMag === 0) {
		return { re: 0, im: 0 };
	}

	let sign = 1;
	if (pivotRow !== 0) {
		const tmp = m[0];
		m[0] = m[pivotRow];
		m[pivotRow] = tmp;
		sign = -1;
	}

	const pivot = m[0][0];
	const pivotRowTail = m[0];

	// Form the (n - 1) x (n - 1) Schur complement:
	// S[i - 1][j - 1] = m[i][j] - (m[i][0] / pivot) * m[0][j]
	const schur = new Array(n - 1);
	for (let i = 1; i < n; i++) {
		const srcRow = m[i];
		const factor = complexDiv(srcRow[0], pivot);
		const schurRow = new Array(n - 1);
		const factorIsZero = factor.re === 0 && factor.im === 0;
		for (let j = 1; j < n; j++) {
			if (factorIsZero) {
				schurRow[j - 1] = srcRow[j];
			} else {
				schurRow[j - 1] = complexSub(srcRow[j], complexMul(factor, pivotRowTail[j]));
			}
		}
		schur[i - 1] = schurRow;
	}

	const subDet = computeDeterminantRecursive(schur);
	const scaled = complexMul(pivot, subDet);
	return sign === 1 ? scaled : complexNeg(scaled);
}

/**
 * Compute the determinant of a square complex matrix using a recursive algorithm.
 *
 * Uses exact recursive Laplace cofactor expansion for small matrices (`n <= 4`)
 * and recursive partial-pivoted Schur-complement reduction for larger matrices (`n > 4`).
 * The input matrix is never mutated.
 *
 * @param {Complex[][]} matrix - Non-empty `n x n` array of complex numbers `{ re, im }`.
 * @returns {Complex} The complex determinant `{ re, im }`.
 * @throws {TypeError} If `matrix` is not a 2D array or contains invalid complex entries.
 * @throws {RangeError} If `matrix` is empty, non-square, ragged, or contains non-finite numbers.
 */
export function determinantComplexRecursive(matrix) {
	const cloned = validateAndCloneMatrix(matrix);
	const result = computeDeterminantRecursive(cloned);
	return {
		re: normalizeZero(result.re),
		im: normalizeZero(result.im),
	};
}
