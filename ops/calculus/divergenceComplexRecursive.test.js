import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divergenceComplexRecursive } from './divergenceComplexRecursive.js'

// Complex arithmetic helpers for test expressions
const c = (re, im = 0) => ({ re, im })
const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im })
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re,
})
const cPow2 = (z) => cMul(z, z)
const cPow3 = (z) => cMul(cPow2(z), z)
const cConj = (z) => ({ re: z.re, im: -z.im })
const cExp = (z) => {
	const r = Math.exp(z.re)
	return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
}
const cSin = (z) => ({
	re: Math.sin(z.re) * Math.cosh(z.im),
	im: Math.cos(z.re) * Math.sinh(z.im),
})
const cCos = (z) => ({
	re: Math.cos(z.re) * Math.cosh(z.im),
	im: -Math.sin(z.re) * Math.sinh(z.im),
})

function assertComplexClose(actual, expected, tol = 1e-8, message = '') {
	assert.equal(typeof actual, 'object')
	assert.notEqual(actual, null)
	assert.ok(!Object.is(actual.re, -0), `actual.re must not be -0 ${message}`)
	assert.ok(!Object.is(actual.im, -0), `actual.im must not be -0 ${message}`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`real mismatch: got ${actual.re}, expected ${expected.re} (tol ${tol}) ${message}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`imag mismatch: got ${actual.im}, expected ${expected.im} (tol ${tol}) ${message}`
	)
}

describe('divergenceComplexRecursive', () => {
	describe('normal cases', () => {
		test('constant complex vector field has zero divergence without -0', () => {
			const field = () => [c(3, -4), c(-1.5, 2.5), c(0, 7)]
			const point = [c(1, 2), c(-3, 0.5), c(4, -1)]
			const result = divergenceComplexRecursive(field, point)
			assert.deepEqual(result, { re: 0, im: 0 })
			assert.ok(!Object.is(result.re, -0))
			assert.ok(!Object.is(result.im, -0))
		})

		test('identity complex vector field F(z) = z in C^n has divergence n', () => {
			const field = (p) => p.map((z) => ({ re: z.re, im: z.im }))
			const point = [c(1, -2), c(0.5, 3), c(-4, 1.25), c(2, 2)]
			const result = divergenceComplexRecursive(field, point)
			assertComplexClose(result, c(4, 0), 1e-10)
		})

		test('complex-scaled identity field F(z) = alpha * z has divergence n * alpha', () => {
			const alpha = c(2.5, -1.75)
			const field = (p) => p.map((z) => cMul(alpha, z))
			const point = [c(1, 1), c(-2, 3), c(0, -5)]
			const result = divergenceComplexRecursive(field, point)
			assertComplexClose(result, c(7.5, -5.25), 1e-10)
		})

		test('polynomial holomorphic vector field in C^3 matches analytical divergence', () => {
			// F(z0, z1, z2) = (z0^2 * z1, z1^3 - (1+2i)*z0, z0 * z2^2)
			// div F = 2*z0*z1 + 3*z1^2 + 2*z0*z2
			const field = ([z0, z1, z2]) => [
				cMul(cPow2(z0), z1),
				cSub(cPow3(z1), cMul(c(1, 2), z0)),
				cMul(z0, cPow2(z2)),
			]
			const point = [c(1.2, -0.7), c(-0.5, 1.4), c(0.8, 0.9)]
			const [z0, z1, z2] = point
			const expected = cAdd(
				cAdd(cMul(c(2), cMul(z0, z1)), cMul(c(3), cPow2(z1))),
				cMul(c(2), cMul(z0, z2))
			)
			const result = divergenceComplexRecursive(field, point)
			assertComplexClose(result, expected, 1e-9)
		})

		test('transcendental holomorphic vector field in C^3 matches analytical divergence', () => {
			// F(z0, z1, z2) = (exp(z0)*z1, sin(z1) + z2, cos(z2))
			// div F = exp(z0)*z1 + cos(z1) - sin(z2)
			const field = ([z0, z1, z2]) => [
				cMul(cExp(z0), z1),
				cAdd(cSin(z1), z2),
				cCos(z2),
			]
			const point = [c(0.4, 0.6), c(-0.3, 0.5), c(0.7, -0.2)]
			const [z0, z1, z2] = point
			const expected = cSub(cAdd(cMul(cExp(z0), z1), cCos(z1)), cSin(z2))
			const result = divergenceComplexRecursive(field, point)
			assertComplexClose(result, expected, 1e-9)
		})

		test('solenoidal (divergence-free) holomorphic vector field gives zero', () => {
			// F(z0, z1) = (exp(z0) * sin(z1), exp(z0) * cos(z1))
			// dF0/dz0 = exp(z0) * sin(z1), dF1/dz1 = -exp(z0) * sin(z1) => sum = 0
			const field = ([z0, z1]) => [
				cMul(cExp(z0), cSin(z1)),
				cMul(cExp(z0), cCos(z1)),
			]
			const point = [c(0.5, -1.1), c(0.8, 0.4)]
			const result = divergenceComplexRecursive(field, point)
			assertComplexClose(result, c(0, 0), 1e-9)
		})

		test('Wirtinger divergence of anti-holomorphic conjugate field F(z) = conj(z) is zero', () => {
			// d(conj(z))/dz = 0
			const field = (p) => p.map(cConj)
			const point = [c(3.1, -2.2), c(-1.4, 5.6)]
			const result = divergenceComplexRecursive(field, point)
			assertComplexClose(result, c(0, 0), 1e-10)
		})

		test('Wirtinger divergence of non-holomorphic |z|^2 field equals sum of conj(z_i)', () => {
			// F_i(z) = |z_i|^2 = z_i * conj(z_i), dF_i/dz_i = conj(z_i)
			const field = (p) => p.map((z) => c(z.re * z.re + z.im * z.im, 0))
			const point = [c(1.5, -2.5), c(-0.75, 4.25), c(2, 1)]
			const expected = point.map(cConj).reduce(cAdd, c(0, 0))
			const result = divergenceComplexRecursive(field, point)
			assertComplexClose(result, expected, 1e-9)
		})

		test('accepts custom step size h', () => {
			const field = ([z0, z1]) => [cPow3(z0), cPow2(z1)]
			const point = [c(2, -1), c(-3, 2)]
			const expected = cAdd(cMul(c(3), cPow2(point[0])), cMul(c(2), point[1]))
			assertComplexClose(divergenceComplexRecursive(field, point, 1e-4), expected, 1e-10)
			assertComplexClose(divergenceComplexRecursive(field, point, 1e-6), expected, 1e-8)
		})

		test('does not mutate caller point and tolerates a field that mutates its input', () => {
			const point = [c(1, 2), c(3, -4)]
			const snapshot = JSON.stringify(point)
			const mutatingField = (p) => {
				const out = [cPow2(p[0]), cMul(c(0, 2), p[1])]
				p[0].re = 9999
				p[1] = c(-9999, -9999)
				return out
			}
			const result = divergenceComplexRecursive(mutatingField, point)
			assert.equal(JSON.stringify(point), snapshot)
			// d(z0^2)/dz0 + d(2i*z1)/dz1 = 2*(1+2i) + 2i = 2 + 6i
			assertComplexClose(result, c(2, 6), 1e-9)
		})
	})

	describe('edge cases', () => {
		test('empty point array (0D space) returns { re: 0, im: 0 }', () => {
			const field = () => []
			const result = divergenceComplexRecursive(field, [])
			assert.deepEqual(result, { re: 0, im: 0 })
			assert.ok(!Object.is(result.re, -0))
			assert.ok(!Object.is(result.im, -0))
		})

		test('single component (1D) field F([z]) = [z^3] matches 3*z^2', () => {
			const field = ([z]) => [cPow3(z)]
			const z = c(-1.5, 2.25)
			const expected = cMul(c(3), cPow2(z))
			const result = divergenceComplexRecursive(field, [z])
			assertComplexClose(result, expected, 1e-9)
		})

		test('handles -0 coordinates and cancelling terms without returning -0', () => {
			const field = ([z0, z1]) => [z0, cMul(c(-1, 0), z1)]
			const result = divergenceComplexRecursive(field, [c(-0, -0), c(-0, -0)])
			assert.deepEqual(result, { re: 0, im: 0 })
			assert.ok(!Object.is(result.re, -0))
			assert.ok(!Object.is(result.im, -0))
		})

		test('handles odd and even dimensions cleanly across recursive splits', () => {
			for (const dim of [1, 2, 3, 5, 7, 8]) {
				const field = (p) => p.map((z, k) => cMul(c(k + 1, -(k + 1)), z))
				const point = Array.from({ length: dim }, (_, k) => c(k * 0.5, -k * 0.25))
				const tri = (dim * (dim + 1)) / 2
				const result = divergenceComplexRecursive(field, point)
				assertComplexClose(result, c(tri, -tri), 1e-9, `dim=${dim}`)
			}
		})
	})

	describe('input validation', () => {
		test('throws TypeError when field is not a function', () => {
			for (const badField of [null, undefined, 42, 'fn', {}, []]) {
				assert.throws(
					() => divergenceComplexRecursive(badField, [c(1, 0)]),
					TypeError
				)
			}
		})

		test('throws TypeError when point is not an array', () => {
			const field = (p) => p
			for (const badPoint of [null, undefined, 123, 'abc', { re: 1, im: 2 }]) {
				assert.throws(
					() => divergenceComplexRecursive(field, badPoint),
					TypeError
				)
			}
		})

		test('throws TypeError when point contains invalid complex objects or sparse holes', () => {
			const field = (p) => p
			assert.throws(() => divergenceComplexRecursive(field, [null]), TypeError)
			assert.throws(() => divergenceComplexRecursive(field, [42]), TypeError)
			assert.throws(() => divergenceComplexRecursive(field, [[1, 2]]), TypeError)
			assert.throws(() => divergenceComplexRecursive(field, [{ re: 1 }]), TypeError)
			assert.throws(() => divergenceComplexRecursive(field, [{ re: '1', im: 0 }]), TypeError)
			assert.throws(() => divergenceComplexRecursive(field, new Array(2)), TypeError)
		})

		test('throws RangeError when point contains non-finite numbers', () => {
			const field = (p) => p
			assert.throws(() => divergenceComplexRecursive(field, [{ re: NaN, im: 0 }]), RangeError)
			assert.throws(() => divergenceComplexRecursive(field, [{ re: 0, im: Infinity }]), RangeError)
			assert.throws(() => divergenceComplexRecursive(field, [{ re: -Infinity, im: 0 }]), RangeError)
		})

		test('throws TypeError or RangeError for invalid step size h', () => {
			const field = (p) => p
			const point = [c(1, 2)]
			for (const badType of [null, '1e-5', {}, true]) {
				assert.throws(() => divergenceComplexRecursive(field, point, badType), TypeError)
			}
			for (const badRange of [0, -1e-5, NaN, Infinity, -Infinity]) {
				assert.throws(() => divergenceComplexRecursive(field, point, badRange), RangeError)
			}
		})

		test('throws TypeError or RangeError for invalid field return values', () => {
			const point = [c(1, 2), c(3, 4)]
			assert.throws(() => divergenceComplexRecursive(() => null, point), TypeError)
			assert.throws(() => divergenceComplexRecursive(() => ({ re: 1, im: 2 }), point), TypeError)
			assert.throws(() => divergenceComplexRecursive(() => [c(1, 2)], point), RangeError)
			assert.throws(() => divergenceComplexRecursive(() => [c(1, 2), 'bad'], point), TypeError)
			assert.throws(
				() => divergenceComplexRecursive(() => [c(1, 2), { re: Infinity, im: 0 }], point),
				RangeError
			)
		})

		test('throws RangeError when coordinate perturbation, derivative, or accumulation overflows', () => {
			assert.throws(
				() => divergenceComplexRecursive((p) => p, [c(Number.MAX_VALUE, 0)], 1e308),
				RangeError
			)
			// Partial derivative difference overflow: (1e308 - (-1e308)) / 2 -> Infinity
			assert.throws(
				() =>
					divergenceComplexRecursive(
						(p) => p.map((z) => ({ re: z.re * 1e308, im: z.im * 1e308 })),
						[c(0, 0)],
						1
					),
				RangeError
			)
			// Pairwise accumulation overflow across two components: 1e308 + 1e308 -> Infinity
			assert.throws(
				() =>
					divergenceComplexRecursive(
						(p) => p.map((z) => ({ re: z.re * 1e308, im: z.im * 1e308 })),
						[c(0, 0), c(0, 0)],
						0.25
					),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		test('cross-check 1: divergence of linear field F(z) = A*z equals trace(A)', () => {
			const A = [
				[c(2, -1), c(0.5, 3), c(-1, 0), c(4, 2), c(0, -1)],
				[c(1, 1), c(-3.5, 2), c(2, -2), c(0, 1), c(1.5, 0.5)],
				[c(-2, 0.5), c(1, -1), c(0.25, 4.5), c(-3, 1), c(2, 0)],
				[c(0, 2), c(-1, 3), c(1, 1), c(5, -0.75), c(-2, -1)],
				[c(3, -2), c(0, 0), c(-1.5, 2.5), c(2, 1), c(-1.25, -3.25)],
			]
			const field = (z) =>
				A.map((row) =>
					row.reduce((acc, aij, j) => cAdd(acc, cMul(aij, z[j])), c(0, 0))
				)
			const traceA = A.reduce((acc, row, i) => cAdd(acc, row[i]), c(0, 0))
			const point = [c(1.1, -0.4), c(-2.3, 1.7), c(0.5, 0.5), c(-1, -2), c(3, 0.2)]

			const div = divergenceComplexRecursive(field, point)
			assertComplexClose(div, traceA, 1e-9)
		})

		test('cross-check 2: linearity div(alpha*F + beta*G) = alpha*div(F) + beta*div(G)', () => {
			const alpha = c(1.7, -0.9)
			const beta = c(-0.6, 2.3)
			const F = ([z0, z1, z2, z3]) => [
				cMul(z0, z1),
				cExp(z1),
				cPow2(z2),
				cAdd(cSin(z3), z0),
			]
			const G = ([z0, z1, z2, z3]) => [
				cPow3(z0),
				cMul(z1, z2),
				cCos(z2),
				cMul(c(0, 1), cPow2(z3)),
			]
			const combined = (p) => {
				const fp = F(p)
				const gp = G(p)
				return fp.map((fi, i) => cAdd(cMul(alpha, fi), cMul(beta, gp[i])))
			}
			const point = [c(0.5, -0.3), c(-0.4, 0.7), c(0.8, 0.2), c(-0.2, -0.6)]

			const lhs = divergenceComplexRecursive(combined, point)
			const rhs = cAdd(
				cMul(alpha, divergenceComplexRecursive(F, point)),
				cMul(beta, divergenceComplexRecursive(G, point))
			)
			assertComplexClose(lhs, rhs, 1e-9)
		})

		test('cross-check 3: product rule div(phi * F) = grad(phi) . F + phi * div(F)', () => {
			// phi(z0, z1, z2) = z0 * z1 + z2^2
			// grad(phi) = (z1, z0, 2*z2)
			const phi = ([z0, z1, z2]) => cAdd(cMul(z0, z1), cPow2(z2))
			const gradPhi = ([z0, z1, z2]) => [z1, z0, cMul(c(2), z2)]
			const F = ([z0, z1, z2]) => [cPow2(z0), cExp(z1), cMul(z0, z2)]
			const phiF = (p) => {
				const s = phi(p)
				return F(p).map((fi) => cMul(s, fi))
			}

			const point = [c(0.6, -0.8), c(-0.5, 0.4), c(1.1, 0.3)]
			const lhs = divergenceComplexRecursive(phiF, point)

			const g = gradPhi(point)
			const fVal = F(point)
			const dotGradF = g.reduce((acc, gi, i) => cAdd(acc, cMul(gi, fVal[i])), c(0, 0))
			const rhs = cAdd(dotGradF, cMul(phi(point), divergenceComplexRecursive(F, point)))

			assertComplexClose(lhs, rhs, 1e-8)
		})

		test('cross-check 4: matches iterative reference and exact formula in 15D', () => {
			const dim = 15
			// F_k(z) = (k + 1) * z_k^2 + i * z_{(k+1)%dim} * z_k
			// dF_k/dz_k = 2*(k + 1)*z_k + i * z_{(k+1)%dim}
			const field = (p) =>
				p.map((zk, k) => {
					const zNext = p[(k + 1) % dim]
					return cAdd(cMul(c(k + 1, 0), cPow2(zk)), cMul(c(0, 1), cMul(zNext, zk)))
				})
			const point = Array.from({ length: dim }, (_, k) =>
				c(Math.sin(k + 1) * 0.7, Math.cos(k + 1) * 0.5)
			)

			// Independent iterative real-axis complex central-difference reference
			function iterativeRef(fn, pt, step = 1e-5) {
				let reSum = 0
				let imSum = 0
				for (let i = 0; i < pt.length; i++) {
					const pPlus = pt.map((z, idx) =>
						idx === i ? { re: z.re + step, im: z.im } : z
					)
					const pMinus = pt.map((z, idx) =>
						idx === i ? { re: z.re - step, im: z.im } : z
					)
					const fPlus = fn(pPlus)[i]
					const fMinus = fn(pMinus)[i]
					reSum += (fPlus.re - fMinus.re) / (2 * step)
					imSum += (fPlus.im - fMinus.im) / (2 * step)
				}
				return { re: reSum, im: imSum }
			}

			// Exact analytical divergence
			let analytical = c(0, 0)
			for (let k = 0; k < dim; k++) {
				const term = cAdd(
					cMul(c(2 * (k + 1), 0), point[k]),
					cMul(c(0, 1), point[(k + 1) % dim])
				)
				analytical = cAdd(analytical, term)
			}

			const recursiveResult = divergenceComplexRecursive(field, point)
			const iterativeResult = iterativeRef(field, point)

			assertComplexClose(recursiveResult, analytical, 1e-8, 'vs analytical')
			assertComplexClose(recursiveResult, iterativeResult, 1e-8, 'vs iterative')
		})
	})
})
