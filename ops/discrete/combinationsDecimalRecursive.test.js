import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsDecimalRecursive } from './combinationsDecimalRecursive.js'

/**
 * Independent iterative multiplicative reference for cross-checking C(n, k).
 * Uses exact BigInt step-by-step division: C(n, i) = C(n, i - 1) * (n - i + 1) / i.
 *
 * @param {bigint} n
 * @param {bigint} k
 * @returns {bigint}
 */
function referenceCombinations(n, k) {
	if (k > n) return 0n
	if (k === 0n || k === n) return 1n
	const r = k < n - k ? k : n - k
	let acc = 1n
	for (let i = 1n; i <= r; i++) {
		acc = (acc * (n - r + i)) / i
	}
	return acc
}

describe('combinationsDecimalRecursive', () => {
	describe('normal cases', () => {
		it('computes standard small and medium binomial coefficients accurately', () => {
			assert.equal(combinationsDecimalRecursive('5', '2'), '10')
			assert.equal(combinationsDecimalRecursive('6', '3'), '20')
			assert.equal(combinationsDecimalRecursive('10', '3'), '120')
			assert.equal(combinationsDecimalRecursive('10', '5'), '252')
			assert.equal(combinationsDecimalRecursive('20', '10'), '184756')
			assert.equal(combinationsDecimalRecursive('52', '5'), '2598960')
		})

		it('computes symmetric pairs via k -> min(k, n - k)', () => {
			assert.equal(combinationsDecimalRecursive('10', '7'), '120')
			assert.equal(combinationsDecimalRecursive('52', '47'), '2598960')
			assert.equal(combinationsDecimalRecursive('30', '28'), '435')
			assert.equal(combinationsDecimalRecursive('30', '2'), '435')
		})
	})

	describe('edge cases', () => {
		it('handles n = 0 and k = 0 (C(0, 0) = 1)', () => {
			assert.equal(combinationsDecimalRecursive('0', '0'), '1')
		})

		it('handles k = 0 and k = n for small and huge n', () => {
			assert.equal(combinationsDecimalRecursive('1', '0'), '1')
			assert.equal(combinationsDecimalRecursive('1', '1'), '1')
			assert.equal(combinationsDecimalRecursive('100', '0'), '1')
			assert.equal(combinationsDecimalRecursive('100', '100'), '1')

			const hugeN = '1' + '0'.repeat(60)
			assert.equal(combinationsDecimalRecursive(hugeN, '0'), '1')
			assert.equal(combinationsDecimalRecursive(hugeN, hugeN), '1')
		})

		it('handles k = 1 and k = n - 1 including huge n', () => {
			const hugeN = '9876543210987654321098765432109876543210'
			const hugeNMinus1 = '9876543210987654321098765432109876543209'
			assert.equal(combinationsDecimalRecursive(hugeN, '1'), hugeN)
			assert.equal(combinationsDecimalRecursive(hugeN, hugeNMinus1), hugeN)
		})

		it('handles k > n by returning 0', () => {
			assert.equal(combinationsDecimalRecursive('0', '1'), '0')
			assert.equal(combinationsDecimalRecursive('5', '6'), '0')
			assert.equal(combinationsDecimalRecursive('10', '100'), '0')
			assert.equal(
				combinationsDecimalRecursive('100000000000000000000', '100000000000000000001'),
				'0'
			)
		})

		it('accepts decimal strings with fractional zeros, leading zeros, plus sign, and whitespace', () => {
			assert.equal(combinationsDecimalRecursive('10.00', '3.000'), '120')
			assert.equal(combinationsDecimalRecursive('+10.0', '  +7.00  '), '120')
			assert.equal(combinationsDecimalRecursive('0005', '002.0'), '10')
			assert.equal(combinationsDecimalRecursive('-0', '-0.00'), '1')
			assert.equal(combinationsDecimalRecursive('5.00', '-0.000'), '1')
		})
	})

	describe('large arbitrary-precision inputs', () => {
		it('computes exact values well beyond Number.MAX_SAFE_INTEGER and Number.MAX_VALUE', () => {
			// Exact known value for C(100, 50)
			assert.equal(
				combinationsDecimalRecursive('100', '50'),
				'100891344545564193334812497256'
			)

			// C(1100, 550) exceeds IEEE-754 double max (~1.8e308) with 330 digits
			const res1100 = combinationsDecimalRecursive('1100', '550')
			const expected1100 = referenceCombinations(1100n, 550n).toString()
			assert.equal(res1100, expected1100)
			assert.ok(res1100.length > 320)
		})

		it('handles very large n with small k or small (n - k)', () => {
			const n = 10n ** 30n
			const k = 3n
			const expected = ((n * (n - 1n) * (n - 2n)) / 6n).toString()
			assert.equal(combinationsDecimalRecursive(n.toString(), k.toString()), expected)
			assert.equal(combinationsDecimalRecursive(n.toString(), (n - k).toString()), expected)
		})

		it('computes deep divide-and-conquer C(4000, 2000) cleanly without stack overflow', () => {
			const actual = combinationsDecimalRecursive('4000', '2000')
			const expected = referenceCombinations(4000n, 2000n).toString()
			assert.equal(actual, expected)
		})
	})

	describe('precision behavior', () => {
		it('defaults to precision 0 (integer format with no decimal point)', () => {
			assert.equal(combinationsDecimalRecursive('10', '3'), '120')
			assert.equal(combinationsDecimalRecursive('10', '3', undefined), '120')
			assert.equal(combinationsDecimalRecursive('10', '3', 0), '120')
		})

		it('formats results with requested fractional decimal places', () => {
			assert.equal(combinationsDecimalRecursive('10.00', '3.00', 2), '120.00')
			assert.equal(combinationsDecimalRecursive('5', '6', 4), '0.0000')
			assert.equal(combinationsDecimalRecursive('0', '0', 3), '1.000')
			assert.equal(combinationsDecimalRecursive('7', '1', 5), '7.00000')
			assert.equal(
				combinationsDecimalRecursive('100', '50', 6),
				'100891344545564193334812497256.000000'
			)
		})
	})

	describe('independent mathematical cross-checks', () => {
		it("satisfies Pascal's identity: C(n, k) = C(n - 1, k - 1) + C(n - 1, k)", () => {
			for (let n = 1; n <= 20; n++) {
				for (let k = 1; k < n; k++) {
					const lhs = BigInt(combinationsDecimalRecursive(String(n), String(k)))
					const rhs =
						BigInt(combinationsDecimalRecursive(String(n - 1), String(k - 1))) +
						BigInt(combinationsDecimalRecursive(String(n - 1), String(k)))
					assert.equal(lhs, rhs, `Pascal identity failed for n=${n}, k=${k}`)
				}
			}

			// Large spot check
			const lhsBig = BigInt(combinationsDecimalRecursive('250', '97'))
			const rhsBig =
				BigInt(combinationsDecimalRecursive('249', '96')) +
				BigInt(combinationsDecimalRecursive('249', '97'))
			assert.equal(lhsBig, rhsBig)
		})

		it('satisfies row sum identity: sum_{k=0..n} C(n, k) = 2^n', () => {
			for (const n of [0, 1, 5, 12, 25, 64]) {
				let sum = 0n
				for (let k = 0; k <= n; k++) {
					sum += BigInt(combinationsDecimalRecursive(String(n), String(k)))
				}
				assert.equal(sum, 1n << BigInt(n), `Row sum failed for n=${n}`)
			}
		})

		it('satisfies symmetry identity: C(n, k) = C(n, n - k)', () => {
			for (const n of [0, 1, 13, 40, 150]) {
				for (let k = 0; k <= Math.min(n, 25); k++) {
					const left = combinationsDecimalRecursive(String(n), String(k))
					const right = combinationsDecimalRecursive(String(n), String(n - k))
					assert.equal(left, right, `Symmetry failed for n=${n}, k=${k}`)
				}
			}
		})

		it("satisfies Vandermonde's identity: C(m + n, r) = sum_j C(m, j) * C(n, r - j)", () => {
			const m = 17
			const n = 23
			const r = 15
			const lhs = BigInt(combinationsDecimalRecursive(String(m + n), String(r)))
			let rhs = 0n
			for (let j = 0; j <= r; j++) {
				rhs +=
					BigInt(combinationsDecimalRecursive(String(m), String(j))) *
					BigInt(combinationsDecimalRecursive(String(n), String(r - j)))
			}
			assert.equal(lhs, rhs)
		})

		it('satisfies absorption identity: k * C(n, k) = n * C(n - 1, k - 1)', () => {
			const n = 500n
			const k = 177n
			const lhs = k * BigInt(combinationsDecimalRecursive(n.toString(), k.toString()))
			const rhs =
				n * BigInt(combinationsDecimalRecursive((n - 1n).toString(), (k - 1n).toString()))
			assert.equal(lhs, rhs)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-string n or k', () => {
			for (const bad of [10, 10n, null, undefined, {}, [], true]) {
				assert.throws(() => combinationsDecimalRecursive(bad, '2'), TypeError)
				assert.throws(() => combinationsDecimalRecursive('10', bad), TypeError)
			}
		})

		it('throws RangeError for empty or malformed decimal strings', () => {
			for (const bad of [
				'',
				'   ',
				'abc',
				'NaN',
				'Infinity',
				'-Infinity',
				'1e5',
				'10.',
				'.0',
				'1.2.3',
				'0x10',
				'1_000',
				'++5'
			]) {
				assert.throws(() => combinationsDecimalRecursive(bad, '2'), RangeError)
				assert.throws(() => combinationsDecimalRecursive('10', bad), RangeError)
			}
		})

		it('throws RangeError for negative numbers', () => {
			for (const bad of ['-1', '-10', '-10.00', '-0.5']) {
				assert.throws(() => combinationsDecimalRecursive(bad, '2'), RangeError)
				assert.throws(() => combinationsDecimalRecursive('10', bad), RangeError)
			}
		})

		it('throws RangeError for non-integer decimal strings', () => {
			for (const bad of ['5.5', '10.0001', '0.1', '+3.2']) {
				assert.throws(() => combinationsDecimalRecursive(bad, '2'), RangeError)
				assert.throws(() => combinationsDecimalRecursive('10', bad), RangeError)
			}
		})

		it('throws TypeError or RangeError for invalid precision values', () => {
			for (const badType of ['2', null, 2n, {}, true]) {
				assert.throws(() => combinationsDecimalRecursive('5', '2', badType), TypeError)
			}
			for (const badVal of [-1, 1.5, NaN, Infinity, -Infinity, 1_000_001]) {
				assert.throws(() => combinationsDecimalRecursive('5', '2', badVal), RangeError)
			}
		})
	})
})
