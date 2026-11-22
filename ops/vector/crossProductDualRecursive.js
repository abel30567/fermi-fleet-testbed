/**
 * @typedef {Object} DualNumber
 * @property {number} v - The primal (real) value component.
 * @property {number} d - The tangent (first-order forward-mode derivative) component.
 */

/**
 * Normalizes IEEE 754 negative zero to positive zero.
 *
 * @param {number} x - Finite numeric value.
 * @returns {number} Normalized value where `-0` becomes `0`.
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validates that a value is a DualNumber `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} element - Candidate dual number.
 * @param {string} vectorName - Parameter name for error reporting.
 * @param {number} index - Element index within the vector.
 * @throws {TypeError} If the element is not a non-null plain-like object or `v`/`d` is not a number.
 * @throws {RangeError} If `v` or `d` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateDualElement(element, vectorName, index) {
	if (element === null || typeof element !== 'object' || Array.isArray(element)) {
		throw new TypeError(
			`Expected ${vectorName}[${index}] to be a dual number object { v, d }`,
		)
	}

	const { v, d } = /** @type {{ v: unknown, d: unknown }} */ (element)

	if (typeof v !== 'number') {
		throw new TypeError(
			`Expected ${vectorName}[${index}].v to be a number, got ${typeof v}`,
		)
	}
	if (!Number.isFinite(v)) {
		throw new RangeError(
			`Expected ${vectorName}[${index}].v to be a finite number, got ${v}`,
		)
	}

	if (typeof d !== 'number') {
		throw new TypeError(
			`Expected ${vectorName}[${index}].d to be a number, got ${typeof d}`,
		)
	}
	if (!Number.isFinite(d)) {
		throw new RangeError(
			`Expected ${vectorName}[${index}].d to be a finite number, got ${d}`,
		)
	}
}

/**
 * Validates that an input is a dense 3-element array of valid DualNumbers.
 *
 * @param {unknown} vec - Candidate 3D dual vector.
 * @param {string} name - Parameter name for error reporting.
 * @throws {TypeError} If `vec` is not an array, has holes, or contains invalid dual elements.
 * @throws {RangeError} If `vec.length !== 3` or any `v`/`d` component is non-finite.
 */
function validateDualVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`Expected "${name}" to be an Array of 3 dual numbers`)
	}
	if (vec.length !== 3) {
		throw new RangeError(
			`Expected "${name}" to have length 3, got ${vec.length}`,
		)
	}
	for (let i = 0; i < 3; i += 1) {
		if (!(i in vec)) {
			throw new TypeError(
				`Expected ${name}[${i}] to be a dual number object { v, d }, got empty slot`,
			)
		}
		validateDualElement(vec[i], name, i)
	}
}

/**
 * Adds two dual numbers: `(a.v + b.v, a.d + b.d)`.
 *
 * @param {DualNumber} a - First dual operand.
 * @param {DualNumber} b - Second dual operand.
 * @returns {DualNumber} Dual sum.
 */
function dualAdd(a, b) {
	return {
		v: normalizeZero(a.v + b.v),
		d: normalizeZero(a.d + b.d),
	}
}

/**
 * Negates a dual number: `(-a.v, -a.d)`.
 *
 * @param {DualNumber} a - Dual operand.
 * @returns {DualNumber} Negated dual number.
 */
function dualNeg(a) {
	return {
		v: normalizeZero(-a.v),
		d: normalizeZero(-a.d),
	}
}

/**
 * Multiplies two dual numbers using the product rule:
 * `(a.v * b.v, a.v * b.d + a.d * b.v)`.
 *
 * @param {DualNumber} a - First dual operand.
 * @param {DualNumber} b - Second dual operand.
 * @returns {DualNumber} Dual product.
 */
function dualMul(a, b) {
	return {
		v: normalizeZero(a.v * b.v),
		d: normalizeZero(a.v * b.d + a.d * b.v),
	}
}

/**
 * Recursively sums a slice `terms[lo..hi)` of dual numbers using
 * divide-and-conquer binary splitting.
 *
 * @param {DualNumber[]} terms - Array of dual numbers to sum.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {DualNumber} Sum of `terms[lo..hi)`.
 */
function sumDualDivideAndConquer(terms, lo, hi) {
	const count = hi - lo
	if (count <= 0) {
		return { v: 0, d: 0 }
	}
	if (count === 1) {
		return terms[lo]
	}
	const mid = lo + Math.floor(count / 2)
	const left = sumDualDivideAndConquer(terms, lo, mid)
	const right = sumDualDivideAndConquer(terms, mid, hi)
	return dualAdd(left, right)
}

