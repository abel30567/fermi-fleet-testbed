import test from 'node:test'
import assert from 'node:assert/strict'
import { convolutionFloatSeries } from './convolutionFloatSeries.js'

/**
 * Independent O(n * m) direct Cauchy-product reference implementation
 * for cross-checking the FFT / Convolution Theorem implementation.
 */
function directConvolve(a, b) {
	if (a.length === 0 || b.length === 0) return []
	const out = new Array(a.length + b.length - 1).fill(0)
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			out[i + j] += a[i] * b[j]
		}
	}
	return out
}

/**
 * Asserts two float arrays are element-wise close within absolute/relative tolerance.
 */
function assertArrayClose(actual, expected, absTol = 1e-11, relTol = 1e-11) {
	assert.equal(actual.length, expected.length, `length mismatch: ${actual.length} vs ${expected.length}`)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual[i]), Math.abs(expected[i])))
		assert.ok(
			diff <= limit,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff}, limit=${limit})`
		)
	}
}

test('normal discrete convolution of integer and floating-point sequences', () => {
	assertArrayClose(convolutionFloatSeries([1, 2, 3], [4, 5, 6]), [4, 13, 28, 27, 18])
	assertArrayClose(convolutionFloatSeries([0.5, -1.25, 2.5], [1.5, 0.25]), [0.75, -1.75, 3.4375, 0.625])
	assertArrayClose(convolutionFloatSeries([1, -1], [1, 1]), [1, 0, -1])
})

test('supports Float64Array inputs', () => {
	const a = new Float64Array([1.25, -0.5, 3.75])
	const b = new Float64Array([2.0, 0.5, -1.0, 4.0])
	assertArrayClose(convolutionFloatSeries(a, b), directConvolve(a, b))
})

test('edge cases: empty, single-element, all-zero, and unequal lengths', () => {
	assert.deepEqual(convolutionFloatSeries([], [1, 2, 3]), [])
	assert.deepEqual(convolutionFloatSeries([1, 2, 3], []), [])
	assert.deepEqual(convolutionFloatSeries([], []), [])

	assertArrayClose(convolutionFloatSeries([7.5], [-2.0]), [-15.0])
	assertArrayClose(convolutionFloatSeries([3], [1, 2, 3, 4]), [3, 6, 9, 12])

	const zeros = convolutionFloatSeries([0, 0, 0], [1, 2, 3])
	assert.deepEqual(zeros, [0, 0, 0, 0, 0])
	for (const z of zeros) {
		assert.ok(!Object.is(z, -0), 'should not return -0 for zero-signal convolution')
	}
})

test('edge cases: extreme magnitudes handled cleanly via normalization scaling', () => {
	assertArrayClose(convolutionFloatSeries([1e150, 2e150], [3e-150, 4e-150]), [3, 10, 8])
	assertArrayClose(convolutionFloatSeries([1e-160, 2e-160], [3e-100, 4e-100]), [3e-260, 10e-260, 8e-260], 1e-270, 1e-11)
})

test('output modes: full, same, and valid', () => {
	const a = [1, 2, 3, 4, 5]
	const b = [10, 20, 30]
	const full = [10, 40, 100, 160, 220, 220, 150]

	assertArrayClose(convolutionFloatSeries(a, b, 'full'), full)
	assertArrayClose(convolutionFloatSeries(a, b, 'same'), [40, 100, 160, 220, 220])
	assertArrayClose(convolutionFloatSeries(a, b, 'valid'), [100, 160, 220])

	// Mode symmetry (commutativity)
	assertArrayClose(convolutionFloatSeries(a, b, 'same'), convolutionFloatSeries(b, a, 'same'))
	assertArrayClose(convolutionFloatSeries(a, b, 'valid'), convolutionFloatSeries(b, a, 'valid'))
})

test('cross-check against direct O(n*m) Cauchy product across non-power-of-2 sizes', () => {
	// Deterministic pseudo-random float64 generator (LCG)
	let seed = 0x12345678
	const nextFloat = () => {
		seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
		return (seed / 0x100000000) * 20 - 10
	}

	const pairs = [
		[7, 5],
		[13, 19],
		[33, 17],
		[64, 65],
		[100, 75]
	]

	for (const [n, m] of pairs) {
		const a = Array.from({ length: n }, nextFloat)
		const b = Array.from({ length: m }, nextFloat)
		const actual = convolutionFloatSeries(a, b)
		const expected = directConvolve(a, b)
		assertArrayClose(actual, expected, 1e-10, 1e-10)
	}
})

test('cross-check against algebraic and closed-form series identities', () => {
	const a = [1.2, -3.4, 5.6, -7.8, 2.1]
	const b = [-0.5, 2.5, -1.5, 4.0]
	const c = [0.75, -0.25, 1.25, -2.0]

	// 1. Commutativity: a * b === b * a
	assertArrayClose(convolutionFloatSeries(a, b), convolutionFloatSeries(b, a))

	// 2. Associativity: (a * b) * c === a * (b * c)
	assertArrayClose(
		convolutionFloatSeries(convolutionFloatSeries(a, b), c),
		convolutionFloatSeries(a, convolutionFloatSeries(b, c))
	)

	// 3. Distributivity: a * (b + c) === (a * b) + (a * c)
	const bPlusC = b.map((v, i) => v + c[i])
	const ab = convolutionFloatSeries(a, b)
	const ac = convolutionFloatSeries(a, c)
	const abPlusAc = ab.map((v, i) => v + ac[i])
	assertArrayClose(convolutionFloatSeries(a, bPlusC), abPlusAc)

	// 4. Impulse / shift identity: a * [0, 0, 1] shifts right by 2
	assertArrayClose(convolutionFloatSeries(a, [0, 0, 1]), [0, 0, ...a])

	// 5. Generating polynomial identity: P_{a*b}(x) === P_a(x) * P_b(x)
	const evalPoly = (coeffs, x) => coeffs.reduceRight((acc, coef) => acc * x + coef, 0)
	for (const x of [-1.5, 0, 0.5, 1, 1.25]) {
		assert.ok(
			Math.abs(evalPoly(ab, x) - evalPoly(a, x) * evalPoly(b, x)) < 1e-10,
			`polynomial identity failed at x=${x}`
		)
	}

	// 6. Closed-form geometric series self-convolution:
	// [r^0, ..., r^(n-1)] * [r^0, ..., r^(n-1)] has k-th term:
	//   (k + 1) * r^k          for 0 <= k < n
	//   (2*n - 1 - k) * r^k    for n <= k <= 2*n - 2
	const r = 0.6
	const n = 12
	const geom = Array.from({ length: n }, (_, k) => r ** k)
	const closedForm = Array.from({ length: 2 * n - 1 }, (_, k) => {
		const count = k < n ? k + 1 : 2 * n - 1 - k
		return count * r ** k
	})
	assertArrayClose(convolutionFloatSeries(geom, geom), closedForm)

	// 7. Binomial series identity: [1, 1] convolved 6 times gives row 6 of Pascal's triangle
	let pascal = [1]
	for (let step = 0; step < 6; step++) {
		pascal = convolutionFloatSeries(pascal, [1, 1])
	}
	assertArrayClose(pascal, [1, 6, 15, 20, 15, 6, 1])
})

test('input validation rejects invalid types, non-finite numbers, and invalid modes', () => {
	assert.throws(() => convolutionFloatSeries(null, [1]), TypeError)
	assert.throws(() => convolutionFloatSeries([1], undefined), TypeError)
	assert.throws(() => convolutionFloatSeries('123', [1]), TypeError)
	assert.throws(() => convolutionFloatSeries({ 0: 1, length: 1 }, [1]), TypeError)
	assert.throws(() => convolutionFloatSeries([1, '2'], [1]), TypeError)
	assert.throws(() => convolutionFloatSeries([1], [1n]), TypeError)

	assert.throws(() => convolutionFloatSeries([NaN], [1]), RangeError)
	assert.throws(() => convolutionFloatSeries([1], [Infinity]), RangeError)
	assert.throws(() => convolutionFloatSeries([-Infinity, 1], [1]), RangeError)

	assert.throws(() => convolutionFloatSeries([1], [1], 123), TypeError)
	assert.throws(() => convolutionFloatSeries([1], [1], 'circular'), RangeError)
})
