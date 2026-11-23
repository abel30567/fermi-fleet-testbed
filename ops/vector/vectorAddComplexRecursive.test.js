import { describe, test } from 'node:test'
import assert from 'node:assert'
import { vectorAddComplexRecursive } from './vectorAddComplexRecursive.js'

/**
 * Independent iterative complex vector addition for cross-checking.
 *
 * @param {Array<{ re: number, im: number }>} a
 * @param {Array<{ re: number, im: number }>} b
 * @returns {Array<{ re: number, im: number }>}
 */
function iterativeComplexAdd(a, b) {
	const result = []
	for (let i = 0; i < a.length; i++) {
		result.push({ re: a[i].re + b[i].re, im: a[i].im + b[i].im })
	}
	return result
}

/**
 * Deterministic pseudo-random complex vector generator (LCG).
 *
 * @param {number} length
 * @param {number} seed
 * @returns {Array<{ re: number, im: number }>}
 */
function makeComplexVector(length, seed) {
	let state = seed >>> 0
	const next = () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return ((state / 0x100000000) - 0.5) * 200
	}
	const vec = []
	for (let i = 0; i < length; i++) {
		vec.push({ re: next(), im: next() })
	}
	return vec
}

/**
 * Asserts two complex vectors are element-wise close within epsilon.
 *
 * @param {Array<{ re: number, im: number }>} actual
 * @param {Array<{ re: number, im: number }>} expected
 * @param {number} [eps=1e-12]
 */
function assertVectorsClose(actual, expected, eps = 1e-12) {
	assert.strictEqual(actual.length, expected.length)
	for (let i = 0; i < actual.length; i++) {
		assert.ok(
			Math.abs(actual[i].re - expected[i].re) <= eps,
			`re mismatch at index ${i}: ${actual[i].re} vs ${expected[i].re}`,
		)
		assert.ok(
			Math.abs(actual[i].im - expected[i].im) <= eps,
			`im mismatch at index ${i}: ${actual[i].im} vs ${expected[i].im}`,
		)
	}
}

