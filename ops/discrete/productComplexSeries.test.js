import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productComplexSeries } from './productComplexSeries.js'

/**
 * Independent reference implementation via direct iterative complex multiplication:
 * (a + bi)(c + di) = (ac - bd) + (ad + bc)i.
 *
 * @param {Array<{ re: number, im: number }>} values
 * @returns {{ re: number, im: number }}
 */
function naiveComplexProduct(values) {
	let re = 1
	let im = 0
	for (const z of values) {
		const nextRe = re * z.re - im * z.im
		const nextIm = re * z.im + im * z.re
		re = nextRe
		im = nextIm
	}
	return { re, im }
}

/**
 * Asserts two complex numbers are equal within combined absolute/relative tolerance.
 *
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [tol=1e-12]
 */
function assertComplexClose(actual, expected, tol = 1e-12) {
	const scale = Math.max(1, Math.hypot(expected.re, expected.im))
	const errRe = Math.abs(actual.re - expected.re)
	const errIm = Math.abs(actual.im - expected.im)
	assert.ok(
		errRe <= tol * scale,
		`real mismatch: got ${actual.re}, expected ${expected.re} (err=${errRe}, limit=${tol * scale})`,
	)
	assert.ok(
		errIm <= tol * scale,
		`imag mismatch: got ${actual.im}, expected ${expected.im} (err=${errIm}, limit=${tol * scale})`,
	)
}

