import { test } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionFloatIterative } from './convolutionFloatIterative.js'

/**
 * Asserts two numeric arrays have identical lengths and element-wise values
 * within `eps`.
 */
function assertArrayClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= eps,
			`Mismatch at index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff}, eps=${eps})`,
		)
	}
}

/**
 * Evaluates a polynomial with coefficients [c0, c1, ..., cd] at `x` via Horner's method.
 */
function evalPoly(coeffs, x) {
	let acc = 0
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = acc * x + coeffs[i]
	}
	return acc
}

test('normal case: basic integer-valued float64 arrays', () => {
	assert.deepEqual(
		convolutionFloatIterative([1, 2, 3], [4, 5, 6]),
		[4, 13, 28, 27, 18],
	)
})

test('normal case: asymmetric lengths and negative fractional floats', () => {
	const result = convolutionFloatIterative([1.5, -2.25, 0.5, 4], [0.5, -0.25])
	assertArrayClose(result, [0.75, -1.5, 0.8125, 1.875, -1])
})

test('normal case: symmetric smoothing kernel', () => {
	const signal = [0, 0, 4, 8, 4, 0, 0]
	const kernel = [0.25, 0.5, 0.25]
	assertArrayClose(
		convolutionFloatIterative(signal, kernel),
		[0, 0, 1, 4, 6, 4, 1, 0, 0],
	)
})

test('normal case: does not mutate input arrays', () => {
	const a = [1.1, 2.2, 3.3]
	const b = [-0.5, 1.5]
	const aCopy = [...a]
	const bCopy = [...b]
	convolutionFloatIterative(a, b)
	assert.deepEqual(a, aCopy)
	assert.deepEqual(b, bCopy)
})

test('edge case: empty signal or kernel returns empty array', () => {
	assert.deepEqual(convolutionFloatIterative([], [1, 2, 3]), [])
	assert.deepEqual(convolutionFloatIterative([1, 2, 3], []), [])
	assert.deepEqual(convolutionFloatIterative([], []), [])
})

test('edge case: single-element arrays', () => {
	assertArrayClose(convolutionFloatIterative([3.5], [-2]), [-7])
})

test('edge case: unit impulse identity and delayed impulse shift', () => {
	const signal = [2.5, -1.25, 0, 7.75]
	assertArrayClose(convolutionFloatIterative(signal, [1]), signal)
	assertArrayClose(convolutionFloatIterative([1], signal), signal)
	assertArrayClose(
		convolutionFloatIterative(signal, [0, 0, 1]),
		[0, 0, 2.5, -1.25, 0, 7.75],
	)
})

test('edge case: all-zero arrays produce positive zeros of expected length', () => {
	const result = convolutionFloatIterative([0, 0, 0], [-1, 2])
	assert.equal(result.length, 4)
	for (const val of result) {
		assert.ok(Object.is(val, 0), `Expected +0, got ${Object.is(val, -0) ? '-0' : val}`)
	}
})

test('edge case: subnormal and small float64 numbers', () => {
	const result = convolutionFloatIterative([1e-160, 2e-160], [3e-160, 4e-160])
	assertArrayClose(result, [3e-320, 1e-319, 8e-320], 1e-323)
})

test('validation: rejects non-array inputs with TypeError', () => {
	const badInputs = [null, undefined, 42, '123', { 0: 1, length: 1 }, new Float64Array([1, 2])]
	for (const bad of badInputs) {
		assert.throws(() => convolutionFloatIterative(bad, [1]), TypeError)
		assert.throws(() => convolutionFloatIterative([1], bad), TypeError)
	}
})

