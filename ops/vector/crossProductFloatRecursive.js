/**
 * Validates that every element in `vec[lo..hi)` is a finite IEEE-754 float64 number
 * using divide-and-conquer recursion over the index range.
 *
 * @param {readonly unknown[]} vec - Candidate vector array.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {string} name - Parameter name for error messages.
 */
function validateComponentsRange(vec, lo, hi, name) {
	if (hi - lo <= 0) {
		return
	}
	if (hi - lo === 1) {
		const value = vec[lo]
		if (typeof value !== 'number' || Number.isNaN(value)) {
			throw new TypeError(
				`${name}[${lo}] must be a valid IEEE-754 float64 number (got ${String(value)})`
			)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`${name}[${lo}] must be a finite IEEE-754 float64 number (got ${value})`
			)
		}
		return
	}
	const mid = lo + ((hi - lo) >> 1)
	validateComponentsRange(vec, lo, mid, name)
	validateComponentsRange(vec, mid, hi, name)
}

/**
 * Validates that an input is a 3-element array of finite IEEE-754 float64 numbers.
 *
 * @param {unknown} vec - Input value to validate.
 * @param {string} name - Parameter name for error messages.
 */
function validateVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be a 3-element Array of numbers`)
	}
	if (vec.length !== 3) {
		throw new RangeError(
			`${name} must have length 3 (got length ${vec.length})`
		)
	}
	validateComponentsRange(vec, 0, 3, name)
}

/**
 * Builds the `(n - 1) × (n - 1)` submatrix obtained by deleting row 0 and column `skipCol`.
 *
 * @param {readonly (readonly number[])[]} matrix - Square matrix of dimension `n >= 2`.
 * @param {number} skipCol - Column index to remove.
 * @returns {number[][]} The minor submatrix.
 */
function buildMinorSubmatrix(matrix, skipCol) {
	const submatrix = []
	for (let r = 1; r < matrix.length; r++) {
		const row = []
		for (let c = 0; c < matrix[r].length; c++) {
			if (c !== skipCol) {
				row.push(matrix[r][c])
			}
		}
		submatrix.push(row)
	}
	return submatrix
}

/**
 * Recursively computes the Laplace cofactor expansion of `matrix` along row 0
 * over column indices `[colLo, colHi)` using divide-and-conquer.
 *
 * @param {readonly (readonly number[])[]} matrix - Square numeric matrix.
 * @param {number} colLo - Inclusive start column index.
 * @param {number} colHi - Exclusive end column index.
 * @returns {number} Partial determinant sum over `[colLo, colHi)`.
 */
function expandCofactorsRange(matrix, colLo, colHi) {
	if (colHi - colLo === 1) {
		const sign = (colLo & 1) === 0 ? 1 : -1
		const submatrix = buildMinorSubmatrix(matrix, colLo)
		return sign * matrix[0][colLo] * determinantRecursive(submatrix)
	}
	const mid = colLo + ((colHi - colLo) >> 1)
	return (
		expandCofactorsRange(matrix, colLo, mid) +
		expandCofactorsRange(matrix, mid, colHi)
	)
}

/**
 * Recursively computes the determinant of a square matrix via Laplace expansion.
 *
 * @param {readonly (readonly number[])[]} matrix - Non-empty square numeric matrix.
 * @returns {number} Determinant value.
 */
function determinantRecursive(matrix) {
	if (matrix.length === 1) {
		return matrix[0][0]
	}
	return expandCofactorsRange(matrix, 0, matrix.length)
}

/**
 * Computes the `k`-th component of `a × b` as the determinant of its cyclic 2×2 minor.
 *
 * @param {readonly [number, number, number]} a - First 3D vector.
 * @param {readonly [number, number, number]} b - Second 3D vector.
 * @param {number} k - Component index (0, 1, or 2).
 * @returns {number} The `k`-th cross-product component, with `-0` normalized to `0`.
 */
function cyclicMinorCofactor(a, b, k) {
	const i = (k + 1) % 3
	const j = (k + 2) % 3
	const minorMatrix = [
		[a[i], a[j]],
		[b[i], b[j]],
	]
	const value = determinantRecursive(minorMatrix)
	return value === 0 ? 0 : value
}

/**
 * Computes cross-product components over index range `[lo, hi)` using
 * divide-and-conquer recursion.
 *
 * @param {readonly [number, number, number]} a - First 3D vector.
 * @param {readonly [number, number, number]} b - Second 3D vector.
 * @param {number} lo - Inclusive start component index.
 * @param {number} hi - Exclusive end component index.
 * @returns {number[]} Array of computed components for indices `[lo, hi)`.
 */
function crossProductRange(a, b, lo, hi) {
	if (hi - lo === 1) {
		return [cyclicMinorCofactor(a, b, lo)]
	}
	const mid = lo + ((hi - lo) >> 1)
	const left = crossProductRange(a, b, lo, mid)
	const right = crossProductRange(a, b, mid, hi)
	return [...left, ...right]
}

/**
 * Computes the 3D vector cross product `a × b` over IEEE-754 float64 numbers
 * using a recursive divide-and-conquer decomposition over component indices
 * `[0, 3)` and recursive Laplace expansion of each cyclic 2×2 minor determinant.
 *
 * @param {readonly [number, number, number]} a - First 3D vector `[ax, ay, az]`.
 * @param {readonly [number, number, number]} b - Second 3D vector `[bx, by, bz]`.
 * @returns {[number, number, number]} The cross product vector `a × b`.
 * @throws {TypeError} If `a` or `b` is not an Array or contains non-number / `NaN` elements.
 * @throws {RangeError} If `a` or `b` does not have length 3 or contains non-finite numbers (`±Infinity`).
 */
export function crossProductFloatRecursive(a, b) {
	validateVector3(a, 'a')
	validateVector3(b, 'b')
	return /** @type {[number, number, number]} */ (crossProductRange(a, b, 0, 3))
}
