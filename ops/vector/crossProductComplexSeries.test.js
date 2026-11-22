import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductComplexSeries } from './crossProductComplexSeries.js'

const c = (re, im = 0) => ({ re, im })

const cAdd = (u, v) => ({ re: u.re + v.re, im: u.im + v.im })
const cSub = (u, v) => ({ re: u.re - v.re, im: u.im - v.im })
const cMul = (u, v) => ({
	re: u.re * v.re - u.im * v.im,
	im: u.re * v.im + u.im * v.re,
})
const cNeg = (u) => ({ re: -u.re, im: -u.im })

const vecAdd = (u, v) => u.map((ui, i) => cAdd(ui, v[i]))
const vecSub = (u, v) => u.map((ui, i) => cSub(ui, v[i]))
const vecScale = (s, v) => v.map((vi) => cMul(s, vi))
const vecDot = (u, v) =>
	u.reduce((acc, ui, i) => cAdd(acc, cMul(ui, v[i])), c(0, 0))

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`expected re ${actual.re} to be within ${eps} of ${expected.re}`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`expected im ${actual.im} to be within ${eps} of ${expected.im}`,
	)
}

function assertComplexVecClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertComplexClose(actual[i], expected[i], eps)
	}
}

/**
 * Independent Levi-Civita tensor summation for cross-checking.
 */
function leviCivitaCross(a, b) {
	const eps = (i, j, k) => {
		if (i === j || j === k || i === k) return 0
		return (j - i) * (k - i) * (k - j) > 0 ? 1 : -1
	}
	const out = [c(0, 0), c(0, 0), c(0, 0)]
	for (let k = 0; k < 3; k++) {
		let sum = c(0, 0)
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				const sign = eps(i, j, k)
				if (sign !== 0) {
					const prod = cMul(a[i], b[j])
					sum = sign > 0 ? cAdd(sum, prod) : cSub(sum, prod)
				}
			}
		}
		out[k] = sum
	}
	return out
}

