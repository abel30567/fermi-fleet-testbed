import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionTypedSeries } from './convolutionTypedSeries.js'

/**
 * Independent naive O(M*N) direct time-domain Cauchy product for cross-checking.
 */
function directConvolve(a, b) {
	if (a.length === 0 || b.length === 0) {
		return new Float64Array(0)
	}
	const out = new Float64Array(a.length + b.length - 1)
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			out[i + j] += a[i] * b[j]
		}
	}
	return out
}

/**
 * Evaluate power series P(x) = sum_{k=0}^{n-1} coeffs[k] * x^k via Horner's method.
 */
function evalSeries(coeffs, x) {
	let acc = 0
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = acc * x + coeffs[i]
	}
	return acc
}

function assertFloat64ArrayClose(actual, expected, tol = 1e-11) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.equal(actual.length, expected.length, `length mismatch: ${actual.length} vs ${expected.length}`)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		const scale = Math.max(1, Math.abs(expected[i]))
		assert.ok(
			diff <= tol * scale,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff})`
		)
	}
}

describe('convolutionTypedSeries', () => {
	test('computes basic full convolution matching polynomial multiplication', () => {
		// (1 + 2x + 3x^2) * (4 + 5x) = 4 + 13x + 22x^2 + 15x^3
		const a = new Float64Array([1, 2, 3])
		const b = new Float64Array([4, 5])
		const result = convolutionTypedSeries(a, b)
		assertFloat64ArrayClose(result, new Float64Array([4, 13, 22, 15]))
	})

	test('identity and shifted impulse responses', () => {
		const signal = new Float64Array([2.5, -1.25, 0, 4.75, 3.125])
		const unitImpulse = new Float64Array([1])
		assertFloat64ArrayClose(convolutionTypedSeries(signal, unitImpulse), signal)

		const delayedImpulse = new Float64Array([0, 0, 1])
		assertFloat64ArrayClose(
			convolutionTypedSeries(signal, delayedImpulse),
			new Float64Array([0, 0, 2.5, -1.25, 0, 4.75, 3.125])
		)
	})

	test('boxcar convolved with boxcar yields symmetric triangle', () => {
		const box = new Float64Array([1, 1, 1, 1])
		assertFloat64ArrayClose(
			convolutionTypedSeries(box, box),
			new Float64Array([1, 2, 3, 4, 3, 2, 1])
		)
	})

	test('supports full, same, and valid modes', () => {
		const a = new Float64Array([1, 2, 3, 4, 5])
		const b = new Float64Array([1, 0, -1])
		// Full: [1, 2, 2, 2, 2, -4, -5]
		assertFloat64ArrayClose(
			convolutionTypedSeries(a, b, { mode: 'full' }),
			new Float64Array([1, 2, 2, 2, 2, -4, -5])
		)
		// Same (length of a = 5, start = floor((3-1)/2) = 1): [2, 2, 2, 2, -4]
		assertFloat64ArrayClose(
			convolutionTypedSeries(a, b, { mode: 'same' }),
			new Float64Array([2, 2, 2, 2, -4])
		)
		// Valid (start = 2, length = 3): [2, 2, 2]
		assertFloat64ArrayClose(
			convolutionTypedSeries(a, b, { mode: 'valid' }),
			new Float64Array([2, 2, 2])
		)
		// Valid is symmetric when a is shorter than b
		assertFloat64ArrayClose(
			convolutionTypedSeries(b, a, { mode: 'valid' }),
			new Float64Array([2, 2, 2])
		)
	})

	test('handles edge cases: empty inputs, single elements, zeros, and immutability', () => {
		const empty = new Float64Array(0)
		const nonEmpty = new Float64Array([1, 2, 3])
		assertFloat64ArrayClose(convolutionTypedSeries(empty, nonEmpty), empty)
		assertFloat64ArrayClose(convolutionTypedSeries(nonEmpty, empty), empty)
		assertFloat64ArrayClose(convolutionTypedSeries(empty, empty), empty)

		assertFloat64ArrayClose(
			convolutionTypedSeries(new Float64Array([-3.5]), new Float64Array([2])),
			new Float64Array([-7])
		)

		const zeros = new Float64Array([0, 0, 0])
		const res = convolutionTypedSeries(zeros, nonEmpty)
		assertFloat64ArrayClose(res, new Float64Array([0, 0, 0, 0, 0]))
		for (let i = 0; i < res.length; i++) {
			assert.equal(Object.is(res[i], -0), false, 'output should not contain -0')
		}

		// Does not mutate input arrays
		const aCopy = new Float64Array(nonEmpty)
		const b = new Float64Array([4, 5])
		const bCopy = new Float64Array(b)
		convolutionTypedSeries(nonEmpty, b)
		assert.deepEqual(nonEmpty, aCopy)
		assert.deepEqual(b, bCopy)
	})

	test('validates input types, finiteness, and options', () => {
		const valid = new Float64Array([1, 2])
		assert.throws(() => convolutionTypedSeries([1, 2], valid), TypeError)
		assert.throws(() => convolutionTypedSeries(valid, new Float32Array([1, 2])), TypeError)
		assert.throws(() => convolutionTypedSeries(null, valid), TypeError)
		assert.throws(() => convolutionTypedSeries(valid, undefined), TypeError)

		assert.throws(() => convolutionTypedSeries(new Float64Array([1, NaN]), valid), RangeError)
		assert.throws(() => convolutionTypedSeries(valid, new Float64Array([Infinity])), RangeError)
		assert.throws(() => convolutionTypedSeries(new Float64Array([-Infinity]), valid), RangeError)

		assert.throws(() => convolutionTypedSeries(valid, valid, null), TypeError)
		assert.throws(() => convolutionTypedSeries(valid, valid, []), TypeError)
		assert.throws(() => convolutionTypedSeries(valid, valid, 'full'), TypeError)
		assert.throws(() => convolutionTypedSeries(valid, valid, { mode: 'circular' }), RangeError)
		assert.throws(() => convolutionTypedSeries(valid, valid, { mode: 42 }), RangeError)
	})

	test('independent cross-check against direct time-domain Cauchy product', () => {
		// Deterministic pseudo-random sequences of non-power-of-two lengths (prime sizes)
		const makeSignal = (len, seed) => {
			const arr = new Float64Array(len)
			let state = seed >>> 0
			for (let i = 0; i < len; i++) {
				state = (1664525 * state + 1013904223) >>> 0
				arr[i] = (state / 0xffffffff) * 20 - 10
			}
			return arr
		}

		const pairs = [
			[7, 11],
			[17, 31],
			[64, 45],
			[128, 129],
		]

		for (const [m, n] of pairs) {
			const a = makeSignal(m, m * 31 + n)
			const b = makeSignal(n, n * 97 + m)
			const actual = convolutionTypedSeries(a, b)
			const expected = directConvolve(a, b)
			assertFloat64ArrayClose(actual, expected, 1e-10)
		}
	})

	test('independent cross-check via algebraic and power-series identities', () => {
		const a = new Float64Array([0.5, -1.25, 2.0, 0.75, -0.5, 1.5, -0.25])
		const b = new Float64Array([-0.75, 1.0, 0.25, -1.5, 0.5])
		const c = new Float64Array([1.25, -0.5, 0.75, 0.25, -1.0])

		// Commutativity: a * b = b * a
		const ab = convolutionTypedSeries(a, b)
		const ba = convolutionTypedSeries(b, a)
		assertFloat64ArrayClose(ab, ba)

		// Associativity: (a * b) * c = a * (b * c)
		const ab_c = convolutionTypedSeries(ab, c)
		const a_bc = convolutionTypedSeries(a, convolutionTypedSeries(b, c))
		assertFloat64ArrayClose(ab_c, a_bc)

		// Distributivity: a * (b + c) = (a * b) + (a * c)
		const bPlusC = new Float64Array(b.length)
		for (let i = 0; i < b.length; i++) {
			bPlusC[i] = b[i] + c[i]
		}
		const lhs = convolutionTypedSeries(a, bPlusC)
		const ac = convolutionTypedSeries(a, c)
		const rhs = new Float64Array(ab.length)
		for (let i = 0; i < ab.length; i++) {
			rhs[i] = ab[i] + ac[i]
		}
		assertFloat64ArrayClose(lhs, rhs)

		// Power-series evaluation identity: C(x) = A(x) * B(x) for arbitrary x
		for (const x of [-1, -0.5, 0, 0.5, 1, 1.25]) {
			const expectedVal = evalSeries(a, x) * evalSeries(b, x)
			const actualVal = evalSeries(ab, x)
			assert.ok(
				Math.abs(actualVal - expectedVal) <= 1e-11 * Math.max(1, Math.abs(expectedVal)),
				`series identity failed at x=${x}: expected ${expectedVal}, got ${actualVal}`
			)
		}
	})
})
