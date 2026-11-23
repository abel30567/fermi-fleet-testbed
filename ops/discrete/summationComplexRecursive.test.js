import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationComplexRecursive } from './summationComplexRecursive.js'

/**
 * Helper to assert two complex numbers are approximately equal within `eps`.
 */
function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.equal(typeof actual, 'object')
	assert.notEqual(actual, null)
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`Real part mismatch: got ${actual.re}, expected ${expected.re} (tol ${eps})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`Imaginary part mismatch: got ${actual.im}, expected ${expected.im} (tol ${eps})`
	)
}

/**
 * Independent reference implementation using Kahan compensated summation.
 */
function kahanComplexSum(values) {
	let re = 0
	let reComp = 0
	let im = 0
	let imComp = 0
	for (const z of values) {
		const yRe = z.re - reComp
		const tRe = re + yRe
		reComp = tRe - re - yRe
		re = tRe

		const yIm = z.im - imComp
		const tIm = im + yIm
		imComp = tIm - im - yIm
		im = tIm
	}
	return { re, im }
}

describe('summationComplexRecursive', () => {
	describe('normal cases', () => {
		test('sums two complex numbers', () => {
			assert.deepEqual(
				summationComplexRecursive([
					{ re: 1, im: 2 },
					{ re: 3, im: 4 },
				]),
				{ re: 4, im: 6 }
			)
		})

		test('sums odd number of complex numbers with mixed signs', () => {
			assert.deepEqual(
				summationComplexRecursive([
					{ re: 5, im: -3 },
					{ re: -2, im: 7 },
					{ re: 1.5, im: -0.5 },
				]),
				{ re: 4.5, im: 3.5 }
			)
		})

		test('sums power-of-two length array', () => {
			const values = [
				{ re: 1, im: -1 },
				{ re: 2, im: -2 },
				{ re: 3, im: -3 },
				{ re: 4, im: -4 },
				{ re: 5, im: -5 },
				{ re: 6, im: -6 },
				{ re: 7, im: -7 },
				{ re: 8, im: -8 },
			]
			assert.deepEqual(summationComplexRecursive(values), { re: 36, im: -36 })
		})

		test('sums purely real and purely imaginary numbers', () => {
			assert.deepEqual(
				summationComplexRecursive([
					{ re: 10, im: 0 },
					{ re: 0, im: 20 },
					{ re: -4, im: 0 },
					{ re: 0, im: -5 },
				]),
				{ re: 6, im: 15 }
			)
		})
	})

	describe('edge cases', () => {
		test('returns { re: 0, im: 0 } for empty array', () => {
			assert.deepEqual(summationComplexRecursive([]), { re: 0, im: 0 })
		})

		test('returns a fresh copy for single-element array without mutating input', () => {
			const input = [{ re: -3.25, im: 7.5 }]
			const result = summationComplexRecursive(input)
			assert.deepEqual(result, { re: -3.25, im: 7.5 })
			assert.notEqual(result, input[0])
		})

		test('cancels opposite complex pairs to zero', () => {
			const values = [
				{ re: 123.456, im: -789.012 },
				{ re: -123.456, im: 789.012 },
				{ re: 0, im: 0 },
			]
			assert.deepEqual(summationComplexRecursive(values), { re: 0, im: 0 })
		})

		test('handles null-prototype objects and objects with extra properties', () => {
			const z1 = Object.assign(Object.create(null), { re: 2, im: 3 })
			const z2 = { re: -1, im: 4, label: 'extra' }
			assert.deepEqual(summationComplexRecursive([z1, z2]), { re: 1, im: 7 })
		})

		test('handles large array without stack overflow (O(log n) recursion depth)', () => {
			const n = 50_000
			const values = Array.from({ length: n }, () => ({ re: 1, im: -2 }))
			assert.deepEqual(summationComplexRecursive(values), { re: n, im: -2 * n })
		})

		test('does not mutate input array or element objects', () => {
			const values = [
				{ re: 1, im: 2 },
				{ re: 3, im: 4 },
				{ re: 5, im: 6 },
			]
			const snapshot = structuredClone(values)
			summationComplexRecursive(values)
			assert.deepEqual(values, snapshot)
		})
	})

	describe('independent cross-checks', () => {
		test('matches closed-form arithmetic series formula', () => {
			const n = 1000
			const values = Array.from({ length: n }, (_, idx) => {
				const k = idx + 1
				return { re: k, im: 3 * k - 1 }
			})
			const expectedRe = (n * (n + 1)) / 2
			const expectedIm = (3 * n * (n + 1)) / 2 - n
			assert.deepEqual(summationComplexRecursive(values), {
				re: expectedRe,
				im: expectedIm,
			})
		})

		test('sum of N-th roots of unity equals zero', () => {
			for (const n of [3, 7, 16, 100]) {
				const roots = Array.from({ length: n }, (_, k) => ({
					re: Math.cos((2 * Math.PI * k) / n),
					im: Math.sin((2 * Math.PI * k) / n),
				}))
				assertComplexClose(summationComplexRecursive(roots), { re: 0, im: 0 }, 1e-12)
			}
		})

		test('matches closed-form complex geometric series (1 - r^n) / (1 - r)', () => {
			// r = 0.5 + 0.5i
			const r = { re: 0.5, im: 0.5 }
			const mul = (a, b) => ({
				re: a.re * b.re - a.im * b.im,
				im: a.re * b.im + a.im * b.re,
			})
			const div = (a, b) => {
				const denom = b.re * b.re + b.im * b.im
				return {
					re: (a.re * b.re + a.im * b.im) / denom,
					im: (a.im * b.re - a.re * b.im) / denom,
				}
			}

			const n = 30
			const terms = []
			let cur = { re: 1, im: 0 }
			for (let k = 0; k < n; k++) {
				terms.push(cur)
				cur = mul(cur, r)
			}
			// cur is now r^n
			const expected = div(
				{ re: 1 - cur.re, im: -cur.im },
				{ re: 1 - r.re, im: -r.im }
			)
			assertComplexClose(summationComplexRecursive(terms), expected, 1e-12)
		})

		test('agrees with Kahan compensated summation on pseudorandom sequence and satisfies split additivity', () => {
			let seed = 42
			const nextRand = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0
				return seed / 0x100000000 - 0.5
			}
			const values = Array.from({ length: 2049 }, () => ({
				re: nextRand() * 1000,
				im: nextRand() * 1000,
			}))

			const actual = summationComplexRecursive(values)
			const reference = kahanComplexSum(values)
			assertComplexClose(actual, reference, 1e-10)

			// Split additivity cross-check: sum(A ++ B) === sum(A) + sum(B)
			const splitIdx = 777
			const left = summationComplexRecursive(values.slice(0, splitIdx))
			const right = summationComplexRecursive(values.slice(splitIdx))
			assertComplexClose(
				actual,
				{ re: left.re + right.re, im: left.im + right.im },
				1e-10
			)
		})
	})

	describe('invalid input errors', () => {
		test('throws TypeError when values is not an array', () => {
			for (const bad of [null, undefined, 42, 'abc', { re: 1, im: 2 }, new Set()]) {
				assert.throws(() => summationComplexRecursive(bad), TypeError)
			}
		})

		test('throws TypeError for non-object elements or sparse array holes', () => {
			assert.throws(() => summationComplexRecursive([null]), TypeError)
			assert.throws(() => summationComplexRecursive([undefined]), TypeError)
			assert.throws(() => summationComplexRecursive([123]), TypeError)
			assert.throws(() => summationComplexRecursive(['1+2i']), TypeError)
			assert.throws(() => summationComplexRecursive([[1, 2]]), TypeError)
			// Sparse array hole
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [{ re: 1, im: 2 }, , { re: 3, im: 4 }]
			assert.throws(() => summationComplexRecursive(sparse), TypeError)
		})

		test('throws TypeError when re or im is missing or non-numeric', () => {
			assert.throws(() => summationComplexRecursive([{ re: 1 }]), TypeError)
			assert.throws(() => summationComplexRecursive([{ im: 2 }]), TypeError)
			assert.throws(() => summationComplexRecursive([{}]), TypeError)
			assert.throws(
				() => summationComplexRecursive([{ re: '1', im: 2 }]),
				TypeError
			)
			assert.throws(
				() => summationComplexRecursive([{ re: 1, im: null }]),
				TypeError
			)
			assert.throws(
				() => summationComplexRecursive([{ re: true, im: 0 }]),
				TypeError
			)
		})

		test('throws RangeError when re or im is NaN or Infinity', () => {
			assert.throws(
				() => summationComplexRecursive([{ re: Number.NaN, im: 0 }]),
				RangeError
			)
			assert.throws(
				() => summationComplexRecursive([{ re: 0, im: Number.NaN }]),
				RangeError
			)
			assert.throws(
				() =>
					summationComplexRecursive([
						{ re: 1, im: 1 },
						{ re: Number.POSITIVE_INFINITY, im: 0 },
					]),
				RangeError
			)
			assert.throws(
				() =>
					summationComplexRecursive([
						{ re: 1, im: 1 },
						{ re: 0, im: Number.NEGATIVE_INFINITY },
					]),
				RangeError
			)
		})
	})
})
