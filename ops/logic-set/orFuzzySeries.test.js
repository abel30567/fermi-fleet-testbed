import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { orFuzzySeries } from './orFuzzySeries.js'

describe('orFuzzySeries — scalar fuzzy logic (Zadeh OR)', () => {
	test('classical Boolean truth table on {0, 1}', () => {
		assert.equal(orFuzzySeries(0, 0), 0)
		assert.equal(orFuzzySeries(0, 1), 1)
		assert.equal(orFuzzySeries(1, 0), 1)
		assert.equal(orFuzzySeries(1, 1), 1)
	})

	test('typical fuzzy membership values in [0, 1]', () => {
		assert.equal(orFuzzySeries(0.2, 0.7), 0.7)
		assert.equal(orFuzzySeries(0.85, 0.35), 0.85)
		assert.equal(orFuzzySeries(0.5, 0.5), 0.5)
		assert.equal(orFuzzySeries(0.01, 0.99), 0.99)
	})

	test('n-ary associative disjunction', () => {
		assert.equal(orFuzzySeries(0.1, 0.4, 0.9, 0.3), 0.9)
		assert.equal(orFuzzySeries(0, 0, 0), 0)
		assert.equal(orFuzzySeries(0.2, 0.8, 0.5), orFuzzySeries(orFuzzySeries(0.2, 0.8), 0.5))
		assert.equal(orFuzzySeries(0.2, 0.8, 0.5), orFuzzySeries(0.2, orFuzzySeries(0.8, 0.5)))
	})

	test('edge cases: boundaries, -0 normalization, subnormals, near-1 precision', () => {
		assert.equal(Object.is(orFuzzySeries(-0, -0), 0), true)
		assert.equal(Object.is(orFuzzySeries(-0, 0), 0), true)
		assert.equal(orFuzzySeries(0, Number.MIN_VALUE), Number.MIN_VALUE)
		assert.equal(orFuzzySeries(Number.MIN_VALUE, Number.MIN_VALUE), Number.MIN_VALUE)
		assert.equal(orFuzzySeries(Number.MIN_VALUE, 0), Number.MIN_VALUE)

		const justBelowOne = 1 - Number.EPSILON / 2
		assert.equal(orFuzzySeries(justBelowOne, 1), 1)
		assert.equal(orFuzzySeries(1, justBelowOne), 1)
		assert.equal(orFuzzySeries(justBelowOne, justBelowOne), justBelowOne)
		assert.equal(orFuzzySeries(justBelowOne, 0.5), justBelowOne)
	})

	test('Zadeh t-conorm axioms (identity, annihilator, commutativity, idempotence, monotonicity)', () => {
		const samples = [0, 0.001, 0.125, 0.333, 0.5, 0.75, 0.999, 1]
		for (const a of samples) {
			assert.equal(orFuzzySeries(a, 0), a)
			assert.equal(orFuzzySeries(0, a), a)
			assert.equal(orFuzzySeries(a, 1), 1)
			assert.equal(orFuzzySeries(1, a), 1)
			assert.equal(orFuzzySeries(a, a), a)
			for (const b of samples) {
				assert.equal(orFuzzySeries(a, b), orFuzzySeries(b, a))
				assert.ok(orFuzzySeries(a, b) >= a && orFuzzySeries(a, b) >= b)
				assert.ok(orFuzzySeries(a, b) >= 0 && orFuzzySeries(a, b) <= 1)
			}
		}

		// Monotonicity: a1 <= a2 and b1 <= b2 => or(a1, b1) <= or(a2, b2)
		for (const a1 of samples) {
			for (const a2 of samples) {
				if (a1 > a2) continue
				for (const b1 of samples) {
					for (const b2 of samples) {
						if (b1 > b2) continue
						assert.ok(orFuzzySeries(a1, b1) <= orFuzzySeries(a2, b2))
					}
				}
			}
		}
	})
})

describe('orFuzzySeries — fuzzy set representations', () => {
	test('array fuzzy sets (element-wise union without mutating inputs)', () => {
		const a = [0, 0.25, 0.8, 1]
		const b = [0.5, 0.25, 0.3, 0.9]
		const out = orFuzzySeries(a, b)
		assert.deepEqual(out, [0.5, 0.25, 0.8, 1])
		assert.deepEqual(a, [0, 0.25, 0.8, 1])
		assert.deepEqual(b, [0.5, 0.25, 0.3, 0.9])
		assert.deepEqual(orFuzzySeries([], []), [])
		assert.deepEqual(orFuzzySeries([0.1, 0.6], [0.5, 0.2], [0.3, 0.9]), [0.5, 0.9])
	})

	test('plain object fuzzy sets (union over key universe, absent key = 0)', () => {
		const a = { cold: 0.2, warm: 0.7 }
		const b = { warm: 0.4, hot: 0.9 }
		const out = orFuzzySeries(a, b)
		assert.deepEqual(out, { cold: 0.2, warm: 0.7, hot: 0.9 })
		assert.deepEqual(a, { cold: 0.2, warm: 0.7 })
		assert.deepEqual(b, { warm: 0.4, hot: 0.9 })
		assert.deepEqual(orFuzzySeries({}, {}), {})

		// Null-prototype object support
		const nullProto = Object.create(null)
		nullProto.x = 0.6
		assert.deepEqual(orFuzzySeries(nullProto, { x: 0.2, y: 0.4 }), { x: 0.6, y: 0.4 })
	})

	test('Map fuzzy sets (union over key universe, absent key = 0)', () => {
		const a = new Map([
			['a', 0.1],
			['b', 0.8]
		])
		const b = new Map([
			['b', 0.3],
			['c', 0.5]
		])
		const out = orFuzzySeries(a, b)
		assert.ok(out instanceof Map)
		assert.deepEqual([...out.entries()], [
			['a', 0.1],
			['b', 0.8],
			['c', 0.5]
		])
		assert.equal(a.size, 2)
		assert.equal(b.size, 2)
		assert.equal(orFuzzySeries(new Map(), new Map()).size, 0)
	})
})

