import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { productComplexRecursive } from './productComplexRecursive.js'

/**
 * Helper to assert two complex numbers are approximately equal within `tolerance`.
 */
function assertComplexClose(actual, expected, tolerance = 1e-10) {
	assert.equal(typeof actual, 'object')
	assert.notEqual(actual, null)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tolerance,
		`Expected re=${actual.re} to be within ${tolerance} of ${expected.re}`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tolerance,
		`Expected im=${actual.im} to be within ${tolerance} of ${expected.im}`,
	)
	assert.equal(Object.is(actual.re, -0), false, 're must not be -0')
	assert.equal(Object.is(actual.im, -0), false, 'im must not be -0')
}

/**
 * Independent iterative reference implementation of discrete complex product.
 */
function iterativeComplexProduct(values) {
	let re = 1
	let im = 0
	for (const z of values) {
		const nextRe = re * z.re - im * z.im
		const nextIm = re * z.im + im * z.re
		re = nextRe
		im = nextIm
	}
	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}

describe('productComplexRecursive', () => {
	describe('normal cases', () => {
		it('multiplies two complex numbers accurately', () => {
			const result = productComplexRecursive([
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
			])
			assert.deepEqual(result, { re: -5, im: 10 })
		})

		it('multiplies three complex numbers (uneven divide-and-conquer split)', () => {
			// (1 + i)(1 - i)(2 + 3i) = 2 * (2 + 3i) = 4 + 6i
			const result = productComplexRecursive([
				{ re: 1, im: 1 },
				{ re: 1, im: -1 },
				{ re: 2, im: 3 },
			])
			assert.deepEqual(result, { re: 4, im: 6 })
		})

		it('computes powers of the imaginary unit i', () => {
			const i = { re: 0, im: 1 }
			assert.deepEqual(productComplexRecursive([i, i]), { re: -1, im: 0 })
			assert.deepEqual(productComplexRecursive([i, i, i]), { re: 0, im: -1 })
			assert.deepEqual(productComplexRecursive([i, i, i, i]), { re: 1, im: 0 })
			assert.deepEqual(productComplexRecursive([i, i, i, i, i]), { re: 0, im: 1 })
		})

		it('computes products of pure real and pure imaginary numbers', () => {
			assert.deepEqual(
				productComplexRecursive([
					{ re: 2, im: 0 },
					{ re: -3, im: 0 },
					{ re: 4, im: 0 },
					{ re: -5, im: 0 },
				]),
				{ re: 120, im: 0 },
			)
			// (2i)(3i)(-4i) = -24 * i^3 = 24i
			assert.deepEqual(
				productComplexRecursive([
					{ re: 0, im: 2 },
					{ re: 0, im: 3 },
					{ re: 0, im: -4 },
				]),
				{ re: 0, im: 24 },
			)
		})

		it('multiplies conjugate pairs to yield positive real modulus squared', () => {
			const z = { re: 3, im: 4 }
			const conj = { re: 3, im: -4 }
			assert.deepEqual(productComplexRecursive([z, conj]), { re: 25, im: 0 })
		})

		it('handles various array lengths (odd, even, prime, powers of two)', () => {
			for (const len of [2, 3, 4, 5, 6, 7, 8, 9, 13, 16]) {
				const arr = Array.from({ length: len }, (_, k) => ({
					re: k % 2 === 0 ? 1 : -1,
					im: 1,
				}))
				assert.deepEqual(
					productComplexRecursive(arr),
					iterativeComplexProduct(arr),
				)
			}
		})

		it('does not mutate the input array or elements and returns a fresh object', () => {
			const elem = { re: 7, im: -2 }
			const input = [elem]
			const result = productComplexRecursive(input)
			assert.deepEqual(result, { re: 7, im: -2 })
			assert.notEqual(result, elem)
			assert.deepEqual(input, [{ re: 7, im: -2 }])
		})
	})

	describe('edge cases', () => {
		it('returns multiplicative identity { re: 1, im: 0 } for an empty array', () => {
			const result = productComplexRecursive([])
			assert.deepEqual(result, { re: 1, im: 0 })
			assert.equal(Object.is(result.re, 1), true)
			assert.equal(Object.is(result.im, 0), true)
		})

		it('returns the normalized element for a single-element array', () => {
			const result = productComplexRecursive([{ re: -3.5, im: 2.25 }])
			assert.deepEqual(result, { re: -3.5, im: 2.25 })
		})

		it('collapses to { re: 0, im: 0 } when any factor is zero', () => {
			const result = productComplexRecursive([
				{ re: 5, im: -7 },
				{ re: 0, im: 0 },
				{ re: -11, im: 13 },
			])
			assert.deepEqual(result, { re: 0, im: 0 })
			assert.equal(Object.is(result.re, 0), true)
			assert.equal(Object.is(result.im, 0), true)
		})

		it('normalizes -0 to +0 in single-element and multiplied results', () => {
			const single = productComplexRecursive([{ re: -0, im: -0 }])
			assert.equal(Object.is(single.re, 0), true)
			assert.equal(Object.is(single.im, 0), true)

			// (-1 + 0i) * (0 + 0i) -> re = -0 without normalization
			const prod1 = productComplexRecursive([
				{ re: -1, im: 0 },
				{ re: 0, im: 0 },
			])
			assert.equal(Object.is(prod1.re, 0), true)
			assert.equal(Object.is(prod1.im, 0), true)

			// (-1 - 0i) * (0 - 1i) -> re = -0 without normalization, im = 1
			const prod2 = productComplexRecursive([
				{ re: -1, im: -0 },
				{ re: 0, im: -1 },
			])
			assert.equal(Object.is(prod2.re, 0), true)
			assert.equal(Object.is(prod2.im, 1), true)
		})

		it('throws TypeError for non-array inputs', () => {
			for (const invalid of [
				undefined,
				null,
				42,
				'1+2i',
				true,
				{ re: 1, im: 2 },
				new Set([{ re: 1, im: 2 }]),
			]) {
				assert.throws(() => productComplexRecursive(invalid), TypeError)
			}
		})

		it('throws TypeError for sparse arrays and malformed elements', () => {
			const sparse = new Array(2)
			sparse[1] = { re: 1, im: 0 }
			assert.throws(() => productComplexRecursive(sparse), TypeError)

			const invalidElements = [
				null,
				undefined,
				5,
				'1+0i',
				[1, 0],
				{},
				{ re: 1 },
				{ im: 1 },
				{ re: '1', im: 0 },
				{ re: 1, im: '0' },
				{ re: 1n, im: 0 },
				{ re: null, im: 0 },
			]
			for (const bad of invalidElements) {
				assert.throws(() => productComplexRecursive([bad]), TypeError)
			}
		})

		it('throws RangeError for non-finite re or im values (even after a zero element)', () => {
			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFinite) {
				assert.throws(() => productComplexRecursive([bad]), RangeError)
				assert.throws(
					() => productComplexRecursive([{ re: 0, im: 0 }, bad]),
					RangeError,
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches iterative reference implementation on a deterministic sequence of 50 complex numbers', () => {
			// Magnitudes close to 1 to avoid float overflow/underflow across 50 factors
			const values = Array.from({ length: 50 }, (_, k) => {
				const r = 0.95 + 0.1 * ((k * 7) % 11) / 10
				const theta = (k + 1) * 0.37
				return { re: r * Math.cos(theta), im: r * Math.sin(theta) }
			})
			const recursiveResult = productComplexRecursive(values)
			const iterativeResult = iterativeComplexProduct(values)
			assertComplexClose(recursiveResult, iterativeResult, 1e-10)
		})

		it('satisfies the nth roots of unity identity: prod_{k=0}^{n-1} exp(2*pi*i*k/n) = (-1)^(n-1)', () => {
			for (const n of [1, 2, 3, 4, 7, 8, 9, 16, 25]) {
				const roots = Array.from({ length: n }, (_, k) => {
					const angle = (2 * Math.PI * k) / n
					return { re: Math.cos(angle), im: Math.sin(angle) }
				})
				const expectedRe = n % 2 === 0 ? -1 : 1
				assertComplexClose(
					productComplexRecursive(roots),
					{ re: expectedRe, im: 0 },
					1e-10,
				)
			}
		})

		it('satisfies polar form identity (De Moivre / angle addition & modulus multiplication)', () => {
			const moduli = [1.2, 0.8, 1.5, 0.75, 1.1, 0.9, 1.3]
			const angles = [0.3, -0.7, 1.1, 2.2, -1.5, 0.4, 0.85]
			const factors = moduli.map((r, i) => ({
				re: r * Math.cos(angles[i]),
				im: r * Math.sin(angles[i]),
			}))

			const expectedRadius = moduli.reduce((acc, r) => acc * r, 1)
			const expectedAngle = angles.reduce((acc, a) => acc + a, 0)
			const expected = {
				re: expectedRadius * Math.cos(expectedAngle),
				im: expectedRadius * Math.sin(expectedAngle),
			}

			assertComplexClose(productComplexRecursive(factors), expected, 1e-12)
		})

		it('satisfies concatenation homomorphism prod(A ++ B) = prod(A) * prod(B)', () => {
			const a = [
				{ re: 1, im: 2 },
				{ re: -3, im: 1 },
				{ re: 0.5, im: -1.5 },
			]
			const b = [
				{ re: 2, im: -1 },
				{ re: -1, im: -2 },
				{ re: 3, im: 0.5 },
				{ re: 1, im: 1 },
			]
			const prodAll = productComplexRecursive([...a, ...b])
			const prodCombined = productComplexRecursive([
				productComplexRecursive(a),
				productComplexRecursive(b),
			])
			assertComplexClose(prodAll, prodCombined, 1e-12)
		})

		it('handles large inputs (10,000 unit-circle factors) with O(log n) stack depth', () => {
			const n = 10_000
			const stepAngle = Math.PI / n
			const factors = Array.from({ length: n }, () => ({
				re: Math.cos(stepAngle),
				im: Math.sin(stepAngle),
			}))
			// Total rotation is n * (pi / n) = pi -> exp(i * pi) = -1 + 0i
			assertComplexClose(
				productComplexRecursive(factors),
				{ re: -1, im: 0 },
				1e-9,
			)
		})
	})
})
