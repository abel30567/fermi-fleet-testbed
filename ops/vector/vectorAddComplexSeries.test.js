import { describe, test } from 'node:test'
import assert from 'node:assert'
import { vectorAddComplexSeries } from './vectorAddComplexSeries.js'

const EPSILON = 1e-12

function assertComplexNear(actual, expected, eps = EPSILON) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`Expected re ~ ${expected.re}, got ${actual.re}`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`Expected im ~ ${expected.im}, got ${actual.im}`,
	)
}

function assertComplexVectorNear(actual, expected, eps = EPSILON) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assertComplexNear(actual[i], expected[i], eps)
	}
}

function squaredNorm(v) {
	let sum = 0
	for (const { re, im } of v) {
		sum += re * re + im * im
	}
	return sum
}

function negateVector(v) {
	return v.map(({ re, im }) => ({ re: -re, im: -im }))
}

function conjugateVector(v) {
	return v.map(({ re, im }) => ({ re, im: -im }))
}

function expIByPowerSeries(theta, terms = 25) {
	let re = 0
	let im = 0
	let power = 1
	let fact = 1
	for (let n = 0; n < terms; n++) {
		if (n > 0) {
			power *= theta
			fact *= n
		}
		const coeff = power / fact
		const mod = n % 4
		if (mod === 0) re += coeff
		else if (mod === 1) im += coeff
		else if (mod === 2) re -= coeff
		else im -= coeff
	}
	return { re, im }
}

