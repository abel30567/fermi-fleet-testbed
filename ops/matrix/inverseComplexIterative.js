/**
 * Complex number represented in Cartesian form.
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes `-0` to `0` for clean numeric output.
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Computes the modulus |z| of a complex number without undue overflow/underflow.
 * @param {Complex} z
 * @returns {number}
 */
function complexAbs(z) {
	return Math.hypot(z.re, z.im)
}

/**
 * Multiplies two complex numbers.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Subtracts complex number b from a.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexSub(a, b) {
	return {
		re: a.re - b.re,
		im: a.im - b.im,
	}
}

/**
 * Divides complex number a by non-zero complex number b using Smith's formula
 * to mitigate intermediate overflow and underflow.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexDiv(a, b) {
	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const ratio = b.im / b.re
		const denom = b.re + b.im * ratio
		return {
			re: (a.re + a.im * ratio) / denom,
			im: (a.im - a.re * ratio) / denom,
		}
	}
	const ratio = b.re / b.im
	const denom = b.im + b.re * ratio
	return {
		re: (a.re * ratio + a.im) / denom,
		im: (a.im * ratio - a.re) / denom,
	}
}

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 * @param {unknown} entry
 * @param {number} row
 * @param {number} col
 * @returns {Complex}
 */
function validateComplexEntry(entry, row, col) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(`Matrix entry at [${row}][${col}] must be an object with numeric { re, im } properties`)
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (entry)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`Matrix entry at [${row}][${col}] must have numeric re and im properties`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`Matrix entry at [${row}][${col}] must have finite re and im values`)
	}
	return { re, im }
}

/**
 * Computes the inverse of a square matrix of complex numbers `{ re, im }`
 * using an iterative Gauss-Jordan elimination algorithm with partial pivoting.
 *
 * The input matrix is not mutated. Singularity is detected relative to the
 * maximum entry modulus of the input matrix scaled by `tolerance`.
 *
 * @param {Complex[][]} matrix - Non-empty square matrix of `{ re, im }` complex numbers.
 * @param {number} [tolerance=1e-12] - Non-negative relative pivot tolerance for singularity detection.
 * @returns {Complex[][]} The inverse matrix as a new square array of `{ re, im }` objects.
 * @throws {TypeError} If `matrix` is not an array of arrays of `{ re, im }` numeric objects,
 *   or if `tolerance` is not a number.
 * @throws {RangeError} If `matrix` is empty, non-square, contains non-finite numbers,
 *   is singular (or nearly singular within `tolerance`), or if `tolerance` is negative/non-finite.
 */
export function inverseComplexIterative(matrix, tolerance = 1e-12) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Matrix must be a 2D array of complex numbers')
	}
	if (typeof tolerance !== 'number') {
		throw new TypeError('Tolerance must be a number')
	}
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('Tolerance must be a finite non-negative number')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty')
	}

	/** @type {Complex[][]} */
	const left = new Array(n)
	/** @type {Complex[][]} */
	const right = new Array(n)
	let maxEntryAbs = 0

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Matrix row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(`Matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`)
		}

		const leftRow = new Array(n)
		const rightRow = new Array(n)
		for (let j = 0; j < n; j++) {
			const cell = validateComplexEntry(row[j], i, j)
			leftRow[j] = cell
			const mag = complexAbs(cell)
			if (mag > maxEntryAbs) {
				maxEntryAbs = mag
			}
			rightRow[j] = i === j ? { re: 1, im: 0 } : { re: 0, im: 0 }
		}
		left[i] = leftRow
		right[i] = rightRow
	}

	if (maxEntryAbs === 0) {
		throw new RangeError('Matrix is singular and cannot be inverted')
	}

	const pivotThreshold = tolerance * maxEntryAbs

	for (let col = 0; col < n; col++) {
		let pivotRow = col
		let maxAbs = complexAbs(left[col][col])

		for (let row = col + 1; row < n; row++) {
			const mag = complexAbs(left[row][col])
			if (mag > maxAbs) {
				maxAbs = mag
				pivotRow = row
			}
		}

		if (maxAbs === 0 || maxAbs <= pivotThreshold) {
			throw new RangeError('Matrix is singular or nearly singular and cannot be inverted')
		}

		if (pivotRow !== col) {
			const tmpLeft = left[col]
			left[col] = left[pivotRow]
			left[pivotRow] = tmpLeft

			const tmpRight = right[col]
			right[col] = right[pivotRow]
			right[pivotRow] = tmpRight
		}

		const pivot = left[col][col]
		left[col][col] = { re: 1, im: 0 }
		for (let j = col + 1; j < n; j++) {
			left[col][j] = complexDiv(left[col][j], pivot)
		}
		for (let j = 0; j < n; j++) {
			right[col][j] = complexDiv(right[col][j], pivot)
		}

		for (let row = 0; row < n; row++) {
			if (row === col) {
				continue
			}
			const factor = left[row][col]
			if (factor.re === 0 && factor.im === 0) {
				continue
			}

			left[row][col] = { re: 0, im: 0 }
			for (let j = col + 1; j < n; j++) {
				left[row][j] = complexSub(left[row][j], complexMul(factor, left[col][j]))
			}
			for (let j = 0; j < n; j++) {
				right[row][j] = complexSub(right[row][j], complexMul(factor, right[col][j]))
			}
		}
	}

	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			const entry = right[i][j]
			if (!Number.isFinite(entry.re) || !Number.isFinite(entry.im)) {
				throw new RangeError('Matrix inversion overflowed to a non-finite value')
			}
			right[i][j] = {
				re: normalizeZero(entry.re),
				im: normalizeZero(entry.im),
			}
		}
	}

	return right
}
