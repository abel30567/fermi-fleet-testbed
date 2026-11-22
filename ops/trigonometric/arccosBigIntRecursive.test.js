import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arccosBigIntRecursive, SCALE } from './arccosBigIntRecursive.js'

/**
 * Independent BigInt cosine reference computed via iterative Taylor series:
 *   cos(theta) = sum_{k=0}^N (-1)^k * theta^(2k) / (2k)!
 * Used to cross-check the algebraic identity cos(arccos(x)) ≈ x at full 10^18 precision.
 *
 * @param {bigint} thetaScaled - Angle in radians scaled by `scale`.
 * @param {bigint} scale - Fixed-point scale factor.
 * @returns {bigint} Fixed-point cos(theta) scaled by `scale`.
 */
function cosTaylorReference(thetaScaled, scale) {
	const guard = 10n ** 12n
	const workScale = scale * guard
	const theta = thetaScaled * guard
	const thetaSq = (theta * theta) / workScale

	let term = workScale
	let sum = workScale
	for (let k = 1n; term !== 0n; k += 1n) {
		term = (-term * thetaSq) / (workScale * (2n * k - 1n) * (2n * k))
		sum += term
	}
	const sign = sum < 0n ? -1n : 1n
	const absSum = sum < 0n ? -sum : sum
	return sign * ((absSum + guard / 2n) / guard)
}

function absDiff(a, b) {
	return a >= b ? a - b : b - a
}

