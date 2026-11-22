import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductComplexIterative } from './dotProductComplexIterative.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real part mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imag part mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

function complexAdd(z, w) {
	return { re: z.re + w.re, im: z.im + w.im }
}

function complexMul(z, w) {
	return {
		re: z.re * w.re - z.im * w.im,
		im: z.re * w.im + z.im * w.re,
	}
}

function complexConj(z) {
	return {
		re: z.re === 0 ? 0 : z.re,
		im: z.im === 0 ? 0 : -z.im,
	}
}

function vecScale(alpha, v) {
	return v.map((z) => complexMul(alpha, z))
}

function vecAdd(u, v) {
	return u.map((z, k) => complexAdd(z, v[k]))
}

function normSquaredIndependent(v) {
	let total = 0
	for (const { re, im } of v) {
		total += re * re + im * im
	}
	return total
}

describe('dotProductComplexIterative', () => {
	describe('normal cases', () => {
		test('computes Hermitian dot product sum_k a[k] * conj(b[k])', () => {
			const a = [c(1, 2), c(3, 4)]
			const b = [c(5, 6), c(7, 8)]
			// k=0: (1+2i)(5-6i) = 17 + 4i
			// k=1: (3+4i)(7-8i) = 53 + 4i
			// sum = 70 + 8i
			assert.deepStrictEqual(dotProductComplexIterative(a, b), { re: 70, im: 8 })
		})

		test('conjugates the second argument', () => {
			// <1, i> = 1 * (-i) = -i
			assert.deepStrictEqual(
				dotProductComplexIterative([c(1, 0)], [c(0, 1)]),
				{ re: 0, im: -1 }
			)
			// <i, 1> = i * 1 = i
			assert.deepStrictEqual(
				dotProductComplexIterative([c(0, 1)], [c(1, 0)]),
				{ re: 0, im: 1 }
			)
		})

		test('matches standard real dot product for purely real vectors', () => {
			const a = [c(2, 0), c(-3, 0), c(4.5, 0)]
			const b = [c(5, 0), c(6, 0), c(-2, 0)]
			// 2*5 + (-3)*6 + 4.5*(-2) = 10 - 18 - 9 = -17
			assert.deepStrictEqual(dotProductComplexIterative(a, b), { re: -17, im: 0 })
		})

		test('handles purely imaginary vectors', () => {
			const a = [c(0, 2), c(0, -3)]
			const b = [c(0, 4), c(0, 5)]
			// (2i)(-4i) + (-3i)(-5i) = 8 - 15 = -7
			assert.deepStrictEqual(dotProductComplexIterative(a, b), { re: -7, im: 0 })
		})

		test('handles negative and fractional components', () => {
			const a = [c(-1.5, 0.5), c(2.25, -3.5), c(0.25, 1.25)]
			const b = [c(0.5, -2.5), c(-1.5, 0.75), c(4, -2)]
			// k=0: (-1.5*0.5 + 0.5*(-2.5)) + i*(0.5*0.5 - (-1.5)*(-2.5)) = -2 - 3.5i
			// k=1: (2.25*(-1.5) + (-3.5)*0.75) + i*((-3.5)*(-1.5) - 2.25*0.75) = -6 + 3.5625i
			// k=2: (0.25*4 + 1.25*(-2)) + i*(1.25*4 - 0.25*(-2)) = -1.5 + 5.5i
			// sum: -9.5 + 5.5625i
			assertComplexClose(dotProductComplexIterative(a, b), { re: -9.5, im: 5.5625 })
		})

		test('does not mutate input arrays or elements', () => {
			const a = [Object.freeze(c(1, -2)), Object.freeze(c(3, 4))]
			const b = [Object.freeze(c(-5, 6)), Object.freeze(c(7, -8))]
			Object.freeze(a)
			Object.freeze(b)

			const res = dotProductComplexIterative(a, b)
			assert.deepStrictEqual(res, { re: -28, im: 56 })
		})
	})

	describe('edge cases', () => {
		test('empty vectors return { re: 0, im: 0 }', () => {
			const res = dotProductComplexIterative([], [])
			assert.deepStrictEqual(res, { re: 0, im: 0 })
			assert.ok(Object.is(res.re, 0))
			assert.ok(Object.is(res.im, 0))
		})

		test('orthogonal complex vectors return { re: 0, im: 0 }', () => {
			const a1 = [c(1, 0), c(0, 1)]
			const b1 = [c(1, 0), c(0, -1)]
			assert.deepStrictEqual(dotProductComplexIterative(a1, b1), { re: 0, im: 0 })

			const a2 = [c(1, 1), c(1, -1)]
			const b2 = [c(1, -1), c(1, 1)]
			// (1+i)(1+i) + (1-i)(1-i) = 2i + (-2i) = 0
			assert.deepStrictEqual(dotProductComplexIterative(a2, b2), { re: 0, im: 0 })
		})

		test('self-dot product <a, a> is real and non-negative', () => {
			const vectors = [
				[c(0, 0), c(0, 0)],
				[c(3, -4)],
				[c(1, 2), c(-3, 4), c(5, -6)],
				[c(-0.5, 0.25), c(1.5, -2.5)],
			]

			for (const v of vectors) {
				const selfDot = dotProductComplexIterative(v, v)
				assert.ok(Object.is(selfDot.im, 0), 'imaginary part of <a, a> must be +0')
				assert.ok(selfDot.re >= 0, 'real part of <a, a> must be non-negative')
				assertComplexClose(selfDot, { re: normSquaredIndependent(v), im: 0 })
			}
		})

		test('normalizes -0 to +0 in output components', () => {
			const res = dotProductComplexIterative([c(-0, -0)], [c(1, -1)])
			assert.ok(Object.is(res.re, 0))
			assert.ok(Object.is(res.im, 0))
		})

		test('handles large vectors iteratively', () => {
			const n = 2000
			const a = Array.from({ length: n }, (_, k) => c(1, k % 2 === 0 ? 1 : -1))
			const b = Array.from({ length: n }, (_, k) => c(1, k % 2 === 0 ? 1 : -1))
			// Each term |1 ± i|^2 = 2, sum = 2*n
			assert.deepStrictEqual(dotProductComplexIterative(a, b), { re: 2 * n, im: 0 })
		})
	})

	describe('input validation', () => {
		test('throws TypeError when a or b is not an array', () => {
			const badArgs = [null, undefined, 42, 'abc', { re: 1, im: 2 }, new Float64Array([1, 2])]
			for (const bad of badArgs) {
				assert.throws(() => dotProductComplexIterative(bad, []), TypeError)
				assert.throws(() => dotProductComplexIterative([], bad), TypeError)
			}
		})

		test('throws RangeError on mismatched lengths', () => {
			assert.throws(() => dotProductComplexIterative([c(1, 0)], []), RangeError)
			assert.throws(() => dotProductComplexIterative([], [c(1, 0)]), RangeError)
			assert.throws(
				() => dotProductComplexIterative([c(1, 2)], [c(1, 2), c(3, 4)]),
				RangeError
			)
		})

		test('throws TypeError on invalid element types or missing properties', () => {
			const badElements = [
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
				{ re: 1, im: true },
			]
			for (const el of badElements) {
				assert.throws(() => dotProductComplexIterative([el], [c(1, 1)]), TypeError)
				assert.throws(() => dotProductComplexIterative([c(1, 1)], [el]), TypeError)
			}

			// Sparse array hole
			const sparse = new Array(2)
			sparse[0] = c(1, 0)
			assert.throws(() => dotProductComplexIterative(sparse, [c(1, 0), c(2, 0)]), TypeError)
		})

		test('throws RangeError on non-finite components (NaN, Infinity, -Infinity)', () => {
			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			]
			for (const el of nonFinite) {
				assert.throws(() => dotProductComplexIterative([el], [c(1, 1)]), RangeError)
				assert.throws(() => dotProductComplexIterative([c(1, 1)], [el]), RangeError)
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		const a = [c(1.5, -2.25), c(-3.1, 4.7), c(0.8, 1.9), c(-2.4, -0.6)]
		const b = [c(-0.7, 3.2), c(2.6, -1.4), c(-4.3, 0.5), c(1.1, -2.8)]
		const d = [c(2.1, 0.9), c(-1.8, -2.3), c(3.4, -1.2), c(0.5, 4.1)]

		test('conjugate symmetry: <a, b> === conj(<b, a>)', () => {
			const ab = dotProductComplexIterative(a, b)
			const ba = dotProductComplexIterative(b, a)
			assertComplexClose(ab, complexConj(ba))
		})

		test('Cauchy-Schwarz inequality: |<a, b>|^2 <= <a, a> * <b, b>', () => {
			const ab = dotProductComplexIterative(a, b)
			const aa = dotProductComplexIterative(a, a)
			const bb = dotProductComplexIterative(b, b)

			const lhs = ab.re * ab.re + ab.im * ab.im
			const rhs = aa.re * bb.re
			assert.ok(lhs <= rhs + 1e-12, `Cauchy-Schwarz violated: ${lhs} > ${rhs}`)

			// Equality case when b is a complex scalar multiple of a
			const scalar = c(-2.5, 1.75)
			const scaled = vecScale(scalar, a)
			const dotScaled = dotProductComplexIterative(a, scaled)
			const normScaled = dotProductComplexIterative(scaled, scaled)
			const lhsEq = dotScaled.re * dotScaled.re + dotScaled.im * dotScaled.im
			const rhsEq = aa.re * normScaled.re
			assert.ok(Math.abs(lhsEq - rhsEq) <= 1e-9, `Equality case mismatch: ${lhsEq} vs ${rhsEq}`)
		})

		test('sesquilinearity: linear in 1st arg, conjugate-linear in 2nd arg', () => {
			const alpha = c(2.5, -1.5)
			const beta = c(-0.75, 3.25)

			// Linearity in first argument: <alpha*a + beta*d, b> = alpha*<a, b> + beta*<d, b>
			const lhs1 = dotProductComplexIterative(
				vecAdd(vecScale(alpha, a), vecScale(beta, d)),
				b
			)
			const rhs1 = complexAdd(
				complexMul(alpha, dotProductComplexIterative(a, b)),
				complexMul(beta, dotProductComplexIterative(d, b))
			)
			assertComplexClose(lhs1, rhs1, 1e-11)

			// Conjugate-linearity in second argument: <a, alpha*b + beta*d> = conj(alpha)*<a, b> + conj(beta)*<a, d>
			const lhs2 = dotProductComplexIterative(
				a,
				vecAdd(vecScale(alpha, b), vecScale(beta, d))
			)
			const rhs2 = complexAdd(
				complexMul(complexConj(alpha), dotProductComplexIterative(a, b)),
				complexMul(complexConj(beta), dotProductComplexIterative(a, d))
			)
			assertComplexClose(lhs2, rhs2, 1e-11)
		})

		test('polarization identity cross-check using independent squared norms', () => {
			// <a, b> = (||a+b||^2 - ||a-b||^2)/4 + i*(||a+ib||^2 - ||a-ib||^2)/4
			const negB = vecScale(c(-1, 0), b)
			const iB = vecScale(c(0, 1), b)
			const negIB = vecScale(c(0, -1), b)

			const rePolar =
				(normSquaredIndependent(vecAdd(a, b)) - normSquaredIndependent(vecAdd(a, negB))) / 4
			const imPolar =
				(normSquaredIndependent(vecAdd(a, iB)) - normSquaredIndependent(vecAdd(a, negIB))) / 4

			const actual = dotProductComplexIterative(a, b)
			assertComplexClose(actual, { re: rePolar, im: imPolar }, 1e-11)
		})
	})
})
