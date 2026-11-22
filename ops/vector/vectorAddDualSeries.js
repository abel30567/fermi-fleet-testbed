/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A first-order dual number representing `v + d*ε` with `ε² = 0`, where `v` is
 * the primal value and `d` is the forward-mode directional derivative.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite
 * numeric components.
 *
 * @param {unknown} elem - Candidate dual number element.
 * @param {string} vectorName - Parameter name (`'a'` or `'b'`) for diagnostics.
 * @param {number} index - Element index within the vector.
 * @throws {TypeError} If `elem` is not a plain-like object or `v`/`d` is not a number.
 * @throws {RangeError} If `v` or `d` is `NaN` or `±Infinity`.
 */
function assertValidDual(elem, vectorName, index) {
	if (elem === null || typeof elem !== 'object' || Array.isArray(elem)) {
		throw new TypeError(
			`${vectorName}[${index}] must be a dual number object { v, d }`
		)
	}

	const { v, d } = elem

	if (typeof v !== 'number') {
		throw new TypeError(`${vectorName}[${index}].v must be a number`)
	}
	if (!Number.isFinite(v)) {
		throw new RangeError(`${vectorName}[${index}].v must be a finite number`)
	}

	if (typeof d !== 'number') {
		throw new TypeError(`${vectorName}[${index}].d must be a number`)
	}
	if (!Number.isFinite(d)) {
		throw new RangeError(`${vectorName}[${index}].d must be a finite number`)
	}
}

/**
 * Component-wise vector addition over first-order dual numbers `{ v, d }`.
 *
 * Dual numbers form the truncated first-order Taylor series ring `ℝ[ε] / (ε²)`,
 * where each scalar entry is represented as `x(t + ε) = v + d·ε + O(ε²)`.
 * By linearity of truncated Taylor series (exact closed-form identity), adding
 * two dual vectors `a` and `b` of equal dimension `n` yields:
 *
 *   `c[i] = (a[i].v + a[i].d·ε) + (b[i].v + b[i].d·ε)`
 *         `= (a[i].v + b[i].v) + (a[i].d + b[i].d)·ε`
 *
 * Empty vectors (`a.length === 0 && b.length === 0`) are accepted as valid
 * 0-dimensional vectors and return a new empty array `[]`.
 * Neither input array nor its dual number elements are mutated.
 *
 * @param {readonly DualNumber[]} a - First dual vector of length `n`.
 * @param {readonly DualNumber[]} b - Second dual vector of length `n`.
 * @returns {DualNumber[]} New dual vector `c` of length `n` with
 *   `c[i] = { v: a[i].v + b[i].v, d: a[i].d + b[i].d }`.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a
 *   dual number object `{ v, d }` with numeric `v` and `d`.
 * @throws {RangeError} If `a` and `b` have different lengths, or if any `v` or
 *   `d` component is non-finite (`NaN`, `Infinity`, or `-Infinity`).
 */
export function vectorAddDualSeries(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array of dual numbers')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array of dual numbers')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`
		)
	}

	const n = a.length
	const result = new Array(n)

	for (let i = 0; i < n; i++) {
		const ai = a[i]
		const bi = b[i]
		assertValidDual(ai, 'a', i)
		assertValidDual(bi, 'b', i)
		result[i] = {
			v: ai.v + bi.v,
			d: ai.d + bi.d,
		}
	}

	return result
}
