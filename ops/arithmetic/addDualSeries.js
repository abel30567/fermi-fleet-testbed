/**
 * @typedef {object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Dual (forward-mode first derivative / tangent) component.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} term - Candidate dual number to validate.
 * @param {number} index - Zero-based argument index for error reporting.
 * @returns {DualNumber} The validated dual number.
 * @throws {TypeError} If `term` is not a non-null non-array object or if `v` or `d` is not a finite number.
 */
function assertDualNumber(term, index) {
	if (typeof term !== 'object' || term === null || Array.isArray(term)) {
		throw new TypeError(
			`addDualSeries: argument ${index} must be a non-null dual number object { v, d }`
		)
	}

	const { v, d } = term
	if (typeof v !== 'number' || !Number.isFinite(v)) {
		throw new TypeError(
			`addDualSeries: argument ${index}.v must be a finite number`
		)
	}
	if (typeof d !== 'number' || !Number.isFinite(d)) {
		throw new TypeError(
			`addDualSeries: argument ${index}.d must be a finite number`
		)
	}

	return term
}

/**
 * Computes a compensated sum (Neumaier improved Kahan–Babuška algorithm) over a numeric series.
 * Preserves precision when summing terms of widely varying magnitudes or cancelling terms,
 * while matching IEEE 754 addition for pairwise inputs and safely handling overflow.
 *
 * @param {number[]} values - Non-empty array of finite numbers to sum.
 * @returns {number} Compensated sum with `-0` normalized to `+0`.
 */
function compensatedSum(values) {
	let sum = values[0]
	let compensation = 0

	for (let i = 1; i < values.length; i++) {
		const term = values[i]
		const next = sum + term
		if (Number.isFinite(next)) {
			if (Math.abs(sum) >= Math.abs(term)) {
				compensation += (sum - next) + term
			} else {
				compensation += (term - next) + sum
			}
		}
		sum = next
	}

	const total = Number.isFinite(sum) ? sum + compensation : sum
	return total === 0 ? 0 : total
}

/**
 * Adds two or more dual numbers `{ v, d }` in the dual number algebra `R[ε] / (ε² = 0)`.
 *
 * Dual numbers represent first-order truncated Taylor series `f(x + ε) = f(x) + f'(x)ε`
 * (equivalently isomorphic to 2x2 upper-triangular matrices `[[v, d], [0, v]]`).
 * By linearity of the truncated Taylor / dual algebra identity (`ε² = 0`):
 *
 *   `(a.v + a.d·ε) + (b.v + b.d·ε) = (a.v + b.v) + (a.d + b.d)·ε`
 *
 * For multi-term series (`n >= 2`), both the primal (`v`) and dual (`d`) sums use
 * Neumaier compensated summation to reduce rounding loss during cancellation.
 *
 * @param {DualNumber} a - First dual number operand `{ v, d }`.
 * @param {DualNumber} b - Second dual number operand `{ v, d }`.
 * @param {...DualNumber} rest - Optional additional dual number operands `{ v, d }`.
 * @returns {DualNumber} The resulting dual number `{ v, d }` representing the sum.
 * @throws {TypeError} If fewer than 2 arguments are provided or any operand is not a valid dual number with finite `v` and `d`.
 */
export function addDualSeries(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			`addDualSeries: expected at least 2 dual number arguments, received ${arguments.length}`
		)
	}

	const terms = [a, b, ...rest]
	const values = new Array(terms.length)
	const derivatives = new Array(terms.length)

	for (let i = 0; i < terms.length; i++) {
		const dual = assertDualNumber(terms[i], i)
		values[i] = dual.v
		derivatives[i] = dual.d
	}

	return {
		v: compensatedSum(values),
		d: compensatedSum(derivatives)
	}
}
