import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productComplexLazy } from './productComplexLazy.js'

/**
 * Asserts two complex numbers are equal within an absolute tolerance.
 *
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [eps=1e-12]
 */
function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`re mismatch: expected ${expected.re} ± ${eps}, got ${actual.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`im mismatch: expected ${expected.im} ± ${eps}, got ${actual.im}`
	)
}

describe('productComplexLazy', () => {
	describe('normal cases', () => {
		test('computes exact running partial products for finite array', () => {
			const input = [
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
				{ re: -1, im: 5 },
			]
			// Step 0: (1 + 2i)
			// Step 1: (1 + 2i)(3 + 4i) = (3 - 8) + (4 + 6)i = -5 + 10i
			// Step 2: (-5 + 10i)(-1 + 5i) = (5 - 50) + (-25 - 10)i = -45 - 35i
			const results = [...productComplexLazy(input)]
			assert.deepEqual(results, [
				{ re: 1, im: 2 },
				{ re: -5, im: 10 },
				{ re: -45, im: -35 },
			])
		})

		test('handles powers of the imaginary unit i', () => {
			const powersOfI = [
				{ re: 0, im: 1 },
				{ re: 0, im: 1 },
				{ re: 0, im: 1 },
				{ re: 0, im: 1 },
			]
			assert.deepEqual([...productComplexLazy(powersOfI)], [
				{ re: 0, im: 1 },
				{ re: -1, im: 0 },
				{ re: 0, im: -1 },
				{ re: 1, im: 0 },
			])
		})

		test('handles single complex factor without mutating input', () => {
			const factor = { re: -7, im: 3.5 }
			const results = [...productComplexLazy([factor])]
			assert.deepEqual(results, [{ re: -7, im: 3.5 }])
			assert.notEqual(results[0], factor)
		})

		test('accepts any iterable (Set, custom iterable, generator)', () => {
			const set = new Set([
				{ re: 2, im: 0 },
				{ re: 0, im: 3 },
			])
			assert.deepEqual([...productComplexLazy(set)], [
				{ re: 2, im: 0 },
				{ re: 0, im: 6 },
			])

			const customIterable = {
				*[Symbol.iterator]() {
					yield { re: 1, im: -1 }
					yield { re: 1, im: 1 }
				},
			}
			assert.deepEqual([...productComplexLazy(customIterable)], [
				{ re: 1, im: -1 },
				{ re: 2, im: 0 },
			])
		})

		test('mutating a yielded object does not corrupt subsequent products', () => {
			const gen = productComplexLazy([
				{ re: 2, im: 3 },
				{ re: 4, im: 5 },
			])
			const first = gen.next().value
			first.re = 999
			first.im = -999
			const second = gen.next().value
			assert.deepEqual(second, { re: -7, im: 22 })
		})
	})

	describe('edge cases', () => {
		test('empty iterable yields nothing', () => {
			assert.deepEqual([...productComplexLazy([])], [])
			const gen = productComplexLazy([])
			assert.deepEqual(gen.next(), { value: undefined, done: true })
		})

		test('zero factor annihilates current and subsequent partial products without -0', () => {
			const input = [
				{ re: -3, im: 4 },
				{ re: 0, im: 0 },
				{ re: -5, im: 7 },
			]
			const results = [...productComplexLazy(input)]
			assert.deepEqual(results, [
				{ re: -3, im: 4 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			])
			assert.ok(Object.is(results[1].re, 0))
			assert.ok(Object.is(results[1].im, 0))
			assert.ok(Object.is(results[2].re, 0))
			assert.ok(Object.is(results[2].im, 0))
		})

		test('normalizes -0 inputs to +0', () => {
			const results = [...productComplexLazy([{ re: -0, im: -0 }])]
			assert.ok(Object.is(results[0].re, 0))
			assert.ok(Object.is(results[0].im, 0))
		})

		test('lazily consumes an infinite generator strictly one element per pull', () => {
			let pulled = 0
			let closed = false

			function* infiniteDoubles() {
				try {
					while (true) {
						pulled += 1
						yield { re: 2, im: 0 }
					}
				} finally {
					closed = true
				}
			}

			const gen = productComplexLazy(infiniteDoubles())
			assert.equal(pulled, 0)

			const taken = []
			for (const p of gen) {
				taken.push(p)
				assert.equal(pulled, taken.length)
				if (taken.length === 5) break
			}

			assert.deepEqual(taken, [
				{ re: 2, im: 0 },
				{ re: 4, im: 0 },
				{ re: 8, im: 0 },
				{ re: 16, im: 0 },
				{ re: 32, im: 0 },
			])
			assert.equal(pulled, 5)
			assert.equal(closed, true)
		})

		test('defers validation of later elements until they are pulled', () => {
			function* eventuallyInvalid() {
				yield { re: 2, im: 1 }
				yield { re: 3, im: -1 }
				yield /** @type {any} */ ({ re: NaN, im: 0 })
			}

			const gen = productComplexLazy(eventuallyInvalid())
			assert.deepEqual(gen.next().value, { re: 2, im: 1 })
			assert.deepEqual(gen.next().value, { re: 7, im: 1 })
			assert.throws(() => gen.next(), RangeError)
		})
	})

	describe('input validation', () => {
		test('rejects non-iterable or string inputs', () => {
			const badInputs = [null, undefined, 42, true, {}, '123']
			for (const bad of badInputs) {
				assert.throws(
					() => [...productComplexLazy(/** @type {any} */ (bad))],
					TypeError
				)
			}
		})

		test('rejects invalid complex objects', () => {
			const badElements = [
				null,
				undefined,
				42,
				'1+2i',
				[1, 2],
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: null },
				{ re: 1n, im: 0 },
			]
			for (const elem of badElements) {
				assert.throws(
					() => [...productComplexLazy(/** @type {any} */ ([elem]))],
					TypeError
				)
			}
		})

		test('rejects NaN and Infinity components', () => {
			const nonFiniteElements = [
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 1 },
				{ re: 1, im: -Infinity },
				{ re: -Infinity, im: Infinity },
			]
			for (const elem of nonFiniteElements) {
				assert.throws(() => [...productComplexLazy([elem])], RangeError)
			}
		})

		test('throws RangeError when intermediate product overflows IEEE-754 finite range', () => {
			assert.throws(
				() => [
					...productComplexLazy([
						{ re: 1e200, im: 1e200 },
						{ re: 1e200, im: 1e200 },
					]),
				],
				RangeError
			)
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('cross-check against polar form prod(r_k) * exp(i * sum(theta_k))', () => {
			const factors = [
				{ re: 1.5, im: -0.75 },
				{ re: -2.2, im: 1.1 },
				{ re: 0.4, im: 0.9 },
				{ re: -0.8, im: -1.3 },
				{ re: 2.1, im: 0.3 },
				{ re: -1.0, im: 2.5 },
			]

			const partials = [...productComplexLazy(factors)]
			assert.equal(partials.length, factors.length)

			let logRadiusSum = 0
			let angleSum = 0
			for (let k = 0; k < factors.length; k += 1) {
				const { re, im } = factors[k]
				logRadiusSum += Math.log(Math.hypot(re, im))
				angleSum += Math.atan2(im, re)

				const radius = Math.exp(logRadiusSum)
				const expected = {
					re: radius * Math.cos(angleSum),
					im: radius * Math.sin(angleSum),
				}
				assertComplexClose(partials[k], expected, 1e-11)
			}
		})

		test("cross-check against De Moivre's theorem (cos t + i sin t)^n = cos(nt) + i sin(nt)", () => {
			const theta = 0.37

			function* unitRotationStream() {
				while (true) {
					yield { re: Math.cos(theta), im: Math.sin(theta) }
				}
			}

			let n = 0
			for (const partial of productComplexLazy(unitRotationStream())) {
				n += 1
				assertComplexClose(
					partial,
					{ re: Math.cos(n * theta), im: Math.sin(n * theta) },
					1e-12
				)
				if (n === 50) break
			}
			assert.equal(n, 50)
		})

		test('cross-check against 2x2 real matrix representation of complex multiplication', () => {
			const factors = [
				{ re: 2, im: -3 },
				{ re: -4, im: 5 },
				{ re: 0.5, im: 1.5 },
				{ re: -1.25, im: -0.75 },
			]

			// Represent a + bi as [[a, -b], [b, a]]
			let m = [
				[1, 0],
				[0, 1],
			]
			const partials = [...productComplexLazy(factors)]

			for (let i = 0; i < factors.length; i += 1) {
				const { re: a, im: b } = factors[i]
				const f = [
					[a, -b],
					[b, a],
				]
				m = [
					[m[0][0] * f[0][0] + m[0][1] * f[1][0], m[0][0] * f[0][1] + m[0][1] * f[1][1]],
					[m[1][0] * f[0][0] + m[1][1] * f[1][0], m[1][0] * f[0][1] + m[1][1] * f[1][1]],
				]
				assertComplexClose(partials[i], { re: m[0][0], im: m[1][0] }, 1e-12)
			}
		})

		test('cross-check product of all n-th roots of unity equals (-1)^(n-1)', () => {
			for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
				function* nthRootsOfUnity() {
					for (let k = 0; k < n; k += 1) {
						const angle = (2 * Math.PI * k) / n
						yield { re: Math.cos(angle), im: Math.sin(angle) }
					}
				}

				let last = { re: 1, im: 0 }
				for (const p of productComplexLazy(nthRootsOfUnity())) {
					last = p
				}
				assertComplexClose(last, { re: n % 2 === 1 ? 1 : -1, im: 0 }, 1e-12)
			}
		})
	})
})
