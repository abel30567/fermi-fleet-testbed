import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { addDualIterative } from './addDualIterative.js'

describe('addDualIterative', () => {
	describe('normal cases', () => {
		it('adds two dual numbers componentwise', () => {
			const res = addDualIterative({ v: 3, d: 1 }, { v: 4, d: -2 })
			assert.deepEqual(res, { v: 7, d: -1 })
		})

		it('adds multiple (3+) dual numbers iteratively', () => {
			const res = addDualIterative(
				{ v: 1.5, d: 0.25 },
				{ v: -2.5, d: 3.75 },
				{ v: 4.0, d: -1.5 },
				{ v: 0.5, d: 2.0 },
			)
			assert.deepEqual(res, { v: 3.5, d: 4.5 })
		})

		it('handles iterative summation over many operands', () => {
			const n = 100
			const operands = []
			for (let i = 1; i <= n; i += 1) {
				operands.push({ v: i, d: 2 * i - 1 })
			}
			const res = addDualIterative(...operands)
			// sum(1..n) = n(n+1)/2, sum(2i-1) = n^2
			assert.deepEqual(res, { v: (n * (n + 1)) / 2, d: n * n })
		})

		it('satisfies additive identity and inverse', () => {
			const a = { v: 5.25, d: -3.5 }
			const zero = { v: 0, d: 0 }
			const negA = { v: -5.25, d: 3.5 }

			assert.deepEqual(addDualIterative(a, zero), a)
			assert.deepEqual(addDualIterative(zero, a), a)
			assert.deepEqual(addDualIterative(a, negA), { v: 0, d: 0 })
		})

		it('satisfies commutativity and associativity for exact dyadic rationals', () => {
			const a = { v: 1.25, d: -0.5 }
			const b = { v: -3.5, d: 2.75 }
			const c = { v: 0.75, d: 1.125 }

			assert.deepEqual(addDualIterative(a, b), addDualIterative(b, a))
			assert.deepEqual(
				addDualIterative(addDualIterative(a, b), c),
				addDualIterative(a, addDualIterative(b, c)),
			)
			assert.deepEqual(
				addDualIterative(a, b, c),
				addDualIterative(addDualIterative(a, b), c),
			)
		})
	})

	describe('edge cases', () => {
		it('normalizes negative zero results to +0', () => {
			const res = addDualIterative({ v: -0, d: -0 }, { v: -0, d: -0 })
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))
		})

		it('does not mutate inputs and returns a fresh plain { v, d } object', () => {
			const a = Object.freeze({ v: 2, d: 3, extra: 'ignored' })
			const b = Object.freeze({ v: 5, d: 7 })
			const res = addDualIterative(a, b)

			assert.deepEqual(res, { v: 7, d: 10 })
			assert.deepEqual(Object.keys(res).sort(), ['d', 'v'])
			assert.notEqual(res, a)
			assert.notEqual(res, b)
		})

		it('handles very small subnormal numbers without losing validity', () => {
			const res = addDualIterative(
				{ v: Number.MIN_VALUE, d: Number.MIN_VALUE },
				{ v: Number.MIN_VALUE, d: -Number.MIN_VALUE },
			)
			assert.equal(res.v, 2 * Number.MIN_VALUE)
			assert.equal(res.d, 0)
		})
	})

	describe('input validation', () => {
		it('throws RangeError when fewer than 2 arguments are provided', () => {
			assert.throws(() => addDualIterative(), RangeError)
			assert.throws(() => addDualIterative({ v: 1, d: 2 }), RangeError)
		})

		it('throws TypeError for non-object, null, or array arguments', () => {
			const valid = { v: 1, d: 1 }
			for (const bad of [null, undefined, 42, '1', true, [1, 2], () => {}]) {
				assert.throws(() => addDualIterative(bad, valid), TypeError)
				assert.throws(() => addDualIterative(valid, bad), TypeError)
				assert.throws(() => addDualIterative(valid, valid, bad), TypeError)
			}
		})

		it('throws TypeError when v or d is missing or non-numeric', () => {
			const valid = { v: 1, d: 1 }
			const malformed = [
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 2 },
				{ v: 1, d: '2' },
				{ v: null, d: 2 },
				{ v: 1, d: undefined },
				{ v: 1n, d: 2 },
			]
			for (const bad of malformed) {
				assert.throws(() => addDualIterative(bad, valid), TypeError)
				assert.throws(() => addDualIterative(valid, bad), TypeError)
			}
		})

		it('throws RangeError when v or d is NaN or infinite', () => {
			const valid = { v: 1, d: 1 }
			const nonFinite = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 0 },
				{ v: Number.NEGATIVE_INFINITY, d: 0 },
				{ v: 0, d: Number.POSITIVE_INFINITY },
				{ v: 0, d: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFinite) {
				assert.throws(() => addDualIterative(bad, valid), RangeError)
				assert.throws(() => addDualIterative(valid, bad), RangeError)
				assert.throws(() => addDualIterative(valid, valid, bad), RangeError)
			}
		})

		it('throws RangeError when accumulated sum overflows finite IEEE-754 bounds', () => {
			assert.throws(
				() =>
					addDualIterative(
						{ v: Number.MAX_VALUE, d: 0 },
						{ v: Number.MAX_VALUE, d: 0 },
					),
				RangeError,
			)
			assert.throws(
				() =>
					addDualIterative(
						{ v: 0, d: -Number.MAX_VALUE },
						{ v: 0, d: -Number.MAX_VALUE },
					),
				RangeError,
			)
		})
	})

	describe('cross-check against central finite differences', () => {
		// Minimal independent dual-number elementary operations to compose differentiable f(x), g(x), h(x)
		const dualMul = (a, b) => ({ v: a.v * b.v, d: a.d * b.v + a.v * b.d })
		const dualDiv = (a, b) => ({
			v: a.v / b.v,
			d: (a.d * b.v - a.v * b.d) / (b.v * b.v),
		})
		const dualSin = (a) => ({ v: Math.sin(a.v), d: Math.cos(a.v) * a.d })
		const dualCos = (a) => ({ v: Math.cos(a.v), d: -Math.sin(a.v) * a.d })
		const dualExp = (a) => {
			const e = Math.exp(a.v)
			return { v: e, d: e * a.d }
		}
		const dualLog = (a) => ({ v: Math.log(a.v), d: a.d / a.v })

		// f(x) = sin(x^2 + 1)
		const fScalar = (x) => Math.sin(x * x + 1)
		const fDual = (xDual) =>
			dualSin(addDualIterative(dualMul(xDual, xDual), { v: 1, d: 0 }))

		// g(x) = exp(0.5 * x) * cos(x)
		const gScalar = (x) => Math.exp(0.5 * x) * Math.cos(x)
		const gDual = (xDual) =>
			dualMul(dualExp(dualMul({ v: 0.5, d: 0 }, xDual)), dualCos(xDual))

		// h(x) = ln(x^2 + 2) / (x + 5)
		const hScalar = (x) => Math.log(x * x + 2) / (x + 5)
		const hDual = (xDual) =>
			dualDiv(
				dualLog(addDualIterative(dualMul(xDual, xDual), { v: 2, d: 0 })),
				addDualIterative(xDual, { v: 5, d: 0 }),
			)

		const centralDiff = (fn, x, step = 1e-6) =>
			(fn(x + step) - fn(x - step)) / (2 * step)

		it('matches central finite differences for f(x) + g(x) across multiple points', () => {
			const points = [-2.3, -0.75, 0, 0.5, 1.4, 2.7]
			const fgScalar = (x) => fScalar(x) + gScalar(x)

			for (const x of points) {
				const xDual = { v: x, d: 1 }
				const result = addDualIterative(fDual(xDual), gDual(xDual))
				const expectedValue = fgScalar(x)
				const approxDeriv = centralDiff(fgScalar, x)

				assert.ok(
					Math.abs(result.v - expectedValue) < 1e-12,
					`value mismatch at x=${x}: got ${result.v}, expected ${expectedValue}`,
				)
				assert.ok(
					Math.abs(result.d - approxDeriv) < 1e-7,
					`derivative mismatch at x=${x}: got ${result.d}, finite-diff ${approxDeriv}`,
				)
			}
		})

		it('matches central finite differences for 3-term sum f(x) + g(x) + h(x)', () => {
			const points = [-3.1, -1.0, 0.25, 1.8, 3.5]
			const fghScalar = (x) => fScalar(x) + gScalar(x) + hScalar(x)

			for (const x of points) {
				const xDual = { v: x, d: 1 }
				const result = addDualIterative(
					fDual(xDual),
					gDual(xDual),
					hDual(xDual),
				)
				const expectedValue = fghScalar(x)
				const approxDeriv = centralDiff(fghScalar, x)

				assert.ok(
					Math.abs(result.v - expectedValue) < 1e-12,
					`value mismatch at x=${x}: got ${result.v}, expected ${expectedValue}`,
				)
				assert.ok(
					Math.abs(result.d - approxDeriv) < 1e-7,
					`derivative mismatch at x=${x}: got ${result.d}, finite-diff ${approxDeriv}`,
				)
			}
		})
	})
})
