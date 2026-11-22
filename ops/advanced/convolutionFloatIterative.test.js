import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionFloatIterative } from './convolutionFloatIterative.js'

function assertArrayClose(actual, expected, tolerance = 1e-12) {
	assert.equal(
		actual.length,
		expected.length,
		`Expected length ${expected.length}, got ${actual.length}`
	)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= tolerance,
			`Mismatch at index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff})`
		)
	}
}

function evalPolynomial(coeffs, x) {
	let value = 0
	for (let i = coeffs.length - 1; i >= 0; i--) {
		value = value * x + coeffs[i]
	}
	return value
}

function sumArray(arr) {
	let total = 0
	for (const x of arr) {
		total += x
	}
	return total
}

describe('convolutionFloatIterative', () => {
	test('computes standard full convolution (default and explicit)', () => {
		assertArrayClose(
			convolutionFloatIterative([1, 2, 3], [0, 1, 0.5]),
			[0, 1, 2.5, 4, 1.5]
		)
		assertArrayClose(
			convolutionFloatIterative([1, 2, 3], [4, 5, 6], 'full'),
			[4, 13, 28, 27, 18]
		)
		assertArrayClose(
			convolutionFloatIterative([1, 2, 3, 4], [1, 1]),
			[1, 3, 5, 7, 4]
		)
		assertArrayClose(
			convolutionFloatIterative([1, 2, 3], [4, 5, 6], undefined),
			[4, 13, 28, 27, 18]
		)
	})

	test('supports same and valid modes', () => {
		// Odd kernel length
		assertArrayClose(
			convolutionFloatIterative([1, 2, 3], [0, 1, 0.5], 'same'),
			[1, 2.5, 4]
		)
		assertArrayClose(
			convolutionFloatIterative([1, 2, 3], [0, 1, 0.5], 'valid'),
			[2.5]
		)

		// Even kernel length, asymmetric sizes
		assertArrayClose(
			convolutionFloatIterative([1, 2, 3, 4], [1, 1], 'same'),
			[1, 3, 5, 7]
		)
		assertArrayClose(
			convolutionFloatIterative([1, 2, 3, 4], [1, 1], 'valid'),
			[3, 5, 7]
		)

		// Shorter first argument in same and valid modes
		assertArrayClose(
			convolutionFloatIterative([1, 1], [1, 2, 3, 4], 'same'),
			[1, 3, 5, 7]
		)
		assertArrayClose(
			convolutionFloatIterative([1, 1], [1, 2, 3, 4], 'valid'),
			[3, 5, 7]
		)

		// Equal even lengths
		assertArrayClose(
			convolutionFloatIterative([1, 2, 3, 4], [1, 2, 3, 4], 'same'),
			[4, 10, 20, 25]
		)
		assertArrayClose(
			convolutionFloatIterative([1, 2, 3, 4], [1, 2, 3, 4], 'valid'),
			[20]
		)
	})

	test('handles edge cases: empty arrays, unit impulse, single elements, zeros, negatives, floats', () => {
		for (const mode of ['full', 'same', 'valid']) {
			assert.deepEqual(convolutionFloatIterative([], [], mode), [])
			assert.deepEqual(convolutionFloatIterative([], [1, 2, 3], mode), [])
			assert.deepEqual(convolutionFloatIterative([1, 2, 3], [], mode), [])
		}

		// Unit impulse [1] is identity and returns a new array
		const signal = [-2.5, 0, 3.125, 7.75]
		const idResult = convolutionFloatIterative(signal, [1])
		assert.deepEqual(idResult, signal)
		assert.notEqual(idResult, signal)
		assert.deepEqual(convolutionFloatIterative([1], signal), signal)

		// Delayed impulse shifts signal
		assertArrayClose(
			convolutionFloatIterative([1.5, -2.5, 4], [0, 0, 1]),
			[0, 0, 1.5, -2.5, 4]
		)

		// Single elements
		for (const mode of ['full', 'same', 'valid']) {
			assertArrayClose(convolutionFloatIterative([3.5], [-2], mode), [-7])
		}

		// Zero arrays should not produce -0
		const zeroRes = convolutionFloatIterative([-1, -2], [0, 0])
		assert.equal(zeroRes.length, 3)
		for (const v of zeroRes) {
			assert.ok(Object.is(v, 0), `Expected +0, got ${Object.is(v, -0) ? '-0' : v}`)
		}

		// Negative and fractional IEEE-754 floats
		assertArrayClose(
			convolutionFloatIterative([-0.5, 1.25, -2.0], [0.25, -0.75]),
			[-0.125, 0.6875, -1.4375, 1.5]
		)
	})

	test('satisfies commutativity, associativity, and distributivity', () => {
		const a = [1.25, -3.5, 0.75, 2.1]
		const b = [-0.4, 2.2, -1.1]
		const c = [0.5, 1.5, -2.5, 0.25, 3.0]

		// Commutativity across all modes
		for (const mode of ['full', 'same', 'valid']) {
			assertArrayClose(
				convolutionFloatIterative(a, b, mode),
				convolutionFloatIterative(b, a, mode)
			)
		}

		// Associativity in full mode: (a * b) * c == a * (b * c)
		const left = convolutionFloatIterative(convolutionFloatIterative(a, b), c)
		const right = convolutionFloatIterative(a, convolutionFloatIterative(b, c))
		assertArrayClose(left, right, 1e-11)

		// Distributivity: a * (b1 + b2) == (a * b1) + (a * b2)
		const b2 = [3.1, -0.9, 4.4]
		const bSum = b.map((val, i) => val + b2[i])
		const lhs = convolutionFloatIterative(a, bSum)
		const ab1 = convolutionFloatIterative(a, b)
		const ab2 = convolutionFloatIterative(a, b2)
		const rhs = ab1.map((val, i) => val + ab2[i])
		assertArrayClose(lhs, rhs, 1e-11)
	})

	test('does not mutate input arrays', () => {
		const a = Object.freeze([1.5, -2.5, 3.5, 4.5])
		const b = Object.freeze([-1.25, 0.75, 2.25])
		const aCopy = [...a]
		const bCopy = [...b]

		for (const mode of ['full', 'same', 'valid']) {
			convolutionFloatIterative(a, b, mode)
			assert.deepEqual([...a], aCopy)
			assert.deepEqual([...b], bCopy)
		}
	})

	test('cross-checks against independent polynomial multiplication and sum identity', () => {
		const pairs = [
			[
				[1.5, -2.25, 0.75, 4.0],
				[-0.5, 3.125, -1.75]
			],
			[
				[0.1, -0.2, 0.3, -0.4, 0.5, -0.6],
				[1.2, 2.3, -3.4, 4.5]
			],
			[
				[-12.5, 0, 7.25, -3.125, 1.5],
				[0.25, -0.5, 1.0, -2.0, 4.0]
			]
		]

		const evaluationPoints = [-2.5, -1.0, -0.375, 0, 0.5, 1.0, 1.75, 3.2]

		for (const [p, q] of pairs) {
			const pq = convolutionFloatIterative(p, q, 'full')
			assert.equal(pq.length, p.length + q.length - 1)

			// Sum identity: sum(p * q) === sum(p) * sum(q)
			const expectedSum = sumArray(p) * sumArray(q)
			const actualSum = sumArray(pq)
			assert.ok(
				Math.abs(actualSum - expectedSum) <= 1e-10 * Math.max(1, Math.abs(expectedSum)),
				`Sum identity failed: expected ${expectedSum}, got ${actualSum}`
			)

			// Polynomial evaluation identity: P(x) * Q(x) === (P * Q)(x)
			for (const x of evaluationPoints) {
				const lhs = evalPolynomial(p, x) * evalPolynomial(q, x)
				const rhs = evalPolynomial(pq, x)
				const tol = 1e-10 * Math.max(1, Math.abs(lhs))
				assert.ok(
					Math.abs(lhs - rhs) <= tol,
					`Polynomial identity failed at x=${x}: P(x)*Q(x)=${lhs}, (P*Q)(x)=${rhs}`
				)
			}
		}
	})

	test('validates inputs strictly', () => {
		// Non-array inputs
		for (const bad of [null, undefined, 42, '123', {}, new Float64Array([1, 2])]) {
			assert.throws(() => convolutionFloatIterative(bad, [1]), TypeError)
			assert.throws(() => convolutionFloatIterative([1], bad), TypeError)
		}

		// Non-number elements (including sparse array holes)
		// eslint-disable-next-line no-sparse-arrays
		const sparse = [1, , 3]
		for (const badArr of [['1'], [null], [undefined], [true], [{}], [1n], sparse]) {
			assert.throws(() => convolutionFloatIterative(badArr, [1]), TypeError)
			assert.throws(() => convolutionFloatIterative([1], badArr), TypeError)
		}

		// Non-finite numbers (including when the other array is empty)
		for (const badNum of [NaN, Infinity, -Infinity]) {
			assert.throws(() => convolutionFloatIterative([1, badNum], [1]), RangeError)
			assert.throws(() => convolutionFloatIterative([1], [badNum]), RangeError)
			assert.throws(() => convolutionFloatIterative([], [badNum]), RangeError)
			assert.throws(() => convolutionFloatIterative([badNum], []), RangeError)
		}

		// Invalid mode types and values (including with empty inputs)
		for (const badModeType of [null, 123, true, {}]) {
			assert.throws(() => convolutionFloatIterative([1], [1], badModeType), TypeError)
			assert.throws(() => convolutionFloatIterative([], [], badModeType), TypeError)
		}
		for (const badModeValue of ['', 'FULL', 'circular', 'wrap']) {
			assert.throws(() => convolutionFloatIterative([1], [1], badModeValue), RangeError)
			assert.throws(() => convolutionFloatIterative([], [], badModeValue), RangeError)
		}
	})
})
