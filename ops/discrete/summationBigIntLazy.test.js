import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationBigIntLazy } from './summationBigIntLazy.js'

/**
 * Helper to exhaust a generator and capture both yielded partial sums and the
 * generator's final return value.
 *
 * @param {Generator<bigint, bigint, void>} gen
 * @returns {{ partials: bigint[], total: bigint }}
 */
function collectWithReturn(gen) {
	const partials = []
	while (true) {
		const step = gen.next()
		if (step.done) {
			return { partials, total: step.value }
		}
		partials.push(step.value)
	}
}

/**
 * Helper generator yielding integer range [start, end] inclusive.
 *
 * @param {bigint} start
 * @param {bigint} end
 * @returns {Generator<bigint, void, void>}
 */
function* rangeClosed(start, end) {
	for (let k = start; k <= end; k += 1n) {
		yield k
	}
}

describe('summationBigIntLazy', () => {
	test('yields exact partial sums and returns final total for basic sequences', () => {
		const { partials, total } = collectWithReturn(
			summationBigIntLazy([1n, 2n, 3n, 4n, 5n])
		)
		assert.deepEqual(partials, [1n, 3n, 6n, 10n, 15n])
		assert.equal(total, 15n)
	})

	test('handles negative values, zero cancellation, and single-element inputs', () => {
		const single = collectWithReturn(summationBigIntLazy([42n]))
		assert.deepEqual(single.partials, [42n])
		assert.equal(single.total, 42n)

		const alternating = collectWithReturn(
			summationBigIntLazy([10n, -10n, 25n, -30n, 5n])
		)
		assert.deepEqual(alternating.partials, [10n, 0n, 25n, -5n, 0n])
		assert.equal(alternating.total, 0n)
	})

	test('handles empty iterables with default and custom initial values', () => {
		const emptyDefault = collectWithReturn(summationBigIntLazy([]))
		assert.deepEqual(emptyDefault.partials, [])
		assert.equal(emptyDefault.total, 0n)

		function* emptyGen() {}
		const emptyCustom = collectWithReturn(
			summationBigIntLazy(emptyGen(), null, -100n)
		)
		assert.deepEqual(emptyCustom.partials, [])
		assert.equal(emptyCustom.total, -100n)
	})

	test('supports custom initial accumulator and termFn with bigint index', () => {
		const items = [10n, 20n, 30n]
		const seenIndices = []
		const { partials, total } = collectWithReturn(
			summationBigIntLazy(
				items,
				(value, idx) => {
					seenIndices.push(idx)
					return value * (idx + 1n)
				},
				5n
			)
		)
		assert.deepEqual(seenIndices, [0n, 1n, 2n])
		assert.deepEqual(partials, [15n, 55n, 145n])
		assert.equal(total, 145n)
	})

	test('works with diverse iterable types (Set, BigInt64Array, custom iterable)', () => {
		const setResult = collectWithReturn(
			summationBigIntLazy(new Set([2n, 4n, 6n]))
		)
		assert.equal(setResult.total, 12n)

		const typed = new BigInt64Array([100n, -40n, 15n])
		const typedResult = collectWithReturn(summationBigIntLazy(typed))
		assert.deepEqual(typedResult.partials, [100n, 60n, 75n])
		assert.equal(typedResult.total, 75n)

		const customIterable = {
			*[Symbol.iterator]() {
				yield 7n
				yield 8n
			}
		}
		assert.deepEqual([...summationBigIntLazy(customIterable)], [7n, 15n])
	})

	test('consumes infinite iterables strictly lazily and cleans up on early exit', () => {
		let produced = 0
		let closed = false

		function* infiniteNaturals() {
			try {
				let n = 1n
				while (true) {
					produced += 1
					yield n
					n += 1n
				}
			} finally {
				closed = true
			}
		}

		// Calling summationBigIntLazy must not pull any elements yet.
		const stream = summationBigIntLazy(infiniteNaturals())
		assert.equal(produced, 0)
		assert.equal(closed, false)

		const taken = []
		for (const partial of stream) {
			taken.push(partial)
			assert.equal(produced, taken.length)
			if (taken.length === 5) {
				break
			}
		}

		assert.deepEqual(taken, [1n, 3n, 6n, 10n, 15n])
		assert.equal(produced, 5)
		assert.equal(closed, true)
	})

	test('preserves exact arbitrary precision beyond Number.MAX_SAFE_INTEGER and 10^18 fixed-point scale', () => {
		const SCALE = 10n ** 18n
		const tenth = SCALE / 10n // exact 0.1 * 10^18
		const { total: fixedTotal } = collectWithReturn(
			summationBigIntLazy(rangeClosed(1n, 1000n), () => tenth)
		)
		assert.equal(fixedTotal, 100n * SCALE)

		const huge = 2n ** 256n
		const { total: hugeTotal } = collectWithReturn(
			summationBigIntLazy([huge, 1n, huge, -1n, 7n])
		)
		assert.equal(hugeTotal, 2n * huge + 7n)
	})

	test('independent cross-checks: Gauss, Faulhaber squares/cubes, geometric, and telescoping series', () => {
		// 1. Gauss arithmetic series: sum_{k=1}^n k = n(n+1)/2
		const n = 10000n
		const { total: sumK } = collectWithReturn(
			summationBigIntLazy(rangeClosed(1n, n))
		)
		assert.equal(sumK, (n * (n + 1n)) / 2n)

		// 2. Faulhaber sum of squares: sum_{k=1}^m k^2 = m(m+1)(2m+1)/6
		const m = 2500n
		const { total: sumSquares } = collectWithReturn(
			summationBigIntLazy(rangeClosed(1n, m), (k) => k * k)
		)
		assert.equal(sumSquares, (m * (m + 1n) * (2n * m + 1n)) / 6n)

		// 3. Nicomachus sum of cubes: sum_{k=1}^m k^3 = (m(m+1)/2)^2
		const { total: sumCubes } = collectWithReturn(
			summationBigIntLazy(rangeClosed(1n, m), (k) => k * k * k)
		)
		const triangular = (m * (m + 1n)) / 2n
		assert.equal(sumCubes, triangular * triangular)

		// 4. Exact geometric series: sum_{k=0}^{p-1} r^k = (r^p - 1)/(r - 1)
		const r = 3n
		const p = 120n
		const { total: geoSum } = collectWithReturn(
			summationBigIntLazy(rangeClosed(0n, p - 1n), (k) => r ** k)
		)
		assert.equal(geoSum, (r ** p - 1n) / (r - 1n))

		// 5. Telescoping series: sum_{k=1}^t ((k+1)^4 - k^4) = (t+1)^4 - 1
		const t = 500n
		const { total: teleSum } = collectWithReturn(
			summationBigIntLazy(
				rangeClosed(1n, t),
				(k) => (k + 1n) ** 4n - k ** 4n
			)
		)
		assert.equal(teleSum, (t + 1n) ** 4n - 1n)
	})

	test('validates arguments eagerly and rejects non-bigint terms during iteration', () => {
		// Invalid iterables fail eagerly on call (before .next())
		for (const bad of [null, undefined, 123, 123n, true, '123', {}, { a: 1 }]) {
			assert.throws(() => summationBigIntLazy(bad), TypeError)
		}

		// Invalid termFn fails eagerly
		for (const badFn of [123, 'fn', {}, []]) {
			assert.throws(() => summationBigIntLazy([], badFn), TypeError)
		}

		// Invalid initial fails eagerly
		for (const badInit of [0, 1.5, '0', null, {}, NaN]) {
			assert.throws(() => summationBigIntLazy([], null, badInit), TypeError)
		}

		// Non-bigint element in stream fails lazily when reached
		const badStream = summationBigIntLazy([1n, 2n, 3, 4n])
		assert.deepEqual(badStream.next(), { value: 1n, done: false })
		assert.deepEqual(badStream.next(), { value: 3n, done: false })
		assert.throws(() => badStream.next(), TypeError)

		// termFn returning non-bigint fails lazily when reached
		const badMapped = summationBigIntLazy([1n, 2n], (x) => Number(x))
		assert.throws(() => badMapped.next(), TypeError)
	})
})
