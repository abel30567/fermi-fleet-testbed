import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { add } from '../../lib.js'
import { addFloatLazy } from './addFloatLazy.js'

function take(iterable, count) {
	const result = []
	if (count <= 0) return result
	for (const value of iterable) {
		result.push(value)
		if (result.length >= count) break
	}
	return result
}

function* naturals(start = 0, step = 1) {
	let current = start
	while (true) {
		yield current
		current += step
	}
}

describe('addFloatLazy', () => {
	describe('normal cases', () => {
		test('adds two pairwise arrays lazily', () => {
			const gen = addFloatLazy([1.5, -2.25, 3, 0.5], [0.5, 4.25, -3, 1.25])
			assert.equal(typeof gen.next, 'function')
			assert.equal(typeof gen[Symbol.iterator], 'function')
			assert.deepEqual([...gen], [2, 2, 0, 1.75])
		})

		test('adds two scalar float64 numbers as a single-element stream', () => {
			assert.deepEqual([...addFloatLazy(2.5, 3.25)], [5.75])
			assert.deepEqual([...addFloatLazy(-10.5, 4.5)], [-6])
		})

		test('broadcasts scalar on the left across an iterable', () => {
			assert.deepEqual([...addFloatLazy(10.5, [1, 2.5, -3.5])], [11.5, 13, 7])
		})

		test('broadcasts scalar on the right across an iterable', () => {
			assert.deepEqual([...addFloatLazy([1, 2.5, -3.5], 10.5)], [11.5, 13, 7])
		})

		test('supports TypedArrays, Sets, Generators, and custom iterables', () => {
			const f64 = new Float64Array([1.25, 2.5, 3.75])
			const set = new Set([0.75, 0.5, 0.25])
			assert.deepEqual([...addFloatLazy(f64, set)], [2, 3, 4])

			const customIterable = Object.assign(Object.create(null), {
				*[Symbol.iterator]() {
					yield 10
					yield 20
				},
			})
			assert.deepEqual([...addFloatLazy(customIterable, new Int32Array([1, 2]))], [11, 22])
		})

		test('composes lazily when chaining multiple addFloatLazy streams', () => {
			const stream = addFloatLazy(
				addFloatLazy(naturals(1, 0.5), naturals(10, 1)),
				0.25,
			)
			assert.deepEqual(take(stream, 4), [11.25, 12.75, 14.25, 15.75])
		})
	})

	describe('laziness and streaming semantics', () => {
		test('consumes infinite generators without hanging', () => {
			const pairwise = addFloatLazy(naturals(0, 1), naturals(0, 0.5))
			assert.deepEqual(take(pairwise, 5), [0, 1.5, 3, 4.5, 6])

			const broadcast = addFloatLazy(100, naturals(0, 0.25))
			assert.deepEqual(take(broadcast, 4), [100, 100.25, 100.5, 100.75])
		})

		test('pulls strictly on demand with zero lookahead and no work before first next()', () => {
			let pullsA = 0
			let pullsB = 0
			let openedA = false
			let openedB = false

			const iterA = {
				*[Symbol.iterator]() {
					openedA = true
					let i = 1
					while (true) {
						pullsA += 1
						yield i * 0.5
						i += 1
					}
				},
			}
			const iterB = {
				*[Symbol.iterator]() {
					openedB = true
					let i = 1
					while (true) {
						pullsB += 1
						yield i * 10
						i += 1
					}
				},
			}

			const stream = addFloatLazy(iterA, iterB)
			assert.equal(openedA, false)
			assert.equal(openedB, false)
			assert.equal(pullsA, 0)
			assert.equal(pullsB, 0)

			assert.deepEqual(stream.next(), { value: 10.5, done: false })
			assert.equal(pullsA, 1)
			assert.equal(pullsB, 1)

			assert.deepEqual(stream.next(), { value: 21, done: false })
			assert.equal(pullsA, 2)
			assert.equal(pullsB, 2)

			stream.return()
			assert.equal(pullsA, 2)
			assert.equal(pullsB, 2)
		})

		test('closes underlying generators when consumer exits early', () => {
			let closedA = false
			let closedB = false

			function* trackedA() {
				try {
					yield* naturals(1)
				} finally {
					closedA = true
				}
			}

			function* trackedB() {
				try {
					yield* naturals(10)
				} finally {
					closedB = true
				}
			}

			const out = take(addFloatLazy(trackedA(), trackedB()), 3)
			assert.deepEqual(out, [11, 13, 15])
			assert.equal(closedA, true)
			assert.equal(closedB, true)
		})

		test('stops at shorter iterable and closes the longer infinite generator', () => {
			let closedInf = false
			function* trackedInf() {
				try {
					yield* naturals(100)
				} finally {
					closedInf = true
				}
			}

			assert.deepEqual([...addFloatLazy([1, 2], trackedInf())], [101, 103])
			assert.equal(closedInf, true)

			let closedInfLeft = false
			function* trackedInfLeft() {
				try {
					yield* naturals(10)
				} finally {
					closedInfLeft = true
				}
			}
			assert.deepEqual([...addFloatLazy(trackedInfLeft(), [1, 2, 3])], [11, 13, 15])
			assert.equal(closedInfLeft, true)
		})

		test('handles empty iterables without touching the second iterable when first is empty', () => {
			let openedB = false
			const lazyB = {
				*[Symbol.iterator]() {
					openedB = true
					yield 1
				},
			}
			assert.deepEqual([...addFloatLazy([], lazyB)], [])
			assert.equal(openedB, false)

			assert.deepEqual([...addFloatLazy([1, 2], [])], [])
			assert.deepEqual([...addFloatLazy(5, [])], [])
			assert.deepEqual([...addFloatLazy([], 5)], [])
		})

		test('does not evaluate invalid elements beyond what is consumed', () => {
			const stream = addFloatLazy([1, 2, 'not-a-number'], [10, 20, 30])
			assert.deepEqual(take(stream, 2), [11, 22])
		})
	})

	describe('IEEE-754 float64 special values and edge cases', () => {
		test('preserves IEEE-754 signed zero semantics', () => {
			const [negNeg] = [...addFloatLazy(-0, -0)]
			assert.equal(Object.is(negNeg, -0), true)

			const [negPos] = [...addFloatLazy(-0, +0)]
			assert.equal(Object.is(negPos, +0), true)

			const [posNeg] = [...addFloatLazy(+0, -0)]
			assert.equal(Object.is(posNeg, +0), true)

			const [posPos] = [...addFloatLazy(+0, +0)]
			assert.equal(Object.is(posPos, +0), true)

			const [cancel] = [...addFloatLazy(1.5, -1.5)]
			assert.equal(Object.is(cancel, +0), true)
		})

		test('handles Infinity, -Infinity, and NaN per IEEE-754', () => {
			const a = [Infinity, -Infinity, Infinity, -Infinity, NaN, 1, 0]
			const b = [1, -1, Infinity, Infinity, 5, NaN, -Infinity]
			const out = [...addFloatLazy(a, b)]

			assert.equal(out[0], Infinity)
			assert.equal(out[1], -Infinity)
			assert.equal(out[2], Infinity)
			assert.equal(Number.isNaN(out[3]), true)
			assert.equal(Number.isNaN(out[4]), true)
			assert.equal(Number.isNaN(out[5]), true)
			assert.equal(out[6], -Infinity)
		})

		test('handles overflow, subnormals, ULP rounding, and 0.1 + 0.2', () => {
			const [classic] = [...addFloatLazy(0.1, 0.2)]
			assert.equal(classic, 0.30000000000000004)

			const [overflowPos] = [...addFloatLazy(Number.MAX_VALUE, Number.MAX_VALUE)]
			assert.equal(overflowPos, Infinity)

			const [overflowNeg] = [...addFloatLazy(-Number.MAX_VALUE, -Number.MAX_VALUE)]
			assert.equal(overflowNeg, -Infinity)

			const [subnormal] = [...addFloatLazy(Number.MIN_VALUE, Number.MIN_VALUE)]
			assert.equal(subnormal, 2 * Number.MIN_VALUE)
			assert.notEqual(subnormal, 0)

			// 2^53 + 1 rounds to even (2^53) in IEEE-754 binary64
			const two53 = 9007199254740992
			assert.deepEqual([...addFloatLazy(two53, 1)], [two53])
			assert.deepEqual([...addFloatLazy(two53, 2)], [two53 + 2])
		})

		test('handles same reusable array passed for both operands', () => {
			const shared = [1.5, -0, 2.25]
			const out = [...addFloatLazy(shared, shared)]
			assert.equal(out[0], 3)
			assert.equal(Object.is(out[1], -0), true)
			assert.equal(out[2], 4.5)
		})
	})

	describe('input validation errors', () => {
		test('throws TypeError eagerly for wrong argument count', () => {
			assert.throws(() => addFloatLazy(), TypeError)
			assert.throws(() => addFloatLazy(1), TypeError)
			assert.throws(() => addFloatLazy(1, 2, 3), TypeError)
		})

		test('throws TypeError eagerly for invalid top-level operands including strings', () => {
			const badValues = [
				null,
				undefined,
				'123',
				new String('123'),
				new Number(5),
				true,
				false,
				10n,
				Symbol('x'),
				{},
				() => 1,
			]

			for (const bad of badValues) {
				assert.throws(() => addFloatLazy(bad, 1), TypeError, `expected reject for a=${String(bad)}`)
				assert.throws(() => addFloatLazy(1, bad), TypeError, `expected reject for b=${String(bad)}`)
				assert.throws(() => addFloatLazy(bad, [1]), TypeError)
				assert.throws(() => addFloatLazy([1], bad), TypeError)
			}
		})

		test('throws TypeError lazily when an iterable yields a non-number element and closes open iterators', () => {
			let closedB = false
			function* trackedB() {
				try {
					yield 10
					yield 20
					yield 30
				} finally {
					closedB = true
				}
			}

			const stream = addFloatLazy([1, 'bad', 3], trackedB())
			assert.deepEqual(stream.next(), { value: 11, done: false })
			assert.throws(() => stream.next(), TypeError)
			assert.equal(closedB, true)

			assert.throws(() => [...addFloatLazy(1, [2, null])], TypeError)
			assert.throws(() => [...addFloatLazy([2, undefined], 1)], TypeError)
			assert.throws(() => [...addFloatLazy(1, new BigInt64Array([1n, 2n]))], TypeError)
			assert.throws(() => [...addFloatLazy([1, 2], [3, {}])], TypeError)
		})

		test('throws TypeError when custom Symbol.iterator returns a malformed iterator', () => {
			const malformed = { [Symbol.iterator]: () => ({ notNext: true }) }
			const stream = addFloatLazy(malformed, 1)
			assert.throws(() => stream.next(), TypeError)

			const malformedB = { [Symbol.iterator]: () => null }
			const streamB = addFloatLazy([1], malformedB)
			assert.throws(() => streamB.next(), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		test('matches exact BigInt dyadic rational arithmetic for exact float64 sums', () => {
			// Numbers of the form k / 2^10 with |k| <= 2^40 have exact IEEE-754 float64
			// representations and exact sums with zero rounding error.
			const SCALE = 1024n
			const intsA = [-1234567n, -513n, -1n, 0n, 1n, 777n, 9876543n, 1048576n]
			const intsB = [7654321n, 513n, 1n, 0n, -1n, 247n, -9876543n, 33554432n]

			const floatsA = intsA.map((k) => Number(k) / Number(SCALE))
			const floatsB = intsB.map((k) => Number(k) / Number(SCALE))

			const actual = [...addFloatLazy(floatsA, floatsB)]
			const expected = intsA.map((ka, i) => Number(ka + intsB[i]) / Number(SCALE))

			assert.deepEqual(actual, expected)
		})

		test('matches eager lib.add and Float64Array bit patterns across deterministic pseudo-random inputs', () => {
			// Deterministic xorshift32 PRNG
			let state = 0x12345678
			function nextUint32() {
				state ^= state << 13
				state ^= state >>> 17
				state ^= state << 5
				return state >>> 0
			}
			function nextFloat() {
				const sign = (nextUint32() & 1) === 0 ? 1 : -1
				const mantissa = nextUint32() / 0x100000000
				const exp = (nextUint32() % 60) - 30
				return sign * mantissa * 2 ** exp
			}

			const count = 200
			const xs = Array.from({ length: count }, nextFloat)
			const ys = Array.from({ length: count }, nextFloat)

			const lazyAB = [...addFloatLazy(xs, ys)]
			const lazyBA = [...addFloatLazy(ys, xs)]

			const bufActual = new ArrayBuffer(8)
			const bufExpected = new ArrayBuffer(8)
			const f64Actual = new Float64Array(bufActual)
			const u64Actual = new BigUint64Array(bufActual)
			const f64Expected = new Float64Array(bufExpected)
			const u64Expected = new BigUint64Array(bufExpected)

			for (let i = 0; i < count; i++) {
				const ref = add(xs[i], ys[i])
				f64Actual[0] = lazyAB[i]
				f64Expected[0] = ref
				assert.equal(u64Actual[0], u64Expected[0], `bit mismatch at index ${i}`)

				// Commutativity check
				assert.equal(Object.is(lazyAB[i], lazyBA[i]), true, `commutativity mismatch at index ${i}`)
			}

			// Broadcast equivalence cross-check: addFloatLazy(s, ys) === addFloatLazy(repeat(s), ys)
			const scalar = -3.141592653589793
			function* repeat(val) {
				while (true) yield val
			}
			assert.deepEqual(
				[...addFloatLazy(scalar, ys)],
				[...addFloatLazy(repeat(scalar), ys)],
			)
		})
	})
})
