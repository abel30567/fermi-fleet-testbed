/**
 * Compute the generalized discrete binomial coefficient (combinations) C(z, k)
 * over a complex upper index z = { re, im } and a non-negative integer k,
 * using a straightforward iterative product:
 *
 *   C(z, k) = prod_{j=1..k} (z - j + 1) / j
 *
 * with C(z, 0) = { re: 1, im: 0 }.
 *
 * @param {{ re: number, im: number }} z - Complex upper index with finite real and imaginary parts.
 * @param {number} k - Non-negative safe integer lower index.
 * @returns {{ re: number, im: number }} Complex binomial coefficient { re, im }.
 * @throws {TypeError} If z is not a complex number object { re, im } or k is not a number.
 * @throws {RangeError} If z.re/z.im are non-finite, k is not a non-negative safe integer, or the result overflows.
 */
export function combinationsComplexIterative(z, k) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('z must be a complex number object { re, im }')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('z.re and z.im must be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('z.re and z.im must be finite numbers')
	}
	if (typeof k !== 'number') {
		throw new TypeError('k must be a number')
	}
	if (!Number.isSafeInteger(k) || k < 0) {
		throw new RangeError('k must be a non-negative safe integer')
	}

	if (k === 0) {
		return { re: 1, im: 0 }
	}

	let effectiveK = k
	if (z.im === 0 && Number.isSafeInteger(z.re) && z.re >= 0) {
		if (k > z.re) {
			return { re: 0, im: 0 }
		}
		effectiveK = Math.min(k, z.re - k)
	}

	let re = 1
	let im = 0

	for (let j = 1; j <= effectiveK; j++) {
		const numRe = z.re - (j - 1)
		const numIm = z.im

		let nextRe = (re * numRe - im * numIm) / j
		let nextIm = (re * numIm + im * numRe) / j

		if (!Number.isFinite(nextRe) || !Number.isFinite(nextIm)) {
			const fRe = numRe / j
			const fIm = numIm / j
			nextRe = re * fRe - im * fIm
			nextIm = re * fIm + im * fRe
		}

		if (!Number.isFinite(nextRe) || !Number.isFinite(nextIm)) {
			throw new RangeError('Result overflows finite floating-point precision')
		}

		re = nextRe
		im = nextIm

		if (re === 0 && im === 0) {
			return { re: 0, im: 0 }
		}
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
