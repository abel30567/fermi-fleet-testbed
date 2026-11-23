import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { cosDualRecursive } from './cosDualRecursive.js'

const assertClose = (actual, expected, tol = 1e-14, msg = '') => {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${msg ? `${msg}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

describe('cosDualRecursive', () => {
	describe('normal cases', () => {
		test('standard angles with unit derivative', () => {
			const cases = [
				{ v: Math.PI / 6, cos: Math.sqrt(3) / 2, negSin: -0.5 },
				{ v: Math.PI / 4, cos: Math.SQRT1_2, negSin: -Math.SQRT1_2 },
				{ v: Math.PI / 3, cos: 0.5, negSin: -Math.sqrt(3) / 2 },
				{ v: (2 * Math.PI) / 3, cos: -0.5, negSin: -Math.sqrt(3) / 2 },
				{ v: (3 * Math.PI) / 4, cos: -Math.SQRT1_2, negSin: -Math.SQRT1_2 },
			]

			for (const { v, cos, negSin } of cases) {
				const res = cosDualRecursive({ v, d: 1 })
				assertClose(res.v, cos, 1e-14, `cos(${v})`)
				assertClose(res.d, negSin, 1e-14, `-sin(${v})`)
			}
		})

		test('chain rule scaling with arbitrary derivative d', () => {
			// f(t) = cos(3t + 0.7) => f'(t) = -3 * sin(3t + 0.7)
			const t = 0.42
			const innerV = 3 * t + 0.7
			const innerD = 3
			const res = cosDualRecursive({ v: innerV, d: innerD })

			assertClose(res.v, Math.cos(innerV), 1e-14)
			assertClose(res.d, -Math.sin(innerV) * innerD, 1e-14)
		})

		test('linearity of derivative component and non-mutation of input', () => {
			const input = { v: 1.234, d: -2.5 }
			const snapshot = { ...input }
			const r1 = cosDualRecursive(input)
			const r2 = cosDualRecursive({ v: 1.234, d: 4.0 })
			const rSum = cosDualRecursive({ v: 1.234, d: -2.5 + 4.0 })

			assert.deepStrictEqual(input, snapshot)
			assertClose(r1.v, r2.v, 0)
			assertClose(rSum.d, r1.d + r2.d, 1e-14)
		})

		test('even symmetry and periodicity', () => {
			const v = 1.1
			const d = 2.7
			const pos = cosDualRecursive({ v, d })
			const negBoth = cosDualRecursive({ v: -v, d: -d })
			const negAngle = cosDualRecursive({ v: -v, d })
			const shifted = cosDualRecursive({ v: v + 6 * Math.PI, d })

			// cos(-(v + d*e)) = cos(v + d*e)
			assertClose(negBoth.v, pos.v, 1e-14)
			assertClose(negBoth.d, pos.d, 1e-14)

			// cos(-v + d*e) = cos(v) + sin(v)*d*e
			assertClose(negAngle.v, pos.v, 1e-14)
			assertClose(negAngle.d, -pos.d, 1e-14)

			// 2*pi periodicity
			assertClose(shifted.v, pos.v, 1e-13)
			assertClose(shifted.d, pos.d, 1e-13)
		})
	})

	describe('edge cases', () => {
		test('zero angle and signed-zero normalization', () => {
			const r0 = cosDualRecursive({ v: 0, d: 1 })
			assert.equal(r0.v, 1)
			assert.ok(Object.is(r0.d, 0), 'derivative at v=0 should be +0, not -0')

			const rNeg0 = cosDualRecursive({ v: -0, d: -5 })
			assert.equal(rNeg0.v, 1)
			assert.ok(Object.is(rNeg0.d, 0))

			const rZeroD = cosDualRecursive({ v: 1.5, d: 0 })
			assertClose(rZeroD.v, Math.cos(1.5), 1e-14)
			assert.ok(Object.is(rZeroD.d, 0))
		})

		test('quadrant boundaries: pi/2, -pi/2, pi, -pi, 2*pi', () => {
			const halfPi = cosDualRecursive({ v: Math.PI / 2, d: 1 })
			assertClose(halfPi.v, 0, 1e-15)
			assertClose(halfPi.d, -1, 1e-14)

			const negHalfPi = cosDualRecursive({ v: -Math.PI / 2, d: 1 })
			assertClose(negHalfPi.v, 0, 1e-15)
			assertClose(negHalfPi.d, 1, 1e-14)

			const pi = cosDualRecursive({ v: Math.PI, d: 2 })
			assertClose(pi.v, -1, 1e-14)
			assertClose(pi.d, 0, 1e-14)

			const negPi = cosDualRecursive({ v: -Math.PI, d: 2 })
			assertClose(negPi.v, -1, 1e-14)
			assertClose(negPi.d, 0, 1e-14)

			const twoPi = cosDualRecursive({ v: 2 * Math.PI, d: 3 })
			assertClose(twoPi.v, 1, 1e-14)
			assertClose(twoPi.d, 0, 1e-14)
		})

		test('very small angles below and around base-case threshold', () => {
			for (const v of [1e-12, -1e-9, 1e-6, 1 / 1024, 1 / 512, -1 / 512]) {
				const res = cosDualRecursive({ v, d: 1.5 })
				assertClose(res.v, Math.cos(v), 1e-15, `small v=${v}`)
				assertClose(res.d, -Math.sin(v) * 1.5, 1e-15, `small d at v=${v}`)
			}
		})

		test('negative and large angles', () => {
			const angles = [-0.5, -2.75, -100, 100, 1e4, -1e6, 1e6, 1e8, -1e9, 1e11]
			for (const v of angles) {
				const d = -1.75
				const res = cosDualRecursive({ v, d })
				assertClose(res.v, Math.cos(v), 1e-12, `large cos(${v})`)
				assertClose(res.d, -Math.sin(v) * d, 1e-12, `large deriv(${v})`)
			}
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-object or array inputs', () => {
			for (const bad of [null, undefined, 0, 1.5, '0', true, [0, 1], () => {}]) {
				assert.throws(() => cosDualRecursive(bad), TypeError)
			}
		})

		test('throws TypeError for missing or non-numeric v or d', () => {
			const badInputs = [
				{},
				{ v: 0 },
				{ d: 1 },
				{ v: '0', d: 1 },
				{ v: 0, d: '1' },
				{ v: null, d: 1 },
				{ v: 0, d: undefined },
				{ v: 0n, d: 1 },
			]
			for (const bad of badInputs) {
				assert.throws(() => cosDualRecursive(bad), TypeError)
			}
		})

		test('throws RangeError for NaN or infinite v or d', () => {
			const badInputs = [
				{ v: Number.NaN, d: 1 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 1, d: Number.POSITIVE_INFINITY },
				{ v: 1, d: Number.NEGATIVE_INFINITY },
			]
			for (const bad of badInputs) {
				assert.throws(() => cosDualRecursive(bad), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches Math.cos and -Math.sin across dense angle sweep', () => {
			const steps = 200
			for (let i = -steps; i <= steps; i++) {
				const v = (i / steps) * 4 * Math.PI
				const d = 0.75 * (i % 5 === 0 ? -1 : 1)
				const res = cosDualRecursive({ v, d })

				assertClose(res.v, Math.cos(v), 1e-14, `sweep cos(${v})`)
				assertClose(res.d, -Math.sin(v) * d, 1e-14, `sweep deriv(${v})`)
			}
		})

		test('central finite-difference derivative cross-check', () => {
			const h = 1e-6
			const points = [-3.1, -1.7, -0.35, 0, 0.25, 1.2, 2.5, 5.8, 12.3]
			for (const v of points) {
				const d = 2.3
				const res = cosDualRecursive({ v, d })
				const fPlus = cosDualRecursive({ v: v + h, d: 0 }).v
				const fMinus = cosDualRecursive({ v: v - h, d: 0 }).v
				const fdDeriv = ((fPlus - fMinus) / (2 * h)) * d

				assertClose(res.d, fdDeriv, 1e-9, `finite-diff at v=${v}`)
			}
		})

		test('Pythagorean identity cos^2(v) + (-sin(v))^2 = 1', () => {
			for (const v of [-7.2, -1.3, 0, 0.8, 2.9, 1000.5]) {
				const { v: c, d: negS } = cosDualRecursive({ v, d: 1 })
				assertClose(c * c + negS * negS, 1, 1e-14, `Pythagorean at v=${v}`)
			}
		})
	})
})
