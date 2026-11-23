import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideFloatLazy } from './divideFloatLazy.js'

/**
 * Helper to take at most `count` values from an iterable without exhausting infinite sources.
 */
function take(iterable, count) {
	const out = []
	for (const value of iterable) {
		out.push(value)
		if (out.length >= count) break
	}
	return out
}

/**
 * Returns the raw IEEE-754 binary64 bit pattern of a number as a 64-bit unsigned BigInt.
 */
function float64Bits(value) {
	const buf = new ArrayBuffer(8)
	const view = new DataView(buf)
	view.setFloat64(0, value, false)
	return view.getBigUint64(0, false)
}

describe('divideFloatLazy - normal cases', () => {
	test('divides two arrays pairwise', () => {
		const gen = divideFloatLazy([10, 20, -15, 7.5], [2, 4, 3, 2.5])
		assert.deepEqual([...gen], [5, 5, -5, 3])
	})

	test('broadcasts scalar divisor over an iterable', () => {
		assert.deepEqual([...divideFloatLazy([1, 2, 3, 4], 2)], [0.5, 1, 1.5, 2])
	})

	test('broadcasts scalar dividend over an iterable', () => {
		assert.deepEqual([...divideFloatLazy(12, [1, 2, 3, 4, 6])], [12, 6, 4, 3, 2])
	})

	test('divides two scalar numbers and yields a single result', () => {
		assert.deepEqual([...divideFloatLazy(21, 6)], [3.5])
	})

	test('supports diverse iterable types (Float64Array, Set, Generator, custom iterable)', () => {
		const typed = new Float64Array([9, 16, 25])
		const set = new Set([3, 4, 5])
		assert.deepEqual([...divideFloatLazy(typed, set)], [3, 4, 5])

		const customIterable = {
			*[Symbol.iterator]() {
				yield 100
				yield 200
			},
		}
		assert.deepEqual([...divideFloatLazy(customIterable, [4, 8])], [25, 25])
	})

	test('handles empty iterables cleanly', () => {
		assert.deepEqual([...divideFloatLazy([], [])], [])
		assert.deepEqual([...divideFloatLazy([], [1, 2, 3])], [])
		assert.deepEqual([...divideFloatLazy([1, 2, 3], [])], [])
		assert.deepEqual([...divideFloatLazy([], 5)], [])
		assert.deepEqual([...divideFloatLazy(5, [])], [])
	})

	test('truncates to the shorter iterable by default', () => {
		assert.deepEqual([...divideFloatLazy([10, 20], [2, 5, 10, 20])], [5, 4])
		assert.deepEqual([...divideFloatLazy([10, 20, 30, 40], [2, 5])], [5, 4])
	})
})

describe('divideFloatLazy - true laziness and infinite generators', () => {
	test('streams pairwise from two infinite generators', () => {
		function* powersOfTwo() {
			let v = 1
			while (true) {
				yield v
				v *= 2
			}
		}
		function* naturals() {
			let n = 1
			while (true) {
				yield n++
			}
		}

		const firstFive = take(divideFloatLazy(powersOfTwo(), naturals()), 5)
		assert.deepEqual(firstFive, [1 / 1, 2 / 2, 4 / 3, 8 / 4, 16 / 5])
	})

	test('streams from an infinite generator with a scalar operand', () => {
		function* counter() {
			let n = 1
			while (true) {
				yield n++
			}
		}

		assert.deepEqual(take(divideFloatLazy(counter(), 4), 4), [0.25, 0.5, 0.75, 1])
		assert.deepEqual(take(divideFloatLazy(1, counter()), 4), [1, 0.5, 1 / 3, 0.25])
	})

	test('consumes strictly one element per .next() and zero elements before first pull', () => {
		let numPulls = 0
		let denPulls = 0

		function* trackedNums() {
			for (let i = 1; ; i++) {
				numPulls++
				yield i * 10
			}
		}
		function* trackedDens() {
			for (let i = 1; ; i++) {
				denPulls++
				yield i
			}
		}

		const gen = divideFloatLazy(trackedNums(), trackedDens())
		assert.equal(numPulls, 0)
		assert.equal(denPulls, 0)

		assert.deepEqual(gen.next(), { value: 10, done: false })
		assert.equal(numPulls, 1)
		assert.equal(denPulls, 1)

		assert.deepEqual(gen.next(), { value: 10, done: false })
		assert.equal(numPulls, 2)
		assert.equal(denPulls, 2)

		gen.return()
	})

	test('does not over-pull the second iterable when the first finishes', () => {
		let denPulls = 0
		let denClosed = false

		function* infiniteDens() {
			try {
				for (let i = 1; ; i++) {
					denPulls++
					yield i
				}
			} finally {
				denClosed = true
			}
		}

		const results = [...divideFloatLazy([6, 12], infiniteDens())]
		assert.deepEqual(results, [6, 6])
		assert.equal(denPulls, 2)
		assert.equal(denClosed, true)
	})

	test('closes both infinite source generators via finally on early break', () => {
		let numClosed = false
		let denClosed = false

		function* infiniteNums() {
			try {
				let i = 1
				while (true) yield i++
			} finally {
				numClosed = true
			}
		}
		function* infiniteDens() {
			try {
				let i = 2
				while (true) yield i++
			} finally {
				denClosed = true
			}
		}

		const sampled = take(divideFloatLazy(infiniteNums(), infiniteDens()), 3)
		assert.deepEqual(sampled, [1 / 2, 2 / 3, 3 / 4])
		assert.equal(numClosed, true)
		assert.equal(denClosed, true)
	})

	test('validates element types lazily rather than eagerly consuming the sequence', () => {
		const gen = divideFloatLazy([10, 'not-a-number', 30], [2, 2, 2])
		assert.deepEqual(gen.next(), { value: 5, done: false })
		assert.throws(() => gen.next(), TypeError)
	})
})

