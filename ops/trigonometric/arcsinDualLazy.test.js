import { describe, test } from 'node:test'
import assert from 'node:assert'
import { arcsinDualLazy } from './arcsinDualLazy.js'

const EPS = 1e-12

function assertClose(actual, expected, tol = EPS, msg = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${msg ? `${msg}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

describe('arcsinDualLazy', () => {
	describe('normal cases', () => {
		test('evaluates a single dual number at standard angles', () => {
			const zero = arcsinDualLazy({ v: 0, d: 1 })
			assert.strictEqual(zero.v, 0)
			assert.strictEqual(zero.d, 1)

			const half = arcsinDualLazy({ v: 0.5, d: 1 })
			assertClose(half.v, Math.PI / 6)
			assertClose(half.d, 2 / Math.sqrt(3))

			const negHalf = arcsinDualLazy({ v: -0.5, d: 3 })
			assertClose(negHalf.v, -Math.PI / 6)
			assertClose(negHalf.d, 6 / Math.sqrt(3))

			const sqrt2Over2 = arcsinDualLazy({ v: Math.SQRT1_2, d: -2 })
			assertClose(sqrt2Over2.v, Math.PI / 4)
			assertClose(sqrt2Over2.d, -2 * Math.SQRT2)
		})

		test('handles zero derivative on interior points', () => {
			const res = arcsinDualLazy({ v: 0.6, d: 0 })
			assertClose(res.v, Math.asin(0.6))
			assert.strictEqual(res.d, 0)
		})

		test('evaluates an iterable array of dual numbers', () => {
			const inputs = [
				{ v: -0.8, d: 1 },
				{ v: 0, d: 2 },
				{ v: 0.6, d: -0.5 },
			]
			const gen = arcsinDualLazy(inputs)
			assert.strictEqual(typeof gen.next, 'function')
			assert.strictEqual(typeof gen[Symbol.iterator], 'function')

			const results = [...gen]
			assert.strictEqual(results.length, 3)
			assertClose(results[0].v, Math.asin(-0.8))
			assertClose(results[0].d, 1 / 0.6)
			assert.strictEqual(results[1].v, 0)
			assert.strictEqual(results[1].d, 2)
			assertClose(results[2].v, Math.asin(0.6))
			assertClose(results[2].d, -0.5 / 0.8)
		})

		test('handles empty iterable', () => {
			assert.deepStrictEqual([...arcsinDualLazy([])], [])
		})

		test('handles non-array iterables such as Set and custom iterables', () => {
			const set = new Set([
				{ v: 0, d: 1 },
				{ v: 0.5, d: 2 },
			])
			const fromSet = [...arcsinDualLazy(set)]
			assert.strictEqual(fromSet.length, 2)
			assert.strictEqual(fromSet[0].v, 0)
			assertClose(fromSet[1].v, Math.PI / 6)
			assertClose(fromSet[1].d, 4 / Math.sqrt(3))

			const customIterable = {
				[Symbol.iterator]() {
					const items = [{ v: -0.6, d: 0.8 }]
					let i = 0
					return {
						next() {
							return i < items.length
								? { value: items[i++], done: false }
								: { value: undefined, done: true }
						},
					}
				},
			}
			const fromCustom = [...arcsinDualLazy(customIterable)]
			assert.strictEqual(fromCustom.length, 1)
			assertClose(fromCustom[0].v, Math.asin(-0.6))
			assertClose(fromCustom[0].d, 1)
		})
	})

	describe('edge cases (domain boundaries and out-of-domain)', () => {
		test('handles v = +1 and v = -1 domain boundaries', () => {
			const posOnePosD = arcsinDualLazy({ v: 1, d: 1 })
			assert.strictEqual(posOnePosD.v, Math.PI / 2)
			assert.strictEqual(posOnePosD.d, Infinity)

			const posOneNegD = arcsinDualLazy({ v: 1, d: -2 })
			assert.strictEqual(posOneNegD.v, Math.PI / 2)
			assert.strictEqual(posOneNegD.d, -Infinity)

			const negOnePosD = arcsinDualLazy({ v: -1, d: 0.5 })
			assert.strictEqual(negOnePosD.v, -Math.PI / 2)
			assert.strictEqual(negOnePosD.d, Infinity)

			const negOneNegD = arcsinDualLazy({ v: -1, d: -0.5 })
			assert.strictEqual(negOneNegD.v, -Math.PI / 2)
			assert.strictEqual(negOneNegD.d, -Infinity)

			const boundaryZeroD = arcsinDualLazy({ v: 1, d: 0 })
			assert.strictEqual(boundaryZeroD.v, Math.PI / 2)
			assert.ok(Number.isNaN(boundaryZeroD.d))
		})

		test('maintains accuracy very close to ±1 using factored (1 - v)(1 + v)', () => {
			// Power of 2 ensures v = 1 - eps is exact in IEEE-754 binary64 (1 - v === eps)
			const eps = 2 ** -46
			const v = 1 - eps
			const res = arcsinDualLazy({ v, d: 1 })
			const expectedDenom = Math.sqrt(eps * (2 - eps))
			assertClose(res.v, Math.asin(v), 1e-12)
			assert.ok(
				Math.abs(res.d - 1 / expectedDenom) / (1 / expectedDenom) < 1e-14,
				`derivative near boundary inaccurate: got ${res.d}, expected ${1 / expectedDenom}`,
			)
		})

		test('preserves signed zero for v = -0', () => {
			const res = arcsinDualLazy({ v: -0, d: 1 })
			assert.ok(Object.is(res.v, -0))
			assert.strictEqual(res.d, 1)
		})

		test('throws RangeError for out-of-domain values |v| > 1', () => {
			assert.throws(() => arcsinDualLazy({ v: 1.0001, d: 1 }), RangeError)
			assert.throws(() => arcsinDualLazy({ v: -1.0001, d: 1 }), RangeError)
			assert.throws(() => arcsinDualLazy({ v: 2, d: 0 }), RangeError)
			assert.throws(() => arcsinDualLazy({ v: -10, d: 3 }), RangeError)
		})
	})

	describe('lazy / streaming generator consumption', () => {
		test('consumes elements strictly on demand from an infinite generator', () => {
			let produced = 0
			let closed = false

			function* infiniteDuals() {
				try {
					let k = 0
					while (true) {
						produced++
						// Values strictly inside (-1, 1): 0, 0.1, 0.2, ... bounded via tanh
						const v = Math.tanh(k * 0.1)
						yield { v, d: 1 }
						k++
					}
				} finally {
					closed = true
				}
			}

			const stream = arcsinDualLazy(infiniteDuals())
			// Creating the generator must not pull any elements yet
			assert.strictEqual(produced, 0)

			const first = stream.next()
			assert.strictEqual(produced, 1)
			assert.strictEqual(first.done, false)
			assert.strictEqual(first.value.v, 0)
			assert.strictEqual(first.value.d, 1)

			const second = stream.next()
			assert.strictEqual(produced, 2)
			assertClose(second.value.v, Math.asin(Math.tanh(0.1)))

			const third = stream.next()
			assert.strictEqual(produced, 3)
			assertClose(third.value.v, Math.asin(Math.tanh(0.2)))

			// Early termination closes upstream generator cleanly
			stream.return()
			assert.strictEqual(closed, true)
			assert.strictEqual(produced, 3)
		})

		test('does not evaluate invalid elements beyond what the consumer pulls', () => {
			const seq = [
				{ v: 0, d: 1 },
				{ v: 0.5, d: 2 },
				{ v: 99, d: 1 }, // out-of-domain; should only throw if pulled
			]
			const gen = arcsinDualLazy(seq)
			const r0 = gen.next()
			assert.strictEqual(r0.done, false)
			assert.strictEqual(r0.value.v, 0)

			const r1 = gen.next()
			assert.strictEqual(r1.done, false)
			assertClose(r1.value.v, Math.PI / 6)

			// Pulling the 3rd element triggers RangeError lazily
			assert.throws(() => gen.next(), RangeError)
		})

		test('supports breaking out of for...of early with upstream cleanup', () => {
			let pulled = 0
			let cleanedUp = false

			function* source() {
				try {
					for (const v of [0, 0.25, 0.5, 0.75]) {
						pulled++
						yield { v, d: 1 }
					}
				} finally {
					cleanedUp = true
				}
			}

			const collected = []
			for (const dual of arcsinDualLazy(source())) {
				collected.push(dual)
				if (collected.length === 2) break
			}

			assert.strictEqual(collected.length, 2)
			assert.strictEqual(pulled, 2)
			assert.strictEqual(cleanedUp, true)
		})
	})

	describe('input validation errors', () => {
		test('throws TypeError for null, undefined, and primitive inputs', () => {
			for (const bad of [null, undefined, 0.5, '0.5', true, Symbol('x'), 42n]) {
				assert.throws(() => arcsinDualLazy(bad), TypeError)
			}
		})

		test('throws TypeError for malformed dual objects', () => {
			assert.throws(() => arcsinDualLazy({}), TypeError)
			assert.throws(() => arcsinDualLazy({ v: 0.5 }), TypeError)
			assert.throws(() => arcsinDualLazy({ d: 1 }), TypeError)
			assert.throws(() => arcsinDualLazy({ v: '0.5', d: 1 }), TypeError)
			assert.throws(() => arcsinDualLazy({ v: 0.5, d: '1' }), TypeError)
		})

		test('throws RangeError for NaN or non-finite v or d', () => {
			assert.throws(() => arcsinDualLazy({ v: Number.NaN, d: 1 }), RangeError)
			assert.throws(() => arcsinDualLazy({ v: 0.5, d: Number.NaN }), RangeError)
			assert.throws(() => arcsinDualLazy({ v: Infinity, d: 1 }), RangeError)
			assert.throws(() => arcsinDualLazy({ v: -Infinity, d: 1 }), RangeError)
			assert.throws(() => arcsinDualLazy({ v: 0.5, d: Infinity }), RangeError)
			assert.throws(() => arcsinDualLazy({ v: 0.5, d: -Infinity }), RangeError)
		})

		test('throws TypeError lazily when an iterable yields invalid elements', () => {
			const gen = arcsinDualLazy([null])
			assert.throws(() => gen.next(), TypeError)

			const gen2 = arcsinDualLazy([[0.5, 1]])
			assert.throws(() => gen2.next(), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		test('matches central finite-difference derivative across interior points and chain rule', () => {
			// Composite function f(t) = arcsin(g(t)) where g(t) = 0.7 * sin(t) + 0.1 * t
			const g = (t) => 0.7 * Math.sin(t) + 0.1 * t
			const gPrime = (t) => 0.7 * Math.cos(t) + 0.1
			const h = 1e-6

			const ts = [-1.2, -0.5, 0, 0.4, 0.9, 1.3]
			const dualStream = (function* () {
				for (const t of ts) {
					yield { v: g(t), d: gPrime(t) }
				}
			})()

			let idx = 0
			for (const actual of arcsinDualLazy(dualStream)) {
				const t = ts[idx++]
				const expectedV = Math.asin(g(t))
				const finiteDiffD = (Math.asin(g(t + h)) - Math.asin(g(t - h))) / (2 * h)
				assertClose(actual.v, expectedV, 1e-14, `primal at t=${t}`)
				assertClose(actual.d, finiteDiffD, 1e-8, `derivative at t=${t}`)
			}
			assert.strictEqual(idx, ts.length)
		})

		test('satisfies inverse identity sin(arcsin(u)) = u in both value and derivative', () => {
			const points = [-0.9, -0.4, 0, 0.3, 0.85]
			const duals = points.map((v, i) => ({ v, d: (i + 1) * 0.7 - 1.5 }))
			for (const [i, res] of [...arcsinDualLazy(duals)].entries()) {
				const orig = duals[i]
				// Dual sin(y) = { v: sin(y.v), d: cos(y.v) * y.d }
				const sinV = Math.sin(res.v)
				const sinD = Math.cos(res.v) * res.d
				assertClose(sinV, orig.v, 1e-14, `sin(arcsin(v)) at i=${i}`)
				assertClose(sinD, orig.d, 1e-14, `d/dt sin(arcsin(u)) at i=${i}`)
			}
		})
	})
})
