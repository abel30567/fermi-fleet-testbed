import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsDecimalSeries } from './permutationsDecimalSeries.js'

/**
 * Independent reference implementation 1: exact factorial ratio n! / (n - k)!.
 */
function factorial(n) {
	let acc = 1n
	for (let i = 2n; i <= n; i++) {
		acc *= i
	}
	return acc
}

function permutationsByFactorialRatio(n, k) {
	if (k === 0n) return 1n
	if (k > n) return 0n
	return factorial(n) / factorial(n - k)
}

/**
 * Independent reference implementation 2: signed Stirling numbers of the first kind
 * series identity:
 *
 *   P(n, k) = sum_{j=0}^{k} s(k, j) * n^j
 *
 * where s(0, 0) = 1 and s(m, j) = s(m - 1, j - 1) - (m - 1) * s(m - 1, j).
 */
function signedStirlingFirstKindRow(k) {
	let row = [1n]
	for (let m = 1; m <= k; m++) {
		const next = new Array(m + 1).fill(0n)
		const factor = BigInt(m - 1)
		for (let j = 1; j <= m; j++) {
			const prevDiag = row[j - 1] ?? 0n
			const prevSame = row[j] ?? 0n
			next[j] = prevDiag - factor * prevSame
		}
		row = next
	}
	return row
}

function permutationsByStirlingSeries(nBig, kNum) {
	const coeffs = signedStirlingFirstKindRow(kNum)
	let sum = 0n
	let nPow = 1n
	for (let j = 0; j <= kNum; j++) {
		sum += coeffs[j] * nPow
		nPow *= nBig
	}
	return sum
}

