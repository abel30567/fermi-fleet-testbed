import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionTypedSeries } from './convolutionTypedSeries.js'

/**
 * Independent reference implementation using the direct Cauchy power-series
 * product definition: c[k] = sum_{i + j = k} a[i] * b[j].
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {'full' | 'same' | 'valid'} [mode='full']
 * @returns {Float64Array}
 */
function directCauchyConvolution(a, b, mode = 'full') {
	const n = a.length
	const m = b.length
	const full = new Float64Array(n + m - 1)
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < m; j++) {
			full[i + j] += a[i] * b[j]
		}
	}
	if (mode === 'full') return full
	if (mode === 'same') {
		const start = Math.floor((m - 1) / 2)
		return full.slice(start, start + n)
	}
	const minLen = Math.min(n, m)
	const maxLen = Math.max(n, m)
	return full.slice(minLen - 1, minLen - 1 + (maxLen - minLen + 1))
}

/**
 * Asserts two Float64Arrays have identical lengths and element-wise closeness.
 *
 * @param {Float64Array} actual
 * @param {Float64Array | number[]} expected
 * @param {number} [tol=1e-10]
 */
function assertCloseArray(actual, expected, tol = 1e-10) {
	assert.ok(actual instanceof Float64Array, 'result should be a Float64Array')
	assert.equal(actual.length, expected.length, `expected length ${expected.length}, got ${actual.length}`)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= tol,
			`mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}, diff=${diff} > ${tol}`
		)
	}
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible randomized cross-checks.
 *
 * @param {number} seed
 */
