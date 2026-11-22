import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductComplexRecursive } from './crossProductComplexRecursive.js'

const c = (re, im = 0) => ({ re, im })

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function cSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
}

function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function cConj(a) {
	return { re: a.re, im: -a.im }
}

function cNeg(a) {
	return { re: -a.re, im: -a.im }
}

function vAdd(u, v) {
	return u.map((ui, i) => cAdd(ui, v[i]))
}

function vScale(alpha, u) {
	return u.map((ui) => cMul(alpha, ui))
}

function bilinearDot(u, v) {
	let acc = c(0, 0)
	for (let i = 0; i < 3; i++) {
		acc = cAdd(acc, cMul(u[i], v[i]))
	}
	return acc
}

function hermitianInner(u, v) {
	let acc = c(0, 0)
	for (let i = 0; i < 3; i++) {
		acc = cAdd(acc, cMul(cConj(u[i]), v[i]))
	}
	return acc
}

// Independent direct formula (no recursion, no cofactor expansion)
function directCrossProduct(u, v) {
	return [
		cSub(cMul(u[1], v[2]), cMul(u[2], v[1])),
		cSub(cMul(u[2], v[0]), cMul(u[0], v[2])),
		cSub(cMul(u[0], v[1]), cMul(u[1], v[0])),
	]
}

// Independent Sarrus' rule 3x3 determinant for scalar triple product cross-check
function det3x3Sarrus(u, v, w) {
	const pos = cAdd(
		cAdd(
			cMul(cMul(u[0], v[1]), w[2]),
			cMul(cMul(u[1], v[2]), w[0])
		),
		cMul(cMul(u[2], v[0]), w[1])
	)
	const neg = cAdd(
		cAdd(
			cMul(cMul(u[2], v[1]), w[0]),
			cMul(cMul(u[0], v[2]), w[1])
		),
		cMul(cMul(u[1], v[0]), w[2])
	)
	return cSub(pos, neg)
}

function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	assert.equal(typeof actual.re, 'number', `${label} re must be number`)
	assert.equal(typeof actual.im, 'number', `${label} im must be number`)
	assert.equal(Object.is(actual.re, -0), false, `${label} re must not be -0`)
	assert.equal(Object.is(actual.im, -0), false, `${label} im must not be -0`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${label} re mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${label} im mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

function assertVectorClose(actual, expected, tol = 1e-12, label = '') {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assertComplexClose(actual[i], expected[i], tol, `${label}[${i}]`)
	}
}