describe('productComplexSeries', () => {
	test('empty product returns multiplicative identity { re: 1, im: 0 }', () => {
		assert.deepEqual(productComplexSeries([]), { re: 1, im: 0 })
	})

	test('single complex number returns equivalent value', () => {
		assertComplexClose(productComplexSeries([{ re: 3, im: 4 }]), { re: 3, im: 4 })
		assertComplexClose(productComplexSeries([{ re: -2.5, im: 7.25 }]), { re: -2.5, im: 7.25 })
		assertComplexClose(productComplexSeries([{ re: -3, im: -4 }]), { re: -3, im: -4 })
		assertComplexClose(productComplexSeries([{ re: 5, im: -12 }]), { re: 5, im: -12 })
	})

	test('exact axis-aligned and quarter-turn products (powers of i and -1)', () => {
		const i = { re: 0, im: 1 }
		const negI = { re: 0, im: -1 }
		const neg1 = { re: -1, im: 0 }

		assert.deepEqual(productComplexSeries([i]), { re: 0, im: 1 })
		assert.deepEqual(productComplexSeries([i, i]), { re: -1, im: 0 })
		assert.deepEqual(productComplexSeries([i, i, i]), { re: 0, im: -1 })
		assert.deepEqual(productComplexSeries([i, i, i, i]), { re: 1, im: 0 })
		assert.deepEqual(productComplexSeries([negI, negI]), { re: -1, im: 0 })
		assert.deepEqual(productComplexSeries([neg1, neg1, neg1]), { re: -1, im: 0 })
		assert.deepEqual(productComplexSeries([{ re: 0, im: -2 }, { re: 0, im: 3 }]), { re: 6, im: 0 })

		// Ensure no -0 components
		const res = productComplexSeries([neg1, { re: 1, im: -0 }])
		assert.ok(Object.is(res.im, 0))
	})

	test('zero factor handling at start, middle, and end', () => {
		assert.deepEqual(productComplexSeries([{ re: 0, im: 0 }]), { re: 0, im: 0 })
		assert.deepEqual(
			productComplexSeries([{ re: 0, im: 0 }, { re: 3, im: 4 }, { re: -1, im: 2 }]),
			{ re: 0, im: 0 },
		)
		assert.deepEqual(
			productComplexSeries([{ re: 3, im: 4 }, { re: 0, im: 0 }, { re: -1, im: 2 }]),
			{ re: 0, im: 0 },
		)
		assert.deepEqual(
			productComplexSeries([{ re: 3, im: 4 }, { re: -1, im: 2 }, { re: -0, im: -0 }]),
			{ re: 0, im: 0 },
		)
	})

	test('standard textbook products', () => {
		// (1 + 2i)(3 + 4i) = -5 + 10i
		assertComplexClose(
			productComplexSeries([{ re: 1, im: 2 }, { re: 3, im: 4 }]),
			{ re: -5, im: 10 },
		)
		// (1 + i)^4 = -4
		assertComplexClose(
			productComplexSeries([
				{ re: 1, im: 1 },
				{ re: 1, im: 1 },
				{ re: 1, im: 1 },
				{ re: 1, im: 1 },
			]),
			{ re: -4, im: 0 },
		)
		// (2 - 3i)(-1 + 5i)(4 + i) = (13 + 13i)(4 + i) = 39 + 65i
		assertComplexClose(
			productComplexSeries([
				{ re: 2, im: -3 },
				{ re: -1, im: 5 },
				{ re: 4, im: 1 },
			]),
			{ re: 39, im: 65 },
		)
	})

	test('cross-check against direct iterative complex multiplication across diverse sequences', () => {
		// Deterministic pseudo-random generator (LCG) for reproducible coverage of all 4 quadrants
		let seed = 123456789
		const nextRand = () => {
			seed = (1103515245 * seed + 12345) & 0x7fffffff
			return (seed / 0x7fffffff) * 4 - 2 // [-2, 2]
		}

		for (const len of [2, 3, 5, 10, 25, 50]) {
			const seq = []
			for (let k = 0; k < len; k++) {
				// Keep magnitudes near 1 so naive product doesn't overflow/underflow
				const angle = nextRand() * Math.PI
				const radius = 0.75 + 0.5 * ((k % 5) / 4)
				seq.push({ re: radius * Math.cos(angle), im: radius * Math.sin(angle) })
			}
			const actual = productComplexSeries(seq)
			const expected = naiveComplexProduct(seq)
			assertComplexClose(actual, expected, 1e-11)
		}
	})

	test('mathematical identity: product of n-th roots of unity equals (-1)^(n-1)', () => {
		for (const n of [1, 2, 3, 4, 5, 6, 7, 12, 50, 99]) {
			const roots = Array.from({ length: n }, (_, k) => ({
				re: Math.cos((2 * Math.PI * k) / n),
				im: Math.sin((2 * Math.PI * k) / n),
			}))
			const expectedRe = n % 2 === 1 ? 1 : -1
			assertComplexClose(productComplexSeries(roots), { re: expectedRe, im: 0 }, 1e-11)
		}
	})

	test('mathematical identity: polynomial factorization prod(z - omega^k) = z^n - 1', () => {
		const z = { re: 1.5, im: -0.75 }
		for (const n of [3, 5, 8, 12]) {
			const factors = Array.from({ length: n }, (_, k) => {
				const angle = (2 * Math.PI * k) / n
				return {
					re: z.re - Math.cos(angle),
					im: z.im - Math.sin(angle),
				}
			})
			// Independent closed-form z^n - 1 via De Moivre's theorem
			const r = Math.hypot(z.re, z.im)
			const theta = Math.atan2(z.im, z.re)
			const expected = {
				re: r ** n * Math.cos(n * theta) - 1,
				im: r ** n * Math.sin(n * theta),
			}
			assertComplexClose(productComplexSeries(factors), expected, 1e-11)
		}
	})

	test('mathematical identity: conjugate pairs yield product of squared moduli', () => {
		const base = [
			{ re: 1.2, im: 3.4 },
			{ re: -2.1, im: 0.7 },
			{ re: -0.5, im: -4.2 },
			{ re: 3.3, im: -1.1 },
		]
		const paired = base.flatMap((z) => [z, { re: z.re, im: -z.im }])
		const expectedModSq = base.reduce((acc, z) => acc * (z.re * z.re + z.im * z.im), 1)
		assertComplexClose(productComplexSeries(paired), { re: expectedModSq, im: 0 }, 1e-11)
	})

	test('commutativity and multiplicative homomorphism', () => {
		const a = [
			{ re: 1.5, im: -0.5 },
			{ re: -2.0, im: 1.25 },
			{ re: 0.3, im: 0.9 },
		]
		const b = [
			{ re: -0.8, im: -1.6 },
			{ re: 2.2, im: 0.4 },
		]

		const combined = productComplexSeries([...a, ...b])
		const reversed = productComplexSeries([...b, ...a].reverse())
		const split = productComplexSeries([productComplexSeries(a), productComplexSeries(b)])

		assertComplexClose(combined, reversed, 1e-12)
		assertComplexClose(combined, split, 1e-12)
	})

	test('log-polar identity avoids intermediate overflow and underflow', () => {
		// Naive iterative multiplication overflows on the second factor
		const cancellingHuge = [
			{ re: 1e200, im: 0 },
			{ re: 1e200, im: 0 },
			{ re: 1e-200, im: 0 },
			{ re: 1e-200, im: 0 },
		]
		assertComplexClose(productComplexSeries(cancellingHuge), { re: 1, im: 0 }, 1e-12)

		// Complex cancellation with rotation: (1e200 * i) * (1e200 * i) * (1e-200) * (1e-200) = -1
		const rotatedHuge = [
			{ re: 0, im: 1e200 },
			{ re: 0, im: 1e200 },
			{ re: 1e-200, im: 0 },
			{ re: 1e-200, im: 0 },
		]
		assertComplexClose(productComplexSeries(rotatedHuge), { re: -1, im: 0 }, 1e-12)

		// Extreme single element whose |z| > Number.MAX_VALUE while re, im are finite
		const extremeCorner = productComplexSeries([{ re: 1.5e308, im: 1.5e308 }])
		assert.ok(Number.isFinite(extremeCorner.re))
		assert.ok(Number.isFinite(extremeCorner.im))
		assertComplexClose(extremeCorner, { re: 1.5e308, im: 1.5e308 }, 1e-12)

		// Subnormal input
		const subnormal = productComplexSeries([{ re: 1e-320, im: 1e-320 }])
		assertComplexClose(subnormal, { re: 1e-320, im: 1e-320 }, 1e-3)

		// True overflow with axis-aligned angle does not yield NaN
		const overflowAxis = productComplexSeries([{ re: 1e200, im: 0 }, { re: 1e200, im: 0 }])
		assert.equal(overflowAxis.re, Infinity)
		assert.equal(overflowAxis.im, 0)
	})

	test('input validation rejects invalid arrays, elements, and non-finite components', () => {
		// Non-array inputs
		for (const bad of [null, undefined, 42, '1+2i', { re: 1, im: 0 }, new Set()]) {
			assert.throws(() => productComplexSeries(bad), TypeError)
		}

		// Invalid element shapes
		for (const badEl of [null, undefined, 1, 'x', [1, 2], {}, { re: 1 }, { im: 1 }, { re: '1', im: 0 }, { re: 1, im: null }]) {
			assert.throws(() => productComplexSeries([badEl]), TypeError)
		}

		// Non-finite components
		for (const badVal of [NaN, Infinity, -Infinity]) {
			assert.throws(() => productComplexSeries([{ re: badVal, im: 0 }]), RangeError)
			assert.throws(() => productComplexSeries([{ re: 0, im: badVal }]), RangeError)
		}

		// Validation still runs even after a zero element
		assert.throws(
			() => productComplexSeries([{ re: 0, im: 0 }, { re: NaN, im: 1 }]),
			RangeError,
		)
		assert.throws(
			() => productComplexSeries([{ re: 0, im: 0 }, null]),
			TypeError,
		)
	})
})