test('validation: rejects non-number elements and sparse holes with TypeError', () => {
	assert.throws(() => convolutionFloatIterative([1, '2'], [1]), TypeError)
	assert.throws(() => convolutionFloatIterative([1], [null]), TypeError)
	assert.throws(() => convolutionFloatIterative([undefined], [1]), TypeError)
	assert.throws(() => convolutionFloatIterative([1], [true]), TypeError)
	assert.throws(() => convolutionFloatIterative([1n], [1]), TypeError)

	// eslint-disable-next-line no-sparse-arrays
	const sparse = [1, , 3]
	assert.throws(() => convolutionFloatIterative(sparse, [1]), TypeError)
	assert.throws(() => convolutionFloatIterative([1], sparse), TypeError)
})

test('validation: rejects non-finite numbers (NaN, Infinity, -Infinity) with RangeError', () => {
	for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
		assert.throws(() => convolutionFloatIterative([1, bad, 2], [1]), RangeError)
		assert.throws(() => convolutionFloatIterative([1], [bad]), RangeError)
	}
})

test('cross-check: commutativity, associativity, and distributivity', () => {
	const a = [1.25, -0.75, 3.5, 0.125]
	const b = [-2.5, 4.0, 0.5]
	const c = [0.25, -1.5, 2.0]

	// Commutativity: a * b == b * a
	assertArrayClose(
		convolutionFloatIterative(a, b),
		convolutionFloatIterative(b, a),
	)

	// Associativity: (a * b) * c == a * (b * c)
	assertArrayClose(
		convolutionFloatIterative(convolutionFloatIterative(a, b), c),
		convolutionFloatIterative(a, convolutionFloatIterative(b, c)),
	)

	// Distributivity: a * (b + c) == (a * b) + (a * c)
	const bPlusC = b.map((v, i) => v + c[i])
	const lhs = convolutionFloatIterative(a, bPlusC)
	const ab = convolutionFloatIterative(a, b)
	const ac = convolutionFloatIterative(a, c)
	const rhs = ab.map((v, i) => v + ac[i])
	assertArrayClose(lhs, rhs)
})

test('cross-check: sum property sum(a * b) == sum(a) * sum(b)', () => {
	const a = [0.3, -1.7, 2.4, 5.1, -0.9]
	const b = [1.2, 0.8, -3.5, 4.4]
	const conv = convolutionFloatIterative(a, b)
	const sumConv = conv.reduce((acc, v) => acc + v, 0)
	const sumA = a.reduce((acc, v) => acc + v, 0)
	const sumB = b.reduce((acc, v) => acc + v, 0)
	assert.ok(
		Math.abs(sumConv - sumA * sumB) < 1e-12,
		`Expected ${sumA * sumB}, got ${sumConv}`,
	)
})

test('cross-check: polynomial multiplication evaluated at multiple points', () => {
	const p = [2.5, -1.2, 0.75, 3.1, -0.4]
	const q = [-0.6, 1.8, -2.2, 0.9]
	const pq = convolutionFloatIterative(p, q)

	for (const x of [-2.5, -1, -0.5, 0, 0.37, 1, 2.25]) {
		const expected = evalPoly(p, x) * evalPoly(q, x)
		const actual = evalPoly(pq, x)
		assert.ok(
			Math.abs(actual - expected) <= 1e-11 * Math.max(1, Math.abs(expected)),
			`Polynomial mismatch at x=${x}: expected ${expected}, got ${actual}`,
		)
	}
})

test('cross-check: direct output-index definition on deterministic larger float64 sequences', () => {
	// Deterministic LCG PRNG
	let seed = 123456789
	const nextFloat = () => {
		seed = (1664525 * seed + 1013904223) >>> 0
		return (seed / 0x100000000) * 20 - 10
	}

	const a = Array.from({ length: 37 }, nextFloat)
	const b = Array.from({ length: 23 }, nextFloat)
	const actual = convolutionFloatIterative(a, b)

	const expected = Array.from({ length: a.length + b.length - 1 }, (_, k) => {
		let sum = 0
		const iMin = Math.max(0, k - b.length + 1)
		const iMax = Math.min(a.length - 1, k)
		for (let i = iMin; i <= iMax; i++) {
			sum += a[i] * b[k - i]
		}
		return sum
	})

	assertArrayClose(actual, expected, 1e-11)
})
