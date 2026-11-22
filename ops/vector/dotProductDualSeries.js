/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A dual number `v + ε·d` (with `ε² = 0`), where `v` is the primal value and
 * `d` is the first-order forward-mode derivative (tangent / infinitesimal part).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` whose
 * components are finite JavaScript numbers.
 *
 * @param {unknown} elem - Candidate dual number element.
 * @param {string} vectorName - Parameter name (`'a'` or `'b'`) for diagnostics.
 * @param {number} index - Element index within the vector.
 * @throws {TypeError} If `elem` is not a non-null plain-like object or `v`/`d` are not numbers.
 * @throws {RangeError} If `elem.v` or `elem.d` is `NaN`, `Infinity`, or `-Infinity`.
 */
function assertValidDual(elem, vectorName, index) {
	if (elem === null || typeof elem !== 'object' || Array.isArray(elem)) {
		throw new TypeError(
			`${vectorName}[${index}] must be a dual number object { v, d }`
		)
	}

	const { v, d } = elem

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(
			`${vectorName}[${index}] must have numeric properties "v" and "d"`
		)
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(
			`${vectorName}[${index}] must have finite "v" and "d" values`
		)
	}
}

/**
 * Validates that an input is a non-empty array of valid dual numbers.
 *
 * @param {unknown} vec - Candidate vector of dual numbers.
 * @param {string} name - Parameter name (`'a'` or `'b'`) for diagnostics.
 * @throws {TypeError} If `vec` is not an array or contains malformed dual elements.
 * @throws {RangeError} If `vec` is empty or contains non-finite numeric components.
 */
function assertValidDualVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of dual numbers`)
	}

	if (vec.length === 0) {
		throw new RangeError(`${name} must be a non-empty array`)
	}

	for (let i = 0; i < vec.length; i++) {
		assertValidDual(vec[i], name, i)
	}
}

/**
 * Computes the dot product of two equal-length vectors of dual numbers
 * `{ v, d }` using the exact truncated first-order dual-number expansion
 * (closed-form identity with `ε² = 0`).
 *
 * Given dual vectors `a = [a_0, ..., a_{n-1}]` and `b = [b_0, ..., b_{n-1}]`
 * where each component is `a_i = a_i.v + ε·a_i.d` and `b_i = b_i.v + ε·b_i.d`,
 * expanding the bilinear inner product modulo `ε²` yields:
 *
 * ```
 * a · b = Σ_{i=0}^{n-1} (a_i.v + ε·a_i.d)(b_i.v + ε·b_i.d)
 *       = Σ_{i=0}^{n-1} (a_i.v · b_i.v)
 *         + ε · Σ_{i=0}^{n-1} (a_i.v · b_i.d + a_i.d · b_i.v)
 * ```
 *
 * This propagates the forward-mode directional derivative of the dot product
 * simultaneously with its primal value without finite-difference truncation error.
 *
 * @param {readonly DualNumber[]} a - First non-empty vector of dual numbers `{ v, d }`.
 * @param {readonly DualNumber[]} b - Second non-empty vector of dual numbers `{ v, d }` with the same length as `a`.
 * @returns {DualNumber} The resulting dual scalar `{ v, d }` representing the value and first derivative of `a · b`.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not an object with numeric `v` and `d`.
 * @throws {RangeError} If `a` or `b` is empty, their lengths differ, or any `v` or `d` is non-finite.
 */
export function dotProductDualSeries(a, b) {
	assertValidDualVector(a, 'a')
	assertValidDualVector(b, 'b')

	if (a.length !== b.length) {
		throw new RangeError(
			`Vectors must have equal length (received ${a.length} and ${b.length})`
		)
	}

	let sumV = 0
	let sumD = 0

	for (let i = 0; i < a.length; i++) {
		const ai = a[i]
		const bi = b[i]
		sumV += ai.v * bi.v
		sumD += ai.v * bi.d + ai.d * bi.v
	}

	return {
		v: sumV === 0 ? 0 : sumV,
		d: sumD === 0 ? 0 : sumD
	}
}
