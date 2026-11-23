import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { unionBoolRecursive } from './unionBoolRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 *
 * @param {...(boolean | Set<unknown>)} args
 * @returns {boolean | Set<unknown>}
 */
function referenceUnion(...args) {
	if (typeof args[0] === 'boolean') {
		return args.some((v) => v === true)
	}
	const out = new Set()
	for (const s of args) {
		for (const item of s) {
			out.add(item)
		}
	}
	return out
}

/**
 * Deterministic PRNG (mulberry32) for reproducible property-based cross-checks.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('unionBoolRecursive - boolean mode', () => {
	test('handles single boolean operand', () => {
		assert.equal(unionBoolRecursive(false), false)
		assert.equal(unionBoolRecursive(true), true)
	})

	test('matches full 2-variable boolean OR truth table', () => {
		assert.equal(unionBoolRecursive(false, false), false)
		assert.equal(unionBoolRecursive(false, true), true)
		assert.equal(unionBoolRecursive(true, false), true)
		assert.equal(unionBoolRecursive(true, true), true)
	})

	test('handles variadic boolean lists with true at start, middle, end, or absent', () => {
		assert.equal(unionBoolRecursive(false, false, false, false, false), false)
		assert.equal(unionBoolRecursive(true, false, false, false, false), true)
		assert.equal(unionBoolRecursive(false, false, true, false, false), true)
		assert.equal(unionBoolRecursive(false, false, false, false, true), true)
		assert.equal(unionBoolRecursive(true, true, true), true)
	})

	test('handles large boolean operand counts without stack overflow', () => {
		const allFalse = Array.from({ length: 4096 }, () => false)
		assert.equal(unionBoolRecursive(...allFalse), false)

		const withOneTrue = allFalse.slice()
		withOneTrue[4095] = true
		assert.equal(unionBoolRecursive(...withOneTrue), true)
	})
})

describe('unionBoolRecursive - Set mode', () => {
	test('handles single Set without aliasing the input', () => {
		const empty = new Set()
		const emptyResult = unionBoolRecursive(empty)
		assert.ok(emptyResult instanceof Set)
		assert.notEqual(emptyResult, empty)
		assert.deepEqual(emptyResult, new Set())

		const input = new Set([1, 2, 3])
		const result = unionBoolRecursive(input)
		assert.notEqual(result, input)
		assert.deepEqual(result, new Set([1, 2, 3]))
		result.add(99)
		assert.equal(input.has(99), false)
	})

	test('unions disjoint, overlapping, identical, and empty sets', () => {
		assert.deepEqual(
			unionBoolRecursive(new Set([1, 2]), new Set([3, 4])),
			new Set([1, 2, 3, 4])
		)
		assert.deepEqual(
			unionBoolRecursive(new Set([1, 2, 3]), new Set([2, 3, 4])),
			new Set([1, 2, 3, 4])
		)
		assert.deepEqual(
			unionBoolRecursive(new Set(['a', 'b']), new Set(['a', 'b'])),
			new Set(['a', 'b'])
		)
		assert.deepEqual(
			unionBoolRecursive(new Set(), new Set([42]), new Set()),
			new Set([42])
		)
		assert.deepEqual(unionBoolRecursive(new Set(), new Set()), new Set())
	})

	test('unions many sets without mutating inputs', () => {
		const s1 = new Set([1, 2])
		const s2 = new Set([2, 3])
		const s3 = new Set([4])
		const s4 = new Set()
		const s5 = new Set([1, 5, 6])

		const result = unionBoolRecursive(s1, s2, s3, s4, s5)
		assert.deepEqual(result, new Set([1, 2, 3, 4, 5, 6]))
		assert.deepEqual(s1, new Set([1, 2]))
		assert.deepEqual(s2, new Set([2, 3]))
		assert.deepEqual(s3, new Set([4]))
		assert.deepEqual(s4, new Set())
		assert.deepEqual(s5, new Set([1, 5, 6]))
	})

	test('preserves JS Set SameValueZero semantics and diverse element types', () => {
		const obj = { k: 1 }
		const sym = Symbol('s')
		const a = new Set([NaN, -0, null, undefined, obj, true, 10n])
		const b = new Set([NaN, +0, sym, false, obj])

		const result = unionBoolRecursive(a, b)
		assert.equal(result.size, 9)
		assert.equal(result.has(NaN), true)
		assert.equal(result.has(0), true)
		assert.equal(result.has(null), true)
		assert.equal(result.has(undefined), true)
		assert.equal(result.has(obj), true)
		assert.equal(result.has(sym), true)
		assert.equal(result.has(true), true)
		assert.equal(result.has(false), true)
		assert.equal(result.has(10n), true)
	})

	test('handles large sets via O(log n) divide-and-conquer depth', () => {
		const left = new Set()
		const right = new Set()
		for (let i = 0; i < 5000; i++) {
			left.add(i)
			right.add(i + 2500)
		}
		const result = unionBoolRecursive(left, right)
		assert.equal(result.size, 7500)
		assert.equal(result.has(0), true)
		assert.equal(result.has(4999), true)
		assert.equal(result.has(7499), true)
	})
})

describe('unionBoolRecursive - input validation', () => {
	test('throws TypeError when called with no arguments', () => {
		assert.throws(() => unionBoolRecursive(), TypeError)
	})

	test('throws TypeError for unsupported operand types', () => {
		const invalidValues = [
			null,
			undefined,
			0,
			1,
			NaN,
			'',
			'true',
			[1, 2],
			{ a: 1 },
			new Map(),
			new WeakSet(),
			new Boolean(true)
		]

		for (const bad of invalidValues) {
			assert.throws(() => unionBoolRecursive(bad), TypeError)
			assert.throws(() => unionBoolRecursive(false, bad), TypeError)
			assert.throws(() => unionBoolRecursive(new Set([1]), bad), TypeError)
		}
	})

	test('throws TypeError when mixing booleans and Set instances', () => {
		assert.throws(() => unionBoolRecursive(true, new Set()), TypeError)
		assert.throws(() => unionBoolRecursive(new Set([1]), false), TypeError)
		assert.throws(() => unionBoolRecursive(false, false, new Set([1])), TypeError)
		assert.throws(() => unionBoolRecursive(new Set(), new Set([1]), true), TypeError)
	})
})

describe('unionBoolRecursive - independent cross-checks and algebraic laws', () => {
	test('matches independent reference across exhaustive 3-variable boolean truth table and random vectors', () => {
		const vals = [false, true]
		for (const a of vals) {
			for (const b of vals) {
				for (const c of vals) {
					assert.equal(unionBoolRecursive(a, b, c), referenceUnion(a, b, c))
				}
			}
		}

		const rng = makeRng(0xdecafbad)
		for (let trial = 0; trial < 100; trial++) {
			const len = 1 + Math.floor(rng() * 25)
			const vec = Array.from({ length: len }, () => rng() < 0.15)
			assert.equal(unionBoolRecursive(...vec), referenceUnion(...vec))
		}
	})

	test('matches independent reference and native Set.prototype.union (when available) on random sets', () => {
		const rng = makeRng(0x12345678)
		const universe = Array.from({ length: 40 }, (_, i) => i)

		for (let trial = 0; trial < 60; trial++) {
			const numSets = 1 + Math.floor(rng() * 10)
			const sets = Array.from({ length: numSets }, () => {
				const s = new Set()
				for (const elem of universe) {
					if (rng() < 0.2) {
						s.add(elem)
					}
				}
				return s
			})

			const actual = unionBoolRecursive(...sets)
			const expected = referenceUnion(...sets)
			assert.deepEqual(actual, expected)

			if (typeof Set.prototype.union === 'function') {
				const nativeUnion = sets.reduce((acc, s) => acc.union(s), new Set())
				assert.deepEqual(actual, nativeUnion)
			}
		}
	})

	test('satisfies commutativity, associativity, idempotence, and identity laws', () => {
		const a = new Set([1, 2, 3])
		const b = new Set([3, 4, 5])
		const c = new Set([5, 6])
		const empty = new Set()

		// Commutativity
		assert.deepEqual(unionBoolRecursive(a, b), unionBoolRecursive(b, a))
		// Associativity
		assert.deepEqual(
			unionBoolRecursive(unionBoolRecursive(a, b), c),
			unionBoolRecursive(a, unionBoolRecursive(b, c))
		)
		// Idempotence
		assert.deepEqual(unionBoolRecursive(a, a), a)
		assert.equal(unionBoolRecursive(true, true), true)
		assert.equal(unionBoolRecursive(false, false), false)
		// Identity
		assert.deepEqual(unionBoolRecursive(a, empty), a)
		assert.equal(unionBoolRecursive(true, false), true)
		assert.equal(unionBoolRecursive(false, false), false)
	})
})
