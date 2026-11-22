import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeComplexSeries } from './magnitudeComplexSeries.js'

function approxEqual(actual, expected, relTol = 1e-12, absTol = 0) {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`
	)
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function complexSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
}

function complexInnerProduct(u, v) {
	let re = 0
	let im = 0
	for (let i = 0; i < u.length; i++) {
		// u_k * conj(v_k)
		re += u[i].re * v[i].re + u[i].im * v[i].im
		im += u[i].im * v[i].re - u[i].re * v[i].im
	}
	return { re, im }
}

describe('magnitudeComplexSeries', () => {
	test('computes exact magnitudes for standard complex vectors', () => {
		assert.equal(magnitudeComplexSeries([{ re: 3, im: 4 }]), 5)
		assert.equal(magnitudeComplexSeries([{ re: -6, im: 0 }]), 6)
		assert.equal(magnitudeComplexSeries([{ re: 0, im: -7 }]), 7)
		assert.equal(magnitudeComplexSeries([{ re: 1, im: 2 }, { re: 2, im: 0 }]), 3)
		assert.equal(magnitudeComplexSeries([{ re: 2, im: 3 }, { re: 6, im: 0 }]), 7)
		approxEqual(
			magnitudeComplexSeries([{ re: 1, im: 2 }, { re: -3, im: 4 }]),
			Math.sqrt(30)
		)
	})

	test('handles empty and zero vectors', () => {
		const empty = magnitudeComplexSeries([])
		assert.equal(empty, 0)
		assert.ok(Object.is(empty, 0))

		const zeros = magnitudeComplexSeries([
			{ re: 0, im: 0 },
			{ re: -0, im: -0 },
			{ re: 0, im: -0 },
		])
		assert.equal(zeros, 0)
		assert.ok(Object.is(zeros, 0))
	})

	test('avoids overflow for very large components', () => {
		const res1 = magnitudeComplexSeries([{ re: 3e300, im: 4e300 }])
		assert.ok(Number.isFinite(res1))
		approxEqual(res1, 5e300, 1e-15)

		const res2 = magnitudeComplexSeries([
			{ re: 1e307, im: 1e307 },
			{ re: -1e307, im: 1e307 },
		])
		assert.ok(Number.isFinite(res2))
		approxEqual(res2, 2e307, 1e-15)
	})

	test('avoids underflow for very small and subnormal components', () => {
		const res1 = magnitudeComplexSeries([{ re: 3e-300, im: 4e-300 }])
		assert.ok(res1 > 0)
		approxEqual(res1, 5e-300, 1e-15)

		const res2 = magnitudeComplexSeries([
			{ re: 1e-305, im: 1e-305 },
			{ re: 1e-305, im: -1e-305 },
		])
		assert.ok(res2 > 0)
		approxEqual(res2, 2e-305, 1e-15)

		const subnormal = magnitudeComplexSeries([{ re: 3e-320, im: 4e-320 }])
		assert.ok(subnormal > 0)
		approxEqual(subnormal, 5e-320, 1e-4)
	})

	test('preserves accuracy with compensated summation on wide dynamic range series', () => {
		// 1 + 10000 * (1e-8)^2 = 1 + 1e-12; naive sum loses 1e-16 terms against 1
		const v = [{ re: 1, im: 0 }]
		for (let i = 0; i < 10000; i++) {
			v.push({ re: 1e-8, im: 0 })
		}
		const result = magnitudeComplexSeries(v)
		const expected = Math.sqrt(1 + 1e-12)
		approxEqual(result, expected, 1e-15)
		assert.ok(result > 1, `Expected compensated sum to retain small terms, got ${result}`)
	})

	test('rejects invalid inputs with TypeError or RangeError', () => {
		assert.throws(() => magnitudeComplexSeries(null), TypeError)
		assert.throws(() => magnitudeComplexSeries(undefined), TypeError)
		assert.throws(() => magnitudeComplexSeries(42), TypeError)
		assert.throws(() => magnitudeComplexSeries('not-an-array'), TypeError)
		assert.throws(() => magnitudeComplexSeries({ re: 1, im: 2 }), TypeError)

		assert.throws(() => magnitudeComplexSeries([null]), TypeError)
		assert.throws(() => magnitudeComplexSeries([undefined]), TypeError)
		assert.throws(() => magnitudeComplexSeries([1]), TypeError)
		assert.throws(() => magnitudeComplexSeries([{ re: 1 }]), TypeError)
		assert.throws(() => magnitudeComplexSeries([{ im: 2 }]), TypeError)
		assert.throws(() => magnitudeComplexSeries([{ re: '3', im: 4 }]), TypeError)
		assert.throws(() => magnitudeComplexSeries(new Array(2)), TypeError)

		assert.throws(() => magnitudeComplexSeries([{ re: NaN, im: 0 }]), RangeError)
		assert.throws(() => magnitudeComplexSeries([{ re: 0, im: NaN }]), RangeError)
		assert.throws(() => magnitudeComplexSeries([{ re: Infinity, im: 1 }]), RangeError)
		assert.throws(() => magnitudeComplexSeries([{ re: 1, im: -Infinity }]), RangeError)
	})

	test('cross-check: agrees with sqrt(Re(<v, v>)) and Math.hypot', () => {
		const v = [
			{ re: 1.5, im: -2.25 },
			{ re: -0.75, im: 3.125 },
			{ re: 4.5, im: 0.5 },
			{ re: -2.0, im: -1.75 },
		]

		const norm = magnitudeComplexSeries(v)
		const inner = complexInnerProduct(v, v)
		assert.equal(inner.im, 0)
		approxEqual(norm, Math.sqrt(inner.re), 1e-15)

		const flat = v.flatMap(({ re, im }) => [re, im])
		approxEqual(norm, Math.hypot(...flat), 1e-15)
	})

	test('cross-check: satisfies absolute homogeneity ||c * v|| = |c| * ||v||', () => {
		const v = [
			{ re: 1.2, im: -3.4 },
			{ re: 5.6, im: 7.8 },
			{ re: -2.1, im: 0.9 },
		]
		const scalars = [
			{ re: 0, im: 0 },
			{ re: -2.5, im: 0 },
			{ re: 0, im: 3.5 },
			{ re: 2.5, im: -4.25 },
			{ re: Math.cos(1.1), im: Math.sin(1.1) }, // unit complex rotation
		]

		const normV = magnitudeComplexSeries(v)
		for (const c of scalars) {
			const scaled = v.map((z) => complexMul(c, z))
			const absC = Math.hypot(c.re, c.im)
			approxEqual(magnitudeComplexSeries(scaled), absC * normV, 1e-14, 1e-15)
		}
	})

	test('cross-check: satisfies triangle inequality and parallelogram law', () => {
		const u = [
			{ re: 2.3, im: -1.1 },
			{ re: -0.5, im: 4.2 },
			{ re: 3.7, im: 2.9 },
		]
		const v = [
			{ re: -1.8, im: 3.4 },
			{ re: 2.6, im: -0.9 },
			{ re: 1.1, im: -5.2 },
		]

		const sum = u.map((z, i) => complexAdd(z, v[i]))
		const diff = u.map((z, i) => complexSub(z, v[i]))

		const normU = magnitudeComplexSeries(u)
		const normV = magnitudeComplexSeries(v)
		const normSum = magnitudeComplexSeries(sum)
		const normDiff = magnitudeComplexSeries(diff)

		// Triangle inequality: ||u + v|| <= ||u|| + ||v||
		assert.ok(normSum <= normU + normV + 1e-12)
		// Reverse triangle inequality: | ||u|| - ||v|| | <= ||u - v||
		assert.ok(Math.abs(normU - normV) <= normDiff + 1e-12)
		// Parallelogram law: ||u + v||^2 + ||u - v||^2 = 2 * (||u||^2 + ||v||^2)
		approxEqual(
			normSum * normSum + normDiff * normDiff,
			2 * (normU * normU + normV * normV),
			1e-13
		)
	})
})
