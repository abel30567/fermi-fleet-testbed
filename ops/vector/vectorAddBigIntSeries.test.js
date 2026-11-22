import { describe, test } from 'node:test'
import assert from 'node:assert'
import { vectorAddBigIntSeries } from './vectorAddBigIntSeries.js'

const SCALE = 10n ** 18n

function dotBigInt(u, v) {
	let sum = 0n
	for (let i = 0; i < u.length; i++) {
		sum += u[i] * v[i]
	}
	return sum
}

describe('vectorAddBigIntSeries', () => {
	test('adds normal BigInt vectors component-wise without mutating inputs', () => {
		const a = [1n, -2n, 3n, 0n]
		const b = [4n, 5n, -10n, 7n]
		const result = vectorAddBigIntSeries(a, b)

		assert.deepStrictEqual(result, [5n, 3n, -7n, 7n])
		assert.notStrictEqual(result, a)
		assert.notStrictEqual(result, b)
		assert.deepStrictEqual(a, [1n, -2n, 3n, 0n])
		assert.deepStrictEqual(b, [4n, 5n, -10n, 7n])
	})

	test('adds fixed-point BigInt vectors scaled by 10^18 exactly', () => {
		const a = [1n * SCALE / 2n, -3n * SCALE / 4n, 123456789012345678n]
		const b = [3n * SCALE / 2n, 3n * SCALE / 4n, 876543210987654322n]
		assert.deepStrictEqual(vectorAddBigIntSeries(a, b), [
			2n * SCALE,
			0n,
			1n * SCALE,
		])
	})

	test('handles empty vectors and returns a fresh array', () => {
		const a = []
		const b = []
		const result = vectorAddBigIntSeries(a, b)
		assert.deepStrictEqual(result, [])
		assert.notStrictEqual(result, a)
		assert.notStrictEqual(result, b)
	})

	test('satisfies zero vector additive identity', () => {
		const v = [42n, -99n, 0n, 10n ** 30n]
		const zero = [0n, 0n, 0n, 0n]
		assert.deepStrictEqual(vectorAddBigIntSeries(v, zero), v)
		assert.deepStrictEqual(vectorAddBigIntSeries(zero, v), v)
	})

	test('satisfies additive inverse property', () => {
		const v = [1n, -2n, 10n ** 40n, -(2n ** 120n)]
		const negV = v.map((x) => -x)
		assert.deepStrictEqual(vectorAddBigIntSeries(v, negV), [0n, 0n, 0n, 0n])
	})

	test('handles huge BigInts greater than 2^100 without precision loss', () => {
		const bigA = (1n << 128n) + 123456789012345678901234567890n
		const bigB = (1n << 256n) - 98765432109876543210987654321n
		const a = [bigA, -bigB, 1n << 512n]
		const b = [bigB, bigB, -(1n << 512n) + 1n]
		assert.deepStrictEqual(vectorAddBigIntSeries(a, b), [
			bigA + bigB,
			0n,
			1n,
		])
	})

	test('throws TypeError for non-array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			123n,
			42,
			'123',
			{ 0: 1n, length: 1 },
			new BigInt64Array([1n, 2n]),
		]
		for (const bad of invalidInputs) {
			assert.throws(() => vectorAddBigIntSeries(bad, [1n]), TypeError)
			assert.throws(() => vectorAddBigIntSeries([1n], bad), TypeError)
		}
	})

	test('throws RangeError for mismatched vector lengths', () => {
		assert.throws(() => vectorAddBigIntSeries([1n], [1n, 2n]), RangeError)
		assert.throws(() => vectorAddBigIntSeries([1n, 2n], [1n]), RangeError)
		assert.throws(() => vectorAddBigIntSeries([], [0n]), RangeError)
		assert.throws(() => vectorAddBigIntSeries([0n], []), RangeError)
	})

	test('throws TypeError for non-BigInt elements and sparse holes', () => {
		const badElements = [0, 1, 1.5, NaN, '1', null, undefined, true, {}, Object(1n)]
		for (const bad of badElements) {
			assert.throws(() => vectorAddBigIntSeries([1n, bad], [1n, 2n]), TypeError)
			assert.throws(() => vectorAddBigIntSeries([1n, 2n], [1n, bad]), TypeError)
		}

		// Sparse arrays with holes
		const sparse = new Array(2)
		sparse[0] = 1n
		assert.throws(() => vectorAddBigIntSeries(sparse, [1n, 2n]), TypeError)
		assert.throws(() => vectorAddBigIntSeries([1n, 2n], sparse), TypeError)
	})

	test('cross-check: commutativity, associativity, and dot-product linearity', () => {
		const a = [1n << 105n, -7n * SCALE, 42n, -(1n << 140n) + 3n]
		const b = [-(1n << 104n) + 9n, 13n * SCALE, -100n, 1n << 139n]
		const c = [3n, -5n, 1n << 110n, 7n * SCALE]

		// Commutativity: a + b = b + a
		assert.deepStrictEqual(
			vectorAddBigIntSeries(a, b),
			vectorAddBigIntSeries(b, a)
		)

		// Associativity: (a + b) + c = a + (b + c)
		assert.deepStrictEqual(
			vectorAddBigIntSeries(vectorAddBigIntSeries(a, b), c),
			vectorAddBigIntSeries(a, vectorAddBigIntSeries(b, c))
		)

		// Linearity of dot product: (a + b) · c = a · c + b · c
		const sumAB = vectorAddBigIntSeries(a, b)
		assert.strictEqual(
			dotBigInt(sumAB, c),
			dotBigInt(a, c) + dotBigInt(b, c)
		)
	})

	test('cross-check: vector series summation matches closed-form Faulhaber identities', () => {
		const N = 100n
		let acc = [0n, 0n, 0n]
		for (let k = 1n; k <= N; k++) {
			acc = vectorAddBigIntSeries(acc, [k, k * k, 1n])
		}
		const expected = [
			(N * (N + 1n)) / 2n,
			(N * (N + 1n) * (2n * N + 1n)) / 6n,
			N,
		]
		assert.deepStrictEqual(acc, expected)
	})
})