describe('crossProductComplexSeries', () => {
	test('standard real and imaginary basis vectors', () => {
		const e1 = [c(1), c(0), c(0)]
		const e2 = [c(0), c(1), c(0)]
		const e3 = [c(0), c(0), c(1)]

		assert.deepEqual(crossProductComplexSeries(e1, e2), e3)
		assert.deepEqual(crossProductComplexSeries(e2, e3), e1)
		assert.deepEqual(crossProductComplexSeries(e3, e1), e2)

		const ie1 = [c(0, 1), c(0), c(0)]
		const ie2 = [c(0), c(0, 1), c(0)]
		assert.deepEqual(crossProductComplexSeries(ie1, e2), [c(0), c(0), c(0, 1)])
		assert.deepEqual(crossProductComplexSeries(ie1, ie2), [c(0), c(0), c(-1, 0)])
	})

	test('hand-calculated general complex vectors', () => {
		const a = [c(1, 2), c(3, -1), c(0, 4)]
		const b = [c(2, -3), c(-1, 5), c(4, 1)]
		// Component 0: (3-i)(4+i) - (4i)(-1+5i) = (13 - i) - (-20 - 4i) = 33 + 3i
		// Component 1: (4i)(2-3i) - (1+2i)(4+i) = (12 + 8i) - (2 + 9i) = 10 - i
		// Component 2: (1+2i)(-1+5i) - (3-i)(2-3i) = (-11 + 3i) - (3 - 11i) = -14 + 14i
		const expected = [c(33, 3), c(10, -1), c(-14, 14)]

		assert.deepEqual(crossProductComplexSeries(a, b), expected)
	})

	test('parallel and complex-collinear vectors yield zero vector', () => {
		const zero = [c(0, 0), c(0, 0), c(0, 0)]
		const a = [c(2, -5), c(-3, 1), c(4, 7)]
		const scaled = vecScale(c(-2.5, 1.5), a)

		assertComplexVecClose(crossProductComplexSeries(a, a), zero)
		assertComplexVecClose(crossProductComplexSeries(a, scaled), zero)
		assert.deepEqual(crossProductComplexSeries(a, zero), zero)
		assert.deepEqual(crossProductComplexSeries(zero, a), zero)
	})

	test('anticommutativity: a × b = -(b × a)', () => {
		const a = [c(1.5, -2.25), c(-0.5, 3.75), c(4.25, 0.5)]
		const b = [c(-2.0, 1.25), c(2.5, -1.5), c(-3.75, 2.0)]

		const ab = crossProductComplexSeries(a, b)
		const ba = crossProductComplexSeries(b, a)
		assertComplexVecClose(ab, ba.map(cNeg))
	})

	test('bilinearity over complex scalars', () => {
		const a1 = [c(1, -1), c(2, 3), c(-4, 0.5)]
		const a2 = [c(0.5, 2), c(-1, 1.5), c(3, -2)]
		const b = [c(-2, 1), c(4, -0.5), c(1.5, 3)]
		const z1 = c(2, -3)
		const z2 = c(-1.5, 0.5)

		const lhs = crossProductComplexSeries(
			vecAdd(vecScale(z1, a1), vecScale(z2, a2)),
			b,
		)
		const rhs = vecAdd(
			vecScale(z1, crossProductComplexSeries(a1, b)),
			vecScale(z2, crossProductComplexSeries(a2, b)),
		)
		assertComplexVecClose(lhs, rhs)
	})

	test('cross-check against independent Levi-Civita summation', () => {
		const a = [c(3.1, -1.7), c(-2.4, 5.2), c(0.8, -4.3)]
		const b = [c(-1.9, 2.6), c(4.5, -0.3), c(-3.2, 1.1)]

		assertComplexVecClose(
			crossProductComplexSeries(a, b),
			leviCivitaCross(a, b),
		)
	})

	test('Lagrange BAC-CAB vector triple product identity: a × (b × c) = b(a·c) - c(a·b)', () => {
		const a = [c(1, -2), c(3, 0.5), c(-1.5, 2.5)]
		const b = [c(-2, 1.5), c(0.5, -3), c(4, -1)]
		const d = [c(2.5, 1), c(-1.5, 2), c(0.5, -2.5)]

		const lhs = crossProductComplexSeries(a, crossProductComplexSeries(b, d))
		const rhs = vecSub(
			vecScale(vecDot(a, d), b),
			vecScale(vecDot(a, b), d),
		)
		assertComplexVecClose(lhs, rhs)
	})

	test('Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = 0', () => {
		const a = [c(2, 1), c(-1, 3), c(0.5, -2)]
		const b = [c(-3, 0.5), c(1.5, -1), c(2, 4)]
		const d = [c(0.5, -1.5), c(2.5, 2), c(-1, 0.5)]

		const t1 = crossProductComplexSeries(a, crossProductComplexSeries(b, d))
		const t2 = crossProductComplexSeries(b, crossProductComplexSeries(d, a))
		const t3 = crossProductComplexSeries(d, crossProductComplexSeries(a, b))
		const sum = vecAdd(vecAdd(t1, t2), t3)

		assertComplexVecClose(sum, [c(0, 0), c(0, 0), c(0, 0)])
	})

	test('bilinear orthogonality and Lagrange dot-cross identity', () => {
		const a = [c(1.2, -0.7), c(2.3, 1.4), c(-0.8, 3.1)]
		const b = [c(-1.5, 2.2), c(0.4, -1.9), c(2.7, 0.6)]
		const d = [c(0.9, 1.1), c(-2.1, 0.3), c(1.6, -2.4)]
		const e = [c(-0.5, -1.3), c(3.2, 0.8), c(-1.1, 1.7)]

		const axb = crossProductComplexSeries(a, b)
		assertComplexClose(vecDot(a, axb), c(0, 0))
		assertComplexClose(vecDot(b, axb), c(0, 0))

		// (a × b) · (d × e) = (a · d)(b · e) - (a · e)(b · d)
		const dxe = crossProductComplexSeries(d, e)
		const lhs = vecDot(axb, dxe)
		const rhs = cSub(
			cMul(vecDot(a, d), vecDot(b, e)),
			cMul(vecDot(a, e), vecDot(b, d)),
		)
		assertComplexClose(lhs, rhs)
	})

	test('does not mutate input vectors', () => {
		const a = [c(1, 2), c(3, 4), c(5, 6)]
		const b = [c(7, 8), c(9, 10), c(11, 12)]
		const aCopy = structuredClone(a)
		const bCopy = structuredClone(b)

		crossProductComplexSeries(a, b)

		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
	})

	test('validates wrong dimensions and invalid inputs', () => {
		const valid = [c(1, 0), c(0, 1), c(1, 1)]

		// Non-arrays
		assert.throws(() => crossProductComplexSeries(null, valid), TypeError)
		assert.throws(() => crossProductComplexSeries(valid, undefined), TypeError)
		assert.throws(() => crossProductComplexSeries('abc', valid), TypeError)
		assert.throws(() => crossProductComplexSeries({ length: 3 }, valid), TypeError)

		// Wrong dimensions
		assert.throws(() => crossProductComplexSeries([], valid), RangeError)
		assert.throws(
			() => crossProductComplexSeries([c(1, 0), c(2, 0)], valid),
			RangeError,
		)
		assert.throws(
			() =>
				crossProductComplexSeries(valid, [c(1), c(2), c(3), c(4)]),
			RangeError,
		)

		// Invalid complex element shapes
		assert.throws(
			() => crossProductComplexSeries([null, c(0), c(0)], valid),
			TypeError,
		)
		assert.throws(
			() => crossProductComplexSeries([1, c(0), c(0)], valid),
			TypeError,
		)
		assert.throws(
			() => crossProductComplexSeries([[1, 0], c(0), c(0)], valid),
			TypeError,
		)
		assert.throws(
			() => crossProductComplexSeries([{ re: 1 }, c(0), c(0)], valid),
			TypeError,
		)
		assert.throws(
			() =>
				crossProductComplexSeries(valid, [
					{ re: '1', im: 0 },
					c(0),
					c(0),
				]),
			TypeError,
		)

		// Non-finite numbers
		assert.throws(
			() => crossProductComplexSeries([c(NaN, 0), c(0), c(0)], valid),
			RangeError,
		)
		assert.throws(
			() => crossProductComplexSeries([c(0, Infinity), c(0), c(0)], valid),
			RangeError,
		)
		assert.throws(
			() => crossProductComplexSeries(valid, [c(0), c(-Infinity, 0), c(0)]),
			RangeError,
		)
	})
})
