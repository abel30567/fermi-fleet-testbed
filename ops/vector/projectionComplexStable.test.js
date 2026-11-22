import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { projectionComplexStable } from './projectionComplexStable.js'

/**
 * Helper to construct a complex number object.
 * @param {number} re
 * @param {number} im
 */
const c = (re, im = 0) => ({ re, im })

/**
 * Independent scaled Hermitian inner product `<a, b> = sum(a_i * conj(b_i))`
 * returning `{ re, im, scale }` such that true value is `(re + i*im) * scale`.
 */
function scaledInnerProduct(a, b) {
	let sA = 0
	let sB = 0
	for (let i = 0; i < a.length; i++) {
		sA = Math.max(sA, Math.abs(a[i].re), Math.abs(a[i].im))
		sB = Math.max(sB, Math.abs(b[i].re), Math.abs(b[i].im))
	}
	if (sA === 0 || sB === 0) return { re: 0, im: 0, scaleA: sA, scaleB: sB }
	let re = 0
	let im = 0
	for (let i = 0; i < a.length; i++) {
		const ar = a[i].re / sA
		const ai = a[i].im / sA
		const br = b[i].re / sB
		const bi = b[i].im / sB
		re += ar * br + ai * bi
		im += ai * br - ar * bi
	}
	return { re, im, scaleA: sA, scaleB: sB }
}

/**
 * Independent scaled Euclidean norm `||x||_2`, returning `{ scaledNorm, scale }`
 * where `||x||_2 = scaledNorm * scale`.
 */
function scaledNorm(x) {
	let scale = 0
	for (let i = 0; i < x.length; i++) {
		scale = Math.max(scale, Math.abs(x[i].re), Math.abs(x[i].im))
	}
	if (scale === 0) return { scaledNorm: 0, scale: 0 }
	let sumSq = 0
	for (let i = 0; i < x.length; i++) {
		const r = x[i].re / scale
		const im = x[i].im / scale
		sumSq += r * r + im * im
	}
	return { scaledNorm: Math.sqrt(sumSq), scale }
}

function subVec(a, b) {
	return a.map((ai, i) => ({ re: ai.re - b[i].re, im: ai.im - b[i].im }))
}

function scaleComplex(z, v) {
	return v.map((vi) => ({
		re: z.re * vi.re - z.im * vi.im,
		im: z.re * vi.im + z.im * vi.re,
	}))
}

function assertComplexClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < actual.length; i++) {
		const dr = Math.abs(actual[i].re - expected[i].re)
		const di = Math.abs(actual[i].im - expected[i].im)
		const tolR = Math.max(absTol, relTol * Math.max(Math.abs(actual[i].re), Math.abs(expected[i].re)))
		const tolI = Math.max(absTol, relTol * Math.max(Math.abs(actual[i].im), Math.abs(expected[i].im)))
		assert.ok(
			dr <= tolR,
			`index ${i} re: expected ${expected[i].re}, got ${actual[i].re} (diff ${dr} > tol ${tolR})`
		)
		assert.ok(
			di <= tolI,
			`index ${i} im: expected ${expected[i].im}, got ${actual[i].im} (diff ${di} > tol ${tolI})`
		)
	}
}