describe('orFuzzySeries — cross-checks against independent computations', () => {
	test('matches Math.max, De Morgan duality, absolute-value identity, and Lp-norm limit', () => {
		const grid = []
		for (let i = 0; i <= 20; i++) {
			grid.push(i / 20)
		}

		for (const a of grid) {
			for (const b of grid) {
				const actual = orFuzzySeries(a, b)

				// 1. Canonical Zadeh s-norm: max(a, b)
				assert.equal(actual, Math.max(a, b))

				// 2. De Morgan duality: a ∨ b = ¬(¬a ∧ ¬b) = 1 - min(1 - a, 1 - b)
				const deMorgan = 1 - Math.min(1 - a, 1 - b)
				assert.ok(
					Math.abs(actual - deMorgan) <= 1e-15,
					`De Morgan mismatch for (${a}, ${b}): ${actual} vs ${deMorgan}`
				)

				// 3. Closed-form absolute-value identity: (a + b + |a - b|) / 2
				const absIdentity = (a + b + Math.abs(a - b)) / 2
				assert.ok(
					Math.abs(actual - absIdentity) <= 1e-15,
					`Abs identity mismatch for (${a}, ${b}): ${actual} vs ${absIdentity}`
				)
			}
		}

		// 4. Asymptotic Lp-norm limit: (a^p + b^p)^(1/p) -> max(a, b) as p -> ∞
		// For p = 100, max(a, b) <= (a^p + b^p)^(1/p) <= 2^(1/p) * max(a, b)
		const p = 100
		const boundFactor = Math.pow(2, 1 / p) - 1
		for (const [a, b] of [
			[0.2, 0.8],
			[0.6, 0.6],
			[0.95, 0.4],
			[0.1, 0.3]
		]) {
			const actual = orFuzzySeries(a, b)
			const lpApprox = Math.pow(Math.pow(a, p) + Math.pow(b, p), 1 / p)
			assert.ok(lpApprox >= actual - 1e-12)
			assert.ok(lpApprox <= actual * (1 + boundFactor) + 1e-12)
		}
	})

	test('fuzzy set union matches independent pointwise De Morgan computation', () => {
		const universe = ['u1', 'u2', 'u3', 'u4']
		const setA = { u1: 0.1, u2: 0.7, u3: 0.0 }
		const setB = { u2: 0.4, u3: 0.9, u4: 0.25 }

		const union = orFuzzySeries(setA, setB)
		for (const u of universe) {
			const muA = setA[u] ?? 0
			const muB = setB[u] ?? 0
			const expected = 1 - Math.min(1 - muA, 1 - muB)
			assert.ok(Math.abs(union[u] - expected) <= 1e-15)
		}
	})
})

describe('orFuzzySeries — invalid inputs', () => {
	test('rejects fewer than two operands', () => {
		assert.throws(() => orFuzzySeries(), TypeError)
		assert.throws(() => orFuzzySeries(0.5), TypeError)
		assert.throws(() => orFuzzySeries([0.5]), TypeError)
	})

	test('rejects out-of-range and non-finite membership values', () => {
		for (const bad of [-0.0001, -1, 1.0001, 2, NaN, Infinity, -Infinity]) {
			assert.throws(() => orFuzzySeries(bad, 0.5), RangeError)
			assert.throws(() => orFuzzySeries(0.5, bad), RangeError)
			assert.throws(() => orFuzzySeries([bad], [0.5]), RangeError)
			assert.throws(() => orFuzzySeries({ x: bad }, { x: 0.5 }), RangeError)
			assert.throws(() => orFuzzySeries(new Map([['x', bad]]), new Map()), RangeError)
		}
	})

	test('rejects wrong types, mixed representations, and sparse/mismatched arrays', () => {
		assert.throws(() => orFuzzySeries('0.5', 0.5), TypeError)
		assert.throws(() => orFuzzySeries(true, false), TypeError)
		assert.throws(() => orFuzzySeries(null, 0.5), TypeError)
		assert.throws(() => orFuzzySeries(undefined, 0.5), TypeError)
		assert.throws(() => orFuzzySeries(0.5, [0.5]), TypeError)
		assert.throws(() => orFuzzySeries([0.5], { a: 0.5 }), TypeError)
		assert.throws(() => orFuzzySeries({ a: 0.5 }, new Map([['a', 0.5]])), TypeError)
		assert.throws(() => orFuzzySeries(new Set([0.5]), new Set([0.5])), TypeError)
		assert.throws(() => orFuzzySeries(new Date(), new Date()), TypeError)
		assert.throws(() => orFuzzySeries([0.1, 0.2], [0.3]), RangeError)

		// Sparse array hole
		const sparse = new Array(2)
		sparse[0] = 0.5
		assert.throws(() => orFuzzySeries(sparse, [0.5, 0.5]), TypeError)
	})
})