function makeRng(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('convolutionTypedSeries', () => {
	test('computes basic full discrete convolution accurately', () => {
		const a = new Float64Array([1, 2, 3])
		const b = new Float64Array([0, 1, 0.5])
		const result = convolutionTypedSeries(a, b)
		// (1 + 2z + 3z^2)(0 + z + 0.5z^2) = 0 + z + 2.5z^2 + 4z^3 + 1.5z^4
		assertCloseArray(result, [0, 1, 2.5, 4, 1.5])
	})

	test('supports full, same, and valid output modes', () => {
		const a = new Float64Array([1, 2, 3, 4, 5])
		const b = new Float64Array([1, 0, -1])

		assertCloseArray(convolutionTypedSeries(a, b, { mode: 'full' }), [1, 2, 2, 2, 2, -4, -5])
		assertCloseArray(convolutionTypedSeries(a, b, { mode: 'same' }), [2, 2, 2, 2, -4])
		assertCloseArray(convolutionTypedSeries(a, b, { mode: 'valid' }), [2, 2, 2])
	})

	test('handles edge cases: length-1 inputs, unit impulse, delay impulse, and all-zero signals', () => {
		// Single-element inputs
		assertCloseArray(
			convolutionTypedSeries(new Float64Array([3.5]), new Float64Array([-2])),
			[-7]
		)

		// Impulse identity: a * [1] === a
		const signal = new Float64Array([4, -1.25, 0, 7.5, 2])
		assertCloseArray(convolutionTypedSeries(signal, new Float64Array([1])), signal)

		// Delayed impulse shifts signal by 2 samples
		assertCloseArray(
			convolutionTypedSeries(signal, new Float64Array([0, 0, 1])),
			[0, 0, 4, -1.25, 0, 7.5, 2]
		)

		// All-zero input yields exact zeros without -0
		const zeros = convolutionTypedSeries(new Float64Array([0, 0, 0]), new Float64Array([1, -2, 3]))
		assertCloseArray(zeros, [0, 0, 0, 0, 0], 1e-15)
		for (let i = 0; i < zeros.length; i++) {
			assert.ok(!Object.is(zeros[i], -0), `index ${i} should not be -0`)
		}

		// Does not mutate input arrays
		const aCopy = new Float64Array(signal)
		const kernel = new Float64Array([0.25, 0.5, 0.25])
		const kCopy = new Float64Array(kernel)
		convolutionTypedSeries(signal, kernel)
		assert.deepEqual(signal, aCopy)
		assert.deepEqual(kernel, kCopy)
	})

	test('satisfies algebraic convolution identities (commutativity, associativity, linearity, sum rule)', () => {
		const a = new Float64Array([1.5, -2, 3.25, 0.5])
		const b = new Float64Array([-0.5, 4, -1])
		const c = new Float64Array([2, 1, -3, 0.75, 1.25])

		// Commutativity: a * b = b * a
		assertCloseArray(convolutionTypedSeries(a, b), convolutionTypedSeries(b, a))

		// Associativity: (a * b) * c = a * (b * c)
		const left = convolutionTypedSeries(convolutionTypedSeries(a, b), c)
		const right = convolutionTypedSeries(a, convolutionTypedSeries(b, c))
		assertCloseArray(left, right)

		// Distributivity / linearity: (a + d) * b = (a * b) + (d * b)
		const d = new Float64Array([-1, 0.5, 2.5, -4])
		const sumAD = new Float64Array(a.length)
		for (let i = 0; i < a.length; i++) sumAD[i] = a[i] + d[i]
		const ab = convolutionTypedSeries(a, b)
		const db = convolutionTypedSeries(d, b)
		const abPlusDb = new Float64Array(ab.length)
		for (let i = 0; i < ab.length; i++) abPlusDb[i] = ab[i] + db[i]
		assertCloseArray(convolutionTypedSeries(sumAD, b), abPlusDb)

		// Series evaluation identity at z = 1: sum(a * b) = sum(a) * sum(b)
		const sum = (arr) => arr.reduce((acc, x) => acc + x, 0)
		assert.ok(Math.abs(sum(ab) - sum(a) * sum(b)) < 1e-11)
	})

	test('cross-checks against independent direct Cauchy-sum convolution across sizes and modes', () => {
		const rng = makeRng(20261122)
		const pairs = [
			[1, 1],
			[2, 3],
			[7, 11],
			[16, 16],
			[31, 17],
			[64, 65],
			[100, 37]
		]

		for (const [n, m] of pairs) {
			const a = new Float64Array(n)
			const b = new Float64Array(m)
			for (let i = 0; i < n; i++) a[i] = (rng() - 0.5) * 20
			for (let j = 0; j < m; j++) b[j] = (rng() - 0.5) * 20

			for (const mode of ['full', 'same', 'valid']) {
				const actual = convolutionTypedSeries(a, b, { mode })
				const expected = directCauchyConvolution(a, b, mode)
				assertCloseArray(actual, expected, 1e-9)
			}
		}
	})

	test('rejects invalid inputs with appropriate TypeError and RangeError', () => {
		const valid = new Float64Array([1, 2, 3])

		// Non-Float64Array inputs
		assert.throws(() => convolutionTypedSeries([1, 2, 3], valid), TypeError)
		assert.throws(() => convolutionTypedSeries(valid, [1, 2, 3]), TypeError)
		assert.throws(() => convolutionTypedSeries(new Float32Array([1, 2]), valid), TypeError)
		assert.throws(() => convolutionTypedSeries(new Int32Array([1, 2]), valid), TypeError)
		assert.throws(() => convolutionTypedSeries(null, valid), TypeError)
		assert.throws(() => convolutionTypedSeries(valid, undefined), TypeError)

		// Empty Float64Array inputs
		assert.throws(() => convolutionTypedSeries(new Float64Array(0), valid), RangeError)
		assert.throws(() => convolutionTypedSeries(valid, new Float64Array(0)), RangeError)

		// Non-finite elements
		assert.throws(() => convolutionTypedSeries(new Float64Array([1, Number.NaN]), valid), RangeError)
		assert.throws(() => convolutionTypedSeries(valid, new Float64Array([Number.POSITIVE_INFINITY])), RangeError)
		assert.throws(() => convolutionTypedSeries(new Float64Array([Number.NEGATIVE_INFINITY]), valid), RangeError)

		// Invalid options and mode
		assert.throws(() => convolutionTypedSeries(valid, valid, null), TypeError)
		assert.throws(() => convolutionTypedSeries(valid, valid, 'full'), TypeError)
		assert.throws(() => convolutionTypedSeries(valid, valid, []), TypeError)
		assert.throws(() => convolutionTypedSeries(valid, valid, { mode: 123 }), TypeError)
		assert.throws(() => convolutionTypedSeries(valid, valid, { mode: 'circular' }), RangeError)
	})
})
