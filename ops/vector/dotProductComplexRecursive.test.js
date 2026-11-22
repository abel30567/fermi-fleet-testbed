import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductComplexRecursive } from './dotProductComplexRecursive.js'

const c = (re, im = 0) => ({ re, im })

function cAdd(x, y) {
	return { re: x.re + y.re, im: x.im + y.im }
}

function cSub(x, y) {
	return { re: x.re - y.re, im: x.im - y.im }
}

function cMul(x, y) {
	return {
		re: x.re * y.re - x.im * y.im,
		im: x.re * y.im + x.im * y.re,
	}
}

function cConj(x) {
	return { re: x.re, im: -x.im }
}

function assertComplexClose(actual, expected, tol = 1e-12, msg = '') {
	assert.equal(typeof actual.re, 'number')
	assert.equal(typeof actual.im, 'number')
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${msg} real mismatch: got ${actual.re}, expected ${expected.re} (diff=${Math.abs(actual.re - expected.re)})`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${msg} imag mismatch: got ${actual.im}, expected ${expected.im} (diff=${Math.abs(actual.im - expected.im)})`
	)
}

/**
 * Independent iterative reference implementation.
 */
function referenceDotIterative(a, b, conjugate = true) {
	let re = 0
	let im = 0
	for (let i = 0; i < a.length; i++) {
		const term = cMul(a[i], conjugate ? cConj(b[i]) : b[i])
		re += term.re
		im += term.im
	}
	return { re, im }
}

