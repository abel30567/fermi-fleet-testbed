import { test } from 'node:test'
import assert from 'node:assert/strict'
import { andFuzzyIterative } from './andFuzzyIterative.js'

test('crisp Boolean truth table (boundary values 0 and 1)', () => {
	assert.equal(andFuzzyIterative(0, 0), 0)
	assert.equal(andFuzzyIterative(0, 1), 0)
	assert.equal(andFuzzyIterative(1, 0), 0)
	assert.equal(andFuzzyIterative(1, 1), 1)
})

test('scalar fuzzy truth values: unary, binary, n-ary, and -0 normalization', () => {
	assert.equal(andFuzzyIterative(0.65), 0.65)
	assert.equal(andFuzzyIterative(0.3, 0.7), 0.3)
	assert.equal(andFuzzyIterative(0.8, 0.25), 0.25)
	assert.equal(andFuzzyIterative(0.9, 0.4, 0.7, 0.4, 0.95), 0.4)
	assert.equal(andFuzzyIterative(1, 1, 1, 0.0001), 0.0001)
	assert.equal(Object.is(andFuzzyIterative(-0), 0), true)
	assert.equal(Object.is(andFuzzyIterative(0.5, -0), 0), true)
})

test('indexed fuzzy sets (arrays): binary, n-ary, empty, and immutability', () => {
	const a = [0.2, 0.8, 1, 0]
	const b = [0.6, 0.3, 0.9, 0.5]
	const c = [0.5, 0.7, 0.4, 0.2]

	assert.deepEqual(andFuzzyIterative(a, b), [0.2, 0.3, 0.9, 0])
	assert.deepEqual(andFuzzyIterative(a, b, c), [0.2, 0.3, 0.4, 0])
	assert.deepEqual(andFuzzyIterative([], []), [])

	const single = andFuzzyIterative(a)
	assert.deepEqual(single, a)
	assert.notEqual(single, a)

	const negZeroResult = andFuzzyIterative([-0, 0.5], [0.2, -0])
	assert.equal(Object.is(negZeroResult[0], 0), true)
	assert.equal(Object.is(negZeroResult[1], 0), true)
})

test('keyed fuzzy sets (plain objects): intersection, null-prototype, explicit 0, immutability', () => {
	const a = { cold: 0.8, warm: 0.3, hot: 0.1 }
	const b = { warm: 0.6, hot: 0.0, extreme: 0.9 }
	const c = { warm: 0.2, hot: 0.5 }

	assert.deepEqual(andFuzzyIterative(a, b), { warm: 0.3, hot: 0 })
	assert.deepEqual(andFuzzyIterative(a, b, c), { warm: 0.2, hot: 0 })
	assert.deepEqual(andFuzzyIterative({ x: 0.5 }, { y: 0.5 }), {})
	assert.deepEqual(andFuzzyIterative({}, {}), {})

	const nullProto = Object.assign(Object.create(null), { a: 0.4, b: 0.9 })
	assert.deepEqual(andFuzzyIterative(nullProto, { a: 0.7, b: 0.2 }), { a: 0.4, b: 0.2 })

	const copy = andFuzzyIterative(a)
	assert.deepEqual(copy, a)
	assert.notEqual(copy, a)
})

test('Map fuzzy sets: binary, n-ary, non-string keys, disjoint, immutability', () => {
	const objKey = { id: 1 }
	const symKey = Symbol('k')
	const m1 = new Map([
		[objKey, 0.7],
		[symKey, 0.4],
		[42, 0.9],
	])
	const m2 = new Map([
		[objKey, 0.3],
		[42, 0.95],
		['extra', 0.8],
	])
	const m3 = new Map([
		[objKey, 0.5],
		[42, 0.6],
	])

	assert.deepEqual(
		andFuzzyIterative(m1, m2),
		new Map([
			[objKey, 0.3],
			[42, 0.9],
		]),
	)
	assert.deepEqual(
		andFuzzyIterative(m1, m2, m3),
		new Map([
			[objKey, 0.3],
			[42, 0.6],
		]),
	)
	assert.deepEqual(andFuzzyIterative(new Map([['a', 0.5]]), new Map()), new Map())

	const copy = andFuzzyIterative(m1)
	assert.deepEqual(copy, m1)
	assert.notEqual(copy, m1)
})

