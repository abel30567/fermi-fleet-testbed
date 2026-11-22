import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { productBigIntLazy } from './productBigIntLazy.js'

/**
 * Helper to exhaust a generator and capture both yielded running values and final return value.
 * @param {Generator<bigint, bigint, void>} gen
 * @returns {{ values: bigint[], finalValue: bigint }}
 */
function collectWithReturn(gen) {
	const values = []
	while (true) {
		const step = gen.next()
		if (step.done) {
			return { values, finalValue: step.value }
		}
		values.push(step.value)
	}
}

describe('productBigIntLazy', () => {
	describe('normal cases', () => {
		it('yields running discrete products and returns final product', () => {
			const { values, finalValue } = collectWithReturn(productBigIntLazy([2n, 3n, 4n, 5n]))
			assert.deepEqual(values, [2n, 6n, 24n, 120n])
			assert.equal(finalValue, 120n)
		})

		it('handles a single-element iterable', () => {
			const { values, finalValue } = collectWithReturn(productBigIntLazy([42n]))
			assert.deepEqual(values, [42n])
			assert.equal(finalValue, 42n)
		})

		it('supports a custom initial BigInt accumulator', () => {
			const { values, finalValue } = collectWithReturn(productBigIntLazy([2n, 3n, 5n], 10n))
			assert.deepEqual(values, [20n, 60n, 300n])
			assert.equal(finalValue, 300n)
		})

		it('works across different iterable types (Set, Map.values, custom iterable, generator)', () => {
			assert.deepEqual([...productBigIntLazy(new Set([2n, 5n, 7n]))], [2n, 10n, 70n])

			const map = new Map([
				['a', 3n],
				['b', 4n],
				['c', 5n]
			])
			assert.deepEqual([...productBigIntLazy(map.values())], [3n, 12n, 60n])

			const customIterable = {
				[Symbol.iterator]() {
					const items = [11n, 13n]
					let i = 0
					return {
						next() {
							return i < items.length
								? { value: items[i++], done: false }
								: { value: undefined, done: true }
						}
					}
				}
			}
			assert.deepEqual([...productBigIntLazy(customIterable)], [11n, 143n])

			function* genSource() {
				yield 6n
				yield 7n
			}
			assert.deepEqual([...productBigIntLazy(genSource())], [6n, 42n])
		})
	})

	describe('edge cases', () => {
		it('handles empty iterables by yielding nothing and returning multiplicative identity 1n', () => {
			const gen = productBigIntLazy([])
			const first = gen.next()
			assert.deepEqual(first, { value: 1n, done: true })

			const customEmpty = productBigIntLazy([], 99n)
			assert.deepEqual(customEmpty.next(), { value: 99n, done: true })
		})

		it('handles negative values and alternating signs accurately', () => {
			const { values, finalValue } = collectWithReturn(
				productBigIntLazy([-2n, -3n, -4n, 5n])
			)
			assert.deepEqual(values, [-2n, 6n, -24n, -120n])
			assert.equal(finalValue, -120n)

			assert.deepEqual([...productBigIntLazy([2n, 3n], -1n)], [-2n, -6n])
		})

		it('handles zero elements and zero initial accumulator', () => {
			assert.deepEqual(collectWithReturn(productBigIntLazy([0n])), {
				values: [0n],
				finalValue: 0n
			})

			assert.deepEqual(collectWithReturn(productBigIntLazy([3n, -5n, 0n, 99n, -7n])), {
				values: [3n, -15n, 0n, 0n, 0n],
				finalValue: 0n
			})

			assert.deepEqual(collectWithReturn(productBigIntLazy([2n, 3n, 4n], 0n)), {
				values: [0n, 0n, 0n],
				finalValue: 0n
			})
		})

		it('computes exact products for huge BigInts beyond IEEE-754 limits', () => {
			const a = 10n ** 100n + 7n
			const b = -(2n ** 1024n) - 13n
			const c = 10n ** 18n + 1n

			const { values, finalValue } = collectWithReturn(productBigIntLazy([a, b, c]))
			assert.equal(values[0], a)
			assert.equal(values[1], a * b)
			assert.equal(values[2], a * b * c)
			assert.equal(finalValue, a * b * c)
		})
	})

	describe('input validation', () => {
		it('throws TypeError eagerly for non-iterable or string inputs', () => {
			const invalidIterables = [null, undefined, 0, 42, 42n, true, false, {}, '', '123']
			for (const bad of invalidIterables) {
				assert.throws(
					() => productBigIntLazy(bad),
					TypeError,
					`Expected TypeError for iterable: ${String(bad)}`
				)
			}
		})

		it('throws TypeError eagerly for non-BigInt initial values', () => {
			const invalidInitials = [1, 0, -1, 1.5, NaN, Infinity, null, '1', {}, []]
			for (const bad of invalidInitials) {
				assert.throws(
					() => productBigIntLazy([2n], bad),
					TypeError,
					`Expected TypeError for initial: ${String(bad)}`
				)
			}
		})

		it('throws TypeError lazily when encountering a non-BigInt element mid-stream', () => {
			let pulled = 0
			function* sourceWithBadElement() {
				pulled++
				yield 2n
				pulled++
				yield 3n
				pulled++
				yield 4 // invalid: Number instead of BigInt
				pulled++
				yield 5n
			}

			const gen = productBigIntLazy(sourceWithBadElement())
			assert.equal(pulled, 0)
			assert.deepEqual(gen.next(), { value: 2n, done: false })
			assert.equal(pulled, 1)
			assert.deepEqual(gen.next(), { value: 6n, done: false })
			assert.equal(pulled, 2)
			assert.throws(() => gen.next(), TypeError)
			assert.equal(pulled, 3, 'must not pull beyond the invalid element')
		})

		it('validates elements even after running product becomes 0n', () => {
			const gen = productBigIntLazy([2n, 0n, 'not-a-bigint'])
			assert.equal(gen.next().value, 2n)
			assert.equal(gen.next().value, 0n)
			assert.throws(() => gen.next(), TypeError)
		})

		it('rejects null, undefined, float, string, and symbol elements', () => {
			for (const badElem of [null, undefined, 1.5, '2', Symbol('x'), {}]) {
				const gen = productBigIntLazy([badElem])
				assert.throws(() => gen.next(), TypeError)
			}
		})
	})

	describe('laziness and streaming guarantees', () => {
		it('does not invoke Symbol.iterator or consume items before first .next()', () => {
			let iteratorCreated = false
			let pulled = 0
			const trackedIterable = {
				[Symbol.iterator]() {
					iteratorCreated = true
					return {
						next() {
							pulled++
							return { value: BigInt(pulled), done: false }
						}
					}
				}
			}

			const gen = productBigIntLazy(trackedIterable)
			assert.equal(iteratorCreated, false, 'iterator must not be created eagerly')
			assert.equal(pulled, 0, 'zero items must be consumed before first .next()')

			assert.equal(gen.next().value, 1n)
			assert.equal(iteratorCreated, true)
			assert.equal(pulled, 1)

			assert.equal(gen.next().value, 2n)
			assert.equal(pulled, 2)

			assert.equal(gen.next().value, 6n)
			assert.equal(pulled, 3)
		})

		it('streams over an infinite generator pulling exactly k elements for k outputs', () => {
			let pulled = 0
			function* infiniteNaturals() {
				let n = 1n
				while (true) {
					pulled++
					yield n++
				}
			}

			const gen = productBigIntLazy(infiniteNaturals())
			const firstSeven = []
			for (let i = 0; i < 7; i++) {
				firstSeven.push(gen.next().value)
				assert.equal(pulled, i + 1)
			}

			assert.deepEqual(firstSeven, [1n, 2n, 6n, 24n, 120n, 720n, 5040n])
		})

		it('closes the upstream iterator cleanly on early termination', () => {
			let pulled = 0
			let closed = false
			function* infiniteWithCleanup() {
				try {
					let n = 2n
					while (true) {
						pulled++
						yield n
					}
				} finally {
					closed = true
				}
			}

			const collected = []
			for (const value of productBigIntLazy(infiniteWithCleanup())) {
				collected.push(value)
				if (collected.length === 4) {
					break
				}
			}

			assert.deepEqual(collected, [2n, 4n, 8n, 16n])
			assert.equal(pulled, 4)
			assert.equal(closed, true, 'breaking out of for..of must close upstream generator')
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('matches exact factorials up to 50! via streaming naturals', () => {
			function* naturals(limit) {
				for (let k = 1n; k <= limit; k++) {
					yield k
				}
			}

			let expected = 1n
			let k = 1n
			const gen = productBigIntLazy(naturals(50n))
			let last = 1n
			for (const prod of gen) {
				expected *= k
				assert.equal(prod, expected)
				last = prod
				k++
			}

			assert.equal(
				last,
				30414093201713378043612608166064768844377641568960512000000000000n
			)
		})

		it('satisfies the Fermat product identity: prod_{k=0}^{n-1} (2^(2^k) + 1) = 2^(2^n) - 1', () => {
			function* fermatFactors(count) {
				for (let k = 0n; k < count; k++) {
					yield (1n << (1n << k)) + 1n
				}
			}

			let n = 1n
			for (const runningProduct of productBigIntLazy(fermatFactors(9n))) {
				const closedForm = (1n << (1n << n)) - 1n
				assert.equal(runningProduct, closedForm)
				n++
			}
			assert.equal(n, 10n)
		})

		it('satisfies geometric progression closed form: prod_{k=0}^{m-1} r^k = r^(m*(m-1)/2)', () => {
			for (const base of [3n, -7n, 10n ** 18n]) {
				function* powers(count) {
					let term = 1n
					for (let k = 0; k < count; k++) {
						yield term
						term *= base
					}
				}

				let m = 1n
				for (const runningProduct of productBigIntLazy(powers(15))) {
					const exponent = (m * (m - 1n)) / 2n
					assert.equal(runningProduct, base ** exponent)
					m++
				}
			}
		})

		it('satisfies multiplicative homomorphism and matches naive Array.prototype.reduce', () => {
			const seqA = [3n, -5n, 7n, 11n, -13n, 17n, 10n ** 25n]
			const seqB = [-2n, 4n, -6n, 8n, 10n, -12n, -(10n ** 20n)]
			const pointwise = seqA.map((a, idx) => a * seqB[idx])

			const prodsA = [...productBigIntLazy(seqA)]
			const prodsB = [...productBigIntLazy(seqB)]
			const prodsAB = [...productBigIntLazy(pointwise)]

			for (let i = 0; i < seqA.length; i++) {
				// Algebraic homomorphism check
				assert.equal(prodsAB[i], prodsA[i] * prodsB[i])

				// Independent naive reduce check on prefix
				const naiveA = seqA.slice(0, i + 1).reduce((acc, x) => acc * x, 1n)
				const naiveB = seqB.slice(0, i + 1).reduce((acc, x) => acc * x, 1n)
				assert.equal(prodsA[i], naiveA)
				assert.equal(prodsB[i], naiveB)
			}
		})
	})
})
