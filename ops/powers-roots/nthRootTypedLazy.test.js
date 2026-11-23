import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootTypedLazy } from './nthRootTypedLazy.js'

/**
 * Asserts two numbers are approximately equal within an absolute or relative
 * tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-12]
 */
function assertClose(actual, expected, tol = 1e-12) {
	assert.equal(typeof actual, 'number')
	assert.ok(!Number.isNaN(actual), `Expected ${expected}, got NaN`)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		`Expected ${actual} to be within ${tol * scale} of ${expected}`
	)
}

/**
 * Independent bisection oracle for computing the real integer k-th root of a
 * positive number x (k >= 1) without using Math.pow or Math.exp/Math.log.
 *
 * @param {number} x - Positive finite radicand.
 * @param {number} k - Positive integer degree.
 * @returns {number}
 */
function bisectionIntegerRoot(x, k) {
	let lo = x >= 1 ? 1 : x
	let hi = x >= 1 ? x : 1
	for (let iter = 0; iter < 120; iter++) {
		const mid = lo + (hi - lo) / 2
		let prod = 1
		for (let i = 0; i < k; i++) {
			prod *= mid
		}
		if (prod === x) return mid
		if (prod < x) {
			lo = mid
		} else {
			hi = mid
		}
	}
	return lo + (hi - lo) / 2
}

