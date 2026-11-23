/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (real part).
 * @property {number} d - Forward-mode derivative (dual part, coefficient of ε where ε² = 0).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} element - Candidate dual number.
 * @param {string} vectorName - Parameter name for error diagnostics.
 * @param {number} index - Element index within the vector.
 * @throws {TypeError} If `element` is not a plain object with numeric `v` and `d` properties.
 * @throws {RangeError} If `element.v` or `element.d` is not a finite number.
 */
function assertDualNumber(element, vectorName, index) {
	if (element === null || typeof element !== 'object' || Array.isArray(element)) {
		throw new TypeError(`${vectorName}[${index}] must be a dual number object { v, d }`)
	}
	const { v, d } = /** @type {Record<string, unknown>} */ (element)
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${vectorName}[${index}] must have numeric v and d properties`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${vectorName}[${index}] must have finite v and d values`)
	}
}

/**
 * Adds two vectors of dual numbers `{ v, d }` componentwise, propagating forward-mode
 * derivatives alongside primal values.
 *
 * In the dual-number ring ℝ[ε]/(ε²) (first-order Taylor series truncation), adding
 * `A(ε) = u + ε u'` and `B(ε) = w + ε w'` yields the exact closed-form series identity:
 *
 *   (u_i + ε u'_i) + (w_i + ε w'_i) = (u_i + w_i) + ε (u'_i + w'_i)
 *
 * @param {readonly DualNumber[]} a - First dual-number vector.
 * @param {readonly DualNumber[]} b - Second dual-number vector (must have the same length as `a`).
 * @returns {DualNumber[]} New vector of dual numbers representing `a + b`.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a valid `{ v, d }` object.
 * @throws {RangeError} If `a` and `b` differ in length, or any component `v` or `d` is non-finite.
 */
export function vectorAddDualSeries(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array of dual numbers')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array of dual numbers')
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`)
	}

	const n = a.length
	const result = new Array(n)

	for (let i = 0; i < n; i++) {
		assertDualNumber(a[i], 'a', i)
		assertDualNumber(b[i], 'b', i)

		result[i] = {
			v: a[i].v + b[i].v,
			d: a[i].d + b[i].d,
		}
	}

	return result
}
