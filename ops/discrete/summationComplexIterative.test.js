import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { summationComplexIterative } from './summationComplexIterative.js'

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`Expected re=${actual.re} to be within ${eps} of ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`Expected im=${actual.im} to be within ${eps} of ${expected.im}`
	)
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexDiv(a, b) {
	const denom = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / denom,
		im: (a.im * b.re - a.re * b.im) / denom,
	}
}

function complexPow(z, n) {
	let result = { re: 1, im: 0 }
	for (let i = 0; i < n; i += 1) {
		result = complexMul(result, z)
	}
	return result
}

describe('summationComplexIterative', () => {
	describe('normal cases', () => {
		it('sums multiple complex numbers with positive and negative components', () => {
			const terms = [
				{ re: 1, im: 2 },
				{ re: 3, im: -5 },
				{ re: -2.5, im: 4.25 },
				{ re: 0.5, im: -1.25 },
			]
			assert.deepEqual(summationComplexIterative(terms), { re: 2, im: 0 })
		})

		it('returns the single element for a singleton array', () => {
			assert.deepEqual(summationComplexIterative([{ re: -7.5, im: 3.25 }]), {
				re: -7.5,
				im: 3.25,
			})
		})

		it('handles purely real and purely imaginary inputs', () => {
			assert.deepEqual(
				summationComplexIterative([
					{ re: 4, im: 0 },
					{ re: 0, im: -9 },
					{ re: -1, im: 0 },
					{ re: 0, im: 6 },
				]),
				{ re: 3, im: -3 }
			)
		})

		it('accepts non-array iterables such as Set and generators', () => {
			const set = new Set([
				{ re: 1, im: 1 },
				{ re: 2, im: 3 },
				{ re: -1, im: 4 },
			])
			assert.deepEqual(summationComplexIterative(set), { re: 2, im: 8 })

			function* gen() {
				yield { re: 10, im: -2 }
				yield { re: -4, im: 5 }
				yield { re: 1, im: -3 }
			}
			assert.deepEqual(summationComplexIterative(gen()), { re: 7, im: 0 })
		})
	})

	describe('edge cases', () => {
		it('returns { re: 0, im: 0 } for an empty iterable', () => {
			const result = summationComplexIterative([])
			assert.deepEqual(result, { re: 0, im: 0 })
			assert.equal(Object.is(result.re, 0), true)
			assert.equal(Object.is(result.im, 0), true)
		})

		it('handles complete cancellation and normalizes -0 to +0', () => {
			const result = summationComplexIterative([
				{ re: -0, im: -0 },
				{ re: 0, im: -0 },
			])
			assert.equal(Object.is(result.re, 0), true)
			assert.equal(Object.is(result.im, 0), true)

			const cancelled = summationComplexIterative([
				{ re: 123.456, im: -789.012 },
				{ re: -123.456, im: 789.012 },
			])
			assert.deepEqual(cancelled, { re: 0, im: 0 })
		})

		it('sums large sequences accurately', () => {
			const n = 10000
			const terms = Array.from({ length: n }, (_, k) => ({ re: k + 1, im: -(k + 1) }))
			const expected = (n * (n + 1)) / 2
			assert.deepEqual(summationComplexIterative(terms), { re: expected, im: -expected })
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-iterable or string inputs', () => {
			for (const invalid of [null, undefined, 42, true, {}, 'abc', Symbol('x')]) {
				assert.throws(() => summationComplexIterative(invalid), TypeError)
			}
		})

		it('throws TypeError for invalid complex element shapes or non-numeric components', () => {
			const badElements = [
				null,
				undefined,
				5,
				'1+2i',
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 2 },
				{ re: 1, im: null },
				{ re: 1n, im: 2n },
				{ re: true, im: 0 },
			]
			for (const bad of badElements) {
				assert.throws(() => summationComplexIterative([{ re: 1, im: 1 }, bad]), TypeError)
			}
		})

		it('throws RangeError for NaN or Infinite components', () => {
			const nonFiniteElements = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFiniteElements) {
				assert.throws(() => summationComplexIterative([bad]), RangeError)
			}
		})

		it('throws RangeError when accumulation overflows finite numbers', () => {
			assert.throws(
				() =>
					summationComplexIterative([
						{ re: Number.MAX_VALUE, im: 0 },
						{ re: Number.MAX_VALUE, im: 0 },
					]),
				RangeError
			)
			assert.throws(
				() =>
					summationComplexIterative([
						{ re: 0, im: -Number.MAX_VALUE },
						{ re: 0, im: -Number.MAX_VALUE },
					]),
				RangeError
			)
		})
	})

	describe('mathematical cross-checks', () => {
		it('matches the closed-form complex geometric series sum (1 - z^n) / (1 - z)', () => {
			const z = { re: 0.5, im: 0.5 }
			const n = 16
			const terms = Array.from({ length: n }, (_, k) => complexPow(z, k))
			const actual = summationComplexIterative(terms)

			const zn = complexPow(z, n)
			const expected = complexDiv({ re: 1 - zn.re, im: -zn.im }, { re: 1 - z.re, im: -z.im })

			assertComplexClose(actual, expected, 1e-12)
		})

		it('satisfies the Nth roots of unity identity sum_{k=0}^{N-1} exp(2*pi*i*k/N) = 0', () => {
			for (const N of [2, 5, 7, 16, 64]) {
				const roots = Array.from({ length: N }, (_, k) => {
					const angle = (2 * Math.PI * k) / N
					return { re: Math.cos(angle), im: Math.sin(angle) }
				})
				assertComplexClose(summationComplexIterative(roots), { re: 0, im: 0 }, 1e-12)
			}
		})

		it('matches closed-form arithmetic progression and conjugate/linearity identities', () => {
			const a = { re: 1.5, im: -2.25 }
			const d = { re: -0.75, im: 1.25 }
			const n = 50
			const terms = Array.from({ length: n }, (_, k) => ({
				re: a.re + k * d.re,
				im: a.im + k * d.im,
			}))

			const sum = summationComplexIterative(terms)
			const closedForm = {
				re: n * a.re + ((n * (n - 1)) / 2) * d.re,
				im: n * a.im + ((n * (n - 1)) / 2) * d.im,
			}
			assertComplexClose(sum, closedForm, 1e-11)

			// Conjugate identity: sum(conj(z_k)) === conj(sum(z_k))
			const conjSum = summationComplexIterative(terms.map((z) => ({ re: z.re, im: -z.im })))
			assertComplexClose(conjSum, { re: sum.re, im: -sum.im }, 1e-11)

			// Linearity check: sum(c * z_k) === c * sum(z_k)
			const c = { re: -2.5, im: 3.5 }
			const scaledSum = summationComplexIterative(terms.map((z) => complexMul(c, z)))
			assertComplexClose(scaledSum, complexMul(c, sum), 1e-10)
		})

		it('agrees with an independent real/imaginary reduce reference on deterministic data', () => {
			let seed = 123456789
			const next = () => {
				seed = (1664525 * seed + 1013904223) >>> 0
				return (seed / 0xffffffff) * 20 - 10
			}
			const terms = Array.from({ length: 200 }, () => ({ re: next(), im: next() }))

			const expected = {
				re: terms.map((z) => z.re).reduce((acc, x) => acc + x, 0),
				im: terms.map((z) => z.im).reduce((acc, y) => acc + y, 0),
			}
			assert.deepEqual(summationComplexIterative(terms), expected)
		})
	})
})
