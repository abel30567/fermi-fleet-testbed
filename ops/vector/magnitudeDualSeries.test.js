import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeDualSeries } from './magnitudeDualSeries.js'

const approxEqual = (actual, expected, tol = 1e-12) => {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

describe('magnitudeDualSeries', () => {
	describe('normal cases', () => {
		it('handles 1D positive and negative dual vectors', () => {
			const pos = magnitudeDualSeries([{ v: 5, d: 2 }])
			assert.deepEqual(pos, { v: 5, d: 2 })

			const neg = magnitudeDualSeries([{ v: -5, d: 2 }])
			assert.deepEqual(neg, { v: 5, d: -2 })
		})

		it('computes exact value and derivative for 2D Pythagorean triple', () => {
			const res = magnitudeDualSeries([
				{ v: 3, d: 1 },
				{ v: 4, d: 2 },
			])
			approxEqual(res.v, 5)
			approxEqual(res.d, (3 * 1 + 4 * 2) / 5)
		})

		it('computes exact value and derivative for 3D and higher-dimensional vectors', () => {
			const res3d = magnitudeDualSeries([
				{ v: 2, d: -1 },
				{ v: -3, d: 4 },
				{ v: 6, d: 0.5 },
			])
			approxEqual(res3d.v, 7)
			approxEqual(res3d.d, (2 * -1 + -3 * 4 + 6 * 0.5) / 7)

			const res5d = magnitudeDualSeries([
				{ v: 1, d: 2 },
				{ v: -2, d: 3 },
				{ v: 2, d: -1 },
				{ v: -4, d: 0.25 },
				{ v: 0, d: 99 },
			])
			const expectedV = Math.hypot(1, -2, 2, -4, 0)
			const expectedD = (1 * 2 + -2 * 3 + 2 * -1 + -4 * 0.25 + 0 * 99) / expectedV
			approxEqual(res5d.v, expectedV)
			approxEqual(res5d.d, expectedD)
		})

		it('returns zero derivative for constant vectors and orthogonal tangent vectors', () => {
			const constant = magnitudeDualSeries([
				{ v: 3, d: 0 },
				{ v: 4, d: 0 },
			])
			assert.deepEqual(constant, { v: 5, d: 0 })

			// Tangent to circle x^2 + y^2 = 25 at (3, 4) has d = (-4, 3)
			const orthogonal = magnitudeDualSeries([
				{ v: 3, d: -4 },
				{ v: 4, d: 3 },
			])
			approxEqual(orthogonal.v, 5)
			approxEqual(orthogonal.d, 0)
		})

		it('handles parallel tangent vectors d = k * v', () => {
			const k = -2.5
			const v = [1.2, -3.4, 5.6]
			const res = magnitudeDualSeries(v.map((vi) => ({ v: vi, d: k * vi })))
			const norm = Math.hypot(...v)
			approxEqual(res.v, norm)
			approxEqual(res.d, k * norm)
		})
	})

	describe('edge cases', () => {
		it('returns { v: 0, d: 0 } for empty vector', () => {
			const res = magnitudeDualSeries([])
			assert.deepEqual(res, { v: 0, d: 0 })
		})

		it('handles zero primal vector with zero vs non-zero derivatives', () => {
			const zeroConst = magnitudeDualSeries([
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			])
			assert.deepEqual(zeroConst, { v: 0, d: 0 })

			const zeroNonDiff = magnitudeDualSeries([
				{ v: 0, d: 1 },
				{ v: 0, d: 0 },
			])
			assert.equal(zeroNonDiff.v, 0)
			assert.ok(Number.isNaN(zeroNonDiff.d))
		})

		it('normalizes negative zero to positive zero', () => {
			const res = magnitudeDualSeries([
				{ v: -0, d: -0 },
				{ v: -0, d: -0 },
			])
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))

			const resNonZero = magnitudeDualSeries([
				{ v: 1, d: -0 },
				{ v: -1, d: 0 },
			])
			assert.ok(Object.is(resNonZero.d, 0))
		})

		it('avoids overflow for very large magnitudes', () => {
			const res = magnitudeDualSeries([
				{ v: 3e200, d: 1 },
				{ v: 4e200, d: 2 },
			])
			approxEqual(res.v / 1e200, 5, 1e-12)
			approxEqual(res.d, (3 * 1 + 4 * 2) / 5, 1e-12)
		})

		it('avoids underflow for very small magnitudes', () => {
			const res = magnitudeDualSeries([
				{ v: 3e-200, d: 1 },
				{ v: 4e-200, d: 2 },
			])
			approxEqual(res.v / 1e-200, 5, 1e-12)
			approxEqual(res.d, (3 * 1 + 4 * 2) / 5, 1e-12)
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivative along a smooth curve', () => {
			// Curve x(t) = [t^2 + 1, sin(t), exp(0.5 * t), -cos(2 * t)]
			const evalCurve = (t) => [
				t * t + 1,
				Math.sin(t),
				Math.exp(0.5 * t),
				-Math.cos(2 * t),
			]
			const evalDeriv = (t) => [
				2 * t,
				Math.cos(t),
				0.5 * Math.exp(0.5 * t),
				2 * Math.sin(2 * t),
			]

			const h = 1e-6
			for (const t of [-1.3, 0, 0.7, 2.1]) {
				const v = evalCurve(t)
				const d = evalDeriv(t)
				const dualVec = v.map((vi, idx) => ({ v: vi, d: d[idx] }))
				const res = magnitudeDualSeries(dualVec)

				const expectedV = Math.hypot(...v)
				const normPlus = Math.hypot(...evalCurve(t + h))
				const normMinus = Math.hypot(...evalCurve(t - h))
				const fdDeriv = (normPlus - normMinus) / (2 * h)

				approxEqual(res.v, expectedV, 1e-12)
				approxEqual(res.d, fdDeriv, 1e-8)
			}
		})

		it('satisfies dual squared-norm identity (||x||)^2 === sum(x_i^2)', () => {
			const vec = [
				{ v: 1.5, d: -0.7 },
				{ v: -2.25, d: 1.3 },
				{ v: 0.8, d: 2.1 },
				{ v: 3.1, d: -0.4 },
			]
			const mag = magnitudeDualSeries(vec)

			// Dual square of magnitude: (v + d*ε)^2 = v^2 + 2*v*d*ε
			const magSqV = mag.v * mag.v
			const magSqD = 2 * mag.v * mag.d

			// Direct sum of dual squares: Σ (v_i^2 + 2*v_i*d_i*ε)
			let sumSqV = 0
			let sumSqD = 0
			for (const { v, d } of vec) {
				sumSqV += v * v
				sumSqD += 2 * v * d
			}

			approxEqual(magSqV, sumSqV, 1e-11)
			approxEqual(magSqD, sumSqD, 1e-11)
		})

		it('satisfies dual positive homogeneity ||α * x|| === α * ||x|| for α.v > 0', () => {
			const alpha = { v: 2.75, d: -0.6 }
			const vec = [
				{ v: -1.2, d: 0.9 },
				{ v: 3.4, d: -1.1 },
				{ v: 0.5, d: 2.3 },
			]

			const scaledVec = vec.map(({ v, d }) => ({
				v: alpha.v * v,
				d: alpha.v * d + alpha.d * v,
			}))

			const lhs = magnitudeDualSeries(scaledVec)
			const base = magnitudeDualSeries(vec)
			const rhs = {
				v: alpha.v * base.v,
				d: alpha.v * base.d + alpha.d * base.v,
			}

			approxEqual(lhs.v, rhs.v, 1e-12)
			approxEqual(lhs.d, rhs.d, 1e-12)
		})

		it('is invariant under orthogonal rotation of both primal and tangent vectors', () => {
			const theta = 1.13
			const c = Math.cos(theta)
			const s = Math.sin(theta)
			const vec = [
				{ v: 2.5, d: -1.2 },
				{ v: -4.1, d: 3.7 },
			]
			const rotated = [
				{ v: c * vec[0].v - s * vec[1].v, d: c * vec[0].d - s * vec[1].d },
				{ v: s * vec[0].v + c * vec[1].v, d: s * vec[0].d + c * vec[1].d },
			]

			const origRes = magnitudeDualSeries(vec)
			const rotRes = magnitudeDualSeries(rotated)

			approxEqual(rotRes.v, origRes.v, 1e-12)
			approxEqual(rotRes.d, origRes.d, 1e-12)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when input is not an array', () => {
			for (const bad of [null, undefined, 42, 'vec', { v: 1, d: 0 }]) {
				assert.throws(() => magnitudeDualSeries(bad), TypeError)
			}
		})

		it('throws TypeError for non-object elements or non-numeric v/d', () => {
			assert.throws(() => magnitudeDualSeries([null]), TypeError)
			assert.throws(() => magnitudeDualSeries([undefined]), TypeError)
			assert.throws(() => magnitudeDualSeries([1]), TypeError)
			assert.throws(() => magnitudeDualSeries([{ v: '3', d: 1 }]), TypeError)
			assert.throws(() => magnitudeDualSeries([{ v: 3, d: '1' }]), TypeError)
			assert.throws(() => magnitudeDualSeries([{ v: 3 }]), TypeError)
		})

		it('throws RangeError for non-finite v or d', () => {
			assert.throws(() => magnitudeDualSeries([{ v: Number.NaN, d: 0 }]), RangeError)
			assert.throws(() => magnitudeDualSeries([{ v: 1, d: Number.NaN }]), RangeError)
			assert.throws(() => magnitudeDualSeries([{ v: Number.POSITIVE_INFINITY, d: 0 }]), RangeError)
			assert.throws(() => magnitudeDualSeries([{ v: 1, d: Number.NEGATIVE_INFINITY }]), RangeError)
		})
	})
})
