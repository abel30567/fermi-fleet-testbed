import { describe, test } from 'node:test'
import assert from 'node:assert'
import { lnDualLazy } from './lnDualLazy.js'

/**
 * Assert two numbers are within an absolute tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-12]
 */
function assertApprox(actual, expected, tol = 1e-12) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

describe('lnDualLazy', () => {
	describe('normal cases', () => {
		test('computes ln on single dual numbers accurately', () => {
			assert.deepStrictEqual(lnDualLazy({ v: 1, d: 1 }), { v: 0, d: 1 })
			assert.deepStrictEqual(lnDualLazy({ v: 1, d: 0 }), { v: 0, d: 0 })

			const atE = lnDualLazy({ v: Math.E, d: Math.E })
			assertApprox(atE.v, 1)
			assertApprox(atE.d, 1)

			const atTwo = lnDualLazy({ v: 2, d: 3 })
			assertApprox(atTwo.v, Math.LN2)
			assertApprox(atTwo.d, 1.5)

			const negDeriv = lnDualLazy({ v: 4, d: -2 })
			assertApprox(negDeriv.v, Math.log(4))
			assertApprox(negDeriv.d, -0.5)
		})

		test('normalizes -0 derivative to +0', () => {
			const res = lnDualLazy({ v: 2, d: -0 })
			assertApprox(res.v, Math.LN2)
			assert.strictEqual(Object.is(res.d, 0), true)
		})

		test('handles very small and very large positive values', () => {
			const small = lnDualLazy({ v: 1e-100, d: 1e-98 })
			assertApprox(small.v, Math.log(1e-100), 1e-11)
			assertApprox(small.d, 100, 1e-11)

			const large = lnDualLazy({ v: 1e100, d: 2e100 })
			assertApprox(large.v, Math.log(1e100), 1e-11)
			assertApprox(large.d, 2, 1e-11)
		})

		test('streams over arrays, Sets, and custom iterables', () => {
			const input = [
				{ v: 1, d: 5 },
				{ v: Math.E, d: 2 * Math.E },
				{ v: 10, d: -5 },
			]
			const out = [...lnDualLazy(input)]
			assert.strictEqual(out.length, 3)
			assert.deepStrictEqual(out[0], { v: 0, d: 5 })
			assertApprox(out[1].v, 1)
			assertApprox(out[1].d, 2)
			assertApprox(out[2].v, Math.LN10)
			assertApprox(out[2].d, -0.5)

			const fromSet = [...lnDualLazy(new Set([{ v: 2, d: 4 }]))]
			assert.strictEqual(fromSet.length, 1)
			assertApprox(fromSet[0].v, Math.LN2)
			assertApprox(fromSet[0].d, 2)

			const customIterable = {
				*[Symbol.iterator]() {
					yield { v: 3, d: 6 }
					yield { v: 9, d: 9 }
				},
			}
			const fromCustom = [...lnDualLazy(customIterable)]
			assert.strictEqual(fromCustom.length, 2)
			assertApprox(fromCustom[0].v, Math.log(3))
			assertApprox(fromCustom[0].d, 2)
			assertApprox(fromCustom[1].v, Math.log(9))
			assertApprox(fromCustom[1].d, 1)
		})

		test('handles empty iterables', () => {
			const gen = lnDualLazy([])
			assert.deepStrictEqual(gen.next(), { value: undefined, done: true })
		})
	})

	describe('edge cases (non-positive inputs)', () => {
		test('throws RangeError for zero and negative zero primal values', () => {
			assert.throws(() => lnDualLazy({ v: 0, d: 1 }), RangeError)
			assert.throws(() => lnDualLazy({ v: 0, d: 0 }), RangeError)
			assert.throws(() => lnDualLazy({ v: -0, d: 1 }), RangeError)
		})

		test('throws RangeError for negative primal values', () => {
			assert.throws(() => lnDualLazy({ v: -1, d: 1 }), RangeError)
			assert.throws(() => lnDualLazy({ v: -1e-15, d: 0 }), RangeError)
			assert.throws(() => lnDualLazy({ v: -Number.MAX_VALUE, d: 2 }), RangeError)
		})

		test('throws RangeError when a non-positive value is encountered in a stream', () => {
			const gen = lnDualLazy([
				{ v: 2, d: 1 },
				{ v: 0, d: 1 },
			])
			const first = gen.next()
			assert.strictEqual(first.done, false)
			assertApprox(first.value.v, Math.LN2)
			assert.throws(() => gen.next(), RangeError)

			const genNeg = lnDualLazy([{ v: -3, d: 1 }])
			assert.throws(() => genNeg.next(), RangeError)
		})
	})

	describe('lazy / streaming generator consumption', () => {
		test('does not pull from source until .next() is called and pulls one item per step', () => {
			let pulled = 0
			function* infiniteSource() {
				let n = 1
				while (true) {
					pulled += 1
					yield { v: n, d: n * 2 }
					n += 1
				}
			}

			const stream = lnDualLazy(infiniteSource())
			assert.strictEqual(pulled, 0)

			const r1 = stream.next()
			assert.strictEqual(pulled, 1)
			assert.strictEqual(r1.done, false)
			assert.deepStrictEqual(r1.value, { v: 0, d: 2 })

			const r2 = stream.next()
			assert.strictEqual(pulled, 2)
			assertApprox(r2.value.v, Math.LN2)
			assertApprox(r2.value.d, 2)

			const r3 = stream.next()
			assert.strictEqual(pulled, 3)
			assertApprox(r3.value.v, Math.log(3))
			assertApprox(r3.value.d, 2)
		})

		test('closes upstream generator on early termination without touching remaining items', () => {
			let pulled = 0
			let closed = false
			function* sourceWithCleanup() {
				try {
					pulled += 1
					yield { v: 1, d: 1 }
					pulled += 1
					yield { v: 2, d: 2 }
					pulled += 1
					// Invalid item that must never be reached on early break
					yield { v: -5, d: 1 }
				} finally {
					closed = true
				}
			}

			const results = []
			for (const dual of lnDualLazy(sourceWithCleanup())) {
				results.push(dual)
				if (results.length === 2) {
					break
				}
			}

			assert.strictEqual(results.length, 2)
			assert.strictEqual(pulled, 2)
			assert.strictEqual(closed, true)
		})

		test('supports composing lazy pipelines: ln(ln(x)) for x > 1', () => {
			let pulled = 0
			function* source() {
				for (const x of [Math.E, Math.E ** 2, 10]) {
					pulled += 1
					yield { v: x, d: 1 }
				}
			}

			const pipeline = lnDualLazy(lnDualLazy(source()))
			assert.strictEqual(pulled, 0)

			const first = pipeline.next().value
			assert.strictEqual(pulled, 1)
			// At x = e: ln(ln(e)) = ln(1) = 0, d/dx = 1 / (e * ln(e)) = 1 / e
			assertApprox(first.v, 0)
			assertApprox(first.d, 1 / Math.E)

			const second = pipeline.next().value
			assert.strictEqual(pulled, 2)
			// At x = e^2: ln(ln(e^2)) = ln(2), d/dx = 1 / (e^2 * 2)
			assertApprox(second.v, Math.LN2)
			assertApprox(second.d, 1 / (2 * Math.E ** 2))
		})
	})

	describe('input validation errors', () => {
		test('throws TypeError synchronously for invalid top-level inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				NaN,
				true,
				false,
				'abc',
				'',
				Symbol('x'),
				() => {},
				{},
				{ value: 2, deriv: 1 },
			]

			for (const bad of invalidInputs) {
				assert.throws(() => lnDualLazy(bad), TypeError)
			}
		})

		test('throws TypeError for malformed dual objects (scalar and streamed)', () => {
			const malformed = [
				{ v: 2 },
				{ d: 1 },
				{ v: '2', d: 1 },
				{ v: 2, d: '1' },
				{ v: null, d: 1 },
				{ v: 2, d: undefined },
			]

			for (const item of malformed) {
				assert.throws(() => lnDualLazy(item), TypeError)
				assert.throws(() => [...lnDualLazy([item])], TypeError)
			}

			for (const nonObj of [null, undefined, 5, '2', [2, 1]]) {
				assert.throws(() => [...lnDualLazy([nonObj])], TypeError)
			}
		})

		test('throws RangeError for non-finite v or d', () => {
			const nonFinite = [
				{ v: NaN, d: 1 },
				{ v: 2, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: -Infinity, d: 1 },
				{ v: 2, d: Infinity },
				{ v: 2, d: -Infinity },
			]

			for (const item of nonFinite) {
				assert.throws(() => lnDualLazy(item), RangeError)
				assert.throws(() => [...lnDualLazy([item])], RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('forward-mode derivative matches central finite differences for composite functions', () => {
			const h = 1e-6

			// Composite function g(x) = 3x^2 + 2x + 1, g'(x) = 6x + 2
			const g = (x) => 3 * x * x + 2 * x + 1
			const gPrime = (x) => 6 * x + 2

			const xs = [0.1, 0.5, 1.0, 2.5, 10.0]
			function* dualStream() {
				for (const x of xs) {
					yield { v: g(x), d: gPrime(x) }
				}
			}

			const results = [...lnDualLazy(dualStream())]
			for (let i = 0; i < xs.length; i += 1) {
				const x = xs[i]
				const fd = (Math.log(g(x + h)) - Math.log(g(x - h))) / (2 * h)
				assertApprox(results[i].v, Math.log(g(x)), 1e-12)
				assertApprox(results[i].d, fd, 1e-7)
			}
		})

		test('satisfies logarithmic product identity ln(a * b) = ln(a) + ln(b) in primal and dual parts', () => {
			const pairs = [
				[{ v: 2, d: 0.7 }, { v: 3.5, d: -1.2 }],
				[{ v: 0.25, d: 4.1 }, { v: 8.0, d: 0.3 }],
				[{ v: Math.PI, d: 1.0 }, { v: Math.E, d: 2.5 }],
			]

			const dualMul = (a, b) => ({
				v: a.v * b.v,
				d: a.v * b.d + a.d * b.v,
			})

			const products = [...lnDualLazy(pairs.map(([a, b]) => dualMul(a, b)))]
			const lnAs = [...lnDualLazy(pairs.map(([a]) => a))]
			const lnBs = [...lnDualLazy(pairs.map(([, b]) => b))]

			for (let i = 0; i < pairs.length; i += 1) {
				assertApprox(products[i].v, lnAs[i].v + lnBs[i].v, 1e-12)
				assertApprox(products[i].d, lnAs[i].d + lnBs[i].d, 1e-12)
			}
		})
	})
})
