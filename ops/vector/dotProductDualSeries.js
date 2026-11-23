/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} dual - Candidate dual number object.
 * @param {string} label - Vector label for error reporting.
 * @param {number} index - Element index for error reporting.
 * @returns {{ v: number, d: number }} The validated dual number.
 * @throws {TypeError} If the element is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is not finite (`NaN` or `±Infinity`).
 */
function assertDual(dual, label, index) {
	if (dual === null || typeof dual !== 'object') {
		throw new TypeError(`${label}[${index}] must be a dual number object { v, d }`)
	}
	const { v, d } = dual
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${label}[${index}].v and .d must be numbers`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${label}[${index}].v and .d must be finite numbers`)
	}
	return dual
}

/**
 * Computes the vector dot product over dual numbers `{ v, d }`, propagating the
 * forward-mode directional derivative alongside the primal value.
 *
 * Using the bilinear product rule identity for dual numbers (where ε² = 0):
 *
 *   (a + ε a') · (b + ε b') = (a · b) + ε (a · b' + a' · b)
 *
 * Terms are accumulated with Neumaier compensated summation to minimize
 * floating-point cancellation across series of terms.
 *
 * @param {ReadonlyArray<{ v: number, d: number }>} a - First vector of dual numbers.
 * @param {ReadonlyArray<{ v: number, d: number }>} b - Second vector of dual numbers (same length as `a`).
 * @returns {{ v: number, d: number }} Dual number containing the dot product value `v` and derivative `d`.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a `{ v, d }` object with numeric fields.
 * @throws {RangeError} If `a` and `b` have different lengths, or any component is non-finite.
 */
export function dotProductDualSeries(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) {
		throw new TypeError('Both inputs must be arrays of dual numbers { v, d }')
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector length mismatch: expected ${a.length}, received ${b.length}`)
	}

	let vSum = 0
	let vComp = 0
	let dSum = 0
	let dComp = 0

	for (let i = 0; i < a.length; i++) {
		const ai = assertDual(a[i], 'a', i)
		const bi = assertDual(b[i], 'b', i)

		// Primal series term: a_i.v * b_i.v
		const pv = ai.v * bi.v
		const vt = vSum + pv
		if (Number.isFinite(vt)) {
			vComp += Math.abs(vSum) >= Math.abs(pv) ? (vSum - vt) + pv : (pv - vt) + vSum
		} else {
			vComp = 0
		}
		vSum = vt

		// Derivative series terms from bilinear product rule: a_i.v * b_i.d + a_i.d * b_i.v
		const pd1 = ai.v * bi.d
		const dt1 = dSum + pd1
		if (Number.isFinite(dt1)) {
			dComp += Math.abs(dSum) >= Math.abs(pd1) ? (dSum - dt1) + pd1 : (pd1 - dt1) + dSum
		} else {
			dComp = 0
		}
		dSum = dt1

		const pd2 = ai.d * bi.v
		const dt2 = dSum + pd2
		if (Number.isFinite(dt2)) {
			dComp += Math.abs(dSum) >= Math.abs(pd2) ? (dSum - dt2) + pd2 : (pd2 - dt2) + dSum
		} else {
			dComp = 0
		}
		dSum = dt2
	}

	const v = vSum + vComp
	const d = dSum + dComp

	return {
		v: v === 0 ? 0 : v,
		d: d === 0 ? 0 : d,
	}
}
