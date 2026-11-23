import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sinBigIntRecursive } from './sinBigIntRecursive.js'

const SCALE = 10n ** 18n

/**
 * Independent reference implementation using Machin's formula for pi,
 * range reduction modulo 2*pi, and an iterative Taylor series for sin(r).
 * Completely independent from binary-splitting + angle-doubling.
 */
function independentSinRef(x) {
	if (x === 0n) return 0n
	const sign = x < 0n ? -1n : 1n
	const absX = x < 0n ? -x : x

	const xDigits = absX.toString().length
	const extra = xDigits + 40
	const extraScale = 10n ** BigInt(extra)
	const W = SCALE * extraScale

	// Compute arctan(1/m) * W iteratively
	const atanRecip = (m) => {
		const m2 = m * m
		let term = W / m
		let sum = term
		let k = 1n
		while (term !== 0n) {
			term = term / m2
			const contrib = term / (2n * k + 1n)
			if (contrib === 0n) break
			sum += k % 2n === 1n ? -contrib : contrib
			k += 1n
		}
		return sum
	}

	// Machin's formula: pi / 4 = 4 * atan(1/5) - atan(1/239)
	const pi = 4n * (4n * atanRecip(5n) - atanRecip(239n))
	const twoPi = 2n * pi

	// Reduce absX * W modulo 2*pi into [-pi, pi]
	let r = (absX * W) % twoPi
	if (r > pi) {
		r -= twoPi
	}

	// Iterative Taylor series: sin(r) = sum_{k=0}^inf (-1)^k r^(2k+1) / (2k+1)!
	const r2 = (r * r) / W
	let term = r
	let sum = term
	let k = 1n
	while (term !== 0n) {
		term = (-term * r2) / (W * (2n * k) * (2n * k + 1n))
		sum += term
		k += 1n
	}

	const signed = sign * sum
	const half = extraScale >> 1n
	return signed >= 0n ? (signed + half) / extraScale : -((-signed + half) / extraScale)
}