describe('dotProductComplexRecursive', () => {
	describe('normal cases', () => {
		it('computes Hermitian dot product of 1D complex vectors', () => {
			// (1 + 2i) * conj(3 + 4i) = (1 + 2i)(3 - 4i) = 11 + 2i
			const res = dotProductComplexRecursive([c(1, 2)], [c(3, 4)])
			assert.deepEqual(res, { re: 11, im: 2 })
		})

		it('computes Hermitian dot product of multi-element complex vectors (even and odd lengths)', () => {
			const a = [c(1, 2), c(-3, 4), c(5, -1)]
			const b = [c(2, -1), c(1, 1), c(0, 3)]
			// term 0: (1+2i)(2+i) = 0 + 5i
			// term 1: (-3+4i)(1-i) = 1 + 7i
			// term 2: (5-i)(-3i) = -3 - 15i
			// sum: -2 - 3i
			const res = dotProductComplexRecursive(a, b)
			assert.deepEqual(res, { re: -2, im: -3 })

			const a4 = [c(1, 1), c(2, -3), c(-4, 0.5), c(0.25, -2)]
			const b4 = [c(-1, 2), c(0.5, 4), c(3, -1), c(2, 1)]
			assertComplexClose(dotProductComplexRecursive(a4, b4), referenceDotIterative(a4, b4, true))
		})

		it('computes bilinear (unconjugated) dot product when options.conjugate is false', () => {
			// (1 + 2i)(3 + 4i) = -5 + 10i
			const res = dotProductComplexRecursive([c(1, 2)], [c(3, 4)], { conjugate: false })
			assert.deepEqual(res, { re: -5, im: 10 })

			const a = [c(1, 2), c(-3, 4), c(5, -1)]
			const b = [c(2, -1), c(1, 1), c(0, 3)]
			// term 0: (1+2i)(2-i) = 4 + 3i
			// term 1: (-3+4i)(1+i) = -7 + i
			// term 2: (5-i)(3i) = 3 + 15i
			// sum: 0 + 19i
			const res3 = dotProductComplexRecursive(a, b, { conjugate: false })
			assert.deepEqual(res3, { re: 0, im: 19 })
		})

		it('handles orthogonal complex vectors', () => {
			// (1, i) and (i, 1): 1*conj(i) + i*conj(1) = -i + i = 0
			const res = dotProductComplexRecursive([c(1, 0), c(0, 1)], [c(0, 1), c(1, 0)])
			assert.deepEqual(res, { re: 0, im: 0 })
		})
	})

	describe('edge cases', () => {
		it('returns { re: 0, im: 0 } for empty vectors', () => {
			const res = dotProductComplexRecursive([], [])
			assert.deepEqual(res, { re: 0, im: 0 })
			assert.ok(Object.is(res.re, 0))
			assert.ok(Object.is(res.im, 0))
		})

		it('handles zero vectors and normalizes -0 to +0', () => {
			const a = [c(-0, -0), c(0, -0)]
			const b = [c(1, -1), c(-2, 3)]
			const res = dotProductComplexRecursive(a, b)
			assert.ok(Object.is(res.re, 0), 're should be +0, not -0')
			assert.ok(Object.is(res.im, 0), 'im should be +0, not -0')

			const resBilinear = dotProductComplexRecursive([c(-0, 0)], [c(1, 0)], { conjugate: false })
			assert.ok(Object.is(resBilinear.re, 0))
			assert.ok(Object.is(resBilinear.im, 0))
		})

		it('handles pure real vectors identically in Hermitian and bilinear modes', () => {
			const a = [c(2, 0), c(-3, 0), c(4.5, 0)]
			const b = [c(-1, 0), c(5, 0), c(2, 0)]
			// -2 - 15 + 9 = -8
			assert.deepEqual(dotProductComplexRecursive(a, b), { re: -8, im: 0 })
			assert.deepEqual(dotProductComplexRecursive(a, b, { conjugate: false }), { re: -8, im: 0 })
		})

		it('handles pure imaginary vectors correctly in both modes', () => {
			const a = [c(0, 2), c(0, -3)]
			const b = [c(0, 4), c(0, 5)]
			// Hermitian: (2i)(-4i) + (-3i)(-5i) = 8 - 15 = -7
			assert.deepEqual(dotProductComplexRecursive(a, b), { re: -7, im: 0 })
			// Bilinear: (2i)(4i) + (-3i)(5i) = -8 + 15 = 7
			assert.deepEqual(dotProductComplexRecursive(a, b, { conjugate: false }), { re: 7, im: 0 })
		})

		it('handles large vectors without stack overflow', () => {
			const n = 20000
			const a = Array.from({ length: n }, () => c(1, -1))
			const b = Array.from({ length: n }, () => c(1, -1))
			// Each term is |1 - i|^2 = 2, total = 40000
			const res = dotProductComplexRecursive(a, b)
			assert.deepEqual(res, { re: 40000, im: 0 })
		})

		it('preserves precision under severe cancellation via compensated pairwise summation', () => {
			// Naive left-to-right summation computes 1e16 + 1 = 1e16 and loses all 1000 ones, yielding 0.
			const a = [c(1e16, 1e16)]
			const b = [c(1, 0)]
			for (let i = 0; i < 1000; i++) {
				a.push(c(1, 1))
				b.push(c(1, 0))
			}
			a.push(c(-1e16, -1e16))
			b.push(c(1, 0))

			const res = dotProductComplexRecursive(a, b)
			assert.deepEqual(res, { re: 1000, im: 1000 })
		})
	})

	describe('input validation and error handling', () => {
		it('throws TypeError when a or b is not an Array', () => {
			assert.throws(() => dotProductComplexRecursive(null, []), TypeError)
			assert.throws(() => dotProductComplexRecursive([], 'not-an-array'), TypeError)
			assert.throws(() => dotProductComplexRecursive({ length: 0 }, []), TypeError)
			assert.throws(() => dotProductComplexRecursive(undefined, []), TypeError)
		})

		it('throws TypeError for invalid options', () => {
			assert.throws(() => dotProductComplexRecursive([], [], null), TypeError)
			assert.throws(() => dotProductComplexRecursive([], [], []), TypeError)
			assert.throws(() => dotProductComplexRecursive([], [], true), TypeError)
			assert.throws(() => dotProductComplexRecursive([], [], { conjugate: 'yes' }), TypeError)
			assert.throws(() => dotProductComplexRecursive([], [], { conjugate: 1 }), TypeError)
		})

		it('throws RangeError on vector dimension mismatch', () => {
			assert.throws(() => dotProductComplexRecursive([c(1, 0)], []), RangeError)
			assert.throws(() => dotProductComplexRecursive([c(1, 0)], [c(1, 0), c(2, 0)]), RangeError)
		})

		it('throws TypeError on malformed complex elements or sparse arrays', () => {
			assert.throws(() => dotProductComplexRecursive([null], [c(1, 0)]), TypeError)
			assert.throws(() => dotProductComplexRecursive([c(1, 0)], [undefined]), TypeError)
			assert.throws(() => dotProductComplexRecursive([42], [c(1, 0)]), TypeError)
			assert.throws(() => dotProductComplexRecursive([[1, 2]], [c(1, 0)]), TypeError)
			assert.throws(() => dotProductComplexRecursive([{ re: 1 }], [c(1, 0)]), TypeError)
			assert.throws(() => dotProductComplexRecursive([{ re: '1', im: 0 }], [c(1, 0)]), TypeError)

			const sparse = new Array(2)
			sparse[0] = c(1, 0)
			assert.throws(() => dotProductComplexRecursive(sparse, [c(1, 0), c(2, 0)]), TypeError)
		})

		it('throws RangeError on non-finite components (NaN, Infinity, -Infinity)', () => {
			assert.throws(() => dotProductComplexRecursive([c(NaN, 0)], [c(1, 0)]), RangeError)
			assert.throws(() => dotProductComplexRecursive([c(1, 0)], [c(0, Infinity)]), RangeError)
			assert.throws(() => dotProductComplexRecursive([c(-Infinity, 0)], [c(1, 0)]), RangeError)
		})

		it('throws RangeError on floating-point overflow', () => {
			assert.throws(
				() => dotProductComplexRecursive([c(1e200, 0)], [c(1e200, 0)]),
				RangeError
			)
			assert.throws(
				() => dotProductComplexRecursive([c(1e308, 0), c(1e308, 0)], [c(1, 0), c(1, 0)]),
				RangeError
			)
		})
	})

	describe('cross-checks and algebraic identities', () => {
		function makeDeterministicVector(n, seed) {
			let s = seed >>> 0
			const next = () => {
				s = (Math.imul(1664525, s) + 1013904223) >>> 0
				return (s / 0xffffffff) * 20 - 10
			}
			return Array.from({ length: n }, () => c(next(), next()))
		}

		it('matches independent iterative reference across multiple sizes and both conventions', () => {
			for (const n of [1, 2, 3, 7, 16, 31, 64, 127]) {
				const a = makeDeterministicVector(n, 100 + n)
				const b = makeDeterministicVector(n, 200 + n)

				assertComplexClose(
					dotProductComplexRecursive(a, b),
					referenceDotIterative(a, b, true),
					1e-10,
					`Hermitian n=${n}`
				)
				assertComplexClose(
					dotProductComplexRecursive(a, b, { conjugate: false }),
					referenceDotIterative(a, b, false),
					1e-10,
					`Bilinear n=${n}`
				)
			}
		})

		it('satisfies Hermitian conjugate symmetry, sesquilinearity, polarization identity, and Cauchy-Schwarz', () => {
			const a = makeDeterministicVector(17, 42)
			const b = makeDeterministicVector(17, 99)
			const d = makeDeterministicVector(17, 137)
			const alpha = c(2.5, -1.75)
			const beta = c(-0.5, 3.25)

			// 1. Conjugate symmetry: <a, b> = conj(<b, a>)
			const ab = dotProductComplexRecursive(a, b)
			const ba = dotProductComplexRecursive(b, a)
			assertComplexClose(ab, cConj(ba), 1e-11, 'conjugate symmetry')

			// 2. Linearity in first argument: <alpha*a + beta*d, b> = alpha*<a,b> + beta*<d,b>
			const linFirstVec = a.map((ai, i) => cAdd(cMul(alpha, ai), cMul(beta, d[i])))
			const lhsFirst = dotProductComplexRecursive(linFirstVec, b)
			const rhsFirst = cAdd(
				cMul(alpha, ab),
				cMul(beta, dotProductComplexRecursive(d, b))
			)
			assertComplexClose(lhsFirst, rhsFirst, 1e-10, 'linearity in 1st arg')

			// 3. Conjugate-linearity in second argument: <a, alpha*b + beta*d> = conj(alpha)*<a,b> + conj(beta)*<a,d>
			const linSecondVec = b.map((bi, i) => cAdd(cMul(alpha, bi), cMul(beta, d[i])))
			const lhsSecond = dotProductComplexRecursive(a, linSecondVec)
			const rhsSecond = cAdd(
				cMul(cConj(alpha), ab),
				cMul(cConj(beta), dotProductComplexRecursive(a, d))
			)
			assertComplexClose(lhsSecond, rhsSecond, 1e-10, 'conjugate-linearity in 2nd arg')

			// 4. Polarization identity (independent norm-based computation):
			// <a, b> = 1/4 * (||a+b||^2 - ||a-b||^2 + i*||a+ib||^2 - i*||a-ib||^2)
			const normSq = (v) => v.reduce((acc, z) => acc + z.re * z.re + z.im * z.im, 0)
			const aPlusB = a.map((ai, i) => cAdd(ai, b[i]))
			const aMinusB = a.map((ai, i) => cSub(ai, b[i]))
			const iUnit = c(0, 1)
			const aPlusIB = a.map((ai, i) => cAdd(ai, cMul(iUnit, b[i])))
			const aMinusIB = a.map((ai, i) => cSub(ai, cMul(iUnit, b[i])))

			const polarized = {
				re: 0.25 * (normSq(aPlusB) - normSq(aMinusB)),
				im: 0.25 * (normSq(aPlusIB) - normSq(aMinusIB)),
			}
			assertComplexClose(ab, polarized, 1e-10, 'polarization identity')

			// 5. Positive-definiteness & Cauchy-Schwarz: |<a, b>|^2 <= <a, a> * <b, b>
			const aa = dotProductComplexRecursive(a, a)
			const bb = dotProductComplexRecursive(b, b)
			assert.ok(aa.re > 0 && Math.abs(aa.im) <= 1e-12)
			assert.ok(bb.re > 0 && Math.abs(bb.im) <= 1e-12)
			const abModSq = ab.re * ab.re + ab.im * ab.im
			assert.ok(abModSq <= aa.re * bb.re + 1e-9, 'Cauchy-Schwarz inequality')
		})

		it('verifies DFT basis orthogonality using N-th roots of unity', () => {
			const N = 16
			const dftBasis = (k) =>
				Array.from({ length: N }, (_, n) => {
					const angle = (2 * Math.PI * k * n) / N
					return c(Math.cos(angle), Math.sin(angle))
				})

			for (let k = 0; k < 4; k++) {
				for (let m = 0; m < 4; m++) {
					const dot = dotProductComplexRecursive(dftBasis(k), dftBasis(m))
					const expected = k === m ? c(N, 0) : c(0, 0)
					assertComplexClose(dot, expected, 1e-12, `DFT basis (${k}, ${m})`)
				}
			}
		})
	})
})
