import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SCALE, sinBigIntRecursive } from './sinBigIntRecursive.js'

const PI_30 = 3141592653589793238462643383280n
const SCALE_30 = 10n ** 30n

function absBigInt(n) {
	return n < 0n ? -n : n
}

/**
 * Independent reference implementation using Machin's formula for pi and
 * iterative term-by-term Maclaurin summation (completely separate from
 * Chudnovsky / binary splitting).
 */
function sinIterativeReference(x) {
	const digits = 60n
	const scaleRef = 10n ** digits

	function atanInv(m) {
		const m2 = m * m
		let term = scaleRef / m
		let sum = term
		let k = 1n
		while (term !== 0n) {
			term /= m2
			const delta = term / (2n * k + 1n)
			sum += k % 2n === 1n ? -delta : delta
			k++
		}
		return sum
	}

	const pi = 4n * (4n * atanInv(5n) - atanInv(239n))
	const twoPi = 2n * pi

	let r = (x * scaleRef) % twoPi
	if (r < 0n) r += twoPi

	let sign = 1n
	if (r >= pi) {
		r -= pi
		sign = -1n
	}
	if (2n * r > pi) {
		r = pi - r
	}

	let term = r
	let sum = r
	let k = 1n
	while (term !== 0n) {
		term = (term * r * r) / (scaleRef * scaleRef * (2n * k) * (2n * k + 1n))
		sum += k % 2n === 1n ? -term : term
		k++
	}

	const factor = 10n ** (digits - 18n)
	const q = sum / factor
	const rem = sum % factor
	const rounded = rem * 2n >= factor ? q + 1n : q
	return sign * rounded
}