describe('arccosBigIntRecursive', () => {
	test('exact boundary and canonical rational angles at default 10^18 scale', () => {
		assert.equal(SCALE, 10n ** 18n)

		// arccos(1) = 0
		assert.equal(arccosBigIntRecursive(SCALE), 0n)

		// arccos(0) = pi / 2 = 1.57079632679489661923...
		assert.equal(arccosBigIntRecursive(0n), 1570796326794896619n)

		// arccos(-1) = pi = 3.14159265358979323846...
		assert.equal(arccosBigIntRecursive(-SCALE), 3141592653589793238n)

		// arccos(1/2) = pi / 3 = 1.04719755119659774615...
		assert.equal(arccosBigIntRecursive(SCALE / 2n), 1047197551196597746n)

		// arccos(-1/2) = 2*pi / 3 = 2.09439510239319549230...
		assert.equal(arccosBigIntRecursive(-SCALE / 2n), 2094395102393195492n)
	})

	test('canonical irrational inputs sqrt(2)/2 and sqrt(3)/2', () => {
		const sqrt2Over2 = 707106781186547524n // floor(sqrt(2)/2 * 10^18)
		const piOver4 = 785398163397448310n // round(pi/4 * 10^18)
		const threePiOver4 = 2356194490192344929n // round(3*pi/4 * 10^18)

		assert.ok(
			absDiff(arccosBigIntRecursive(sqrt2Over2), piOver4) <= 1n,
			'arccos(sqrt(2)/2) should match pi/4 within 1 ulp (input rounding)',
		)
		assert.ok(
			absDiff(arccosBigIntRecursive(-sqrt2Over2), threePiOver4) <= 1n,
			'arccos(-sqrt(2)/2) should match 3*pi/4 within 1 ulp (input rounding)',
		)

		const sqrt3Over2 = 866025403784438647n // round(sqrt(3)/2 * 10^18)
		const piOver6 = 523598775598298873n // round(pi/6 * 10^18)
		const fivePiOver6 = 2617993877991494365n // round(5*pi/6 * 10^18)

		assert.ok(
			absDiff(arccosBigIntRecursive(sqrt3Over2), piOver6) <= 2n,
			'arccos(sqrt(3)/2) should match pi/6 within 2 ulp (input rounding)',
		)
		assert.ok(
			absDiff(arccosBigIntRecursive(-sqrt3Over2), fivePiOver6) <= 2n,
			'arccos(-sqrt(3)/2) should match 5*pi/6 within 2 ulp (input rounding)',
		)
	})

	test('extreme near-boundary and near-zero precision (beyond float64 resolution)', () => {
		// Near +1: arccos(1 - 10^-18) ≈ sqrt(2) * 10^-9 = 1.414213562373...e-9
		// Scaled by 10^18 -> 1414213562n (float64 loses 1 - 1e-18 completely to 1.0!)
		assert.equal(arccosBigIntRecursive(SCALE - 1n), 1414213562n)

		// Near -1: arccos(-(1 - 10^-18)) = pi - sqrt(2)*10^-9 ≈ 3.14159265217557967608...
		assert.equal(arccosBigIntRecursive(-(SCALE - 1n)), 3141592652175579676n)

		// Near 0: arccos(±10^-18) = pi/2 ∓ 10^-18 + O(10^-54)
		const halfPi = arccosBigIntRecursive(0n)
		assert.equal(arccosBigIntRecursive(1n), halfPi - 1n)
		assert.equal(arccosBigIntRecursive(-1n), halfPi + 1n)
	})

	test('symmetry arccos(x) + arccos(-x) ≈ pi and strict monotonicity', () => {
		const pi = arccosBigIntRecursive(-SCALE)
		const samples = [
			-SCALE,
			-(SCALE - 1n),
			-999999000000000000n,
			-900000000000000000n,
			-750000000000000000n,
			-500000000000000000n,
			-250000000000000000n,
			-10000000000000000n,
			-1n,
			0n,
			1n,
			10000000000000000n,
			250000000000000000n,
			500000000000000000n,
			750000000000000000n,
			900000000000000000n,
			999999000000000000n,
			SCALE - 1n,
			SCALE,
		]

		for (let i = 1; i < samples.length; i += 1) {
			const prev = arccosBigIntRecursive(samples[i - 1])
			const curr = arccosBigIntRecursive(samples[i])
			assert.ok(prev > curr, `Expected arccos to strictly decrease from ${samples[i - 1]} to ${samples[i]}`)
		}

		for (const x of samples) {
			if (x > 0n) {
				const sum = arccosBigIntRecursive(x) + arccosBigIntRecursive(-x)
				assert.ok(absDiff(sum, pi) <= 1n, `Symmetry failed for x=${x}: sum=${sum}, pi=${pi}`)
			}
		}
	})

	test('cross-check against Math.acos across [-1, 1]', () => {
		for (let i = -20; i <= 20; i += 1) {
			const x = (SCALE * BigInt(i)) / 20n
			const actual = Number(arccosBigIntRecursive(x)) / 1e18
			const expected = Math.acos(i / 20)
			assert.ok(
				Math.abs(actual - expected) < 1e-14,
				`Mismatch vs Math.acos at ${i}/20: actual=${actual}, expected=${expected}`,
			)
		}
	})

	test('cross-check algebraic identity cos(arccos(x)) ≈ x via independent BigInt Taylor cosine', () => {
		const testInputs = [
			-999000000000000000n,
			-876543210987654321n,
			-500000000000000000n,
			-123456789012345678n,
			-1000000n,
			0n,
			1000000n,
			123456789012345678n,
			333333333333333333n,
			666666666666666667n,
			987654321098765432n,
			999999000000000000n,
		]

		for (const x of testInputs) {
			const theta = arccosBigIntRecursive(x)
			const reconstructed = cosTaylorReference(theta, SCALE)
			assert.ok(
				absDiff(reconstructed, x) <= 2n,
				`cos(arccos(${x})) = ${reconstructed}, diff=${absDiff(reconstructed, x)}`,
			)
		}
	})

	test('custom scales including 50-digit high-precision BigInts and minimal scale=1n', () => {
		// 50 decimal digits of precision
		const scale50 = 10n ** 50n
		const pi50 = 314159265358979323846264338327950288419716939937511n
		const piOver3_50 = 104719755119659774615421446109316762806572313312504n

		assert.equal(arccosBigIntRecursive(-scale50, scale50), pi50)
		assert.equal(arccosBigIntRecursive(scale50 / 2n, scale50), piOver3_50)
		assert.equal(arccosBigIntRecursive(scale50, scale50), 0n)

		// Verify cos(arccos(x)) at 30 digits
		const scale30 = 10n ** 30n
		const x30 = 314159265358979323846264338327n
		const theta30 = arccosBigIntRecursive(x30, scale30)
		assert.ok(absDiff(cosTaylorReference(theta30, scale30), x30) <= 2n)

		// Minimal scale = 1n
		assert.equal(arccosBigIntRecursive(1n, 1n), 0n)
		assert.equal(arccosBigIntRecursive(0n, 1n), 2n) // round(1.5707...) = 2
		assert.equal(arccosBigIntRecursive(-1n, 1n), 3n) // round(3.1415...) = 3
	})

	test('input validation throws TypeError for non-BigInt and RangeError for invalid domain/scale', () => {
		for (const badX of [0, 0.5, '0', null, undefined, Number.NaN, {}, []]) {
			assert.throws(() => arccosBigIntRecursive(badX), TypeError)
		}

		for (const badScale of [1e18, '1000', null, {}, []]) {
			assert.throws(() => arccosBigIntRecursive(0n, badScale), TypeError)
		}

		for (const badScale of [0n, -1n, -SCALE]) {
			assert.throws(() => arccosBigIntRecursive(0n, badScale), RangeError)
		}

		assert.throws(() => arccosBigIntRecursive(SCALE + 1n), RangeError)
		assert.throws(() => arccosBigIntRecursive(-SCALE - 1n), RangeError)
		assert.throws(() => arccosBigIntRecursive(2n * SCALE), RangeError)
		assert.throws(() => arccosBigIntRecursive(-(10n ** 30n)), RangeError)
		assert.throws(() => arccosBigIntRecursive(2n, 1n), RangeError)
		assert.throws(() => arccosBigIntRecursive(-2n, 1n), RangeError)
	})
})
