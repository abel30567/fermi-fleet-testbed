import { describe, it } from 'node:test'
import assert from 'node:assert'
import { projectionComplexSeries } from './projectionComplexSeries.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexClose(actual, expected, tol = 1e-12, msg = '') {
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol && Math.abs(actual.im - expected.im) <= tol,
		`${msg} expected (${expected.re} + ${expected.im}i), got (${actual.re} + ${actual.im}i) (tol=${tol})`,
	)
}

function assertVectorClose(actual, expected, tol = 1e-12, msg = '') {
	assert.strictEqual(actual.length, expected.length, `${msg} length mismatch`)
	for (let i = 0; i < actual.length; i++) {
		assertComplexClose(actual[i], expected[i], tol, `${msg}[${i}]`)
	}
}

/** Independent Hermitian inner product <a, b> = sum(a_k * conj(b_k)). */
function hermitianInner(a, b) {
	let re = 0
	let im = 0
	for (let i = 0; i < a.length; i++) {
		re += a[i].re * b[i].re + a[i].im * b[i].im
		im += a[i].im * b[i].re - a[i].re * b[i].im
	}
	return { re, im }
}

/** Independent squared Euclidean/Hermitian norm ||a||^2 = <a, a>. */
function normSquared(a) {
	let sum = 0
	for (let i = 0; i < a.length; i++) {
		sum += a[i].re * a[i].re + a[i].im * a[i].im
	}
	return sum
}

/** Independent vector subtraction a - b. */
function vecSub(a, b) {
	return a.map((ai, i) => ({ re: ai.re - b[i].re, im: ai.im - b[i].im }))
}

/** Independent complex scalar multiplication s * a. */
function scalarMul(s, a) {
	return a.map((ai) => ({
		re: s.re * ai.re - s.im * ai.im,
		im: s.re * ai.im + s.im * ai.re,
	}))
}

/** Independent rank-1 projection matrix P = (v * v^H) / ||v||^2 applied to u. */
function projectViaMatrix(u, v) {
	const n = v.length
	const denom = normSquared(v)
	// Build n x n Hermitian projection matrix P_{j,k} = (v_j * conj(v_k)) / denom
	const P = Array.from({ length: n }, (_, j) =>
		Array.from({ length: n }, (_, k) => ({
			re: (v[j].re * v[k].re + v[j].im * v[k].im) / denom,
			im: (v[j].im * v[k].re - v[j].re * v[k].im) / denom,
		})),
	)
	// Compute (P * u)_j = sum_k P_{j,k} * u_k
	return P.map((row) => {
		let re = 0
		let im = 0
		for (let k = 0; k < n; k++) {
			re += row[k].re * u[k].re - row[k].im * u[k].im
			im += row[k].re * u[k].im + row[k].im * u[k].re
		}
		return { re, im }
	})
}

