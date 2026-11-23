import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddComplexIterative } from './vectorAddComplexIterative.js'

/**
 * Helper to assert two complex vectors are approximately equal within
 * combined relative + absolute tolerance.
 */
function assertComplexVectorsClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		const reLimit = tol * Math.max(1, Math.abs(expected[i].re))
		const imLimit = tol * Math.max(1, Math.abs(expected[i].im))
		assert.ok(
			Math.abs(actual[i].re - expected[i].re) <= reLimit,
			`index ${i} re: expected ${expected[i].re}, got ${actual[i].re}`,
		)
		assert.ok(
			Math.abs(actual[i].im - expected[i].im) <= imLimit,
			`index ${i} im: expected ${expected[i].im}, got ${actual[i].im}`,
		)
	}
}

/**
 * Deterministic LCG PRNG for reproducible property tests.
 */
function createRng(seed = 42) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('vectorAddComplexIterative', () => {
	test('adds two vectors of complex numbers element-wise', () => {
		const a = [
			{ re: 1, im: 2 },
			{ re: -3, im: 4.5 },
			{ re: 0, im: -1 },
		]
		const b = [
			{ re: 5, im: -2 },
			{ re: 3, im: 1.5 },
			{ re: 7, im: 1 },
		]

		const result = vectorAddComplexIterative(a, b)
		assert.deepEqual(result, [
			{ re: 6, im: 0 },
			{ re: 0, im: 6 },
			{ re: 7, im: 0 },
		])
	})

	test('handles single-element vectors', () => {
		assert.deepEqual(
			vectorAddComplexIterative([{ re: 2.5, im: -3.25 }], [{ re: -1.5, im: 0.75 }]),
			[{ re: 1, im: -2.5 }],
		)
	})

	test('handles empty vectors', () => {
		const result = vectorAddComplexIterative([], [])
		assert.deepEqual(result, [])
	})

	test('handles pure real, pure imaginary, and zero complex numbers', () => {
		const a = [
			{ re: 10, im: 0 },
			{ re: 0, im: -5 },
			{ re: 0, im: 0 },
		]
		const b = [
			{ re: -4, im: 0 },
			{ re: 0, im: 12 },
			{ re: 0, im: 0 },
		]
		assert.deepEqual(vectorAddComplexIterative(a, b), [
			{ re: 6, im: 0 },
			{ re: 0, im: 7 },
			{ re: 0, im: 0 },
		])
	})

	test('does not mutate input arrays or their element objects', () => {
		const a = [
			{ re: 1, im: 2 },
			{ re: 3, im: 4 },
		]
		const b = [
			{ re: 5, im: 6 },
			{ re: 7, im: 8 },
		]
		const aCopy = structuredClone(a)
		const bCopy = structuredClone(b)

		const res = vectorAddComplexIterative(a, b)
		assert.notEqual(res, a)
		assert.notEqual(res, b)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)

		res[0].re = 999
		assert.equal(a[0].re, 1)
		assert.equal(b[0].re, 5)
	})

	test('handles floating-point precision and large finite numbers', () => {
		const a = [
			{ re: 0.1, im: 0.2 },
			{ re: 1e150, im: -1e150 },
		]
		const b = [
			{ re: 0.2, im: 0.4 },
			{ re: 2e150, im: 3e150 },
		]
		const result = vectorAddComplexIterative(a, b)
		assertComplexVectorsClose(result, [
			{ re: 0.3, im: 0.6 },
			{ re: 3e150, im: 2e150 },
		])
	})

	test('returns clean { re, im } objects even if inputs carry extra properties', () => {
		const a = [{ re: 1, im: 2, label: 'x' }]
		const b = [{ re: 3, im: 4, extra: true }]
		const result = vectorAddComplexIterative(a, b)
		assert.deepEqual(result, [{ re: 4, im: 6 }])
		assert.deepEqual(Object.keys(result[0]), ['re', 'im'])
	})

	test('throws TypeError when inputs are not arrays', () => {
		const valid = [{ re: 1, im: 2 }]
		for (const bad of [null, undefined, 42, 'abc', { re: 1, im: 2 }, new Float64Array([1, 2])]) {
			assert.throws(() => vectorAddComplexIterative(bad, valid), TypeError)
			assert.throws(() => vectorAddComplexIterative(valid, bad), TypeError)
		}
	})

	test('throws RangeError on mismatched vector lengths', () => {
		assert.throws(
			() => vectorAddComplexIterative([{ re: 1, im: 0 }], []),
			RangeError,
		)
		assert.throws(
			() =>
				vectorAddComplexIterative(
					[{ re: 1, im: 0 }],
					[
						{ re: 1, im: 0 },
						{ re: 2, im: 0 },
					],
				),
			RangeError,
		)
	})

	test('throws TypeError on sparse arrays', () => {
		const sparse = new Array(2)
		sparse[0] = { re: 1, im: 2 }
		const dense = [
			{ re: 1, im: 2 },
			{ re: 3, im: 4 },
		]
		assert.throws(() => vectorAddComplexIterative(sparse, dense), TypeError)
		assert.throws(() => vectorAddComplexIterative(dense, sparse), TypeError)
	})

	test('throws TypeError on invalid element shapes or non-numeric re/im', () => {
		const valid = [{ re: 1, im: 2 }]
		const invalidElements = [
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
			{ re: true, im: 0 },
		]
		for (const badElem of invalidElements) {
			assert.throws(() => vectorAddComplexIterative([badElem], valid), TypeError)
			assert.throws(() => vectorAddComplexIterative(valid, [badElem]), TypeError)
		}
	})

	test('throws RangeError on non-finite re or im values (NaN, Infinity, -Infinity)', () => {
		const valid = [{ re: 1, im: 2 }]
		const nonFinite = [
			{ re: Number.NaN, im: 0 },
			{ re: 0, im: Number.NaN },
			{ re: Number.POSITIVE_INFINITY, im: 1 },
			{ re: 1, im: Number.NEGATIVE_INFINITY },
		]
		for (const badElem of nonFinite) {
			assert.throws(() => vectorAddComplexIterative([badElem], valid), RangeError)
			assert.throws(() => vectorAddComplexIterative(valid, [badElem]), RangeError)
		}
	})

	test('cross-check: matches split real/imaginary reference implementation on random vectors', () => {
		const rand = createRng(20261123)
		const randomComplexVector = (n) =>
			Array.from({ length: n }, () => ({
				re: (rand() - 0.5) * 200,
				im: (rand() - 0.5) * 200,
			}))

		// Independent reference: split into Float64Arrays for real and imaginary parts, sum, recombine
		const referenceAdd = (u, v) => {
			const reU = Float64Array.from(u, (z) => z.re)
			const imU = Float64Array.from(u, (z) => z.im)
			const reV = Float64Array.from(v, (z) => z.re)
			const imV = Float64Array.from(v, (z) => z.im)
			return Array.from({ length: u.length }, (_, i) => ({
				re: reU[i] + reV[i],
				im: imU[i] + imV[i],
			}))
		}

		for (const n of [0, 1, 5, 32, 250]) {
			const a = randomComplexVector(n)
			const b = randomComplexVector(n)
			assert.deepEqual(vectorAddComplexIterative(a, b), referenceAdd(a, b))
		}
	})

	test('cross-check: algebraic laws (commutativity, associativity, identity, inverse, conjugate linearity, triangle inequality)', () => {
		const rand = createRng(987654321)
		const makeVec = (n) =>
			Array.from({ length: n }, () => ({
				re: Math.round((rand() - 0.5) * 1000) / 10,
				im: Math.round((rand() - 0.5) * 1000) / 10,
			}))
		const conj = (v) => v.map(({ re, im }) => ({ re, im: -im }))
		const neg = (v) => v.map(({ re, im }) => ({ re: -re, im: -im }))
		const l2Norm = (v) =>
			Math.hypot(...v.flatMap(({ re, im }) => [re, im]))

		const n = 40
		const a = makeVec(n)
		const b = makeVec(n)
		const c = makeVec(n)
		const zero = Array.from({ length: n }, () => ({ re: 0, im: 0 }))

		// Commutativity: a + b = b + a
		assert.deepEqual(
			vectorAddComplexIterative(a, b),
			vectorAddComplexIterative(b, a),
		)

		// Associativity: (a + b) + c ≈ a + (b + c)
		assertComplexVectorsClose(
			vectorAddComplexIterative(vectorAddComplexIterative(a, b), c),
			vectorAddComplexIterative(a, vectorAddComplexIterative(b, c)),
			1e-11,
		)

		// Additive identity: a + 0 = a
		assert.deepEqual(vectorAddComplexIterative(a, zero), a)

		// Additive inverse: a + (-a) = 0
		assertComplexVectorsClose(vectorAddComplexIterative(a, neg(a)), zero, 0)

		// Conjugate linearity: conj(a + b) = conj(a) + conj(b)
		assert.deepEqual(
			conj(vectorAddComplexIterative(a, b)),
			vectorAddComplexIterative(conj(a), conj(b)),
		)

		// Triangle inequality: ||a + b||_2 <= ||a||_2 + ||b||_2
		const sumNorm = l2Norm(vectorAddComplexIterative(a, b))
		assert.ok(sumNorm <= l2Norm(a) + l2Norm(b) + 1e-12)
	})
})
