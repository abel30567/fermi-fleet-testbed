import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arccosFloatRecursive } from './arccosFloatRecursive.js'

const TOL = 1e-14

function assertClose(actual, expected, tol = TOL, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

describe('arccosFloatRecursive', () => {
	it('returns exact values at domain boundaries and zero', () => {
		const atOne = arccosFloatRecursive(1)
		assert.equal(atOne, 0)
		assert.ok(Object.is(atOne, 0), 'arccos(1) should be +0')

		assert.equal(arccosFloatRecursive(0), Math.PI / 2)
		assert.equal(arccosFloatRecursive(-0), Math.PI / 2)
		assert.equal(arccosFloatRecursive(-1), Math.PI)
	})

	it('computes standard trigonometric angles accurately', () => {
		const cases = [
			[Math.sqrt(3) / 2, Math.PI / 6],
			[Math.SQRT1_2, Math.PI / 4],
			[0.5, Math.PI / 3],
			[-0.5, (2 * Math.PI) / 3],
			[-Math.SQRT1_2, (3 * Math.PI) / 4],
			[-Math.sqrt(3) / 2, (5 * Math.PI) / 6],
		]

		for (const [x, expected] of cases) {
			assertClose(arccosFloatRecursive(x), expected, TOL, `x=${x}`)
		}
	})

	it('handles values very close to +1, -1, and 0 without catastrophic cancellation', () => {
		const epsilons = [
			1e-2,
			1e-4,
			1e-6,
			1e-8,
			1e-10,
			1e-12,
			1e-14,
			1e-15,
			Number.EPSILON,
		]

		for (const eps of epsilons) {
			const nearPosOne = 1 - eps
			assertClose(
				arccosFloatRecursive(nearPosOne),
				Math.acos(nearPosOne),
				1e-14,
				`1 - ${eps}`
			)

			const nearNegOne = -1 + eps
			assertClose(
				arccosFloatRecursive(nearNegOne),
				Math.acos(nearNegOne),
				1e-14,
				`-1 + ${eps}`
			)
		}

		// Values very close to zero including subnormals
		for (const tiny of [1e-15, -1e-15, 1e-100, -1e-100, Number.MIN_VALUE, -Number.MIN_VALUE]) {
			assertClose(
				arccosFloatRecursive(tiny),
				Math.acos(tiny),
				1e-15,
				`tiny=${tiny}`
			)
		}
	})

	it('satisfies reflection, half-angle, and monotonicity properties', () => {
		const samples = [-0.99, -0.75, -0.3, -0.01, 0.01, 0.3, 0.75, 0.99]

		for (const x of samples) {
			// Reflection identity: arccos(x) + arccos(-x) = pi
			assertClose(
				arccosFloatRecursive(x) + arccosFloatRecursive(-x),
				Math.PI,
				1e-14,
				`reflection at x=${x}`
			)

			// Half-angle identity: arccos(x) = 2 * arccos(sqrt((1 + x) / 2))
			const halfCos = Math.sqrt((1 + x) / 2)
			assertClose(
				arccosFloatRecursive(x),
				2 * arccosFloatRecursive(halfCos),
				1e-14,
				`half-angle at x=${x}`
			)
		}

		// Strictly decreasing over [-1, 1]
		let prev = arccosFloatRecursive(-1)
		for (let i = -99; i <= 100; i++) {
			const x = i / 100
			const curr = arccosFloatRecursive(x)
			assert.ok(curr < prev, `expected strictly decreasing at x=${x}: ${curr} < ${prev}`)
			prev = curr
		}
	})

	it('cross-checks against Math.acos and Math.cos round-trip across [-1, 1]', () => {
		const steps = 1000
		let maxAcosErr = 0
		let maxRoundTripErr = 0

		for (let i = 0; i <= steps; i++) {
			const x = -1 + (2 * i) / steps
			const theta = arccosFloatRecursive(x)
			const ref = Math.acos(x)

			const acosErr = Math.abs(theta - ref)
			if (acosErr > maxAcosErr) maxAcosErr = acosErr

			const roundTripErr = Math.abs(Math.cos(theta) - x)
			if (roundTripErr > maxRoundTripErr) maxRoundTripErr = roundTripErr

			assert.ok(theta >= 0 && theta <= Math.PI, `range check failed at x=${x}: ${theta}`)
		}

		assert.ok(maxAcosErr <= 1e-14, `max error vs Math.acos was ${maxAcosErr}`)
		assert.ok(maxRoundTripErr <= 1e-14, `max round-trip |cos(arccos(x)) - x| was ${maxRoundTripErr}`)
	})

	it('propagates NaN', () => {
		assert.ok(Number.isNaN(arccosFloatRecursive(Number.NaN)))
	})

	it('throws RangeError for out-of-domain inputs (|x| > 1 and +/-Infinity)', () => {
		const outOfDomain = [
			1 + Number.EPSILON,
			-1 - Number.EPSILON,
			1.0001,
			-1.0001,
			2,
			-2,
			1e308,
			-1e308,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		]

		for (const x of outOfDomain) {
			assert.throws(
				() => arccosFloatRecursive(x),
				RangeError,
				`expected RangeError for x=${x}`
			)
		}
	})

	it('throws TypeError for non-number inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			'0.5',
			'',
			true,
			false,
			{},
			[0.5],
			0n,
			Symbol('x'),
		]

		for (const val of invalidInputs) {
			assert.throws(
				() => arccosFloatRecursive(val),
				TypeError,
				`expected TypeError for input ${String(val)}`
			)
		}
	})
})