describe('projectionComplexSeries', () => {
	describe('normal cases', () => {
		it('projects a 1D complex vector onto a non-zero 1D complex vector (identity)', () => {
			const u = [c(3, -4)]
			const v = [c(1, 2)]
			const proj = projectionComplexSeries(u, v)
			// In C^1, any non-zero v spans C^1, so proj_v(u) = u
			assertVectorClose(proj, u)
		})

		it('matches exact analytical solution for 2D complex vectors', () => {
			// u = [1 + 2i, 3 - i], v = [1 + i, 2i]
			// <u, v> = (1+2i)(1-i) + (3-i)(-2i) = (3 + i) + (-2 - 6i) = 1 - 5i
			// <v, v> = (1^2 + 1^2) + (0^2 + 2^2) = 6
			// coeff = (1/6) - (5/6)i
			// proj = coeff * v = [(1/6 - 5i/6)(1+i), (1/6 - 5i/6)(2i)]
			//      = [1 - (2/3)i, (5/3) + (1/3)i]
			const u = [c(1, 2), c(3, -1)]
			const v = [c(1, 1), c(0, 2)]
			const expected = [c(1, -2 / 3), c(5 / 3, 1 / 3)]
			assertVectorClose(projectionComplexSeries(u, v), expected)
		})

		it('matches standard real vector projection when imaginary parts are zero', () => {
			const u = [c(3, 0), c(4, 0), c(5, 0)]
			const v = [c(1, 0), c(0, 0), c(1, 0)]
			// <u, v> = 8, <v, v> = 2, coeff = 4 -> [4, 0, 4]
			assertVectorClose(projectionComplexSeries(u, v), [c(4, 0), c(0, 0), c(4, 0)])
		})

		it('handles purely imaginary vectors', () => {
			const u = [c(0, 2), c(0, 4)]
			const v = [c(0, 1), c(0, -1)]
			// <u, v> = (2i)(-i) + (4i)(i) = 2 - 4 = -2
			// <v, v> = 2, coeff = -1 -> [0 - i, 0 + i]
			assertVectorClose(projectionComplexSeries(u, v), [c(0, -1), c(0, 1)])
		})

		it('is invariant under non-zero complex scaling of v', () => {
			const u = [c(2, -1), c(-3, 4), c(0.5, 1.5)]
			const v = [c(1, 2), c(-1, 0.5), c(3, -2)]
			const base = projectionComplexSeries(u, v)

			for (const alpha of [c(5, 0), c(-3, 0), c(0, 2), c(3, -4), c(Math.SQRT1_2, Math.SQRT1_2)]) {
				const scaledV = scalarMul(alpha, v)
				assertVectorClose(projectionComplexSeries(u, scaledV), base, 1e-11)
			}
		})

		it('is complex-linear in u', () => {
			const u1 = [c(1, -2), c(3, 1), c(-1, 4)]
			const u2 = [c(2, 3), c(-4, 0.5), c(1, -1)]
			const v = [c(1, 1), c(2, -3), c(0, 2)]
			const a = c(2, -1)
			const b = c(-0.5, 3)

			const combined = u1.map((_, i) => ({
				re: (a.re * u1[i].re - a.im * u1[i].im) + (b.re * u2[i].re - b.im * u2[i].im),
				im: (a.re * u1[i].im + a.im * u1[i].re) + (b.re * u2[i].im + b.im * u2[i].re),
			}))

			const lhs = projectionComplexSeries(combined, v)
			const p1 = scalarMul(a, projectionComplexSeries(u1, v))
			const p2 = scalarMul(b, projectionComplexSeries(u2, v))
			const rhs = p1.map((_, i) => ({ re: p1[i].re + p2[i].re, im: p1[i].im + p2[i].im }))

			assertVectorClose(lhs, rhs, 1e-11)
		})

		it('remains numerically stable for extreme magnitudes of v', () => {
			const u = [c(1, 2), c(3, -1)]
			const vBase = [c(1, 1), c(0, 2)]
			const expected = [c(1, -2 / 3), c(5 / 3, 1 / 3)]

			const hugeV = vBase.map((z) => c(z.re * 1e200, z.im * 1e200))
			const tinyV = vBase.map((z) => c(z.re * 1e-200, z.im * 1e-200))

			assertVectorClose(projectionComplexSeries(u, hugeV), expected, 1e-12, 'huge v')
			assertVectorClose(projectionComplexSeries(u, tinyV), expected, 1e-12, 'tiny v')
		})
	})

	describe('edge cases', () => {
		it('returns u when u is parallel to v (complex scalar multiple)', () => {
			const v = [c(1, -2), c(3, 4), c(-0.5, 0.25)]
			const u = scalarMul(c(-2.5, 1.75), v)
			assertVectorClose(projectionComplexSeries(u, v), u, 1e-11)
		})

		it('returns the zero vector when u is Hermitian-orthogonal to v', () => {
			// For v = [1 + i, 2 - i] and u = [2 + i, -1 + i]:
			// <u, v> = (2 + i)(1 - i) + (-1 + i)(2 + i) = (3 - i) + (-3 + i) = 0
			const v = [c(1, 1), c(2, -1)]
			const u = [c(2, 1), c(-1, 1)]
			assertComplexClose(hermitianInner(u, v), c(0, 0))
			assertVectorClose(projectionComplexSeries(u, v), [c(0, 0), c(0, 0)])
		})

		it('returns the zero vector when u is the zero vector', () => {
			const u = [c(0, 0), c(0, 0), c(0, 0)]
			const v = [c(1, 2), c(-3, 4), c(5, -6)]
			const proj = projectionComplexSeries(u, v)
			assert.deepStrictEqual(proj, [c(0, 0), c(0, 0), c(0, 0)])
		})

		it('does not mutate input arrays or elements', () => {
			const u = [c(1, 2), c(3, 4)]
			const v = [c(5, -1), c(2, 3)]
			const uSnap = structuredClone(u)
			const vSnap = structuredClone(v)
			projectionComplexSeries(u, v)
			assert.deepStrictEqual(u, uSnap)
			assert.deepStrictEqual(v, vSnap)
		})

		it('throws RangeError when target vector v is the zero vector', () => {
			assert.throws(
				() => projectionComplexSeries([c(1, 0), c(0, 1)], [c(0, 0), c(0, 0)]),
				RangeError,
			)
		})

		it('throws RangeError for mismatched vector lengths', () => {
			assert.throws(
				() => projectionComplexSeries([c(1, 0)], [c(1, 0), c(0, 1)]),
				RangeError,
			)
		})

		it('throws RangeError for empty arrays', () => {
			assert.throws(() => projectionComplexSeries([], []), RangeError)
			assert.throws(() => projectionComplexSeries([], [c(1, 0)]), RangeError)
			assert.throws(() => projectionComplexSeries([c(1, 0)], []), RangeError)
		})

		it('throws TypeError or RangeError for invalid inputs', () => {
			// Non-arrays
			assert.throws(() => projectionComplexSeries(null, [c(1, 0)]), TypeError)
			assert.throws(() => projectionComplexSeries([c(1, 0)], undefined), TypeError)
			assert.throws(() => projectionComplexSeries('abc', [c(1, 0)]), TypeError)
			assert.throws(() => projectionComplexSeries([c(1, 0)], { re: 1, im: 0 }), TypeError)

			// Invalid elements
			assert.throws(() => projectionComplexSeries([null], [c(1, 0)]), TypeError)
			assert.throws(() => projectionComplexSeries([c(1, 0)], [42]), TypeError)
			assert.throws(() => projectionComplexSeries([{ re: 1 }], [c(1, 0)]), TypeError)
			assert.throws(() => projectionComplexSeries([c(1, 0)], [{ re: '1', im: 0 }]), TypeError)

			// Non-finite components
			assert.throws(() => projectionComplexSeries([c(NaN, 0)], [c(1, 0)]), RangeError)
			assert.throws(() => projectionComplexSeries([c(1, Infinity)], [c(1, 0)]), RangeError)
			assert.throws(() => projectionComplexSeries([c(1, 0)], [c(1, -Infinity)]), RangeError)
			assert.throws(() => projectionComplexSeries([c(1, 0)], [c(NaN, 1)]), RangeError)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		const testPairs = [
			{
				name: '3D general complex vectors',
				u: [c(2, -3), c(-1.5, 4.2), c(0.7, -0.9)],
				v: [c(-1, 2), c(3.5, -1.5), c(2, 0.5)],
			},
			{
				name: '5D mixed real/imaginary/complex vectors',
				u: [c(1, 0), c(0, -2), c(3, 4), c(-5, 1), c(0, 0)],
				v: [c(0, 1), c(2, 0), c(-1, 3), c(4, -2), c(1, 1)],
			},
			{
				name: '8D harmonic series vectors',
				u: Array.from({ length: 8 }, (_, k) =>
					c(Math.cos((k + 1) * 0.7) / (k + 1), Math.sin((k + 1) * 1.1) / (k + 1)),
				),
				v: Array.from({ length: 8 }, (_, k) =>
					c(Math.cos((k + 1) * 0.4), -Math.sin((k + 1) * 0.9)),
				),
			},
		]

		for (const { name, u, v } of testPairs) {
			it(`satisfies orthogonality, idempotence, Pythagorean theorem, and matrix cross-check (${name})`, () => {
				const proj = projectionComplexSeries(u, v)
				const residual = vecSub(u, proj)

				// 1. Residual (u - proj_v(u)) is Hermitian-orthogonal to v: <u - proj_v(u), v> = 0
				assertComplexClose(hermitianInner(residual, v), c(0, 0), 1e-11, `${name} residual orthogonality`)

				// 2. Idempotence: proj_v(proj_v(u)) = proj_v(u)
				const projTwice = projectionComplexSeries(proj, v)
				assertVectorClose(projTwice, proj, 1e-11, `${name} idempotence`)

				// 3. Pythagorean theorem: ||u||^2 = ||proj_v(u)||^2 + ||u - proj_v(u)||^2
				const normU2 = normSquared(u)
				const normProj2 = normSquared(proj)
				const normRes2 = normSquared(residual)
				assert.ok(
					Math.abs(normU2 - (normProj2 + normRes2)) <= 1e-11 * Math.max(1, normU2),
					`${name} Pythagorean mismatch: ||u||^2=${normU2}, ||proj||^2+||res||^2=${normProj2 + normRes2}`,
				)

				// 4. Independent rank-1 projection matrix P = (v * v^H) / ||v||^2 cross-check
				const matrixProj = projectViaMatrix(u, v)
				assertVectorClose(proj, matrixProj, 1e-11, `${name} matrix cross-check`)

				// 5. Minimal distance property: ||u - proj||^2 <= ||u - (coeff + delta)*v||^2
				for (const delta of [c(0.1, 0), c(-0.1, 0), c(0, 0.1), c(0.05, -0.05)]) {
					const perturbed = proj.map((pi, i) => ({
						re: pi.re + (delta.re * v[i].re - delta.im * v[i].im),
						im: pi.im + (delta.re * v[i].im + delta.im * v[i].re),
					}))
					assert.ok(
						normRes2 <= normSquared(vecSub(u, perturbed)) + 1e-12,
						`${name} minimal distance violated`,
					)
				}
			})
		}
	})
})