/**
 * Extracts a submatrix excluding row `skipRow` and column `skipCol`.
 *
 * @param {DualNumber[][]} matrix - Input matrix of dual numbers.
 * @param {number} skipRow - Row index to omit (pass `-1` to keep all rows).
 * @param {number} skipCol - Column index to omit.
 * @returns {DualNumber[][]} Minor submatrix.
 */
function extractMinor(matrix, skipRow, skipCol) {
	const minor = []
	for (let r = 0; r < matrix.length; r += 1) {
		if (r === skipRow) continue
		const row = []
		for (let c = 0; c < matrix[r].length; c += 1) {
			if (c === skipCol) continue
			row.push(matrix[r][c])
		}
		minor.push(row)
	}
	return minor
}

/**
 * Computes the determinant of an `n x n` matrix of dual numbers recursively
 * via Laplace cofactor expansion along the first row, combining cofactor terms
 * with divide-and-conquer binary-splitting summation.
 *
 * @param {DualNumber[][]} matrix - Square matrix of dual numbers.
 * @returns {DualNumber} Dual determinant of `matrix`.
 */
function detDualRecursive(matrix) {
	const n = matrix.length
	if (n === 0) {
		return { v: 1, d: 0 }
	}
	if (n === 1) {
		return {
			v: normalizeZero(matrix[0][0].v),
			d: normalizeZero(matrix[0][0].d),
		}
	}

	/** @type {DualNumber[]} */
	const cofactorTerms = new Array(n)
	for (let col = 0; col < n; col += 1) {
		const minor = extractMinor(matrix, 0, col)
		const minorDet = detDualRecursive(minor)
		const product = dualMul(matrix[0][col], minorDet)
		cofactorTerms[col] = col % 2 === 0 ? product : dualNeg(product)
	}

	return sumDualDivideAndConquer(cofactorTerms, 0, n)
}

/**
 * Recursively computes components `[lo, hi)` of the 3D cross product using
 * divide-and-conquer splitting across output coordinates. Each leaf coordinate
 * `k` evaluates the signed cofactor `(-1)^k * det(M_k)` of the `2 x 3` matrix
 * formed by `[a, b]` using {@link detDualRecursive}.
 *
 * @param {DualNumber[][]} rows - The `2 x 3` matrix `[a, b]`.
 * @param {number} lo - Inclusive start coordinate index (`0 <= lo <= 3`).
 * @param {number} hi - Exclusive end coordinate index (`0 <= hi <= 3`).
 * @returns {DualNumber[]} Resulting slice of cross-product dual components.
 */
function crossComponentsDivideAndConquer(rows, lo, hi) {
	const count = hi - lo
	if (count <= 0) {
		return []
	}
	if (count === 1) {
		const k = lo
		const minor2x2 = extractMinor(rows, -1, k)
		const det = detDualRecursive(minor2x2)
		return [k % 2 === 0 ? det : dualNeg(det)]
	}
	const mid = lo + Math.floor(count / 2)
	const left = crossComponentsDivideAndConquer(rows, lo, mid)
	const right = crossComponentsDivideAndConquer(rows, mid, hi)
	return left.concat(right)
}

/**
 * Computes the 3D vector cross product `a x b` over dual numbers `{ v, d }`,
 * propagating both primal values and forward-mode first derivatives via a
 * recursive divide-and-conquer cofactor expansion.
 *
 * Given two 3D dual vectors `a(t) = a.v + a.d * eps` and
 * `b(t) = b.v + b.d * eps` (with `eps^2 = 0`), the result satisfies:
 * - `(a x b).v = a.v x b.v`
 * - `(a x b).d = a.d x b.v + a.v x b.d`
 *
 * The output components are divided recursively across coordinate ranges and
 * each component `k` is evaluated as the signed cofactor `(-1)^k * det(M_k)`
 * using recursive Laplace determinant expansion over dual numbers and
 * divide-and-conquer summation.
 *
 * @param {DualNumber[]} a - First 3D vector of dual numbers `[a0, a1, a2]`.
 * @param {DualNumber[]} b - Second 3D vector of dual numbers `[b0, b1, b2]`.
 * @returns {DualNumber[]} 3D dual vector representing `a x b`.
 * @throws {TypeError} If `a` or `b` is not an array, contains holes, or has
 *   elements that are not `{ v, d }` objects with numeric `v` and `d`.
 * @throws {RangeError} If `a` or `b` does not have length 3, or if any `v`
 *   or `d` component is non-finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function crossProductDualRecursive(a, b) {
	validateDualVector3(a, 'a')
	validateDualVector3(b, 'b')
	return crossComponentsDivideAndConquer([a, b], 0, 3)
}