describe('vectorAddComplexSeries', () => {
	test('adds standard multi-element complex vectors', () => {
		const a = [
			{ re: 1, im: 2 },
			{ re: -3.5, im: 4.25 },
			{ re: 0, im: -7 },
		]
		const b = [
			{ re: 5, im: -1 },
			{ re: 2.5, im: 0.75 },
			{ re: 3, im: 7 },
		]
		const sum = vectorAddComplexSeries(a, b)
		assert.deepEqual(sum, [
			{ re: 6, im: 1 },
			{ re: -1, im: 5 },
			{ re: 3, im: 0 },
		])
	})

	test('handles single-element complex vectors', () => {
		const sum = vectorAddComplexSeries([{ re: -2.25, im: 3.5 }], [{ re: 1.25, im: -0.5 }])
		assert.deepEqual(sum, [{ re: -1, im: 3 }])
	})

	test('handles empty vectors', () => {
		const sum = vectorAddComplexSeries([], [])
		assert.deepEqual(sum, [])
	})

	test('satisfies zero vector additive identity', () => {
		const u = [
			{ re: 2.5, im: -1.5 },
			{ re: -4, im: 9.25 },
		]
		const zero = [
			{ re: 0, im: 0 },
			{ re: 0, im: 0 },
		]
		assert.deepEqual(vectorAddComplexSeries(u, zero), u)
		assert.deepEqual(vectorAddComplexSeries(zero, u), u)
	})

	test('satisfies additive inverse property u + (-u) = 0', () => {
		const u = [
			{ re: 3.14, im: -2.71 },
			{ re: -10, im: 0.5 },
			{ re: 0, im: 0 },
		]
		const negU = negateVector(u)
		const sum = vectorAddComplexSeries(u, negU)
		assertComplexVectorNear(
			sum,
			[
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
			],
		)
	})

	test('does not mutate input arrays or elements and returns fresh objects', () => {
		const a = [
			{ re: 1, im: 2 },
			{ re: 3, im: 4 },
		]
		const b = [
			{ re: 5, im: 6 },
			{ re: 7, im: 8 },
		]
		const aSnapshot = structuredClone(a)
		const bSnapshot = structuredClone(b)

		const out = vectorAddComplexSeries(a, b)
		assert.deepEqual(a, aSnapshot)
		assert.deepEqual(b, bSnapshot)
		assert.notEqual(out, a)
		assert.notEqual(out, b)
		assert.notEqual(out[0], a[0])
		assert.notEqual(out[0], b[0])

		out[0].re = 999
		assert.deepEqual(a, aSnapshot)
		assert.deepEqual(b, bSnapshot)
	})

	test('throws RangeError on mismatched lengths', () => {
		assert.throws(
			() => vectorAddComplexSeries([{ re: 1, im: 2 }], []),
			RangeError,
		)
		assert.throws(
			() =>
				vectorAddComplexSeries(
					[{ re: 1, im: 0 }],
					[
						{ re: 1, im: 0 },
						{ re: 2, im: 0 },
					],
				),
			RangeError,
		)
	})

	test('throws TypeError or RangeError on invalid inputs', () => {
		assert.throws(() => vectorAddComplexSeries(null, []), TypeError)
		assert.throws(() => vectorAddComplexSeries([], undefined), TypeError)
		assert.throws(() => vectorAddComplexSeries('abc', []), TypeError)
		assert.throws(() => vectorAddComplexSeries({}, []), TypeError)

		assert.throws(() => vectorAddComplexSeries([null], [{ re: 0, im: 0 }]), TypeError)
		assert.throws(() => vectorAddComplexSeries([[1, 2]], [{ re: 0, im: 0 }]), TypeError)
		assert.throws(() => vectorAddComplexSeries([42], [{ re: 0, im: 0 }]), TypeError)
		assert.throws(() => vectorAddComplexSeries([{ re: 1 }], [{ re: 0, im: 0 }]), TypeError)
		assert.throws(() => vectorAddComplexSeries([{ re: '1', im: 0 }], [{ re: 0, im: 0 }]), TypeError)
		assert.throws(() => vectorAddComplexSeries([{ re: 0, im: 0 }], [{ re: 1, im: null }]), TypeError)

		assert.throws(() => vectorAddComplexSeries([{ re: NaN, im: 0 }], [{ re: 0, im: 0 }]), RangeError)
		assert.throws(() => vectorAddComplexSeries([{ re: 0, im: Infinity }], [{ re: 0, im: 0 }]), RangeError)
		assert.throws(() => vectorAddComplexSeries([{ re: 0, im: 0 }], [{ re: -Infinity, im: 1 }]), RangeError)
	})

	test('cross-check: commutativity, associativity, conjugate linearity, and parallelogram law', () => {
		const u = [
			{ re: 1.5, im: -2.25 },
			{ re: -3.75, im: 4.125 },
			{ re: 0.5, im: 6.5 },
			{ re: -2.0, im: -1.5 },
		]
		const v = [
			{ re: -4.25, im: 1.75 },
			{ re: 2.5, im: -0.625 },
			{ re: 3.125, im: -2.25 },
			{ re: 5.5, im: 3.0 },
		]
		const w = [
			{ re: 0.75, im: 3.5 },
			{ re: -1.25, im: -2.0 },
			{ re: 4.0, im: 1.25 },
			{ re: -0.5, im: 2.75 },
		]

		// Commutativity: u + v = v + u
		assertComplexVectorNear(
			vectorAddComplexSeries(u, v),
			vectorAddComplexSeries(v, u),
		)

		// Associativity: (u + v) + w = u + (v + w)
		assertComplexVectorNear(
			vectorAddComplexSeries(vectorAddComplexSeries(u, v), w),
			vectorAddComplexSeries(u, vectorAddComplexSeries(v, w)),
		)

		// Conjugate linearity: conj(u + v) = conj(u) + conj(v)
		assertComplexVectorNear(
			conjugateVector(vectorAddComplexSeries(u, v)),
			vectorAddComplexSeries(conjugateVector(u), conjugateVector(v)),
		)

		// Parallelogram law: ||u + v||^2 + ||u - v||^2 = 2(||u||^2 + ||v||^2)
		const uPlusV = vectorAddComplexSeries(u, v)
		const uMinusV = vectorAddComplexSeries(u, negateVector(v))
		const lhs = squaredNorm(uPlusV) + squaredNorm(uMinusV)
		const rhs = 2 * (squaredNorm(u) + squaredNorm(v))
		assert.ok(
			Math.abs(lhs - rhs) <= 1e-11,
			`Parallelogram law violated: lhs=${lhs}, rhs=${rhs}`,
		)
	})

	test('cross-check: sum of unit-circle phasors against Taylor series exp(i*theta)', () => {
		const anglesA = [0.2, 1.1, -0.7, 2.3]
		const anglesB = [0.5, -0.4, 1.8, -1.2]

		const a = anglesA.map((theta) => ({ re: Math.cos(theta), im: Math.sin(theta) }))
		const b = anglesB.map((theta) => ({ re: Math.cos(theta), im: Math.sin(theta) }))

		const actual = vectorAddComplexSeries(a, b)
		const expectedFromSeries = anglesA.map((thetaA, i) => {
			const za = expIByPowerSeries(thetaA)
			const zb = expIByPowerSeries(anglesB[i])
			return { re: za.re + zb.re, im: za.im + zb.im }
		})

		assertComplexVectorNear(actual, expectedFromSeries, 1e-12)
	})
})