test('input validation: missing args, out-of-range, wrong types, mismatched shapes', () => {
	assert.throws(() => andFuzzyIterative(), TypeError)

	// Out-of-range scalars
	assert.throws(() => andFuzzyIterative(-0.01), RangeError)
	assert.throws(() => andFuzzyIterative(1.01), RangeError)
	assert.throws(() => andFuzzyIterative(NaN), RangeError)
	assert.throws(() => andFuzzyIterative(Infinity), RangeError)
	assert.throws(() => andFuzzyIterative(-Infinity), RangeError)

	// Must not short-circuit validation after seeing 0
	assert.throws(() => andFuzzyIterative(0, 2), RangeError)
	assert.throws(() => andFuzzyIterative(0, '0.5'), TypeError)

	// Unsupported operand types
	assert.throws(() => andFuzzyIterative(null), TypeError)
	assert.throws(() => andFuzzyIterative(undefined), TypeError)
	assert.throws(() => andFuzzyIterative(true, false), TypeError)
	assert.throws(() => andFuzzyIterative('0.5', '0.5'), TypeError)
	assert.throws(() => andFuzzyIterative(new Set([0.5])), TypeError)
	assert.throws(() => andFuzzyIterative(new Date()), TypeError)

	// Mixed operand representations
	assert.throws(() => andFuzzyIterative(0.5, [0.5]), TypeError)
	assert.throws(() => andFuzzyIterative([0.5], { 0: 0.5 }), TypeError)
	assert.throws(() => andFuzzyIterative({ a: 0.5 }, new Map([['a', 0.5]])), TypeError)
	assert.throws(() => andFuzzyIterative(new Map([['a', 0.5]]), { a: 0.5 }), TypeError)

	// Array validation: length mismatch, invalid elements, sparse hole
	assert.throws(() => andFuzzyIterative([0.5, 0.2], [0.5]), RangeError)
	assert.throws(() => andFuzzyIterative([0.5], [1.5]), RangeError)
	assert.throws(() => andFuzzyIterative([0.5], ['0.2']), TypeError)
	// eslint-disable-next-line no-sparse-arrays
	assert.throws(() => andFuzzyIterative([0.5, , 0.2]), TypeError)

	// Object & Map validation even for non-intersecting keys
	assert.throws(() => andFuzzyIterative({ a: 0.5 }, { b: 1.2 }), RangeError)
	assert.throws(() => andFuzzyIterative({ a: 0.5 }, { b: 'bad' }), TypeError)
	assert.throws(
		() => andFuzzyIterative(new Map([['a', 0.5]]), new Map([['b', -0.1]])),
		RangeError,
	)
})

test('iterative scalability on large inputs without stack overflow', () => {
	const size = 20000
	const arrA = new Array(size)
	const arrB = new Array(size)
	for (let i = 0; i < size; i++) {
		arrA[i] = i / size
		arrB[i] = (size - i) / size
	}
	const intersection = andFuzzyIterative(arrA, arrB)
	assert.equal(intersection.length, size)
	assert.equal(intersection[0], 0)
	assert.equal(intersection[size / 2], 0.5)
	assert.equal(intersection[size - 1], 1 / size)

	const scalars = new Array(10000).fill(0.8)
	scalars[7777] = 0.123
	assert.equal(andFuzzyIterative(...scalars), 0.123)
})

test('independent cross-check: De Morgan dual and closed-form algebraic min identity', () => {
	// Independent Zadeh De Morgan dual: AND(a, b) = NOT(OR(NOT(a), NOT(b))) = 1 - max(1 - a, 1 - b)
	const deMorganAnd = (a, b) => 1 - Math.max(1 - a, 1 - b)
	// Independent algebraic identity: min(a, b) = (a + b - |a - b|) / 2
	const algebraicMin = (a, b) => (a + b - Math.abs(a - b)) / 2

	const samples = [0, 0.05, 0.17, 0.25, 0.3333333, 0.5, 0.6666667, 0.83, 0.99, 1]
	const eps = 1e-12

	for (const a of samples) {
		for (const b of samples) {
			const actual = andFuzzyIterative(a, b)
			assert.ok(
				Math.abs(actual - deMorganAnd(a, b)) <= eps,
				`De Morgan mismatch for (${a}, ${b}): got ${actual}`,
			)
			assert.ok(
				Math.abs(actual - algebraicMin(a, b)) <= eps,
				`Algebraic min mismatch for (${a}, ${b}): got ${actual}`,
			)
		}
	}

	// Cross-check Zadeh De Morgan on indexed fuzzy sets
	const setA = [0, 0.12, 0.45, 0.78, 1]
	const setB = [1, 0.65, 0.45, 0.21, 0]
	const setAnd = andFuzzyIterative(setA, setB)
	for (let i = 0; i < setA.length; i++) {
		assert.ok(Math.abs(setAnd[i] - deMorganAnd(setA[i], setB[i])) <= eps)
	}
})

test('Zadeh t-norm algebraic axioms: commutativity, associativity, idempotence, identity, monotonicity', () => {
	const vals = [0, 0.15, 0.4, 0.75, 1]

	for (const a of vals) {
		// Identity & annihilator & idempotence
		assert.equal(andFuzzyIterative(a, 1), a)
		assert.equal(andFuzzyIterative(a, 0), 0)
		assert.equal(andFuzzyIterative(a, a), a)

		for (const b of vals) {
			// Commutativity
			assert.equal(andFuzzyIterative(a, b), andFuzzyIterative(b, a))

			for (const c of vals) {
				// Associativity
				assert.equal(
					andFuzzyIterative(andFuzzyIterative(a, b), c),
					andFuzzyIterative(a, andFuzzyIterative(b, c)),
				)
			}
		}
	}

	// Monotonicity: a <= a' and b <= b' => AND(a, b) <= AND(a', b')
	for (let i = 0; i < vals.length; i++) {
		for (let i2 = i; i2 < vals.length; i2++) {
			for (let j = 0; j < vals.length; j++) {
				for (let j2 = j; j2 < vals.length; j2++) {
					assert.ok(
						andFuzzyIterative(vals[i], vals[j]) <=
							andFuzzyIterative(vals[i2], vals[j2]),
					)
				}
			}
		}
	}
})
