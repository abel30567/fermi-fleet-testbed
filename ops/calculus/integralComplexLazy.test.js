import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { integralComplexLazy } from './integralComplexLazy.js'

/**
 * Helper to assert two complex numbers are approximately equal.
 *
 * @param {{ re: number, im: number }} actual
 * @param {{ re: number, im: number }} expected
 * @param {number} [tol=1e-9]
 */
function assertComplexClose(actual, expected, tol = 1e-9) {
	assert.equal(typeof actual, 'object')
	assert.notEqual(actual, null)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`Expected re ${actual.re} to be within ${tol} of ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`Expected im ${actual.im} to be within ${tol} of ${expected.im}`
	)
}

/**
 * Helper to consume a generator and return its final yielded complex value.
 *
 * @param {Iterable<{ re: number, im: number }>} iter
 * @returns {{ re: number, im: number } | undefined}
 */
function lastValue(iter) {
	let last
	for (const val of iter) {
		last = val
	}
	return last
}

/**
 * Generates `steps + 1` evenly spaced points along the straight line from `a` to `b`.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @param {number} steps
 */
function* linePath(a, b, steps) {
	for (let k = 0; k <= steps; k++) {
		const t = k / steps
		yield {
			re: a.re + (b.re - a.re) * t,
			im: a.im + (b.im - a.im) * t,
		}
	}
}

/**
 * Generates `steps + 1` points traversing a circle centered at `center` with radius `radius`
 * and `turns` full revolutions (positive = counterclockwise, negative = clockwise).
 *
 * @param {{ re: number, im: number }} center
 * @param {number} radius
 * @param {number} steps
 * @param {number} [turns=1]
 */
function* circlePath(center, radius, steps, turns = 1) {
	for (let k = 0; k <= steps; k++) {
		const theta = (2 * Math.PI * turns * k) / steps
		yield {
			re: center.re + radius * Math.cos(theta),
			im: center.im + radius * Math.sin(theta),
		}
	}
}

describe('integralComplexLazy', () => {
	describe('exact & basic trapezoidal cases', () => {
		test('integrates a constant complex function exactly in one step', () => {
			// ∫_{1+i}^{4-i} (2 + 3i) dz = (2 + 3i) * (3 - 2i) = 12 + 5i
			const c = { re: 2, im: 3 }
			const results = [
				...integralComplexLazy(() => c, [
					{ re: 1, im: 1 },
					{ re: 4, im: -1 },
				]),
			]
			assert.deepEqual(results, [
				{ re: 0, im: 0 },
				{ re: 12, im: 5 },
			])
		})

		test('integrates a linear function f(z) = a*z + b exactly even with 2 points', () => {
			// f(z) = (1 - 2i)z + (3 + i)
			// Antiderivative F(z) = 0.5*(1 - 2i)z^2 + (3 + i)z
			// From z0 = 0 to z1 = 2 + 4i:
			// z1^2 = 4 + 16i - 16 = -12 + 16i
			// 0.5*(1 - 2i)*(-12 + 16i) = (1 - 2i)*(-6 + 8i) = (-6 + 16) + (8 + 12)i = 10 + 20i
			// (3 + i)*(2 + 4i) = (6 - 4) + (12 + 2)i = 2 + 14i
			// Total = 12 + 34i
			const fn = (z) => ({
				re: z.re + 2 * z.im + 3,
				im: z.im - 2 * z.re + 1,
			})
			const results = [
				...integralComplexLazy(fn, [
					{ re: 0, im: 0 },
					{ re: 2, im: 4 },
				]),
			]
			assert.equal(results.length, 2)
			assert.deepEqual(results[0], { re: 0, im: 0 })
			assertComplexClose(results[1], { re: 12, im: 34 }, 1e-12)
		})

		test('yields cumulative running partial integrals along a multi-segment path', () => {
			// f(z) = z along 0 -> 1 -> 1+i -> i
			// Segment 0->1: 0.5*(0 + 1)*1 = 0.5
			// Segment 1->1+i: 0.5*(1 + 1+i)*i = 0.5*(2 + i)*i = -0.5 + i  => cumulative: 0 + i
			// Segment 1+i->i: 0.5*(1+i + i)*(-1) = -0.5 - i               => cumulative: -0.5 + 0i
			// Check: F(i) - F(0) = i^2 / 2 = -0.5
			const results = [
				...integralComplexLazy(
					(z) => z,
					[
						{ re: 0, im: 0 },
						{ re: 1, im: 0 },
						{ re: 1, im: 1 },
						{ re: 0, im: 1 },
					]
				),
			]
			assert.deepEqual(results, [
				{ re: 0, im: 0 },
				{ re: 0.5, im: 0 },
				{ re: 0, im: 1 },
				{ re: -0.5, im: 0 },
			])
		})

		test('supports pre-evaluated { z, fz } samples mode', () => {
			const samples = [
				{ z: { re: 0, im: 0 }, fz: { re: 0, im: 0 } },
				{ z: { re: 1, im: 0 }, fz: { re: 1, im: 0 } },
				{ z: { re: 1, im: 1 }, fz: { re: 1, im: 1 } },
				{ z: { re: 0, im: 1 }, fz: { re: 0, im: 1 } },
			]
			const results = [...integralComplexLazy(samples)]
			assert.deepEqual(results, [
				{ re: 0, im: 0 },
				{ re: 0.5, im: 0 },
				{ re: 0, im: 1 },
				{ re: -0.5, im: 0 },
			])
		})

		test('supports options.initial constant of integration in both modes', () => {
			const initial = { re: 10, im: -5 }
			const fromFn = [
				...integralComplexLazy(
					() => ({ re: 2, im: 0 }),
					[
						{ re: 0, im: 0 },
						{ re: 1, im: 1 },
					],
					{ initial }
				),
			]
			const fromSamples = [
				...integralComplexLazy(
					[
						{ z: { re: 0, im: 0 }, fz: { re: 2, im: 0 } },
						{ z: { re: 1, im: 1 }, fz: { re: 2, im: 0 } },
					],
					{ initial }
				),
			]
			const expected = [
				{ re: 10, im: -5 },
				{ re: 12, im: -3 },
			]
			assert.deepEqual(fromFn, expected)
			assert.deepEqual(fromSamples, expected)
		})

		test('does not share mutable state across yielded objects and normalizes -0', () => {
			const gen = integralComplexLazy(
				() => ({ re: -0, im: -0 }),
				[
					{ re: 0, im: 0 },
					{ re: 1, im: 0 },
				]
			)
			const first = gen.next().value
			assert.ok(Object.is(first.re, 0))
			assert.ok(Object.is(first.im, 0))
			first.re = 999
			first.im = 999
			const second = gen.next().value
			assert.ok(Object.is(second.re, 0))
			assert.ok(Object.is(second.im, 0))
		})
	})

	describe('analytical contour integral cross-checks', () => {
		test('Fundamental Theorem of Calculus for f(z) = z^2 along straight and bent paths', () => {
			const zSquared = (z) => ({
				re: z.re * z.re - z.im * z.im,
				im: 2 * z.re * z.im,
			})

			// Exact: ∫_{1+i}^{3-2i} z^2 dz = [(3 - 2i)^3 - (1 + i)^3] / 3 = (-7/3) - 16i
			const expected = { re: -7 / 3, im: -16 }
			const a = { re: 1, im: 1 }
			const mid = { re: 3, im: 1 }
			const b = { re: 3, im: -2 }

			const straight = lastValue(integralComplexLazy(zSquared, linePath(a, b, 2000)))
			assertComplexClose(straight, expected, 1e-5)

			function* bentPath() {
				yield* linePath(a, mid, 1000)
				let skipFirst = true
				for (const pt of linePath(mid, b, 1000)) {
					if (skipFirst) {
						skipFirst = false
						continue
					}
					yield pt
				}
			}
			const bent = lastValue(integralComplexLazy(zSquared, bentPath()))
			assertComplexClose(bent, expected, 1e-5)
		})

		test("Cauchy's integral formula: ∮ (1/z) dz = 2πi around the unit circle", () => {
			const reciprocal = (z) => {
				const denom = z.re * z.re + z.im * z.im
				return { re: z.re / denom, im: -z.im / denom }
			}

			const ccw = lastValue(
				integralComplexLazy(reciprocal, circlePath({ re: 0, im: 0 }, 1, 4000, 1))
			)
			assertComplexClose(ccw, { re: 0, im: 2 * Math.PI }, 1e-5)

			// Clockwise orientation yields -2πi
			const cw = lastValue(
				integralComplexLazy(reciprocal, circlePath({ re: 0, im: 0 }, 1, 4000, -1))
			)
			assertComplexClose(cw, { re: 0, im: -2 * Math.PI }, 1e-5)

			// Winding number 2 around shifted pole a = 1 - 0.5i yields 4πi
			const pole = { re: 1, im: -0.5 }
			const shiftedReciprocal = (z) => {
				const dr = z.re - pole.re
				const di = z.im - pole.im
				const denom = dr * dr + di * di
				return { re: dr / denom, im: -di / denom }
			}
			const doubleWinding = lastValue(
				integralComplexLazy(shiftedReciprocal, circlePath(pole, 2.5, 4000, 2))
			)
			assertComplexClose(doubleWinding, { re: 0, im: 4 * Math.PI }, 1e-4)
		})

		test("Cauchy's integral formula: ∮ (e^z / (z - z0)) dz = 2πi * e^{z0}", () => {
			const z0 = { re: 0.5, im: -0.25 }
			const expComplex = (z) => {
				const r = Math.exp(z.re)
				return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
			}
			const integrand = (z) => {
				const ez = expComplex(z)
				const dr = z.re - z0.re
				const di = z.im - z0.im
				const denom = dr * dr + di * di
				return {
					re: (ez.re * dr + ez.im * di) / denom,
					im: (ez.im * dr - ez.re * di) / denom,
				}
			}

			const ez0 = expComplex(z0)
			// 2πi * (a + bi) = -2πb + 2πa i
			const expected = { re: -2 * Math.PI * ez0.im, im: 2 * Math.PI * ez0.re }
			const actual = lastValue(
				integralComplexLazy(integrand, circlePath(z0, 1.5, 4000, 1))
			)
			assertComplexClose(actual, expected, 1e-5)
		})

		test("Cauchy's integral theorem: ∮ e^z dz = 0 around a closed contour", () => {
			const expComplex = (z) => {
				const r = Math.exp(z.re)
				return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
			}
			const actual = lastValue(
				integralComplexLazy(expComplex, circlePath({ re: 0, im: 0 }, 1, 2000, 1))
			)
			assertComplexClose(actual, { re: 0, im: 0 }, 1e-6)
		})
	})

	describe('edge cases & lazy streaming', () => {
		test('0 points yields an empty sequence', () => {
			let calls = 0
			const fn = (z) => {
				calls += 1
				return z
			}
			function* emptyGen() {}

			assert.deepEqual([...integralComplexLazy(fn, [])], [])
			assert.deepEqual([...integralComplexLazy(fn, emptyGen())], [])
			assert.deepEqual([...integralComplexLazy([])], [])
			assert.equal(calls, 0)
		})

		test('1 point yields initial value (0 + 0i by default) and validates that point', () => {
			let calls = 0
			const fn = (z) => {
				calls += 1
				return { re: z.re * 2, im: z.im * 2 }
			}
			assert.deepEqual(
				[...integralComplexLazy(fn, [{ re: 3, im: -4 }])],
				[{ re: 0, im: 0 }]
			)
			assert.equal(calls, 1)

			assert.deepEqual(
				[...integralComplexLazy([{ z: { re: 3, im: -4 }, fz: { re: 6, im: -8 } }])],
				[{ re: 0, im: 0 }]
			)
			assert.deepEqual(
				[
					...integralComplexLazy(fn, [{ re: 3, im: -4 }], {
						initial: { re: 1, im: 2 },
					}),
				],
				[{ re: 1, im: 2 }]
			)
		})

		test('handles repeated consecutive points without NaN or drift', () => {
			const results = [
				...integralComplexLazy(
					(z) => z,
					[
						{ re: 2, im: 3 },
						{ re: 2, im: 3 },
						{ re: 2, im: 3 },
					]
				),
			]
			assert.deepEqual(results, [
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			])
		})

		test('consumes an infinite path generator lazily on demand and cleans up on break', () => {
			let produced = 0
			let evaluated = 0
			let closed = false

			function* infinitePath() {
				try {
					let k = 0
					while (true) {
						produced += 1
						yield { re: k, im: 0 }
						k += 1
					}
				} finally {
					closed = true
				}
			}

			const fn = (z) => {
				evaluated += 1
				// f(z) = 2z => ∫_0^n 2x dx = n^2
				return { re: 2 * z.re, im: 2 * z.im }
			}

			const taken = []
			for (const partial of integralComplexLazy(fn, infinitePath())) {
				taken.push(partial)
				assert.equal(produced, taken.length)
				assert.equal(evaluated, taken.length)
				if (taken.length === 5) {
					break
				}
			}

			assert.equal(produced, 5)
			assert.equal(evaluated, 5)
			assert.equal(closed, true)
			assert.deepEqual(taken, [
				{ re: 0, im: 0 },
				{ re: 1, im: 0 },
				{ re: 4, im: 0 },
				{ re: 9, im: 0 },
				{ re: 16, im: 0 },
			])
		})

		test('consumes an infinite { z, fz } sample generator lazily', () => {
			let produced = 0
			function* infiniteSamples() {
				let k = 0
				while (true) {
					produced += 1
					yield { z: { re: 0, im: k }, fz: { re: 1, im: 0 } }
					k += 1
				}
			}

			const gen = integralComplexLazy(infiniteSamples())
			// Nothing consumed before first .next()
			assert.equal(produced, 0)

			assert.deepEqual(gen.next().value, { re: 0, im: 0 })
			assert.equal(produced, 1)

			assert.deepEqual(gen.next().value, { re: 0, im: 1 })
			assert.equal(produced, 2)

			assert.deepEqual(gen.next().value, { re: 0, im: 2 })
			assert.equal(produced, 3)

			gen.return()
		})
	})

	describe('input validation', () => {
		test('rejects invalid top-level arguments eagerly on invocation', () => {
			assert.throws(() => integralComplexLazy(), TypeError)
			assert.throws(() => integralComplexLazy(null), TypeError)
			assert.throws(() => integralComplexLazy(123), TypeError)
			assert.throws(() => integralComplexLazy('not-an-iterable'), TypeError)
			assert.throws(() => integralComplexLazy({ re: 0, im: 0 }), TypeError)

			// Missing or invalid path when fn is provided
			assert.throws(() => integralComplexLazy((z) => z), TypeError)
			assert.throws(() => integralComplexLazy((z) => z, null), TypeError)
			assert.throws(() => integralComplexLazy((z) => z, 42), TypeError)
			assert.throws(() => integralComplexLazy((z) => z, 'abc'), TypeError)

			// Invalid options
			assert.throws(() => integralComplexLazy((z) => z, [], null), TypeError)
			assert.throws(() => integralComplexLazy((z) => z, [], []), TypeError)
			assert.throws(() => integralComplexLazy((z) => z, [], 'bad'), TypeError)
			assert.throws(() => integralComplexLazy([], null), TypeError)
			assert.throws(() => integralComplexLazy([], []), TypeError)
			assert.throws(
				() => integralComplexLazy((z) => z, [], { initial: null }),
				TypeError
			)
			assert.throws(
				() => integralComplexLazy((z) => z, [], { initial: { re: '0', im: 0 } }),
				TypeError
			)
			assert.throws(
				() => integralComplexLazy((z) => z, [], { initial: { re: NaN, im: 0 } }),
				RangeError
			)
			assert.throws(
				() =>
					integralComplexLazy((z) => z, [], {
						initial: { re: 0, im: Infinity },
					}),
				RangeError
			)
		})

		test('rejects invalid path elements and integrand return values lazily', () => {
			const badPointGen = integralComplexLazy(
				(z) => z,
				[{ re: 0, im: 0 }, { re: NaN, im: 0 }]
			)
			assert.deepEqual(badPointGen.next().value, { re: 0, im: 0 })
			assert.throws(() => badPointGen.next(), RangeError)

			assert.throws(
				() => [...integralComplexLazy((z) => z, [null])],
				TypeError
			)
			assert.throws(
				() => [...integralComplexLazy((z) => z, [{ re: 1 }])],
				TypeError
			)
			assert.throws(
				() => [...integralComplexLazy((z) => z, [{ re: Infinity, im: 0 }])],
				RangeError
			)

			// Invalid integrand return values
			assert.throws(
				() => [...integralComplexLazy(() => null, [{ re: 0, im: 0 }])],
				TypeError
			)
			assert.throws(
				() => [
					...integralComplexLazy(
						() => ({ re: 0, im: 'bad' }),
						[{ re: 0, im: 0 }]
					),
				],
				TypeError
			)
			assert.throws(
				() => [
					...integralComplexLazy(
						() => ({ re: 0, im: -Infinity }),
						[{ re: 0, im: 0 }]
					),
				],
				RangeError
			)
		})

		test('rejects invalid { z, fz } sample objects lazily', () => {
			assert.throws(() => [...integralComplexLazy([null])], TypeError)
			assert.throws(
				() => [...integralComplexLazy([{ z: { re: 0, im: 0 } }])],
				TypeError
			)
			assert.throws(
				() => [...integralComplexLazy([{ fz: { re: 0, im: 0 } }])],
				TypeError
			)
			assert.throws(
				() => [
					...integralComplexLazy([
						{ z: { re: 0, im: 0 }, fz: { re: NaN, im: 0 } },
					]),
				],
				RangeError
			)
		})

		test('throws RangeError when integral overflows to a non-finite value', () => {
			assert.throws(
				() => [
					...integralComplexLazy(
						() => ({ re: 1e308, im: 0 }),
						[
							{ re: 0, im: 0 },
							{ re: 10, im: 0 },
						]
					),
				],
				RangeError
			)
		})
	})
})