describe('vectorAddComplexRecursive', () => {
	test('adds complex vectors of even length', () => {
		const a = [
			{ re: 1, im: 2 },
			{ re: -3, im: 4 },
			{ re: 5.5, im: -1.5 },
			{ re: 0, im: 7 },
		]
		const b = [
			{ re: 3, im: -1 },
			{ re: 2, im: 6 },
			{ re: -0.5, im: 2.5 },
			{ re: 4, im: -7 },
		]
		assert.deepStrictEqual(vectorAddComplexRecursive(a, b), [
			{ re: 4, im: 1 },
			{ re: -1, im: 10 },
			{ re: 5, im: 1 },
			{ re: 4, im: 0 },
		])
	})

	test('adds complex vectors of odd and prime lengths', () => {
		for (const len of [3, 5, 7, 11, 17]) {
			const a = Array.from({ length: len }, (_, i) => ({ re: i * 2 - 3, im: -i + 1 }))
			const b = Array.from({ length: len }, (_, i) => ({ re: -i + 4, im: i * 3 - 2 }))
			const expected = Array.from({ length: len }, (_, i) => ({
				re: i + 1,
				im: i * 2 - 1,
			}))
			assert.deepStrictEqual(vectorAddComplexRecursive(a, b), expected)
		}
	})

	test('handles pure real and pure imaginary vectors', () => {
		const realVec = [
			{ re: 2, im: 0 },
			{ re: -5, im: 0 },
			{ re: 1.25, im: 0 },
		]
		const imagVec = [
			{ re: 0, im: 3 },
			{ re: 0, im: -4 },
			{ re: 0, im: 0.75 },
		]
		assert.deepStrictEqual(vectorAddComplexRecursive(realVec, imagVec), [
			{ re: 2, im: 3 },
			{ re: -5, im: -4 },
			{ re: 1.25, im: 0.75 },
		])
	})

	test('handles empty arrays', () => {
		assert.deepStrictEqual(vectorAddComplexRecursive([], []), [])
	})

	test('handles single-element arrays', () => {
		assert.deepStrictEqual(
			vectorAddComplexRecursive([{ re: 3.5, im: -2.25 }], [{ re: -1.5, im: 4.25 }]),
			[{ re: 2, im: 2 }],
		)
	})

	test('zero vector acts as additive identity', () => {
		const a = [
			{ re: 1.5, im: -2.5 },
			{ re: 0, im: 9 },
			{ re: -7, im: 0 },
			{ re: 4.25, im: 8.75 },
			{ re: -3, im: -6 },
		]
		const zero = a.map(() => ({ re: 0, im: 0 }))
		assert.deepStrictEqual(vectorAddComplexRecursive(a, zero), a)
		assert.deepStrictEqual(vectorAddComplexRecursive(zero, a), a)
	})

	test('additive inverses sum to the zero vector', () => {
		const a = [
			{ re: 12, im: -5 },
			{ re: -3.75, im: 8.125 },
			{ re: 0, im: 4 },
			{ re: -9, im: 0 },
		]
		const negA = a.map(({ re, im }) => ({ re: -re, im: -im }))
		const expectedZero = a.map(() => ({ re: 0, im: 0 }))
		assert.deepStrictEqual(vectorAddComplexRecursive(a, negA), expectedZero)
	})

	test('does not mutate input arrays or share element references', () => {
		const a = [
			{ re: 1, im: 2 },
			{ re: 3, im: 4 },
		]
		const b = [
			{ re: 0, im: 0 },
			{ re: 0, im: 0 },
		]
		const aSnapshot = structuredClone(a)
		const bSnapshot = structuredClone(b)

		const res = vectorAddComplexRecursive(a, b)
		assert.deepStrictEqual(a, aSnapshot)
		assert.deepStrictEqual(b, bSnapshot)
		assert.notStrictEqual(res, a)
		assert.notStrictEqual(res, b)
		assert.notStrictEqual(res[0], a[0])
		assert.notStrictEqual(res[1], a[1])
	})

	test('handles large vectors without overflowing call stack', () => {
		const n = 4096
		const a = makeComplexVector(n, 42)
		const b = makeComplexVector(n, 99)
		const result = vectorAddComplexRecursive(a, b)
		assert.deepStrictEqual(result, iterativeComplexAdd(a, b))
	})

	test('throws TypeError for non-array inputs', () => {
		const valid = [{ re: 1, im: 2 }]
		const badInputs = [null, undefined, 42, 'abc', { re: 1, im: 2 }, new Set(), true]
		for (const bad of badInputs) {
			assert.throws(() => vectorAddComplexRecursive(bad, valid), TypeError)
			assert.throws(() => vectorAddComplexRecursive(valid, bad), TypeError)
		}
	})

	test('throws RangeError for mismatched vector lengths', () => {
		assert.throws(
			() => vectorAddComplexRecursive([{ re: 1, im: 0 }], []),
			RangeError,
		)
		assert.throws(
			() => vectorAddComplexRecursive([], [{ re: 1, im: 0 }]),
			RangeError,
		)
		assert.throws(
			() =>
				vectorAddComplexRecursive(
					[{ re: 1, im: 2 }, { re: 3, im: 4 }],
					[{ re: 1, im: 2 }],
				),
			RangeError,
		)
	})

	test('throws RangeError for NaN or Infinity element components', () => {
		const nonFiniteCases = [
			{ re: NaN, im: 0 },
			{ re: 0, im: NaN },
			{ re: Infinity, im: 1 },
			{ re: 1, im: -Infinity },
		]
		const ok = { re: 1, im: 2 }
		for (const bad of nonFiniteCases) {
			assert.throws(
				() => vectorAddComplexRecursive([ok, bad, ok], [ok, ok, ok]),
				RangeError,
			)
			assert.throws(
				() => vectorAddComplexRecursive([ok, ok, ok], [ok, bad, ok]),
				RangeError,
			)
		}
	})

	test('throws TypeError for malformed elements and sparse array holes', () => {
		const ok = { re: 1, im: 2 }
		const malformedElements = [
			null,
			undefined,
			5,
			'1+2i',
			[1, 2],
			{},
			{ re: 1 },
			{ im: 2 },
			{ re: '1', im: 2 },
			{ re: 1, im: null },
		]
		for (const bad of malformedElements) {
			assert.throws(
				() => vectorAddComplexRecursive([ok, bad], [ok, ok]),
				TypeError,
			)
			assert.throws(
				() => vectorAddComplexRecursive([ok, ok], [ok, bad]),
				TypeError,
			)
		}

		// Sparse array hole
		const sparse = new Array(3)
		sparse[0] = ok
		sparse[2] = ok
		assert.throws(() => vectorAddComplexRecursive(sparse, [ok, ok, ok]), TypeError)
		assert.throws(() => vectorAddComplexRecursive([ok, ok, ok], sparse), TypeError)
	})

	test('cross-check: matches iterative addition across lengths 0..33', () => {
		for (let len = 0; len <= 33; len++) {
			const a = makeComplexVector(len, 1000 + len)
			const b = makeComplexVector(len, 2000 + len)
			assert.deepStrictEqual(vectorAddComplexRecursive(a, b), iterativeComplexAdd(a, b))
		}
	})

	test('cross-check: satisfies commutativity (a + b == b + a)', () => {
		for (const len of [0, 1, 2, 7, 16, 63]) {
			const a = makeComplexVector(len, 300 + len)
			const b = makeComplexVector(len, 400 + len)
			assert.deepStrictEqual(
				vectorAddComplexRecursive(a, b),
				vectorAddComplexRecursive(b, a),
			)
		}
	})

	test('cross-check: satisfies associativity ((a + b) + c == a + (b + c))', () => {
		// Exact integer/dyadic components for exact equality
		const aInt = [
			{ re: 1.5, im: -2.25 },
			{ re: 7, im: 3.5 },
			{ re: -4.75, im: 0.5 },
			{ re: 10, im: -8 },
			{ re: 0.125, im: -0.625 },
		]
		const bInt = [
			{ re: -3.25, im: 5.5 },
			{ re: 2.5, im: -1.25 },
			{ re: 8, im: -6.5 },
			{ re: -1.5, im: 4.25 },
			{ re: 3.75, im: 2.125 },
		]
		const cInt = [
			{ re: 4.75, im: -3.25 },
			{ re: -9.5, im: 2.75 },
			{ re: 1.25, im: 7 },
			{ re: 0.5, im: -3.25 },
			{ re: -2.875, im: 1.5 },
		]
		const lhsExact = vectorAddComplexRecursive(vectorAddComplexRecursive(aInt, bInt), cInt)
		const rhsExact = vectorAddComplexRecursive(aInt, vectorAddComplexRecursive(bInt, cInt))
		assert.deepStrictEqual(lhsExact, rhsExact)

		// General floating-point vectors within tight tolerance
		const a = makeComplexVector(31, 701)
		const b = makeComplexVector(31, 702)
		const c = makeComplexVector(31, 703)
		const lhs = vectorAddComplexRecursive(vectorAddComplexRecursive(a, b), c)
		const rhs = vectorAddComplexRecursive(a, vectorAddComplexRecursive(b, c))
		assertVectorsClose(lhs, rhs, 1e-12)
	})
})