describe('permutationsDecimalSeries', () => {
	test('computes standard discrete permutations', () => {
		assert.equal(permutationsDecimalSeries('5', '3'), '60')
		assert.equal(permutationsDecimalSeries('10', '4'), '5040')
		assert.equal(permutationsDecimalSeries('6', '6'), '720')
		assert.equal(permutationsDecimalSeries('8', '2'), '56')
		assert.equal(permutationsDecimalSeries('12', '5'), '95040')
	})

	test('handles boundary and edge cases', () => {
		// P(0, 0) = 1
		assert.equal(permutationsDecimalSeries('0', '0'), '1')
		// P(n, 0) = 1
		assert.equal(permutationsDecimalSeries('100', '0'), '1')
		// P(n, 1) = n
		assert.equal(permutationsDecimalSeries('42', '1'), '42')
		// P(n, k) = 0 when k > n
		assert.equal(permutationsDecimalSeries('0', '1'), '0')
		assert.equal(permutationsDecimalSeries('5', '6'), '0')
		assert.equal(permutationsDecimalSeries('3', '1000000000000'), '0')
		// P(1, 1) = 1
		assert.equal(permutationsDecimalSeries('1', '1'), '1')
	})

	test('supports equivalent decimal string representations', () => {
		assert.equal(permutationsDecimalSeries('+5', '+3'), '60')
		assert.equal(permutationsDecimalSeries('5.000', '3.0'), '60')
		assert.equal(permutationsDecimalSeries('1.0e1', '4.0e0'), '5040')
		assert.equal(permutationsDecimalSeries('100e-1', '.4e1'), '5040')
		assert.equal(permutationsDecimalSeries('-0', '-0.0'), '1')
		assert.equal(permutationsDecimalSeries('  7.0  ', '  2  '), '42')
		assert.equal(permutationsDecimalSeries('0e999999999', '0e-50'), '1')
	})

	test('respects configurable precision argument', () => {
		assert.equal(permutationsDecimalSeries('5', '3', 0), '60')
		assert.equal(permutationsDecimalSeries('5', '3', 2), '60.00')
		assert.equal(permutationsDecimalSeries('5', '3', 6), '60.000000')
		assert.equal(permutationsDecimalSeries('5', '0', 3), '1.000')
		assert.equal(permutationsDecimalSeries('5', '8', 4), '0.0000')
		assert.equal(permutationsDecimalSeries('10', '1', 1), '10.0')
	})

	test('handles arbitrary-precision values far beyond Number.MAX_SAFE_INTEGER', () => {
		// 25! = 15511210043330985984000000
		assert.equal(
			permutationsDecimalSeries('25', '25'),
			'15511210043330985984000000'
		)

		// Very large n with small k: P(10^30, 3) = 10^30 * (10^30 - 1) * (10^30 - 2)
		const nBig = 10n ** 30n
		const expected = nBig * (nBig - 1n) * (nBig - 2n)
		assert.equal(
			permutationsDecimalSeries(nBig.toString(), '3'),
			expected.toString()
		)
		assert.equal(
			permutationsDecimalSeries('1e30', '3', 2),
			`${expected.toString()}.00`
		)

		// P(10^50, 1) = 10^50
		assert.equal(
			permutationsDecimalSeries('1e50', '1'),
			(10n ** 50n).toString()
		)
	})

	test('independent cross-check against factorial ratio n! / (n - k)!', () => {
		for (let n = 0; n <= 30; n += 3) {
			for (let k = 0; k <= n + 2; k += 2) {
				const actual = permutationsDecimalSeries(String(n), String(k))
				const expected = permutationsByFactorialRatio(BigInt(n), BigInt(k))
				assert.equal(
					actual,
					expected.toString(),
					`Mismatch for P(${n}, ${k})`
				)
			}
		}

		// Larger factorial cross-check: P(120, 45)
		assert.equal(
			permutationsDecimalSeries('120', '45'),
			permutationsByFactorialRatio(120n, 45n).toString()
		)
	})

	test('independent cross-check against signed Stirling first-kind series identity', () => {
		const testNs = [
			0n,
			1n,
			7n,
			19n,
			123456789012345678901234567890n,
		]
		for (const nBig of testNs) {
			for (let k = 0; k <= 12; k++) {
				if (BigInt(k) > nBig) continue
				const actual = permutationsDecimalSeries(nBig.toString(), String(k))
				const expected = permutationsByStirlingSeries(nBig, k)
				assert.equal(
					actual,
					expected.toString(),
					`Stirling series mismatch for P(${nBig}, ${k})`
				)
			}
		}
	})

	test('independent cross-check against recurrence and composition identities', () => {
		// Recurrence: P(n, k) = P(n - 1, k) + k * P(n - 1, k - 1)
		for (let n = 1; n <= 15; n++) {
			for (let k = 1; k <= n; k++) {
				const lhs = BigInt(permutationsDecimalSeries(String(n), String(k)))
				const rhs =
					BigInt(permutationsDecimalSeries(String(n - 1), String(k))) +
					BigInt(k) *
						BigInt(permutationsDecimalSeries(String(n - 1), String(k - 1)))
				assert.equal(lhs, rhs, `Recurrence failed for n=${n}, k=${k}`)
			}
		}

		// Composition: P(n, a + b) = P(n, a) * P(n - a, b)
		const n = 50
		for (const [a, b] of [
			[0, 10],
			[10, 0],
			[7, 13],
			[25, 25],
		]) {
			const lhs = BigInt(permutationsDecimalSeries(String(n), String(a + b)))
			const rhs =
				BigInt(permutationsDecimalSeries(String(n), String(a))) *
				BigInt(permutationsDecimalSeries(String(n - a), String(b)))
			assert.equal(lhs, rhs, `Composition failed for n=${n}, a=${a}, b=${b}`)
		}
	})

	test('rejects invalid inputs with appropriate errors', () => {
		// Non-string n or k -> TypeError
		assert.throws(() => permutationsDecimalSeries(5, '3'), TypeError)
		assert.throws(() => permutationsDecimalSeries('5', 3), TypeError)
		assert.throws(() => permutationsDecimalSeries(5n, '3'), TypeError)
		assert.throws(() => permutationsDecimalSeries(null, '3'), TypeError)
		assert.throws(() => permutationsDecimalSeries('5', undefined), TypeError)

		// Malformed decimal strings -> RangeError
		assert.throws(() => permutationsDecimalSeries('', '3'), RangeError)
		assert.throws(() => permutationsDecimalSeries('   ', '3'), RangeError)
		assert.throws(() => permutationsDecimalSeries('abc', '3'), RangeError)
		assert.throws(() => permutationsDecimalSeries('NaN', '3'), RangeError)
		assert.throws(() => permutationsDecimalSeries('Infinity', '3'), RangeError)
		assert.throws(() => permutationsDecimalSeries('1_000', '3'), RangeError)
		assert.throws(() => permutationsDecimalSeries('0x10', '3'), RangeError)
		assert.throws(() => permutationsDecimalSeries('.', '3'), RangeError)
		assert.throws(() => permutationsDecimalSeries('1e', '3'), RangeError)

		// Negative or non-integer values -> RangeError
		assert.throws(() => permutationsDecimalSeries('-1', '1'), RangeError)
		assert.throws(() => permutationsDecimalSeries('5', '-2'), RangeError)
		assert.throws(() => permutationsDecimalSeries('5.5', '2'), RangeError)
		assert.throws(() => permutationsDecimalSeries('5', '2.5'), RangeError)
		assert.throws(() => permutationsDecimalSeries('1e-1', '1'), RangeError)
		assert.throws(() => permutationsDecimalSeries('1.5e0', '1'), RangeError)

		// Excessive magnitude / product length -> RangeError
		assert.throws(() => permutationsDecimalSeries('1e200000', '1'), RangeError)
		assert.throws(
			() => permutationsDecimalSeries('200000', '100001'),
			RangeError
		)

		// Invalid precision -> TypeError / RangeError
		assert.throws(() => permutationsDecimalSeries('5', '3', '2'), TypeError)
		assert.throws(() => permutationsDecimalSeries('5', '3', null), TypeError)
		assert.throws(() => permutationsDecimalSeries('5', '3', NaN), TypeError)
		assert.throws(() => permutationsDecimalSeries('5', '3', -1), RangeError)
		assert.throws(() => permutationsDecimalSeries('5', '3', 1.5), RangeError)
		assert.throws(
			() => permutationsDecimalSeries('5', '3', Infinity),
			RangeError
		)
		assert.throws(
			() => permutationsDecimalSeries('5', '3', 100001),
			RangeError
		)
	})
})