describe('divideFloatLazy - IEEE-754 edge cases and options', () => {
	test('follows IEEE-754 division-by-zero semantics by default', () => {
		const [posInf, negInf, negZeroInf, posZeroInf, zeroOverZero, negZeroOverZero] = [
			...divideFloatLazy([1, -1, 1, -1, 0, -0], [0, 0, -0, -0, 0, 0]),
		]

		assert.equal(posInf, Infinity)
		assert.equal(negInf, -Infinity)
		assert.equal(negZeroInf, -Infinity)
		assert.equal(posZeroInf, Infinity)
		assert.ok(Number.isNaN(zeroOverZero))
		assert.ok(Number.isNaN(negZeroOverZero))
	})

	test('preserves IEEE-754 signed zeros, infinities, NaN, overflow, and underflow', () => {
		const results = [
			...divideFloatLazy(
				[0, -0, -0, 1, -1, Infinity, Infinity, NaN, 1, Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MIN_VALUE],
				[-1, 1, -1, -Infinity, Infinity, -2, Infinity, 2, NaN, 0.5, 2, 2, Number.MIN_VALUE],
			),
		]

		assert.ok(Object.is(results[0], -0))
		assert.ok(Object.is(results[1], -0))
		assert.ok(Object.is(results[2], 0))
		assert.ok(Object.is(results[3], -0))
		assert.ok(Object.is(results[4], -0))
		assert.equal(results[5], -Infinity)
		assert.ok(Number.isNaN(results[6]))
		assert.ok(Number.isNaN(results[7]))
		assert.ok(Number.isNaN(results[8]))
		assert.equal(results[9], Infinity)
		assert.ok(Object.is(results[10], 0))
		assert.ok(Object.is(results[11], -0))
		assert.equal(results[12], 1)

		// Verify raw IEEE-754 binary64 bit patterns for signed zeros and infinities
		assert.equal(float64Bits(results[0]), 0x8000000000000000n)
		assert.equal(float64Bits(results[2]), 0x0000000000000000n)
		assert.equal(float64Bits(results[5]), 0xfff0000000000000n)
		assert.equal(float64Bits(results[9]), 0x7ff0000000000000n)
	})

	test('strictZero option throws RangeError on +0 and -0 divisors and closes source iterators', () => {
		assert.throws(() => [...divideFloatLazy(1, 0, { strictZero: true })], RangeError)
		assert.throws(() => [...divideFloatLazy(1, -0, { strictZero: true })], RangeError)

		let closed = false
		function* source() {
			try {
				yield 10
				yield 20
				yield 30
			} finally {
				closed = true
			}
		}

		const gen = divideFloatLazy(source(), [2, 0, 5], { strictZero: true })
		assert.deepEqual(gen.next(), { value: 5, done: false })
		assert.throws(() => gen.next(), RangeError)
		assert.equal(closed, true)
	})

	test('strictLength option rejects mismatched iterable lengths and accepts equal lengths', () => {
		assert.deepEqual([...divideFloatLazy([8, 9], [2, 3], { strictLength: true })], [4, 3])
		assert.throws(() => [...divideFloatLazy([8], [2, 3], { strictLength: true })], RangeError)
		assert.throws(() => [...divideFloatLazy([8, 9], [2], { strictLength: true })], RangeError)
	})
})

