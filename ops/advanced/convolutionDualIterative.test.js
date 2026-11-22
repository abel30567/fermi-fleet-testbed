import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionDualIterative } from './convolutionDualIterative.js'

/**
 * Helper to assert two dual-number arrays match within an absolute tolerance.
 *
 * @param {Array<{v: number, d: number}>} actual
 * @param {Array<{v: number, d: number}>} expected
 * @param {number} [tol=1e-12]
 */
function assertDualArrayClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length, `length mismatch: ${actual.length} !== ${expected.length}`)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i].v - expected[i].v) <= tol,
			`index ${i} value mismatch: ${actual[i].v} vs ${expected[i].v}`,
		)
		assert.ok(
			Math.abs(actual[i].d - expected[i].d) <= tol,
			`index ${i} derivative mismatch: ${actual[i].d} vs ${expected[i].d}`,
		)
	}
}

/**
 * Independent scalar discrete linear convolution for cross-checking.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function realConvolve(a, b) {
	if (a.length === 0 || b.length === 0) return []
	const out = new Array(a.length + b.length - 1).fill(0)
	for (let k = 0; k < out.length; k++) {
		const iMin = Math.max(0, k - b.length + 1)
		const iMax = Math.min(a.length - 1, k)
		let sum = 0
		for (let i = iMin; i <= iMax; i++) {
			sum += a[i] * b[k - i]
		}
		out[k] = sum
	}
	return out
}

describe('convolutionDualIterative', () => {
	describe('normal cases', () => {
		it('computes hand-verified convolution of two dual sequences', () => {
			// a = [(1, 2), (3, -1)]
			// b = [(4, 0.5), (-2, 3), (5, 1)]
			// k=0: a0*b0 = (1*4, 1*0.5 + 2*4) = (4, 8.5)
			// k=1: a0*b1 + a1*b0
			//      = (1*(-2), 1*3 + 2*(-2)) + (3*4, 3*0.5 + (-1)*4)
			//      = (-2, -1) + (12, -2.5) = (10, -3.5)
			// k=2: a0*b2 + a1*b1
			//      = (1*5, 1*1 + 2*5) + (3*(-2), 3*3 + (-1)*(-2))
			//      = (5, 11) + (-6, 11) = (-1, 22)
			// k=3: a1*b2 = (3*5, 3*1 + (-1)*5) = (15, -2)
			const a = [
				{ v: 1, d: 2 },
				{ v: 3, d: -1 },
			]
			const b = [
				{ v: 4, d: 0.5 },
				{ v: -2, d: 3 },
				{ v: 5, d: 1 },
			]
			const expected = [
				{ v: 4, d: 8.5 },
				{ v: 10, d: -3.5 },
				{ v: -1, d: 22 },
				{ v: 15, d: -2 },
			]

			const result = convolutionDualIterative(a, b)
			assert.deepEqual(result, expected)
		})

		it('reduces to standard convolution when all derivatives are zero', () => {
			const aVals = [1.5, -2, 0.25, 4]
			const bVals = [-3, 0.5, 2]
			const a = aVals.map((v) => ({ v, d: 0 }))
			const b = bVals.map((v) => ({ v, d: 0 }))

			const result = convolutionDualIterative(a, b)
			const expectedVals = realConvolve(aVals, bVals)
			const expected = expectedVals.map((v) => ({ v, d: 0 }))

			assertDualArrayClose(result, expected)
		})

		it('returns all zeros when both inputs are purely infinitesimal (v = 0, since ε² = 0)', () => {
			const a = [
				{ v: 0, d: 3 },
				{ v: 0, d: -7 },
			]
			const b = [
				{ v: 0, d: 5 },
				{ v: 0, d: 2 },
				{ v: 0, d: -1 },
			]
			const result = convolutionDualIterative(a, b)
			assert.deepEqual(result, [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			])
		})

		it('does not mutate input arrays or element objects', () => {
			const a = [
				{ v: 2, d: 1 },
				{ v: -3, d: 4 },
			]
			const b = [{ v: 5, d: -2 }]
			const aSnapshot = structuredClone(a)
			const bSnapshot = structuredClone(b)

			const result = convolutionDualIterative(a, b)
			assert.deepEqual(a, aSnapshot)
			assert.deepEqual(b, bSnapshot)
			assert.notEqual(result[0], a[0])
			assert.notEqual(result[0], b[0])
		})
	})

	describe('edge cases and algebraic properties', () => {
		it('returns an empty array when either or both inputs are empty', () => {
			const sample = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
			]
			assert.deepEqual(convolutionDualIterative([], []), [])
			assert.deepEqual(convolutionDualIterative([], sample), [])
			assert.deepEqual(convolutionDualIterative(sample, []), [])
		})

		it('treats length-1 unit impulse [{ v: 1, d: 0 }] as multiplicative identity', () => {
			const impulse = [{ v: 1, d: 0 }]
			const a = [
				{ v: 2.5, d: -1.5 },
				{ v: 0, d: 3 },
				{ v: -4, d: 0.25 },
			]

			assert.deepEqual(convolutionDualIterative(a, impulse), a)
			assert.deepEqual(convolutionDualIterative(impulse, a), a)
		})

		it('scales and differentiates properly with a general length-1 dual impulse', () => {
			const scalar = [{ v: 3, d: 2 }]
			const a = [
				{ v: 4, d: -1 },
				{ v: -2, d: 5 },
			]
			// (4, -1)*(3, 2) = (12, 8 - 3) = (12, 5)
			// (-2, 5)*(3, 2) = (-6, -4 + 15) = (-6, 11)
			const expected = [
				{ v: 12, d: 5 },
				{ v: -6, d: 11 },
			]
			assert.deepEqual(convolutionDualIterative(a, scalar), expected)
			assert.deepEqual(convolutionDualIterative(scalar, a), expected)
		})

		it('shifts a sequence when convolved with a delayed unit impulse', () => {
			const a = [
				{ v: 1, d: 0.5 },
				{ v: 2, d: -1 },
			]
			const delayedImpulse = [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 1, d: 0 },
			]
			assert.deepEqual(convolutionDualIterative(a, delayedImpulse), [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 1, d: 0.5 },
				{ v: 2, d: -1 },
			])
		})

		it('handles all-zero sequences and embedded zeros', () => {
			const zeros2 = [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			]
			const a = [
				{ v: 0, d: 0 },
				{ v: 5, d: -2 },
				{ v: 0, d: 0 },
			]
			assert.deepEqual(convolutionDualIterative(zeros2, a), [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			])
			assert.deepEqual(convolutionDualIterative(a, a), [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 25, d: -20 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			])
		})

		it('satisfies commutativity: a * b === b * a', () => {
			const a = [
				{ v: 1.25, d: -0.5 },
				{ v: -3.5, d: 2.1 },
				{ v: 0.75, d: 4.3 },
				{ v: 2.0, d: -1.8 },
			]
			const b = [
				{ v: -0.6, d: 1.4 },
				{ v: 3.2, d: -2.7 },
			]

			const ab = convolutionDualIterative(a, b)
			const ba = convolutionDualIterative(b, a)
			assertDualArrayClose(ab, ba, 1e-14)
		})

		it('satisfies associativity: (a * b) * c === a * (b * c)', () => {
			const a = [
				{ v: 1, d: 0.5 },
				{ v: -2, d: 1.5 },
			]
			const b = [
				{ v: 3, d: -1 },
				{ v: 0.5, d: 2 },
				{ v: -1.5, d: 0.25 },
			]
			const c = [
				{ v: 2, d: 3 },
				{ v: -4, d: -0.5 },
			]

			const left = convolutionDualIterative(convolutionDualIterative(a, b), c)
			const right = convolutionDualIterative(a, convolutionDualIterative(b, c))
			assertDualArrayClose(left, right, 1e-12)
		})

		it('satisfies distributivity over dual addition: a * (b + c) === (a * b) + (a * c)', () => {
			const a = [
				{ v: 2, d: -1 },
				{ v: 0.5, d: 3 },
			]
			const b = [
				{ v: 1, d: 2 },
				{ v: -3, d: 0.5 },
				{ v: 4, d: -1.5 },
			]
			const c = [
				{ v: -2, d: 1 },
				{ v: 5, d: -2.5 },
				{ v: 1.5, d: 3 },
			]

			const bPlusC = b.map((bi, i) => ({ v: bi.v + c[i].v, d: bi.d + c[i].d }))
			const lhs = convolutionDualIterative(a, bPlusC)

			const ab = convolutionDualIterative(a, b)
			const ac = convolutionDualIterative(a, c)
			const rhs = ab.map((abi, i) => ({ v: abi.v + ac[i].v, d: abi.d + ac[i].d }))

			assertDualArrayClose(lhs, rhs, 1e-12)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when a or b is not an array', () => {
			const valid = [{ v: 1, d: 0 }]
			for (const bad of [null, undefined, 42, 'abc', { v: 1, d: 0 }, new Float64Array([1, 2])]) {
				assert.throws(() => convolutionDualIterative(bad, valid), TypeError)
				assert.throws(() => convolutionDualIterative(valid, bad), TypeError)
			}
		})

		it('throws TypeError when any element is not a valid dual object { v, d }', () => {
			const valid = [{ v: 1, d: 0 }]
			const badElements = [
				null,
				undefined,
				5,
				'1',
				[1, 2],
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 1, d: '0' },
				{ v: 1, d: null },
			]
			for (const badEl of badElements) {
				assert.throws(() => convolutionDualIterative([badEl], valid), TypeError)
				assert.throws(() => convolutionDualIterative(valid, [badEl]), TypeError)
			}
		})

		it('throws TypeError on sparse arrays with holes', () => {
			const sparse = new Array(2)
			sparse[0] = { v: 1, d: 0 }
			const valid = [{ v: 1, d: 0 }]
			assert.throws(() => convolutionDualIterative(sparse, valid), TypeError)
			assert.throws(() => convolutionDualIterative(valid, sparse), TypeError)
		})

		it('throws RangeError when any v or d is NaN or Infinity', () => {
			const valid = [{ v: 1, d: 0 }]
			const nonFinite = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: 1, d: Number.NEGATIVE_INFINITY },
			]
			for (const badEl of nonFinite) {
				assert.throws(() => convolutionDualIterative([badEl], valid), RangeError)
				assert.throws(() => convolutionDualIterative(valid, [badEl]), RangeError)
			}
		})

		it('validates both arrays even when the other array is empty', () => {
			assert.throws(() => convolutionDualIterative([], [{ v: Number.NaN, d: 0 }]), RangeError)
			assert.throws(() => convolutionDualIterative([{ v: 'bad', d: 0 }], []), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivatives for smooth parameterized sequences', () => {
			const makeA = (t) => [
				{ v: Math.sin(t), d: Math.cos(t) },
				{ v: t * t + 1, d: 2 * t },
				{ v: Math.exp(0.5 * t), d: 0.5 * Math.exp(0.5 * t) },
				{ v: Math.log(t + 3), d: 1 / (t + 3) },
			]
			const makeB = (t) => [
				{ v: Math.cos(2 * t), d: -2 * Math.sin(2 * t) },
				{ v: 1 / (t + 2), d: -1 / ((t + 2) * (t + 2)) },
				{ v: Math.sqrt(t + 4), d: 0.5 / Math.sqrt(t + 4) },
			]

			const t0 = 1.15
			const h = 1e-6

			const dualResult = convolutionDualIterative(makeA(t0), makeB(t0))

			const aReal0 = makeA(t0).map((x) => x.v)
			const bReal0 = makeB(t0).map((x) => x.v)
			const real0 = realConvolve(aReal0, bReal0)

			const realPlus = realConvolve(
				makeA(t0 + h).map((x) => x.v),
				makeB(t0 + h).map((x) => x.v),
			)
			const realMinus = realConvolve(
				makeA(t0 - h).map((x) => x.v),
				makeB(t0 - h).map((x) => x.v),
			)

			assert.equal(dualResult.length, real0.length)
			for (let k = 0; k < dualResult.length; k++) {
				const fdDeriv = (realPlus[k] - realMinus[k]) / (2 * h)
				assert.ok(
					Math.abs(dualResult[k].v - real0[k]) < 1e-12,
					`value mismatch at k=${k}: ${dualResult[k].v} vs ${real0[k]}`,
				)
				assert.ok(
					Math.abs(dualResult[k].d - fdDeriv) < 1e-8,
					`derivative mismatch at k=${k}: dual=${dualResult[k].d} vs fd=${fdDeriv}`,
				)
			}
		})

		it('matches polynomial product P(x)*Q(x) and its derivatives (P*Q)′(x) and ∂(P*Q)/∂t', () => {
			// Polynomials with parameter-dependent coefficients:
			// P(x; t) = Σ a_i(t) x^i,  Q(x; t) = Σ b_j(t) x^j
			const t = 0.7
			const a = [
				{ v: 2 + t, d: 1 }, // (2 + t)
				{ v: -1 + 2 * t * t, d: 4 * t }, // (-1 + 2t^2) x
				{ v: Math.sin(t), d: Math.cos(t) }, // sin(t) x^2
				{ v: 0.5 - 3 * t, d: -3 }, // (0.5 - 3t) x^3
			]
			const b = [
				{ v: Math.cos(t), d: -Math.sin(t) }, // cos(t)
				{ v: 3 * t - 1, d: 3 }, // (3t - 1) x
				{ v: Math.exp(-t), d: -Math.exp(-t) }, // e^{-t} x^2
			]

			// Evaluate polynomial and both ∂/∂t and ∂/∂x independently
			const evalPoly = (coeffs, x) => {
				let val = 0
				let dT = 0
				let dX = 0
				let xPow = 1
				for (let i = 0; i < coeffs.length; i++) {
					val += coeffs[i].v * xPow
					dT += coeffs[i].d * xPow
					if (i > 0) {
						dX += i * coeffs[i].v * x ** (i - 1)
					}
					xPow *= x
				}
				return { val, dT, dX }
			}

			const conv = convolutionDualIterative(a, b)

			for (const x of [-2.5, -0.4, 0, 1, 1.75]) {
				const p = evalPoly(a, x)
				const q = evalPoly(b, x)
				const r = evalPoly(conv, x)

				// Check R(x; t) = P(x; t) * Q(x; t)
				const expectedVal = p.val * q.val
				assert.ok(
					Math.abs(r.val - expectedVal) < 1e-11,
					`P(x)*Q(x) mismatch at x=${x}: ${r.val} vs ${expectedVal}`,
				)

				// Check ∂(P*Q)/∂t = P_t * Q + P * Q_t
				const expectedDT = p.dT * q.val + p.val * q.dT
				assert.ok(
					Math.abs(r.dT - expectedDT) < 1e-11,
					`∂(P*Q)/∂t mismatch at x=${x}: ${r.dT} vs ${expectedDT}`,
				)

				// Check (P*Q)'(x) = P'(x)*Q(x) + P(x)*Q'(x) directly from convolution output
				const expectedDX = p.dX * q.val + p.val * q.dX
				assert.ok(
					Math.abs(r.dX - expectedDX) < 1e-11,
					`(P*Q)'(x) mismatch at x=${x}: ${r.dX} vs ${expectedDX}`,
				)

				// Also cross-check (P*Q)'(x) using dual convolution over monomial terms a_i*x^i
				const pMonomials = a.map((c, i) => ({
					v: c.v * x ** i,
					d: i === 0 ? 0 : i * c.v * x ** (i - 1),
				}))
				const qMonomials = b.map((c, j) => ({
					v: c.v * x ** j,
					d: j === 0 ? 0 : j * c.v * x ** (j - 1),
				}))
				const convMonomials = convolutionDualIterative(pMonomials, qMonomials)
				const sumVal = convMonomials.reduce((acc, el) => acc + el.v, 0)
				const sumDX = convMonomials.reduce((acc, el) => acc + el.d, 0)
				assert.ok(
					Math.abs(sumVal - expectedVal) < 1e-11,
					`monomial dual conv value mismatch at x=${x}: ${sumVal} vs ${expectedVal}`,
				)
				assert.ok(
					Math.abs(sumDX - expectedDX) < 1e-11,
					`monomial dual conv (P*Q)'(x) mismatch at x=${x}: ${sumDX} vs ${expectedDX}`,
				)
			}
		})
	})
})