describe('projectionComplexStable', () => {
	describe('normal cases', () => {
		test('real vectors embedded in complex space', () => {
			const u = [c(3, 0), c(4, 0)]
			const v = [c(1, 0), c(0, 0)]
			const p = projectionComplexStable(u, v)
			assertComplexClose(p, [c(3, 0), c(0, 0)])
		})

		test('1D complex projection returns u for any nonzero v (verifies Hermitian conjugation order)', () => {
			const u = [c(2, -5)]
			const v = [c(0, 3)]
			const p = projectionComplexStable(u, v)
			assertComplexClose(p, u)
		})

		test('general 2D complex vector matches hand-computed analytical result', () => {
			// u = [1 + 2i, 3 - i], v = [i, 1 + i]
			// <u, v> = (1+2i)(-i) + (3-i)(1-i) = (2 - i) + (2 - 4i) = 4 - 5i
			// <v, v> = 1 + 2 = 3
			// proj = ((4 - 5i)/3) * [i, 1 + i] = [(5 + 4i)/3, 3 - i/3]
			const u = [c(1, 2), c(3, -1)]
			const v = [c(0, 1), c(1, 1)]
			const p = projectionComplexStable(u, v)
			assertComplexClose(p, [c(5 / 3, 4 / 3), c(3, -1 / 3)])
		})

		test('purely imaginary vectors', () => {
			const u = [c(0, 2), c(0, 6)]
			const v = [c(0, 1), c(0, 1)]
			const p = projectionComplexStable(u, v)
			assertComplexClose(p, [c(0, 4), c(0, 4)])
		})

		test('does not mutate input vectors or elements', () => {
			const u = [c(1, 2), c(3, 4)]
			const v = [c(5, -1), c(2, 3)]
			const uSnap = structuredClone(u)
			const vSnap = structuredClone(v)
			projectionComplexStable(u, v)
			assert.deepEqual(u, uSnap)
			assert.deepEqual(v, vSnap)
		})
	})

	describe('edge cases', () => {
		test('orthogonal complex vectors yield zero vector', () => {
			// u = [1, i], v = [i, 1]
			// <u, v> = 1 * conj(i) + i * conj(1) = -i + i = 0
			const u = [c(1, 0), c(0, 1)]
			const v = [c(0, 1), c(1, 0)]
			const p = projectionComplexStable(u, v)
			assertComplexClose(p, [c(0, 0), c(0, 0)])
		})

		test('parallel vectors (u = alpha * v for complex alpha) return u', () => {
			const v = [c(1, -2), c(3, 4), c(-5, 1)]
			const alpha = c(-2.5, 1.75)
			const u = scaleComplex(alpha, v)
			const p = projectionComplexStable(u, v)
			assertComplexClose(p, u)
		})

		test('zero u vector yields exact positive-zero complex vector', () => {
			const u = [c(0, 0), c(0, 0), c(0, 0)]
			const v = [c(1, -1), c(2, 3), c(-4, 0)]
			const p = projectionComplexStable(u, v)
			assert.deepEqual(p, [c(0, 0), c(0, 0), c(0, 0)])
			for (const el of p) {
				assert.ok(Object.is(el.re, 0))
				assert.ok(Object.is(el.im, 0))
			}
		})

		test('invariance under nonzero complex scaling of target vector v', () => {
			const u = [c(2, -3), c(4, 1), c(-1, 5)]
			const v = [c(1, 2), c(-3, 1), c(2, -1)]
			const scaledV = scaleComplex(c(3, -4), v)
			const p1 = projectionComplexStable(u, v)
			const p2 = projectionComplexStable(u, scaledV)
			assertComplexClose(p1, p2)
		})

		test('linearity in u: proj_v(a*u1 + b*u2) = a*proj_v(u1) + b*proj_v(u2)', () => {
			const u1 = [c(1, 3), c(-2, 4), c(5, -1)]
			const u2 = [c(-4, 2), c(1, -3), c(2, 2)]
			const v = [c(2, -1), c(1, 1), c(-3, 2)]
			const a = c(2, -3)
			const b = c(-1, 4)

			const au1 = scaleComplex(a, u1)
			const bu2 = scaleComplex(b, u2)
			const combined = au1.map((x, i) => c(x.re + bu2[i].re, x.im + bu2[i].im))

			const lhs = projectionComplexStable(combined, v)
			const p1 = scaleComplex(a, projectionComplexStable(u1, v))
			const p2 = scaleComplex(b, projectionComplexStable(u2, v))
			const rhs = p1.map((x, i) => c(x.re + p2[i].re, x.im + p2[i].im))

			assertComplexClose(lhs, rhs)
		})

		test('extreme large scale (1e180 and 1e200) avoids overflow', () => {
			for (const s of [1e180, 1e200]) {
				const u = [c(1 * s, 2 * s), c(3 * s, -1 * s)]
				const v = [c(0, 1 * s), c(1 * s, 1 * s)]
				const p = projectionComplexStable(u, v)
				assertComplexClose(p, [c((5 / 3) * s, (4 / 3) * s), c(3 * s, (-1 / 3) * s)], 1e-12, 0)
			}
		})

		test('extreme small scale (1e-180 and 1e-200) avoids underflow', () => {
			for (const s of [1e-180, 1e-200]) {
				const u = [c(1 * s, 2 * s), c(3 * s, -1 * s)]
				const v = [c(0, 1 * s), c(1 * s, 1 * s)]
				const p = projectionComplexStable(u, v)
				assertComplexClose(p, [c((5 / 3) * s, (4 / 3) * s), c(3 * s, (-1 / 3) * s)], 1e-12, 0)
			}
		})

		test('mismatched extreme scales (u at 1e180, v at 1e-180 and vice versa)', () => {
			const sLarge = 1e180
			const sSmall = 1e-180

			const uLarge = [c(1 * sLarge, 2 * sLarge), c(3 * sLarge, -1 * sLarge)]
			const vSmall = [c(0, 1 * sSmall), c(1 * sSmall, 1 * sSmall)]
			const pLarge = projectionComplexStable(uLarge, vSmall)
			assertComplexClose(
				pLarge,
				[c((5 / 3) * sLarge, (4 / 3) * sLarge), c(3 * sLarge, (-1 / 3) * sLarge)],
				1e-12,
				0
			)

			const uSmall = [c(1 * sSmall, 2 * sSmall), c(3 * sSmall, -1 * sSmall)]
			const vLarge = [c(0, 1 * sLarge), c(1 * sLarge, 1 * sLarge)]
			const pSmall = projectionComplexStable(uSmall, vLarge)
			assertComplexClose(
				pSmall,
				[c((5 / 3) * sSmall, (4 / 3) * sSmall), c(3 * sSmall, (-1 / 3) * sSmall)],
				1e-12,
				0
			)
		})

		test('subnormal target vector v does not falsely throw zero-norm', () => {
			const tiny = Number.MIN_VALUE // 5e-324
			const u = [c(3, 4), c(5, -2)]
			const v = [c(tiny, 0), c(0, tiny)]
			// v_hat = [1, i], <u, v_hat> = (3+4i)(1) + (5-2i)(-i) = (3+4i) + (-2-5i) = 1 - i
			// <v_hat, v_hat> = 2, alpha = (1 - i)/2
			// proj = [(1 - i)/2, (1 + i)/2]
			const p = projectionComplexStable(u, v)
			assertComplexClose(p, [c(0.5, -0.5), c(0.5, 0.5)])
		})

		test('compensated summation preserves accuracy under catastrophic cancellation', () => {
			// Naive left-to-right sum of [1e16, 1, -1e16] loses the 1 completely and yields 0.
			const u = [c(1e16, -1e16), c(1, 2), c(-1e16, 1e16)]
			const v = [c(1, 0), c(1, 0), c(1, 0)]
			const p = projectionComplexStable(u, v)
			assertComplexClose(p, [c(1 / 3, 2 / 3), c(1 / 3, 2 / 3), c(1 / 3, 2 / 3)], 1e-12, 1e-12)
		})
	})

	describe('invalid inputs', () => {
		test('throws on zero target vector v', () => {
			assert.throws(() => projectionComplexStable([c(1, 2)], [c(0, 0)]), RangeError)
			assert.throws(
				() => projectionComplexStable([c(1, 0), c(2, 3)], [c(0, 0), c(0, 0)]),
				RangeError
			)
			assert.throws(
				() => projectionComplexStable([c(0, 0)], [c(0, 0)]),
				RangeError
			)
		})

		test('throws on empty vectors', () => {
			assert.throws(() => projectionComplexStable([], []), RangeError)
		})

		test('throws on mismatched lengths', () => {
			assert.throws(() => projectionComplexStable([c(1, 0)], [c(1, 0), c(0, 1)]), RangeError)
			assert.throws(() => projectionComplexStable([c(1, 0), c(2, 0)], [c(1, 0)]), RangeError)
			assert.throws(() => projectionComplexStable([], [c(1, 0)]), RangeError)
		})

		test('throws on non-array arguments', () => {
			assert.throws(() => projectionComplexStable(null, [c(1, 0)]), TypeError)
			assert.throws(() => projectionComplexStable([c(1, 0)], null), TypeError)
			assert.throws(() => projectionComplexStable(undefined, [c(1, 0)]), TypeError)
			assert.throws(() => projectionComplexStable('abc', [c(1, 0)]), TypeError)
			assert.throws(() => projectionComplexStable({ 0: c(1, 0), length: 1 }, [c(1, 0)]), TypeError)
		})

		test('throws on invalid {re, im} elements', () => {
			const good = [c(1, 0)]
			const badElements = [
				null,
				undefined,
				42,
				'1+2i',
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: '2' },
				{ re: NaN, im: 0 },
				{ re: 0, im: NaN },
				{ re: Infinity, im: 0 },
				{ re: 0, im: -Infinity },
			]

			for (const bad of badElements) {
				assert.throws(() => projectionComplexStable([bad], good), TypeError)
				assert.throws(() => projectionComplexStable(good, [bad]), TypeError)
			}

			// Sparse array hole
			const sparse = new Array(2)
			sparse[0] = c(1, 0)
			assert.throws(() => projectionComplexStable(sparse, [c(1, 0), c(0, 1)]), TypeError)
			assert.throws(() => projectionComplexStable([c(1, 0), c(0, 1)], sparse), TypeError)

			// Invalid element in v still throws even when u is zero
			assert.throws(() => projectionComplexStable([c(0, 0)], [{ re: NaN, im: 0 }]), TypeError)
		})
	})

	describe('independent mathematical cross-checks', () => {
		const cases = [
			{
				name: '3D general complex',
				u: [c(1.5, -2.25), c(-3.1, 4.7), c(0.8, 2.3)],
				v: [c(-2.4, 1.1), c(0.5, -3.2), c(4.1, 0.9)],
			},
			{
				name: '5D mixed-sign complex',
				u: [c(7, -1), c(-2, 8), c(3, 3), c(-5, -6), c(0, 9)],
				v: [c(1, 2), c(-3, 4), c(5, -6), c(-7, -8), c(9, 1)],
			},
			{
				name: 'extreme large scale (1e180)',
				u: [c(2e180, -3e180), c(4e180, 1e180), c(-5e180, 2e180)],
				v: [c(1e180, 4e180), c(-2e180, 3e180), c(3e180, -1e180)],
			},
			{
				name: 'extreme small scale (1e-180)',
				u: [c(2e-180, -3e-180), c(4e-180, 1e-180), c(-5e-180, 2e-180)],
				v: [c(1e-180, 4e-180), c(-2e-180, 3e-180), c(3e-180, -1e-180)],
			},
			{
				name: 'cross-extreme scales (u ~ 1e180, v ~ 1e-180)',
				u: [c(3e180, 1e180), c(-2e180, 5e180), c(4e180, -2e180)],
				v: [c(2e-180, -1e-180), c(1e-180, 3e-180), c(-4e-180, 2e-180)],
			},
		]

		for (const { name, u, v } of cases) {
			test(`idempotence, orthogonality of residual, and Pythagorean theorem: ${name}`, () => {
				const proj = projectionComplexStable(u, v)

				// 1. Idempotence: proj_v(proj_v(u)) = proj_v(u)
				const projTwice = projectionComplexStable(proj, v)
				assertComplexClose(projTwice, proj, 1e-12, 0)

				// 2. Orthogonality of residual: <u - proj_v(u), v> = 0
				const residual = subVec(u, proj)
				const ip = scaledInnerProduct(residual, v)
				const ipMag = Math.hypot(ip.re, ip.im)
				assert.ok(
					ipMag <= 1e-12 * u.length,
					`residual not orthogonal to v for ${name}: scaled |<r, v>| = ${ipMag}`
				)

				// 3. Pythagorean theorem: ||u||^2 = ||proj_v(u)||^2 + ||u - proj_v(u)||^2
				// Compare in normalized scale of u to avoid overflow/underflow at 1e±180.
				const normU = scaledNorm(u)
				const normP = scaledNorm(proj)
				const normR = scaledNorm(residual)

				const uNormScaled = normU.scaledNorm
				const pNormScaled = normP.scaledNorm * (normP.scale / normU.scale)
				const rNormScaled = normR.scaledNorm * (normR.scale / normU.scale)

				const lhs = uNormScaled * uNormScaled
				const rhs = pNormScaled * pNormScaled + rNormScaled * rNormScaled
				assert.ok(
					Math.abs(lhs - rhs) <= 1e-12 * lhs,
					`Pythagorean theorem failed for ${name}: ||u||^2=${lhs}, ||p||^2+||r||^2=${rhs}`
				)
			})
		}
	})
})