describe('divideFloatLazy - input validation errors', () => {
	test('throws TypeError eagerly when arguments are missing or invalid', () => {
		assert.throws(() => divideFloatLazy(), TypeError)
		assert.throws(() => divideFloatLazy([1, 2]), TypeError)

		const invalidInputs = [
			null,
			undefined,
			'123',
			new String('123'),
			true,
			false,
			{},
			10n,
			new Number(5),
			Symbol('x'),
			() => 1,
		]

		for (const bad of invalidInputs) {
			assert.throws(() => divideFloatLazy(bad, 1), TypeError)
			assert.throws(() => divideFloatLazy(1, bad), TypeError)
		}
	})

	test('throws TypeError eagerly for invalid options', () => {
		assert.throws(() => divideFloatLazy(1, 2, null), TypeError)
		assert.throws(() => divideFloatLazy(1, 2, []), TypeError)
		assert.throws(() => divideFloatLazy(1, 2, 'strict'), TypeError)
		assert.throws(() => divideFloatLazy(1, 2, { strictZero: 1 }), TypeError)
		assert.throws(() => divideFloatLazy(1, 2, { strictLength: 'yes' }), TypeError)
	})

	test('throws TypeError when custom [Symbol.iterator]() does not return an iterator', () => {
		const broken = { [Symbol.iterator]() { return null } }
		assert.throws(() => [...divideFloatLazy(broken, [1])], TypeError)
		assert.throws(() => [...divideFloatLazy([1], broken)], TypeError)
	})

	test('throws TypeError when an iterable yields non-number elements', () => {
		assert.throws(() => [...divideFloatLazy([null], [1])], TypeError)
		assert.throws(() => [...divideFloatLazy([1], [undefined])], TypeError)
		assert.throws(() => [...divideFloatLazy([1], ['2'])], TypeError)
		assert.throws(() => [...divideFloatLazy(new BigInt64Array([10n]), [2])], TypeError)
		assert.throws(() => [...divideFloatLazy([10], [true])], TypeError)
	})
})

describe('divideFloatLazy - independent cross-checks', () => {
	test('matches eager reference bit-for-bit across deterministic PRNG corpus including special values', () => {
		// Deterministic xorshift32 PRNG
		let state = 0x12345678
		function nextFloat() {
			state ^= state << 13
			state ^= state >>> 17
			state ^= state << 5
			return ((state >>> 0) / 0x100000000 - 0.5) * 1e6
		}

		const specials = [0, -0, 1, -1, Infinity, -Infinity, NaN, Number.MAX_VALUE, Number.MIN_VALUE, Number.EPSILON]
		const numerators = [...specials]
		const denominators = [...specials].reverse()
		for (let i = 0; i < 200; i++) {
			numerators.push(nextFloat())
			denominators.push(nextFloat())
		}

		const expected = numerators.map((n, i) => n / denominators[i])
		const actual = [...divideFloatLazy(numerators, denominators)]

		assert.equal(actual.length, expected.length)
		for (let i = 0; i < expected.length; i++) {
			assert.ok(
				Object.is(actual[i], expected[i]),
				`Mismatch at index ${i}: expected ${expected[i]}, got ${actual[i]}`,
			)
		}
	})

	test('matches exact BigInt rational quotient and dyadic multiplicative inverse properties', () => {
		const pairs = [
			[1000003, 7],
			[-9876543, 13],
			[42, 3],
			[123456789, 997],
			[0, 17],
		]

		const quotients = [
			...divideFloatLazy(
				pairs.map(([p]) => p),
				pairs.map(([, q]) => q),
			),
		]

		// Cross-check against exact BigInt fixed-point division scaled by 10^9
		const SCALE = 1_000_000_000n
		for (let i = 0; i < pairs.length; i++) {
			const [p, q] = pairs[i]
			const exactScaled = (BigInt(p) * SCALE) / BigInt(q)
			const floatScaled = BigInt(Math.trunc(quotients[i] * Number(SCALE)))
			const diff = exactScaled >= floatScaled ? exactScaled - floatScaled : floatScaled - exactScaled
			assert.ok(diff <= 1n, `BigInt cross-check failed for ${p}/${q}: diff=${diff}`)
		}

		// Exact dyadic round-trip: dividing normal floats by powers of 2 is exact in binary64
		const values = [-12345.6789, -1.5, 0.125, 3.141592653589793, 9007199254740991]
		const powersOfTwo = [2, 4, 16, 1024, 65536]
		const dyadicQuotients = [...divideFloatLazy(values, powersOfTwo)]
		for (let i = 0; i < values.length; i++) {
			assert.equal(dyadicQuotients[i] * powersOfTwo[i], values[i])
		}
	})
})
