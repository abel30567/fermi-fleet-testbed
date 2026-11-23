import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductComplexSeries } from './dotProductComplexSeries.js'

const EPS = 1e-12

function assertComplexClose(actual, expected, tol = EPS, msg = '') {
	assert.equal(typeof actual, 'object', `${msg}: result should be an object`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${msg}: expected re ≈ ${expected.re}, got ${actual.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${msg}: expected im ≈ ${expected.im}, got ${actual.im}`
	)
}

/**
 * Independent helper: squared Euclidean norm ||w||^2 = sum(|w_k|^2).
 */
function normSquared(w) {
	return w.reduce((acc, z) => acc + z.re * z.re + z.im * z.im, 0)
}

/**
 * Independent cross-check via the complex polarization identity:
 *   <u, v> = 1/4 * (||u + v||^2 - ||u - v||^2 + i*(||u + i*v||^2 - ||u - i*v||^2))
 */
function dotViaPolarizationIdentity(u, v) {
	const uPlusV = u.map((z, k) => ({ re: z.re + v[k].re, im: z.im + v[k].im }))
	const uMinusV = u.map((z, k) => ({ re: z.re - v[k].re, im: z.im - v[k].im }))
	// i * (c + i*d) = -d + i*c
	const uPlusIV = u.map((z, k) => ({ re: z.re - v[k].im, im: z.im + v[k].re }))
	const uMinusIV = u.map((z, k) => ({ re: z.re + v[k].im, im: z.im - v[k].re }))

	return {
		re: 0.25 * (normSquared(uPlusV) - normSquared(uMinusV)),
		im: 0.25 * (normSquared(uPlusIV) - normSquared(uMinusIV)),
	}
}

describe('dotProductComplexSeries', () => {
	it('computes Hermitian dot product of basic complex vectors', () => {
		// u = [1 + 2i, 3 - 4i], v = [5 + 6i, -7 + 8i]
		// (1+2i)(5-6i) = 5 - 6i + 10i + 12 = 17 + 4i
		// (3-4i)(-7-8i) = -21 - 24i + 28i - 32 = -53 + 4i
		// sum = -36 + 8i
		const u = [{ re: 1, im: 2 }, { re: 3, im: -4 }]
		const v = [{ re: 5, im: 6 }, { re: -7, im: 8 }]
		assertComplexClose(dotProductComplexSeries(u, v), { re: -36, im: 8 })
	})

	it('reduces to standard real dot product when imaginary parts are zero', () => {
		const u = [{ re: 2, im: 0 }, { re: -3, im: 0 }, { re: 4.5, im: 0 }]
		const v = [{ re: 1.5, im: 0 }, { re: 4, im: 0 }, { re: -2, im: 0 }]
		// 3 - 12 - 9 = -18
		assertComplexClose(dotProductComplexSeries(u, v), { re: -18, im: 0 })
	})

	it('handles purely imaginary vectors correctly', () => {
		// <i, i> = i * (-i) = 1
		const u = [{ re: 0, im: 2 }, { re: 0, im: -3 }]
		const v = [{ re: 0, im: 5 }, { re: 0, im: 4 }]
		// (2i)(-5i) + (-3i)(-4i) = 10 - 12 = -2
		assertComplexClose(dotProductComplexSeries(u, v), { re: -2, im: 0 })
	})

	it('supports bilinear (non-conjugated) complex dot product via options', () => {
		// (1+2i)(5+6i) = -7 + 16i
		// (3-4i)(-7+8i) = 11 + 52i
		// sum = 4 + 68i
		const u = [{ re: 1, im: 2 }, { re: 3, im: -4 }]
		const v = [{ re: 5, im: 6 }, { re: -7, im: 8 }]
		assertComplexClose(
			dotProductComplexSeries(u, v, { conjugate: false }),
			{ re: 4, im: 68 }
		)
	})

	it('handles empty vectors, single-element vectors, and zero vectors', () => {
		assert.deepEqual(dotProductComplexSeries([], []), { re: 0, im: 0 })

		assertComplexClose(
			dotProductComplexSeries([{ re: 3, im: 4 }], [{ re: 3, im: 4 }]),
			{ re: 25, im: 0 }
		)

		const zero = [{ re: 0, im: 0 }, { re: 0, im: 0 }]
		const v = [{ re: 7, im: -9 }, { re: -1, im: 2 }]
		const res = dotProductComplexSeries(zero, v)
		assert.deepEqual(res, { re: 0, im: 0 })
		assert.ok(!Object.is(res.re, -0), 're should not be -0')
		assert.ok(!Object.is(res.im, -0), 'im should not be -0')
	})

	it('maintains accuracy under catastrophic cancellation via Neumaier summation', () => {
		const u = [
			{ re: 1e16, im: 0 },
			{ re: 1, im: 1 },
			{ re: -1e16, im: 0 },
		]
		const v = [
			{ re: 1, im: 0 },
			{ re: 1, im: 0 },
			{ re: 1, im: 0 },
		]
		assertComplexClose(dotProductComplexSeries(u, v), { re: 1, im: 1 }, 1e-12)
	})

	it('cross-check: matches the complex polarization identity', () => {
		const cases = [
			[
				[{ re: 1.25, im: -0.75 }, { re: -2.5, im: 3.125 }, { re: 0.5, im: 4.0 }],
				[{ re: -1.5, im: 2.25 }, { re: 0.75, im: -1.125 }, { re: 3.25, im: -0.5 }],
			],
			[
				[{ re: Math.PI, im: -Math.E }, { re: Math.SQRT2, im: Math.LN2 }],
				[{ re: Math.cos(1), im: Math.sin(1) }, { re: -0.3, im: 0.9 }],
			],
			[
				[{ re: 0, im: 1 }, { re: 1, im: 0 }],
				[{ re: 1, im: 0 }, { re: 0, im: 1 }],
			],
		]

		for (const [u, v] of cases) {
			const actual = dotProductComplexSeries(u, v)
			const viaPolarization = dotViaPolarizationIdentity(u, v)
			assertComplexClose(actual, viaPolarization, 1e-11, 'polarization identity')
		}
	})

	it('cross-check: satisfies DFT basis orthogonality <e_m, e_n> = N * delta_{m,n}', () => {
		const N = 8
		const basis = Array.from({ length: N }, (_, m) =>
			Array.from({ length: N }, (_, k) => {
				const angle = (2 * Math.PI * m * k) / N
				return { re: Math.cos(angle), im: Math.sin(angle) }
			})
		)

		for (let m = 0; m < N; m++) {
			for (let n = 0; n < N; n++) {
				const res = dotProductComplexSeries(basis[m], basis[n])
				const expected = m === n ? { re: N, im: 0 } : { re: 0, im: 0 }
				assertComplexClose(res, expected, 1e-12, `DFT <e_${m}, e_${n}>`)
			}
		}
	})

	it('cross-check: satisfies conjugate symmetry, sesquilinearity, and Cauchy-Schwarz', () => {
		const u = [{ re: 2, im: -1 }, { re: 0.5, im: 3 }, { re: -4, im: 1.5 }]
		const v = [{ re: -1, im: 2.5 }, { re: 3, im: -0.5 }, { re: 1.25, im: -2 }]
		const w = [{ re: 0.75, im: 1 }, { re: -2, im: -1.5 }, { re: 2.5, im: 0.5 }]

		// Conjugate symmetry: <v, u> = conj(<u, v>)
		const uv = dotProductComplexSeries(u, v)
		const vu = dotProductComplexSeries(v, u)
		assertComplexClose(vu, { re: uv.re, im: -uv.im }, 1e-12, 'conjugate symmetry')

		// Positive-definiteness: <u, u> = ||u||^2
		const uu = dotProductComplexSeries(u, u)
		assertComplexClose(uu, { re: normSquared(u), im: 0 }, 1e-12, 'norm squared')

		// Cauchy-Schwarz: |<u, v>|^2 <= ||u||^2 * ||v||^2
		const uvMagSq = uv.re * uv.re + uv.im * uv.im
		assert.ok(uvMagSq <= normSquared(u) * normSquared(v) + 1e-12, 'Cauchy-Schwarz')

		// Sesquilinearity: <alpha*u + w, v> = alpha*<u, v> + <w, v>
		const alpha = { re: 1.5, im: -2.25 }
		const comb = u.map((z, k) => ({
			re: alpha.re * z.re - alpha.im * z.im + w[k].re,
			im: alpha.re * z.im + alpha.im * z.re + w[k].im,
		}))
		const lhs = dotProductComplexSeries(comb, v)
		const wv = dotProductComplexSeries(w, v)
		const rhs = {
			re: alpha.re * uv.re - alpha.im * uv.im + wv.re,
			im: alpha.re * uv.im + alpha.im * uv.re + wv.im,
		}
		assertComplexClose(lhs, rhs, 1e-11, 'sesquilinearity')

		// Unitary phase invariance: <e^{i*theta} u, e^{i*theta} v> = <u, v>
		const theta = 1.2345
		const c = Math.cos(theta)
		const s = Math.sin(theta)
		const rot = (vec) => vec.map((z) => ({ re: c * z.re - s * z.im, im: c * z.im + s * z.re }))
		assertComplexClose(
			dotProductComplexSeries(rot(u), rot(v)),
			uv,
			1e-12,
			'unitary phase invariance'
		)
	})

	it('validates inputs and throws descriptive errors', () => {
		assert.throws(() => dotProductComplexSeries(null, []), TypeError)
		assert.throws(() => dotProductComplexSeries([], 'not-an-array'), TypeError)
		assert.throws(
			() => dotProductComplexSeries([{ re: 1, im: 0 }], []),
			RangeError
		)
		assert.throws(
			() => dotProductComplexSeries([null], [{ re: 1, im: 0 }]),
			TypeError
		)
		assert.throws(
			() => dotProductComplexSeries([{ re: '1', im: 0 }], [{ re: 1, im: 0 }]),
			TypeError
		)
		assert.throws(
			() => dotProductComplexSeries([{ re: NaN, im: 0 }], [{ re: 1, im: 0 }]),
			RangeError
		)
		assert.throws(
			() => dotProductComplexSeries([{ re: 1, im: Infinity }], [{ re: 1, im: 0 }]),
			RangeError
		)
		assert.throws(
			() => dotProductComplexSeries([], [], null),
			TypeError
		)
		assert.throws(
			() => dotProductComplexSeries([], [], { conjugate: 'yes' }),
			TypeError
		)
	})
})
