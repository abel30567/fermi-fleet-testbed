/**
 * Computes the discrete permutations (falling factorial) over complex numbers:
 *
 *   P(z, k) = (z)_k = z * (z - 1) * (z - 2) * ... * (z - k + 1)
 *
 * using a straightforward iterative product. By convention, P(z, 0) = 1 + 0i.
 *
 * @param {{ re: number, im: number }} z - Complex base operand with finite real and imaginary parts.
 * @param {number} k - Non-negative safe integer number of falling factors.
 * @returns {{ re: number, im: number }} The complex falling factorial { re, im }.
 * @throws {TypeError} If `z` is not an object with numeric `re` and `im` properties, or `k` is not a number.
 * @throws {RangeError} If `z.re` or `z.im` is not finite, `k` is not a non-negative safe integer, or the result overflows finite IEEE-754 double precision.
 */
export function permutationsComplexIterative(z, k) {
	if (typeof z !== 'object' || z === null || Array.isArray(z)) {
		throw new TypeError('Expected z to be a complex number object { re, im }')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('Expected z.re and z.im to be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('Expected z.re and z.im to be finite numbers')
	}
	if (typeof k !== 'number') {
		throw new TypeError('Expected k to be a number')
	}
	if (!Number.isSafeInteger(k) || k < 0) {
		throw new RangeError('Expected k to be a non-negative safe integer')
	}

	let accRe = 1
	let accIm = 0

	for (let j = 0; j < k; j++) {
		const factorRe = z.re - j
		const factorIm = z.im

		if (factorRe === 0 && factorIm === 0) {
			return { re: 0, im: 0 }
		}

		const nextRe = accRe * factorRe - accIm * factorIm
		const nextIm = accRe * factorIm + accIm * factorRe

		if (!Number.isFinite(nextRe) || !Number.isFinite(nextIm)) {
			throw new RangeError('Result overflows finite IEEE-754 double precision')
		}

		accRe = nextRe
		accIm = nextIm
	}

	return {
		re: accRe === 0 ? 0 : accRe,
		im: accIm === 0 ? 0 : accIm,
	}
}