describe('sinBigIntRecursive', () => {
	it('exports SCALE equal to 10^18', () => {
		assert.equal(SCALE, 1000000000000000000n)
	})

	it('computes exact known values for small positive and negative integer radians', () => {
		assert.equal(sinBigIntRecursive(0n), 0n)
		assert.equal(sinBigIntRecursive(1n), 841470984807896507n)
		assert.equal(sinBigIntRecursive(-1n), -841470984807896507n)
		assert.equal(sinBigIntRecursive(2n), 909297426825681695n)
		assert.equal(sinBigIntRecursive(3n), 141120008059867222n)
		assert.equal(sinBigIntRecursive(4n), -756802495307928251n)
		assert.equal(sinBigIntRecursive(5n), -958924274663138469n)
		assert.equal(sinBigIntRecursive(6n), -279415498198925873n)
		assert.equal(sinBigIntRecursive(10n), -544021110889369813n)
		// 355 is a famous convergent close to 113 * pi
		assert.equal(sinBigIntRecursive(355n), -30144353359488n)
	})

	it('handles rational and fixed-point angles via optional inputScale', () => {
		// Exact special angles using 30-digit pi approximation
		assert.equal(sinBigIntRecursive(0n, SCALE), 0n)
		assert.equal(sinBigIntRecursive(PI_30 / 6n, SCALE_30), 500000000000000000n)
		assert.equal(sinBigIntRecursive(PI_30 / 4n, SCALE_30), 707106781186547524n)
		assert.equal(sinBigIntRecursive(PI_30 / 3n, SCALE_30), 866025403784438647n)
		assert.equal(sinBigIntRecursive(PI_30 / 2n, SCALE_30), SCALE)
		assert.equal(sinBigIntRecursive(PI_30, SCALE_30), 0n)
		assert.equal(sinBigIntRecursive((3n * PI_30) / 2n, SCALE_30), -SCALE)
		assert.equal(sinBigIntRecursive(2n * PI_30, SCALE_30), 0n)
		assert.equal(sinBigIntRecursive(-PI_30 / 2n, SCALE_30), -SCALE)

		// Very small angles
		assert.equal(sinBigIntRecursive(1n, SCALE), 1n)
		assert.equal(sinBigIntRecursive(-1n, SCALE), -1n)
		assert.equal(sinBigIntRecursive(1n, 10n ** 40n), 0n)
	})

	it('preserves exact odd symmetry and range bounds [-SCALE, SCALE]', () => {
		const samples = [
			0n,
			1n,
			2n,
			7n,
			42n,
			355n,
			1000000n,
			10n ** 18n,
			10n ** 30n,
			10n ** 60n,
			10n ** 100n,
		]
		for (const x of samples) {
			const pos = sinBigIntRecursive(x)
			const neg = sinBigIntRecursive(-x)
			assert.equal(neg, -pos, `odd symmetry failed for ${x}`)
			assert.ok(pos >= -SCALE && pos <= SCALE, `range failed for ${x}: ${pos}`)
		}
	})

	it('cross-checks against Math.sin within tight floating-point tolerance', () => {
		const angles = []
		for (let i = -50; i <= 50; i++) angles.push(BigInt(i))
		angles.push(-1000000n, -123456n, -1000n, 1000n, 123456n, 1000000n)

		for (const x of angles) {
			const actual = Number(sinBigIntRecursive(x)) / 1e18
			const expected = Math.sin(Number(x))
			assert.ok(
				Math.abs(actual - expected) < 1e-12,
				`Math.sin mismatch at ${x}: got ${actual}, expected ${expected}`,
			)
		}
	})

	it('cross-checks against independent iterative Machin + Taylor reference', () => {
		const cases = [0n, 1n, -1n, 2n, -3n, 7n, 22n, 355n, -100000n, 10n ** 18n, -(10n ** 18n)]
		for (const x of cases) {
			const actual = sinBigIntRecursive(x)
			const expected = sinIterativeReference(x)
			assert.equal(actual, expected, `reference mismatch at ${x}`)
		}
	})

	it('satisfies Pythagorean identity sin^2(x) + cos^2(x) ≈ 1', () => {
		const halfPi30 = PI_30 / 2n
		const angles = [0n, 1n, 2n, 5n, -7n, 123n, -4567n]
		for (const x of angles) {
			const s = sinBigIntRecursive(x)
			// cos(x) = sin(pi/2 - x)
			const c = sinBigIntRecursive(halfPi30 - x * SCALE_30, SCALE_30)
			const sumSq = (s * s + c * c) / SCALE
			assert.ok(
				absBigInt(sumSq - SCALE) <= 2n,
				`Pythagorean identity failed at ${x}: sin^2+cos^2=${sumSq}`,
			)
		}
	})

	it('satisfies triple-angle and quintuple-angle identities for huge BigInts', () => {
		const hugeAngles = [10n ** 18n, 10n ** 30n, -(10n ** 45n), 10n ** 60n, 10n ** 100n]
		const scale2 = SCALE * SCALE
		const scale4 = scale2 * scale2

		for (const x of hugeAngles) {
			const s = sinBigIntRecursive(x)
			const s3 = sinBigIntRecursive(3n * x)
			const s5 = sinBigIntRecursive(5n * x)

			// sin(3x) = 3*sin(x) - 4*sin^3(x)
			const rhs3 = 3n * s - (4n * s * s * s) / scale2
			assert.ok(
				absBigInt(s3 - rhs3) <= 10n,
				`triple-angle identity failed at ${x}: lhs=${s3}, rhs=${rhs3}`,
			)

			// sin(5x) = 16*sin^5(x) - 20*sin^3(x) + 5*sin(x)
			const rhs5 =
				(16n * s * s * s * s * s) / scale4 -
				(20n * s * s * s) / scale2 +
				5n * s
			assert.ok(
				absBigInt(s5 - rhs5) <= 25n,
				`quintuple-angle identity failed at ${x}: lhs=${s5}, rhs=${rhs5}`,
			)
		}
	})

	it('validates input types and ranges strictly', () => {
		const invalidX = [0, 1, -1, 1.5, NaN, Infinity, -Infinity, '1', null, undefined, true, {}, []]
		for (const bad of invalidX) {
			assert.throws(() => sinBigIntRecursive(bad), TypeError)
		}

		const invalidScaleTypes = [1, 1.5, NaN, '1', null, true, {}, []]
		for (const bad of invalidScaleTypes) {
			assert.throws(() => sinBigIntRecursive(1n, bad), TypeError)
		}

		const invalidScaleRanges = [0n, -1n, -SCALE]
		for (const bad of invalidScaleRanges) {
			assert.throws(() => sinBigIntRecursive(1n, bad), RangeError)
		}
	})
})
