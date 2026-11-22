/**
 * Computes the discrete k-permutations (falling factorial) over the complex
 * numbers using a straightforward iterative product:
 *
 *   P(z, k) = (z)_k = z * (z - 1) * (z - 2) * ... * (z - k + 1)
 *
 * where z = re + i * im is represented as `{ re, im }` and k is a non-negative
 * safe integer. By convention, the empty product P(z, 0) equals `{ re: 1, im: 0 }`.
 *
 * @param {{ re: number, im: number }} z - Complex number `{ re, im }` with finite components.
 * @param {number} k - Non-negative safe integer number of factors.
 * @returns {{ re: number, im: number }} The complex falling factorial P(z, k).
 * @throws {TypeError} If `z` is not a complex number object `{ re, im }` with numeric components, or if `k` is not a number.
 * @throws {RangeError} If `z.re` or `z.im` is not finite, if `k` is not a non-negative safe integer, or if the result overflows finite floating-point range.
 */
export function permutationsComplexIterative(z, k) {
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
	if (!Number.isFinite(k) || !Number.isInteger(k) || k < 0 || !Number.isSafeInteger(k)) {
		throw new RangeError('k must be a non-negative safe integer')
	}

	if (k === 0) {
		return { re: 1, im: 0 }
	}

	// If z is a real integer n with 0 <= n < k, the j = n factor (z - n) is identically 0.
	if (z.im === 0 && Number.isInteger(z.re) && z.re >= 0 && z.re < k) {
		return { re: 0, im: 0 }
	}

	let re = 1
	let im = 0
	const zRe = z.re
	const zIm = z.im

	for (let j = 0; j < k; j++) {
		const factorRe = zRe - j
		const factorIm = zIm

		const nextRe = re * factorRe - im * factorIm
		const nextIm = re * factorIm + im * factorRe

		if (!Number.isFinite(nextRe) || !Number.isFinite(nextIm)) {
			throw new RangeError('Result overflowed finite floating-point range')
		}

		re = nextRe
		im = nextIm
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
