import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sinDualLazy } from './sinDualLazy.js'

const EPS = 1e-12

function assertClose(actual, expected, tol = EPS, message) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		message ?? `expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

describe('sinDualLazy', () => {
	describe('single dual number cases', () => {
		test('computes sin and forward-mode derivative at canonical angles', () => {
			const zero = sinDualLazy({ v: 0, d: 1 })
			assert.equal(zero.v, 0)
			assert.equal(zero.d, 1)

			const halfPi = sinDualLazy({ v: Math.PI / 2, d: 1 })
			assertClose(halfPi.v, 1)
			assertClose(halfPi.d, 0)

			const pi = sinDualLazy({ v: Math.PI, d: 1 })
			assertClose(pi.v, 0)
			assertClose(pi.d, -1)

			const sixthPi = sinDualLazy({ v: Math.PI / 6, d: 2 })
			assertClose(sixthPi.v, 0.5)
			assertClose(sixthPi.d, 2 * Math.cos(Math.PI / 6))
		})

		test('handles zero, negative, and scaled derivatives', () => {
			const constant = sinDualLazy({ v: 1.23, d: 0 })
			assertClose(constant.v, Math.sin(1.23))
			assert.equal(constant.d, 0)

			const neg = sinDualLazy({ v: -0.75, d: -3.5 })
			assertClose(neg.v, Math.sin(-0.75))
			assertClose(neg.d, -3.5 * Math.cos(-0.75))
		})

		test('does not mutate the input dual number', () => {
			const input = Object.freeze({ v: 0.5, d: 2 })
			const out = sinDualLazy(input)
			assert.notEqual(out, input)
			assertClose(out.v, Math.sin(0.5))
			assertClose(out.d, 2 * Math.cos(0.5))
		})

		test('preserves signed zero and handles tiny and large finite angles', () => {
			const negZero = sinDualLazy({ v: -0, d: 1 })
			assert.ok(Object.is(negZero.v, -0))
			assert.equal(negZero.d, 1)

			const tiny = sinDualLazy({ v: 1e-12, d: 1 })
			assertClose(tiny.v, 1e-12, 1e-24)
			assertClose(tiny.d, 1, 1e-15)

			const large = sinDualLazy({ v: 1e6, d: 1 })
			assert.ok(Number.isFinite(large.v))
			assert.ok(Number.isFinite(large.d))
			assertClose(large.v ** 2 + large.d ** 2, 1, 1e-12)
		})
	})

	describe('lazy streaming / generator consumption', () => {
		test('consumes iterable strictly on demand without eager evaluation', () => {
			let produced = 0
			let finalized = false

			function* source() {
				try {
					for (let i = 0; i < 10; i++) {
						produced += 1
						yield { v: i * 0.25, d: 1 }
					}
				} finally {
					finalized = true
				}
			}

			const stream = sinDualLazy(source())
			assert.equal(typeof stream.next, 'function')
			assert.equal(typeof stream[Symbol.iterator], 'function')
			assert.equal(produced, 0, 'must not pull from source before first .next()')

			const first = stream.next()
			assert.equal(first.done, false)
			assert.equal(produced, 1)
			assert.equal(first.value.v, 0)
			assert.equal(first.value.d, 1)

			const second = stream.next()
			assert.equal(second.done, false)
			assert.equal(produced, 2)
			assertClose(second.value.v, Math.sin(0.25))
			assertClose(second.value.d, Math.cos(0.25))

			// Early termination closes upstream generator cleanly
			const closed = stream.return()
			assert.equal(closed.done, true)
			assert.equal(produced, 2)
			assert.equal(finalized, true)
		})

		test('supports infinite generators with early break in for..of', () => {
			function* infiniteAngles() {
				let n = 0
				while (true) {
					yield { v: (n * Math.PI) / 4, d: 1 }
					n += 1
				}
			}

			const taken = []
			for (const dual of sinDualLazy(infiniteAngles())) {
				taken.push(dual)
				if (taken.length === 5) break
			}

			assert.equal(taken.length, 5)
			for (let i = 0; i < taken.length; i++) {
				const angle = (i * Math.PI) / 4
				assertClose(taken[i].v, Math.sin(angle))
				assertClose(taken[i].d, Math.cos(angle))
			}
		})

		test('handles empty iterables and multiple iterable types (Array, Set, custom iterable)', () => {
			assert.deepEqual([...sinDualLazy([])], [])

			function* emptyGen() {}
			assert.deepEqual([...sinDualLazy(emptyGen())], [])

			const set = new Set([
				{ v: 0, d: 1 },
				{ v: Math.PI / 2, d: 3 },
			])
			const fromSet = [...sinDualLazy(set)]
			assert.equal(fromSet.length, 2)
			assertClose(fromSet[0].v, 0)
			assertClose(fromSet[0].d, 1)
			assertClose(fromSet[1].v, 1)
			assertClose(fromSet[1].d, 0)

			const customIterable = {
				[Symbol.iterator]() {
					const items = [{ v: 1, d: 2 }]
					let i = 0
					return {
						next() {
							return i < items.length ? { value: items[i++], done: false } : { value: undefined, done: true }
						},
					}
				},
			}
			const fromCustom = [...sinDualLazy(customIterable)]
			assert.equal(fromCustom.length, 1)
			assertClose(fromCustom[0].v, Math.sin(1))
			assertClose(fromCustom[0].d, 2 * Math.cos(1))
		})

		test('composes lazily as a pipeline for sin(sin(x))', () => {
			let pulled = 0
			function* source() {
				for (const x of [0.3, 0.8, 1.4]) {
					pulled += 1
					yield { v: x, d: 1 }
				}
			}

			const composed = sinDualLazy(sinDualLazy(source()))
			assert.equal(pulled, 0)

			const first = composed.next().value
			assert.equal(pulled, 1)
			assertClose(first.v, Math.sin(Math.sin(0.3)))
			assertClose(first.d, Math.cos(Math.sin(0.3)) * Math.cos(0.3))

			const rest = [...composed]
			assert.equal(pulled, 3)
			assert.equal(rest.length, 2)
			assertClose(rest[1].v, Math.sin(Math.sin(1.4)))
			assertClose(rest[1].d, Math.cos(Math.sin(1.4)) * Math.cos(1.4))
		})
	})

	describe('input validation', () => {
		test('rejects invalid top-level inputs eagerly', () => {
			for (const bad of [null, undefined, 42, true, false, Symbol('x'), 10n, 'abc', '', () => {}]) {
				assert.throws(() => sinDualLazy(bad), TypeError)
			}
		})

		test('rejects malformed dual objects with TypeError', () => {
			for (const bad of [{}, { v: 1 }, { d: 1 }, { v: '0', d: 1 }, { v: 0, d: null }, { v: 0, d: undefined }]) {
				assert.throws(() => sinDualLazy(bad), TypeError)
			}
		})

		test('rejects non-finite dual components with RangeError', () => {
			for (const bad of [
				{ v: Number.NaN, d: 1 },
				{ v: 1, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 0, d: Number.POSITIVE_INFINITY },
				{ v: 0, d: Number.NEGATIVE_INFINITY },
			]) {
				assert.throws(() => sinDualLazy(bad), RangeError)
			}
		})

		test('validates stream elements lazily when consumed', () => {
			let pulled = 0
			function* sourceWithError() {
				pulled += 1
				yield { v: 0, d: 1 }
				pulled += 1
				yield { v: Number.NaN, d: 1 }
				pulled += 1
				yield { v: 1, d: 1 }
			}

			const gen = sinDualLazy(sourceWithError())
			assert.equal(pulled, 0)

			const ok = gen.next()
			assert.equal(ok.done, false)
			assert.equal(ok.value.v, 0)
			assert.equal(pulled, 1)

			assert.throws(() => gen.next(), RangeError)
			assert.equal(pulled, 2, 'must not consume elements past the failing element')

			// Invalid element type in an array stream
			const badTypeGen = sinDualLazy([{ v: 0, d: 1 }, [0, 1]])
			assert.equal(badTypeGen.next().value.v, 0)
			assert.throws(() => badTypeGen.next(), TypeError)
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('forward-mode derivative matches central finite difference across angles and tangents', () => {
			const h = 1e-6
			const samples = [
				{ v: -2.5, d: 1 },
				{ v: -1.1, d: -2.3 },
				{ v: 0, d: 4.2 },
				{ v: 0.7, d: 0.5 },
				{ v: 1.25, d: 1 },
				{ v: 2.8, d: 3.1 },
				{ v: Math.PI / 3, d: -1.7 },
			]

			const results = [...sinDualLazy(samples)]
			assert.equal(results.length, samples.length)

			for (let i = 0; i < samples.length; i++) {
				const { v, d } = samples[i]
				const finiteDiff = (Math.sin(v + h * d) - Math.sin(v - h * d)) / (2 * h)
				assertClose(results[i].d, finiteDiff, 1e-8)
			}
		})

		test('composed sin(sin(x)) derivative matches central finite difference', () => {
			const h = 1e-6
			const xs = [-2.0, -0.5, 0.0, 0.6, 1.5, 2.7]
			const duals = xs.map((v) => ({ v, d: 1 }))
			const composed = [...sinDualLazy(sinDualLazy(duals))]

			for (let i = 0; i < xs.length; i++) {
				const x = xs[i]
				const finiteDiff = (Math.sin(Math.sin(x + h)) - Math.sin(Math.sin(x - h))) / (2 * h)
				assertClose(composed[i].v, Math.sin(Math.sin(x)), 1e-12)
				assertClose(composed[i].d, finiteDiff, 1e-8)
			}
		})

		test('satisfies Pythagorean identity sin²(v) + cos²(v) = 1 and odd/even symmetry', () => {
			const angles = [-3.1, -1.7, -0.4, 0, 0.4, 1.7, 3.1]
			const results = [...sinDualLazy(angles.map((v) => ({ v, d: 1 })))]

			for (const res of results) {
				assertClose(res.v ** 2 + res.d ** 2, 1, 1e-14)
			}

			for (const x of [0.4, 1.7, 3.1]) {
				const pos = sinDualLazy({ v: x, d: 2.5 })
				const neg = sinDualLazy({ v: -x, d: 2.5 })
				assertClose(neg.v, -pos.v, 1e-15)
				assertClose(neg.d, pos.d, 1e-15)
			}
		})
	})
})
