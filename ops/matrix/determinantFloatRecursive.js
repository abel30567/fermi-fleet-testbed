/**
 * Threshold at or below which recursive Laplace (cofactor) expansion is used.
 * Above this size, recursive partial-pivoted Schur complement reduction is used
 * so runtime stays O(n^3) while remaining genuinely recursive / divide-and-conquer.
 */
const COFACTOR_THRESHOLD = 4;

/**
 * Validates that `M` is a non-empty square 2D array of finite IEEE-754 float64 numbers.
 *
 * @param {unknown} M
 * @throws {TypeError} If `M` is not an array, any row is not an array, or any entry is not a number.
 * @throws {RangeError} If `M` is empty, not square, or contains non-finite numbers (`NaN`, `±Infinity`).
 */
function validateSquareMatrix(M) {
	if (!Array.isArray(M)) {
		throw new TypeError('Expected matrix M to be a 2D array of numbers.');
	}
	const n = M.length;
	if (n === 0) {
		throw new RangeError('Expected matrix M to be non-empty.');
	}
	for (let i = 0; i < n; i++) {
		const row = M[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} of matrix M to be an array.`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`Expected a square ${n}x${n} matrix, but row ${i} has length ${row.length}.`,
			);
		}
		for (let j = 0; j < n; j++) {
			const val = row[j];
			if (typeof val !== 'number') {
				throw new TypeError(
					`Expected finite number at M[${i}][${j}], got ${typeof val}.`,
				);
			}
			if (!Number.isFinite(val)) {
				throw new RangeError(
					`Expected finite number at M[${i}][${j}], got ${val}.`,
				);
			}
		}
	}
}

/**
 * Recursively computes the determinant of a validated `n x n` numeric matrix.
 *
 * - Base cases: `n === 1` and `n === 2` use closed-form expressions.
 * - Small matrices (`3 <= n <= 4`): recursive Laplace (cofactor) expansion along row 0.
 * - Larger matrices (`n > 4`): recursive partial-pivoted Schur complement reduction,
 *   reducing an `n x n` determinant to `sign * pivot * det(S)` where `S` is the
 *   `(n - 1) x (n - 1)` Schur complement of the pivot element.
 *
 * @param {number[][]} A - Validated square matrix (never mutated).
 * @returns {number}
 */
function detRecursive(A) {
	const n = A.length;

	if (n === 1) {
		return A[0][0];
	}

	if (n === 2) {
		return A[0][0] * A[1][1] - A[0][1] * A[1][0];
	}

	if (n <= COFACTOR_THRESHOLD) {
		// Recursive Laplace / cofactor expansion along row 0.
		let sum = 0;
		const firstRow = A[0];
		for (let col = 0; col < n; col++) {
			const coeff = firstRow[col];
			if (coeff === 0) {
				continue;
			}
			const minor = new Array(n - 1);
			for (let r = 1; r < n; r++) {
				const srcRow = A[r];
				const minorRow = new Array(n - 1);
				let dstCol = 0;
				for (let c = 0; c < n; c++) {
					if (c !== col) {
						minorRow[dstCol++] = srcRow[c];
					}
				}
				minor[r - 1] = minorRow;
			}
			const sign = (col & 1) === 0 ? 1 : -1;
			sum += sign * coeff * detRecursive(minor);
		}
		return sum;
	}

	// Recursive partial-pivoted Schur complement reduction for n > COFACTOR_THRESHOLD.
	let pivotRow = 0;
	let maxAbs = Math.abs(A[0][0]);
	for (let r = 1; r < n; r++) {
		const absVal = Math.abs(A[r][0]);
		if (absVal > maxAbs) {
			maxAbs = absVal;
			pivotRow = r;
		}
	}

	const pivot = A[pivotRow][0];
	if (pivot === 0) {
		return 0;
	}

	// Swapping row 0 with pivotRow is a single transposition (sign = -1 if pivotRow !== 0).
	const sign = pivotRow === 0 ? 1 : -1;
	const topRow = A[pivotRow];
	const schur = new Array(n - 1);

	for (let i = 1; i < n; i++) {
		const srcRow = i === pivotRow ? A[0] : A[i];
		const factor = srcRow[0] / pivot;
		const outRow = new Array(n - 1);
		for (let j = 1; j < n; j++) {
			outRow[j - 1] = srcRow[j] - factor * topRow[j];
		}
		schur[i - 1] = outRow;
	}

	return sign * pivot * detRecursive(schur);
}

/**
 * Computes the determinant of a square matrix of IEEE-754 float64 numbers
 * using a recursive / divide-and-conquer algorithm.
 *
 * For small matrices (`n <= 4`), uses recursive Laplace (cofactor) expansion.
 * For larger matrices (`n > 4`), uses recursive partial-pivoted Schur complement
 * reduction to achieve `O(n^3)` time complexity and numerical stability.
 * Does not mutate the input matrix.
 *
 * @param {number[][]} M - Non-empty square 2D array of finite numbers.
 * @returns {number} The determinant of `M` (with `-0` normalized to `0`).
 * @throws {TypeError} If `M` is not a 2D array of numbers.
 * @throws {RangeError} If `M` is empty, non-square, or contains non-finite numbers.
 */
export function determinantFloatRecursive(M) {
	validateSquareMatrix(M);
	const result = detRecursive(M);
	return result === 0 ? 0 : result;
}