describe('nthRootTypedLazy', () => {
	describe('normal cases', () => {
		it('computes element-wise roots over Float64Array with a scalar degree', () => {
			const radicands = new Float64Array([1, 8, 27, 64, 125])
			const result = Float64Array.from(nthRootTypedLazy(radicands, 3))
			assert.deepEqual(result, new Float64Array([1, 2, 3, 4, 5]))
		})

		it('computes exact roots for higher integer powers via Newton refinement', () => {
			const radicands = new Float64Array([16, 32, 64, 243, 1024])
			const degrees = new Float64Array([4, 5, 6, 5, 10])
			const result = [...nthRootTypedLazy(radicands, degrees)]
			assert.deepEqual(result, [2, 2, 2, 3, 2])
		})

		it('computes element-wise roots over paired Float64Array inputs', () => {
			const radicands = new Float64Array([9, 16, 27, 81, 32])
			const degrees = new Float64Array([1, 2, 3, 4, 5])
			const result = [...nthRootTypedLazy(radicands, degrees)]
			assert.deepEqual(result, [9, 4, 3, 3, 2])
		})

		it('handles negative and fractional degrees accurately', () => {
			const radicands = new Float64Array([4, 8, 16, 16, 25])
			const degrees = new Float64Array([-2, -3, -4, 0.5, -0.5])
			const result = [...nthRootTypedLazy(radicands, degrees)]
			const expected = [0.5, 0.5, 0.5, 256, 1 / 625]
			assert.equal(result.length, expected.length)
			for (let i = 0; i < expected.length; i++) {
				assertClose(result[i], expected[i], 1e-12)
			}
		})

		it('yields nothing for empty Float64Array inputs', () => {
			assert.deepEqual([...nthRootTypedLazy(new Float64Array(0), 2)], [])
			assert.deepEqual(
				[...nthRootTypedLazy(new Float64Array(0), new Float64Array(0))],
				[]
			)
		})
	})

	describe('edge cases', () => {
		it('computes real negative roots for odd integer degrees (positive and negative)', () => {
			const radicands = new Float64Array([-1, -8, -27, -32, -243, -8, -32, -5])
			const degrees = new Float64Array([3, 3, 3, 5, 5, -3, -5, 1])
			const result = [...nthRootTypedLazy(radicands, degrees)]
			assert.deepEqual(result, [-1, -2, -3, -2, -3, -0.5, -0.5, -5])
		})

		it('returns NaN for even integer and non-integer roots of negative numbers', () => {
			const radicands = new Float64Array([-4, -16, -16, -64, -8, -9])
			const degrees = new Float64Array([2, 4, -2, -6, 2.5, 0.5])
			const result = [...nthRootTypedLazy(radicands, degrees)]
			for (let i = 0; i < result.length; i++) {
				assert.ok(
					Number.isNaN(result[i]),
					`Expected NaN at index ${i} for (${radicands[i]}, ${degrees[i]}), got ${result[i]}`
				)
			}
		})

		it('throws RangeError eagerly for scalar zero degree (+0 and -0)', () => {
			const radicands = new Float64Array([1, 4, 9])
			assert.throws(() => nthRootTypedLazy(radicands, 0), RangeError)
			assert.throws(() => nthRootTypedLazy(radicands, -0), RangeError)
		})

		it('throws RangeError lazily when encountering zero degree in a Float64Array or iterable', () => {
			const radicands = new Float64Array([8, 27, 64])
			const degrees = new Float64Array([3, 0, 3])
			const gen = nthRootTypedLazy(radicands, degrees)
			assert.deepEqual(gen.next(), { value: 2, done: false })
			assert.throws(() => gen.next(), RangeError)

			function* degStream() {
				yield 2
				yield -0
			}
			const gen2 = nthRootTypedLazy(new Float64Array([9, 16]), degStream())
			assert.deepEqual(gen2.next(), { value: 3, done: false })
			assert.throws(() => gen2.next(), RangeError)
		})

		it('preserves signed zero and infinity semantics for zero and infinite radicands', () => {
			// Zero radicands
			assert.ok(Object.is([...nthRootTypedLazy(new Float64Array([0]), 2)][0], 0))
			assert.ok(Object.is([...nthRootTypedLazy(new Float64Array([-0]), 2)][0], 0))
			assert.ok(Object.is([...nthRootTypedLazy(new Float64Array([-0]), 3)][0], -0))
			assert.equal([...nthRootTypedLazy(new Float64Array([0]), -2)][0], Infinity)
			assert.equal([...nthRootTypedLazy(new Float64Array([-0]), -2)][0], Infinity)
			assert.equal([...nthRootTypedLazy(new Float64Array([-0]), -3)][0], -Infinity)

			// Infinite radicands
			assert.equal([...nthRootTypedLazy(new Float64Array([Infinity]), 3)][0], Infinity)
			assert.ok(Object.is([...nthRootTypedLazy(new Float64Array([Infinity]), -3)][0], 0))
			assert.equal([...nthRootTypedLazy(new Float64Array([-Infinity]), 3)][0], -Infinity)
			assert.ok(Object.is([...nthRootTypedLazy(new Float64Array([-Infinity]), -3)][0], -0))
			assert.ok(Number.isNaN([...nthRootTypedLazy(new Float64Array([-Infinity]), 2)][0]))
		})

		it('handles NaN and infinite degrees sensibly', () => {
			const res = [...nthRootTypedLazy(new Float64Array([NaN, 16, 5, 0, -5, Infinity]), new Float64Array([2, NaN, Infinity, Infinity, Infinity, -Infinity]))]
			assert.ok(Number.isNaN(res[0]))
			assert.ok(Number.isNaN(res[1]))
			assert.equal(res[2], 1)
			assert.ok(Number.isNaN(res[3]))
			assert.ok(Number.isNaN(res[4]))
			assert.ok(Number.isNaN(res[5]))
		})

		it('handles very large and very small finite magnitudes without spurious NaN/overflow', () => {
			const radicands = new Float64Array([1e300, 1e-300])
			const result = [...nthRootTypedLazy(radicands, 300)]
			assertClose(result[0], 10, 1e-12)
			assertClose(result[1], 0.1, 1e-12)
		})
	})

	describe('lazy and streaming behavior', () => {
		it('does not pull from input iterables until .next() is called and pulls strictly on demand', () => {
			let radicandPulls = 0
			let degreePulls = 0

			function* radicandGen() {
				for (const v of [1, 8, 27, 64, 125]) {
					radicandPulls++
					yield v
				}
			}
			function* degreeGen() {
				for (const d of [3, 3, 3, 3, 3]) {
					degreePulls++
					yield d
				}
			}

			const stream = nthRootTypedLazy(radicandGen(), degreeGen())
			assert.equal(radicandPulls, 0)
			assert.equal(degreePulls, 0)

			assert.deepEqual(stream.next(), { value: 1, done: false })
			assert.equal(radicandPulls, 1)
			assert.equal(degreePulls, 1)

			assert.deepEqual(stream.next(), { value: 2, done: false })
			assert.equal(radicandPulls, 2)
			assert.equal(degreePulls, 2)
		})

		it('consumes infinite generators lazily and closes upstream iterators on early exit', () => {
			let radicandClosed = false
			let degreeClosed = false
			let produced = 0

			function* infiniteSquares() {
				try {
					let k = 1
					while (true) {
						produced++
						yield k * k
						k++
					}
				} finally {
					radicandClosed = true
				}
			}

			function* infiniteTwos() {
				try {
					while (true) {
						yield 2
					}
				} finally {
					degreeClosed = true
				}
			}

			const taken = []
			for (const root of nthRootTypedLazy(infiniteSquares(), infiniteTwos())) {
				taken.push(root)
				if (taken.length === 4) {
					break
				}
			}

			assert.deepEqual(taken, [1, 2, 3, 4])
			assert.equal(produced, 4)
			assert.equal(radicandClosed, true)
			assert.equal(degreeClosed, true)
		})

		it('supports custom iterable objects implementing Symbol.iterator', () => {
			let pulls = 0
			const customIterable = {
				[Symbol.iterator]() {
					const data = [16, 81, 256]
					let i = 0
					return {
						next() {
							if (i >= data.length) return { value: undefined, done: true }
							pulls++
							return { value: data[i++], done: false }
						},
					}
				},
			}

			const gen = nthRootTypedLazy(customIterable, 4)
			assert.equal(pulls, 0)
			assert.equal(gen.next().value, 2)
			assert.equal(pulls, 1)
			assert.equal(gen.next().value, 3)
			assert.equal(pulls, 2)
		})
	})

	describe('invalid input validation', () => {
		it('rejects invalid radicands types eagerly with TypeError', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				'1234',
				true,
				{},
				[1, 8, 27],
				new Int32Array([1, 8, 27]),
				new Float32Array([1, 8, 27]),
				new Uint8Array([1, 8, 27]),
				new DataView(new ArrayBuffer(16)),
			]

			for (const bad of invalidInputs) {
				assert.throws(
					() => nthRootTypedLazy(bad, 3),
					TypeError,
					`Expected TypeError for radicands = ${String(bad)}`
				)
			}
		})

		it('rejects invalid degrees types eagerly with TypeError', () => {
			const validRadicands = new Float64Array([1, 8, 27])
			const invalidDegrees = [
				null,
				undefined,
				'3',
				false,
				{},
				[3, 3, 3],
				new Int32Array([3, 3, 3]),
				new Float32Array([3, 3, 3]),
				new Uint8Array([3, 3, 3]),
			]

			for (const bad of invalidDegrees) {
				assert.throws(
					() => nthRootTypedLazy(validRadicands, bad),
					TypeError,
					`Expected TypeError for degrees = ${String(bad)}`
				)
			}
		})

		it('rejects mismatched Float64Array lengths eagerly with RangeError', () => {
			assert.throws(
				() => nthRootTypedLazy(new Float64Array([1, 8, 27]), new Float64Array([3, 3])),
				RangeError
			)
		})

		it('rejects mismatched lazy sequence lengths with RangeError when detected', () => {
			function* shortGen() {
				yield 8
			}
			function* longGen() {
				yield 3
				yield 3
			}

			const genA = nthRootTypedLazy(shortGen(), longGen())
			assert.equal(genA.next().value, 2)
			assert.throws(() => genA.next(), RangeError)

			const genB = nthRootTypedLazy(new Float64Array([8, 27]), shortGen())
			assert.throws(() => [...genB], RangeError)
		})

		it('rejects non-numeric elements yielded by lazy iterables with TypeError', () => {
			function* badRadicands() {
				yield 8
				yield /** @type {any} */ ('27')
			}
			const gen1 = nthRootTypedLazy(badRadicands(), 3)
			assert.equal(gen1.next().value, 2)
			assert.throws(() => gen1.next(), TypeError)

			function* badDegrees() {
				yield 3
				yield /** @type {any} */ (null)
			}
			const gen2 = nthRootTypedLazy(new Float64Array([8, 27]), badDegrees())
			assert.equal(gen2.next().value, 2)
			assert.throws(() => gen2.next(), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches independent bisection oracle across positive/negative radicands and integer degrees', () => {
			const radicands = new Float64Array([
				0.001, 0.25, 2, 7.5, 19.3, 1000, -0.125, -5.7, -42, -100000,
			])
			const degrees = new Float64Array([3, 4, 5, 2, 7, 6, 3, 5, 7, 5])
			const results = [...nthRootTypedLazy(radicands, degrees)]

			for (let i = 0; i < radicands.length; i++) {
				const x = radicands[i]
				const n = degrees[i]
				const expected = x < 0
					? -bisectionIntegerRoot(-x, n)
					: bisectionIntegerRoot(x, n)
				assertClose(results[i], expected, 1e-12)
			}
		})

		it('satisfies round-trip identity (nthRoot(x, n))^n === x and matches exp(log(x)/n)', () => {
			const radicands = new Float64Array([0.05, 0.7, 2.5, 13.7, 123.456, 98765.4321])
			const degrees = new Float64Array([0.4, 1.5, 2.3, 3.7, -2.5, 7.25])
			const results = [...nthRootTypedLazy(radicands, degrees)]

			for (let i = 0; i < radicands.length; i++) {
				const x = radicands[i]
				const n = degrees[i]
				const r = results[i]

				// Cross-check via exp(log(x) / n)
				const logExpOracle = Math.exp(Math.log(x) / n)
				assertClose(r, logExpOracle, 1e-12)

				// Round-trip identity: r^n ≈ x
				assertClose(Math.pow(r, n), x, 1e-11)
			}
		})
	})
})