describe('sinBigIntRecursive', () => {
	describe('input validation', () => {
		it('throws TypeError for non-BigInt inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				0,
				1,
				-1,
				1.5,
				NaN,
				Infinity,
				-Infinity,
				'0',
				'1',
				true,
				false,
				{},
				[],
				[1n],
				Symbol('1'),
				() => 1n,
			]

			for (const value of invalidInputs) {
				assert.throws(() => sinBigIntRecursive(value), TypeError)
			}
		})

		it('throws TypeError when called with no arguments', () => {
			assert.throws(() => sinBigIntRecursive(), TypeError)
		})
	})

	describe('normal cases and exact 18-digit fixed-point values', () => {
		it('returns exact known 18-digit values for small positive integers', () => {
			// Verified to >25 decimal places:
			// sin(1)  =  0.8414709848078965066525...
			// sin(2)  =  0.9092974268256816953960...
			// sin(3)  =  0.1411200080598672221007...
			// sin(4)  = -0.7568024953079282513726...
			// sin(5)  = -0.9589242746631384688931...
			// sin(6)  = -0.2794154981989258728115...
			// sin(10) = -0.5440211108893698134047...
			assert.equal(sinBigIntRecursive(1n), 841470984807896507n)
			assert.equal(sinBigIntRecursive(2n), 909297426825681695n)
			assert.equal(sinBigIntRecursive(3n), 141120008059867222n)
			assert.equal(sinBigIntRecursive(4n), -756802495307928251n)
			assert.equal(sinBigIntRecursive(5n), -958924274663138469n)
			assert.equal(sinBigIntRecursive(6n), -279415498198925873n)
			assert.equal(sinBigIntRecursive(10n), -544021110889369813n)
		})

		it('returns exact values for negative integers (odd symmetry)', () => {
			assert.equal(sinBigIntRecursive(-1n), -841470984807896507n)
			assert.equal(sinBigIntRecursive(-2n), -909297426825681695n)
			assert.equal(sinBigIntRecursive(-3n), -141120008059867222n)
			assert.equal(sinBigIntRecursive(-10n), 544021110889369813n)
		})
	})

	describe('edge cases', () => {
		it('handles zero exactly', () => {
			assert.equal(sinBigIntRecursive(0n), 0n)
		})

		it('handles angles very close to integer multiples of pi (near-zero sine)', () => {
			// 355 / 113 > pi: 355 - 113*pi ≈ +3.014435335948845e-5, and 113 is odd,
			// so sin(355) = -sin(355 - 113*pi) ≈ -0.000030144353359488449...
			const s355 = sinBigIntRecursive(355n)
			assert.equal(s355, independentSinRef(355n))
			assert.ok(s355 < 0n && s355 > -31000000000000n)
		})

		it('handles angles very close to odd multiples of pi/2 (near +/-1)', () => {
			// 11 ≈ 7*pi/2 -> sin(11) ≈ -0.9999902065507035
			const s11 = sinBigIntRecursive(11n)
			assert.equal(s11, independentSinRef(11n))
			assert.ok(s11 < -999990000000000000n && s11 >= -SCALE)

			// 22 ≈ 7*pi -> sin(22) ≈ -0.008851309290403876
			const s22 = sinBigIntRecursive(22n)
			assert.equal(s22, independentSinRef(22n))
		})

		it('handles powers of 2 and (2^k - 1) exercising pure even and pure odd recursion paths', () => {
			const specialInputs = [2n, 3n, 4n, 7n, 8n, 15n, 16n, 31n, 32n, 63n, 64n, 1023n, 1024n]
			for (const x of specialInputs) {
				assert.equal(sinBigIntRecursive(x), independentSinRef(x), `mismatch at x=${x}`)
			}
		})

		it('handles very large BigInts beyond IEEE-754 Number.MAX_SAFE_INTEGER', () => {
			const largeInputs = [
				10n ** 18n,
				-(10n ** 18n),
				2n ** 64n,
				2n ** 128n + 123456789n,
				10n ** 50n + 7n,
				-(10n ** 50n + 7n),
			]

			for (const x of largeInputs) {
				const actual = sinBigIntRecursive(x)
				const expected = independentSinRef(x)
				assert.equal(actual, expected, `mismatch for large x=${x}`)
				assert.ok(actual >= -SCALE && actual <= SCALE)
			}
		})
	})

	describe('independent cross-checks and mathematical identities', () => {
		it('matches independent Machin-pi + iterative Taylor series across a wide range', () => {
			const samples = [
				-1000n,
				-100n,
				-17n,
				-1n,
				0n,
				1n,
				7n,
				42n,
				100n,
				355n,
				1000n,
				999999n,
				12345678901234567890123456789n,
			]

			for (const x of samples) {
				assert.equal(
					sinBigIntRecursive(x),
					independentSinRef(x),
					`independent cross-check failed for x=${x}`
				)
			}
		})

		it('agrees with native Math.sin within IEEE-754 floating-point precision', () => {
			for (let i = -50; i <= 50; i += 1) {
				const x = BigInt(i)
				const res = Number(sinBigIntRecursive(x)) / 1e18
				const native = Math.sin(i)
				assert.ok(
					Math.abs(res - native) < 1e-15,
					`Math.sin mismatch at ${i}: got ${res}, expected ${native}`
				)
			}
		})

		it('satisfies odd symmetry sin(-x) === -sin(x) and range [-10^18, 10^18]', () => {
			const values = [1n, 2n, 13n, 355n, 10n ** 25n, 3n ** 60n]
			for (const x of values) {
				const pos = sinBigIntRecursive(x)
				const neg = sinBigIntRecursive(-x)
				assert.equal(neg, -pos)
				assert.ok(pos >= -SCALE && pos <= SCALE)
			}
		})

		it('satisfies the triple-angle identity sin(3x) = 3*sin(x) - 4*sin(x)^3', () => {
			const values = [1n, 2n, 5n, 19n, 355n, 10n ** 30n, -(10n ** 40n) + 13n]
			const scale2 = SCALE * SCALE
			const half = scale2 >> 1n

			for (const x of values) {
				const s = sinBigIntRecursive(x)
				const s3 = sinBigIntRecursive(3n * x)
				const sCubedNum = s * s * s
				const sCubed =
					sCubedNum >= 0n
						? (sCubedNum + half) / scale2
						: -((-sCubedNum + half) / scale2)
				const rhs = 3n * s - 4n * sCubed
				const diff = s3 >= rhs ? s3 - rhs : rhs - s3
				// Rounding s to 10^-18 can propagate up to ~15 ULPs through 3s - 4s^3
				assert.ok(
					diff <= 15n,
					`triple-angle identity failed for x=${x}: sin(3x)=${s3}, 3s-4s^3=${rhs}, diff=${diff}`
				)
			}
		})
	})
})
