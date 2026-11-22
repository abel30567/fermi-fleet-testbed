import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeDualRecursive } from './magnitudeDualRecursive.js'

describe('magnitudeDualRecursive', () => {
	test('1D positive and negative vectors', () => {
		assert.deepEqual(magnitudeDualRecursive([{ v: 5, d: 2 }]), { v: 5, d: 2 })
		assert.deepEqual(magnitudeDualRecursive([{ v: -5, d: 2 }]), { v: 5, d: -2 })

		const zeroTangentNeg = magnitudeDualRecursive([{ v: -4, d: 0 }])
		assert.equal(zeroTangentNeg.v, 4)
		assert.ok(Object.is(zeroTangentNeg.d, 0), 'derivative should normalize -0 to +0')
	})

	test('3-4-5 right triangle with various tangents', () => {
		const res1 = magnitudeDualRecursive([
			{ v: 3, d: 1 },
			{ v: 4, d: -2 },
		])
		assert.equal(res1.v, 5)
		assert.equal(res1.d, -1)

		const res2 = magnitudeDualRecursive([
			{ v: -3, d: 2 },
			{ v: 4, d: 3 },
		])
		assert.equal(res2.v, 5)
		// ( (-3)*2 + 4*3 ) / 5 = 6 / 5 = 1.2
		assert.ok(Math.abs(res2.d - 1.2) < 1e-12)
	})

	test('higher-dimensional vectors (odd, even, and power-of-two lengths)', () => {
		// 3D: [1, 2, 2], ||x|| = 3, dx = [3, -1, 4] -> (3 - 2 + 8) / 3 = 3
		const res3d = magnitudeDualRecursive([
			{ v: 1, d: 3 },
			{ v: 2, d: -1 },
			{ v: 2, d: 4 },
		])
		assert.equal(res3d.v, 3)
		assert.equal(res3d.d, 3)

		// 4D: [1, -1, 1, -1], ||x|| = 2, dx = [2, 2, -2, -2] -> (2 - 2 - 2 + 2) / 2 = 0
		const res4d = magnitudeDualRecursive([
			{ v: 1, d: 2 },
			{ v: -1, d: 2 },
			{ v: 1, d: -2 },
			{ v: -1, d: -2 },
		])
		assert.equal(res4d.v, 2)
		assert.ok(Object.is(res4d.d, 0))

		// 7D (non-power-of-two odd length)
		const vec7 = [
			{ v: 2, d: 0.5 },
			{ v: -3, d: 1.5 },
			{ v: 6, d: -0.25 },
			{ v: -1, d: 2 },
			{ v: 4, d: -1 },
			{ v: 0, d: 7 },
			{ v: -2, d: 0.75 },
		]
		const expectedV = Math.sqrt(4 + 9 + 36 + 1 + 16 + 0 + 4)
		const expectedDot = 2 * 0.5 + -3 * 1.5 + 6 * -0.25 + -1 * 2 + 4 * -1 + 0 * 7 + -2 * 0.75
		const res7 = magnitudeDualRecursive(vec7)
		assert.ok(Math.abs(res7.v - expectedV) < 1e-12)
		assert.ok(Math.abs(res7.d - expectedDot / expectedV) < 1e-12)
	})

	test('zero vector and subnormal underflow edge cases', () => {
		const zeroConst = magnitudeDualRecursive([
			{ v: 0, d: 0 },
			{ v: 0, d: 0 },
			{ v: 0, d: 0 },
		])
		assert.deepEqual(zeroConst, { v: 0, d: 0 })
		assert.ok(Object.is(zeroConst.d, 0))

		// Zero primal with non-zero tangent: s.v === 0 and s.d === 0 -> subgradient 0
		const zeroWithTangent = magnitudeDualRecursive([
			{ v: 0, d: 1 },
			{ v: -0, d: -2 },
		])
		assert.deepEqual(zeroWithTangent, { v: 0, d: 0 })
		assert.ok(Object.is(zeroWithTangent.d, 0))

		// Subnormal underflow where v^2 underflows to 0 but 2*v*d is non-zero -> d is NaN
		const subnormal = magnitudeDualRecursive([{ v: 1e-200, d: 1 }])
		assert.equal(subnormal.v, 0)
		assert.ok(Number.isNaN(subnormal.d))
	})

	test('cross-check against central finite difference of Math.hypot', () => {
		const cases = [
			[
				{ v: 1.25, d: -0.75 },
				{ v: -2.5, d: 1.4 },
				{ v: 0.8, d: 0.3 },
				{ v: -4.1, d: -2.2 },
				{ v: 3.3, d: 0.9 },
			],
			[
				{ v: -0.01, d: 5.0 },
				{ v: 0.02, d: -3.0 },
				{ v: 0.03, d: 1.0 },
			],
			Array.from({ length: 100 }, (_, i) => ({
				v: Math.sin(i + 1) * 10,
				d: Math.cos(i + 1) * 3,
			})),
		]

		const eps = 1e-7
		for (const vec of cases) {
			const res = magnitudeDualRecursive(vec)

			const primalHypot = Math.hypot(...vec.map((x) => x.v))
			const plus = Math.hypot(...vec.map((x) => x.v + eps * x.d))
			const minus = Math.hypot(...vec.map((x) => x.v - eps * x.d))
			const fdDeriv = (plus - minus) / (2 * eps)

			assert.ok(
				Math.abs(res.v - primalHypot) < 1e-11,
				`primal mismatch: got ${res.v}, expected ${primalHypot}`,
			)
			assert.ok(
				Math.abs(res.d - fdDeriv) < 1e-7,
				`derivative mismatch: got ${res.d}, finite-diff ${fdDeriv}`,
			)
		}
	})

	test('invalid inputs throw descriptive TypeError or RangeError', () => {
		// Non-array inputs
		for (const bad of [null, undefined, 42, 'abc', { v: 1, d: 0 }, true]) {
			assert.throws(() => magnitudeDualRecursive(bad), TypeError)
		}

		// Empty array
		assert.throws(() => magnitudeDualRecursive([]), RangeError)

		// Invalid element shapes
		for (const badEl of [null, undefined, 1, 'x', [1, 2], {}, { v: 1 }, { d: 1 }]) {
			assert.throws(() => magnitudeDualRecursive([{ v: 1, d: 0 }, badEl]), TypeError)
		}

		// Non-numeric v or d
		assert.throws(() => magnitudeDualRecursive([{ v: '3', d: 1 }]), TypeError)
		assert.throws(() => magnitudeDualRecursive([{ v: 3, d: '1' }]), TypeError)

		// Non-finite v or d
		for (const nonFinite of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			assert.throws(() => magnitudeDualRecursive([{ v: nonFinite, d: 1 }]), RangeError)
			assert.throws(() => magnitudeDualRecursive([{ v: 1, d: nonFinite }]), RangeError)
		}
	})
})