describe('crossProductComplexRecursive', () => {
	describe('normal cases', () => {
		it('computes standard basis vector cross products', () => {
			const e0 = [c(1), c(0), c(0)]
			const e1 = [c(0), c(1), c(0)]
			const e2 = [c(0), c(0), c(1)]

			assertVectorClose(crossProductComplexRecursive(e0, e1), e2, 0, 'e0 x e1')
			assertVectorClose(crossProductComplexRecursive(e1, e2), e0, 0, 'e1 x e2')
			assertVectorClose(crossProductComplexRecursive(e2, e0), e1, 0, 'e2 x e0')

			assertVectorClose(
				crossProductComplexRecursive(e1, e0),
				[c(0), c(0), c(-1)],
				0,
				'e1 x e0'
			)
		})

		it('computes cross product of pure real vectors', () => {
			const u = [c(1), c(2), c(3)]
			const v = [c(4), c(5), c(6)]
			const res = crossProductComplexRecursive(u, v)
			assertVectorClose(res, [c(-3), c(6), c(-3)], 0)
		})

		it('computes cross product of pure imaginary vectors', () => {
			const u = [c(0, 1), c(0, 0), c(0, 0)]
			const v = [c(0, 0), c(0, 1), c(0, 0)]
			// (i, 0, 0) x (0, i, 0) = (0, 0, i*i) = (0, 0, -1)
			assertVectorClose(
				crossProductComplexRecursive(u, v),
				[c(0), c(0), c(-1)],
				0
			)

			const u2 = [c(0, 2), c(0, -3), c(0, 4)]
			const v2 = [c(0, 5), c(0, 6), c(0, -7)]
			// (-3i)(-7i) - (4i)(6i) = -21 - (-24) = 3
			// (4i)(5i) - (2i)(-7i) = -20 - 14 = -34
			// (2i)(6i) - (-3i)(5i) = -12 - 15 = -27
			assertVectorClose(
				crossProductComplexRecursive(u2, v2),
				[c(3, 0), c(-34, 0), c(-27, 0)],
				0
			)
		})

		it('computes cross product of general complex vectors with nonzero real and imaginary parts', () => {
			const u = [c(1, 2), c(3, -1), c(-2, 4)]
			const v = [c(2, -3), c(-1, 5), c(4, 1)]
			// Hand calculation:
			// c0 = (3 - i)(4 + i) - (-2 + 4i)(-1 + 5i)
			//    = (12 + 3i - 4i + 1) - (2 - 10i - 4i - 20)
			//    = (13 - i) - (-18 - 14i) = 31 + 13i
			// c1 = (-2 + 4i)(2 - 3i) - (1 + 2i)(4 + i)
			//    = (-4 + 6i + 8i + 12) - (4 + i + 8i - 2)
			//    = (8 + 14i) - (2 + 9i) = 6 + 5i
			// c2 = (1 + 2i)(-1 + 5i) - (3 - i)(2 - 3i)
			//    = (-1 + 5i - 2i - 10) - (6 - 9i - 2i - 3)
			//    = (-11 + 3i) - (3 - 11i) = -14 + 14i
			const expected = [c(31, 13), c(6, 5), c(-14, 14)]
			const res = crossProductComplexRecursive(u, v)
			assertVectorClose(res, expected, 0)
		})

		it('does not mutate input vectors or complex elements', () => {
			const u = [c(1, -2), c(3, 4), c(-5, 6)]
			const v = [c(-7, 8), c(9, -10), c(11, 12)]
			const uCopy = structuredClone(u)
			const vCopy = structuredClone(v)

			const res = crossProductComplexRecursive(u, v)
			assert.deepEqual(u, uCopy)
			assert.deepEqual(v, vCopy)
			assert.notEqual(res, u)
			assert.notEqual(res, v)
		})
	})

	describe('edge cases', () => {
		it('handles zero vectors', () => {
			const zero = [c(0, 0), c(0, 0), c(0, 0)]
			const v = [c(1, -2), c(3.5, 4.25), c(-5, 0.5)]

			assertVectorClose(crossProductComplexRecursive(zero, v), zero, 0)
			assertVectorClose(crossProductComplexRecursive(v, zero), zero, 0)
			assertVectorClose(crossProductComplexRecursive(zero, zero), zero, 0)
		})

		it('returns zero for self-cross and complex-collinear vectors', () => {
			const u = [c(2, -3), c(-1.5, 4), c(0.5, 2.5)]
			const zero = [c(0, 0), c(0, 0), c(0, 0)]

			assertVectorClose(crossProductComplexRecursive(u, u), zero, 1e-13)

			const alpha = c(-3, 2)
			const scaled = vScale(alpha, u)
			assertVectorClose(crossProductComplexRecursive(u, scaled), zero, 1e-12)
		})

		it('normalizes -0 to +0 in all output components', () => {
			const u = [c(-0, -0), c(-0, 1), c(0, -0)]
			const v = [c(0, -0), c(-0, -0), c(-0, 0)]
			const res = crossProductComplexRecursive(u, v)

			for (let i = 0; i < 3; i++) {
				assert.equal(Object.is(res[i].re, -0), false)
				assert.equal(Object.is(res[i].im, -0), false)
				assert.equal(res[i].re, 0)
				assert.equal(res[i].im, 0)
			}

			// Also check cancellation producing -0 in arithmetic
			const a = [c(-1, 0), c(0, 0), c(0, 0)]
			const b = [c(0, 0), c(0, 0), c(0, 0)]
			const res2 = crossProductComplexRecursive(a, b)
			for (const z of res2) {
				assert.equal(Object.is(z.re, -0), false)
				assert.equal(Object.is(z.im, -0), false)
			}
		})

		it('handles extreme magnitudes without spurious overflow or underflow', () => {
			// Parallel huge vectors: naive calculation gives Inf - Inf = NaN
			const huge = [c(1e200, 1e200), c(1e200, -1e200), c(0, 0)]
			const resParallel = crossProductComplexRecursive(huge, huge)
			assertVectorClose(resParallel, [c(0), c(0), c(0)], 0, 'huge parallel')

			// Complementary huge and tiny vectors: 1e200 * 1e-200 = 1
			const uTiny = [c(1e-200, 0), c(0, 0), c(0, 0)]
			const vHuge = [c(0, 0), c(0, 1e200), c(0, 0)]
			const resComp = crossProductComplexRecursive(uTiny, vHuge)
			assertVectorClose(resComp, [c(0), c(0), c(0, 1)], 1e-15, 'tiny x huge')

			// Mixed dynamic range within a single vector
			const uMixed = [c(1e200, 0), c(1e-200, 0), c(0, 0)]
			const vZ = [c(0, 0), c(0, 0), c(1e200, 0)]
			// c0 = u1 * v2 = 1e-200 * 1e200 = 1
			const resMixed = crossProductComplexRecursive(uMixed, vZ)
			assertComplexClose(resMixed[0], c(1, 0), 1e-15, 'mixed[0]')
			assertComplexClose(resMixed[2], c(0, 0), 0, 'mixed[2]')

			// Subnormal tiny vector crossed with huge vector
			const uSub = [c(1e-320, 0), c(0, 0), c(0, 0)]
			const vLarge = [c(0, 0), c(1e300, 0), c(0, 0)]
			const resSub = crossProductComplexRecursive(uSub, vLarge)
			assertComplexClose(resSub[2], c(1e-20, 0), 1e-23, 'subnormal x large')
		})
	})

	describe('input validation', () => {
		const validVec = [c(1, 0), c(0, 1), c(0, 0)]

		it('throws TypeError when u or v is not an array', () => {
			for (const bad of [null, undefined, 42, '123', { length: 3 }, new Float64Array(3)]) {
				assert.throws(() => crossProductComplexRecursive(bad, validVec), TypeError)
				assert.throws(() => crossProductComplexRecursive(validVec, bad), TypeError)
			}
		})

		it('throws RangeError when u or v does not have length 3', () => {
			for (const bad of [[], [c(1)], [c(1), c(2)], [c(1), c(2), c(3), c(4)]]) {
				assert.throws(() => crossProductComplexRecursive(bad, validVec), RangeError)
				assert.throws(() => crossProductComplexRecursive(validVec, bad), RangeError)
			}
		})

		it('throws TypeError for invalid complex element structures', () => {
			const invalidElements = [
				null,
				undefined,
				5,
				'1+2i',
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: null },
			]
			for (const badEl of invalidElements) {
				assert.throws(
					() => crossProductComplexRecursive([badEl, c(0), c(0)], validVec),
					TypeError
				)
				assert.throws(
					() => crossProductComplexRecursive(validVec, [c(0), badEl, c(0)]),
					TypeError
				)
			}
			// Sparse array
			assert.throws(
				() => crossProductComplexRecursive(new Array(3), validVec),
				TypeError
			)
		})

		it('throws RangeError for non-finite re or im values', () => {
			const nonFinite = [NaN, Infinity, -Infinity]
			for (const val of nonFinite) {
				assert.throws(
					() => crossProductComplexRecursive([c(val, 0), c(0), c(0)], validVec),
					RangeError
				)
				assert.throws(
					() => crossProductComplexRecursive([c(0, val), c(0), c(0)], validVec),
					RangeError
				)
				assert.throws(
					() => crossProductComplexRecursive(validVec, [c(0), c(0), c(val, 1)]),
					RangeError
				)
				assert.throws(
					() => crossProductComplexRecursive(validVec, [c(0), c(0), c(1, val)]),
					RangeError
				)
			}
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		// Deterministic LCG for reproducible complex test vectors
		function makePrng(seed) {
			let state = seed >>> 0
			return () => {
				state = (1664525 * state + 1013904223) >>> 0
				return (state / 0xffffffff) * 10 - 5
			}
		}

		function randomVec(next) {
			return [
				c(next(), next()),
				c(next(), next()),
				c(next(), next()),
			]
		}

		it('matches independent direct algebraic formula across 50 complex vector pairs', () => {
			const next = makePrng(20261122)
			for (let trial = 0; trial < 50; trial++) {
				const u = randomVec(next)
				const v = randomVec(next)
				const actual = crossProductComplexRecursive(u, v)
				const expected = directCrossProduct(u, v)
				assertVectorClose(actual, expected, 1e-11, `trial ${trial}`)
			}
		})

		it('satisfies anti-commutativity: u × v = -(v × u)', () => {
			const next = makePrng(101)
			for (let i = 0; i < 15; i++) {
				const u = randomVec(next)
				const v = randomVec(next)
				const uv = crossProductComplexRecursive(u, v)
				const vu = crossProductComplexRecursive(v, u)
				const negVu = vu.map(cNeg)
				assertVectorClose(uv, negVu, 1e-11, `anti-comm ${i}`)
			}
		})

		it('satisfies complex bilinearity in both arguments', () => {
			const next = makePrng(202)
			const u = randomVec(next)
			const v = randomVec(next)
			const w = randomVec(next)
			const alpha = c(next(), next())
			const beta = c(next(), next())

			// (alpha*u + beta*w) x v = alpha*(u x v) + beta*(w x v)
			const lhs1 = crossProductComplexRecursive(
				vAdd(vScale(alpha, u), vScale(beta, w)),
				v
			)
			const rhs1 = vAdd(
				vScale(alpha, crossProductComplexRecursive(u, v)),
				vScale(beta, crossProductComplexRecursive(w, v))
			)
			assertVectorClose(lhs1, rhs1, 1e-10, 'left linearity')

			// u x (alpha*v + beta*w) = alpha*(u x v) + beta*(u x w)
			const lhs2 = crossProductComplexRecursive(
				u,
				vAdd(vScale(alpha, v), vScale(beta, w))
			)
			const rhs2 = vAdd(
				vScale(alpha, crossProductComplexRecursive(u, v)),
				vScale(beta, crossProductComplexRecursive(u, w))
			)
			assertVectorClose(lhs2, rhs2, 1e-10, 'right linearity')
		})

		it('satisfies bilinear orthogonality and conjugated Hermitian orthogonality', () => {
			const next = makePrng(303)
			for (let i = 0; i < 15; i++) {
				const u = randomVec(next)
				const v = randomVec(next)
				const w = crossProductComplexRecursive(u, v)

				assertComplexClose(bilinearDot(w, u), c(0, 0), 1e-10, `w·u ${i}`)
				assertComplexClose(bilinearDot(w, v), c(0, 0), 1e-10, `w·v ${i}`)

				// Under Hermitian inner product <a, b> = sum(conj(a_k) * b_k),
				// <u, conj(u x v)> = conj((u x v) · u) = 0
				const wConj = w.map(cConj)
				assertComplexClose(hermitianInner(u, wConj), c(0, 0), 1e-10, `<u, conj(w)> ${i}`)
				assertComplexClose(hermitianInner(v, wConj), c(0, 0), 1e-10, `<v, conj(w)> ${i}`)
			}
		})

		it('satisfies Jacobi identity and BAC-CAB vector triple product identity', () => {
			const next = makePrng(404)
			for (let i = 0; i < 10; i++) {
				const u = randomVec(next)
				const v = randomVec(next)
				const w = randomVec(next)

				const u_vw = crossProductComplexRecursive(u, crossProductComplexRecursive(v, w))
				const v_wu = crossProductComplexRecursive(v, crossProductComplexRecursive(w, u))
				const w_uv = crossProductComplexRecursive(w, crossProductComplexRecursive(u, v))

				// Jacobi: u x (v x w) + v x (w x u) + w x (u x v) = 0
				const jacobi = vAdd(vAdd(u_vw, v_wu), w_uv)
				assertVectorClose(jacobi, [c(0), c(0), c(0)], 1e-9, `jacobi ${i}`)

				// BAC-CAB: u x (v x w) = (u · w) v - (u · v) w
				const uw = bilinearDot(u, w)
				const uv = bilinearDot(u, v)
				const bacCab = vAdd(vScale(uw, v), vScale(cNeg(uv), w))
				assertVectorClose(u_vw, bacCab, 1e-9, `BAC-CAB ${i}`)
			}
		})

		it('satisfies scalar triple product equality with independent Sarrus 3x3 determinant', () => {
			const next = makePrng(505)
			for (let i = 0; i < 10; i++) {
				const u = randomVec(next)
				const v = randomVec(next)
				const w = randomVec(next)

				const detRef = det3x3Sarrus(u, v, w)
				const stp1 = bilinearDot(u, crossProductComplexRecursive(v, w))
				const stp2 = bilinearDot(v, crossProductComplexRecursive(w, u))
				const stp3 = bilinearDot(w, crossProductComplexRecursive(u, v))

				assertComplexClose(stp1, detRef, 1e-9, `stp1 ${i}`)
				assertComplexClose(stp2, detRef, 1e-9, `stp2 ${i}`)
				assertComplexClose(stp3, detRef, 1e-9, `stp3 ${i}`)
			}
		})
	})
})
