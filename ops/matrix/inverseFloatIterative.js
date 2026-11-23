/**
 * Computes the inverse of a square matrix of IEEE-754 float64 numbers
 * using iterative Gauss-Jordan elimination with partial pivoting.
 *
 * The input matrix is not mutated. Throws an error for invalid inputs
 * or singular / nearly singular matrices.
 *
 * @param {number[][]} matrix - Non-empty square matrix (n x n) of finite float64 numbers.
 * @param {number} [tolerance=1e-12] - Relative pivot threshold for detecting singular matrices (must be a finite number >= 0).
 * @returns {number[][]} The n x n inverse matrix.
 * @throws {TypeError} If `matrix` is not a 2D array of numbers or `tolerance` is not a number.
 * @throws {RangeError} If `matrix` is empty, non-square, contains non-finite numbers, `tolerance` is invalid, or inversion overflows float64.
 * @throws {Error} If `matrix` is singular or nearly singular.
 */
export function inverseFloatIterative(matrix, tolerance = 1e-12) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of finite numbers');
	}
	const n = matrix.length;
	if (n === 0) {
		throw new RangeError('matrix must be non-empty');
	}
	if (typeof tolerance !== 'number') {
		throw new TypeError('tolerance must be a number');
	}
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('tolerance must be a finite non-negative number');
	}

	// Validate shape/entries and build augmented matrix [A | I]
	const width = 2 * n;
	const aug = new Array(n);
	let maxScale = 0;

	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(`matrix must be square: row ${i} has length ${row.length}, expected ${n}`);
		}

		const augRow = new Array(width);
		for (let j = 0; j < n; j++) {
			const val = row[j];
			if (typeof val !== 'number') {
				throw new TypeError(`matrix[${i}][${j}] must be a number`);
			}
			if (!Number.isFinite(val)) {
				throw new RangeError(`matrix[${i}][${j}] must be a finite number`);
			}
			const absVal = Math.abs(val);
			if (absVal > maxScale) {
				maxScale = absVal;
			}
			augRow[j] = val;
			augRow[n + j] = i === j ? 1 : 0;
		}
		aug[i] = augRow;
	}

	if (maxScale === 0) {
		throw new Error('matrix is singular and cannot be inverted');
	}

	const pivotThreshold = maxScale * tolerance;

	// Iterative Gauss-Jordan elimination with partial pivoting
	for (let col = 0; col < n; col++) {
		let pivotRow = col;
		let maxAbs = Math.abs(aug[col][col]);

		for (let r = col + 1; r < n; r++) {
			const absVal = Math.abs(aug[r][col]);
			if (absVal > maxAbs) {
				maxAbs = absVal;
				pivotRow = r;
			}
		}

		if (maxAbs === 0 || maxAbs <= pivotThreshold) {
			throw new Error('matrix is singular or nearly singular and cannot be inverted');
		}

		if (pivotRow !== col) {
			const tmp = aug[col];
			aug[col] = aug[pivotRow];
			aug[pivotRow] = tmp;
		}

		const pRow = aug[col];
		const pivotVal = pRow[col];
		pRow[col] = 1;
		for (let j = col + 1; j < width; j++) {
			pRow[j] /= pivotVal;
		}

		for (let r = 0; r < n; r++) {
			if (r === col) {
				continue;
			}
			const targetRow = aug[r];
			const factor = targetRow[col];
			if (factor === 0) {
				continue;
			}
			targetRow[col] = 0;
			for (let j = col + 1; j < width; j++) {
				targetRow[j] -= factor * pRow[j];
			}
		}
	}

	// Extract right half as the inverse matrix
	const inverse = new Array(n);
	for (let i = 0; i < n; i++) {
		const srcRow = aug[i];
		const outRow = new Array(n);
		for (let j = 0; j < n; j++) {
			const val = srcRow[n + j];
			if (!Number.isFinite(val)) {
				throw new RangeError('matrix inverse overflowed IEEE-754 float64 range');
			}
			outRow[j] = val === 0 ? 0 : val;
		}
		inverse[i] = outRow;
	}

	return inverse;
}
