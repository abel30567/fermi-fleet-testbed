import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { determinantDecimalIterative } from './determinantDecimalIterative.js'

/**
 * Independent helper: exact rational representation over BigInt for cross-checks.
 */
function parseExactDecimal(str) {
	const m = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(str)
	if (!m) throw new Error(`Invalid decimal in test helper: ${str}`)
	const sign = m[1] === '-' ? -1n : 1n
	const intPart = m[2] ?? ''
	const fracPart = m[3] ?? m[4] ?? ''
	const exp = m[5] ? Number(m[5]) : 0
	const scale = fracPart.length - exp
	let num = sign * BigInt(intPart + fracPart || '0')
	if (scale < 0) {
		return { num: num * 10n ** BigInt(-scale), scale: 0 }
	}
	return { num, scale }
}

/**
 * Independent helper: format exact scaled BigInt (num / 10^scale) rounded half away from zero.
 */
function formatExactScaled(num, scale, precision) {
	if (num === 0n) return '0'
	const neg = num < 0n
	let abs = neg ? -num : num
	let outScale = scale
	if (scale > precision) {
		const div = 10n ** BigInt(scale - precision)
		let q = abs / div
		const r = abs % div
		if (r * 2n >= div) q += 1n
		abs = q
		outScale = precision
	}
	if (abs === 0n) return '0'
	if (outScale === 0) return (neg ? '-' : '') + abs.toString()
	const s = abs.toString().padStart(outScale + 1, '0')
	const iPart = s.slice(0, s.length - outScale)
	const fPart = s.slice(s.length - outScale).replace(/0+$/, '')
	return fPart ? `${neg ? '-' : ''}${iPart}.${fPart}` : `${neg ? '-' : ''}${iPart}`
}

/**
 * Independent reference algorithm: Leibniz formula over all n! permutations.
 * Works for small n (e.g., 3x3, 4x4) with exact scaled BigInt arithmetic.
 */
function leibnizDeterminantDecimal(matrix, precision = 20) {
	const n = matrix.length
	const parsed = matrix.map((row) => row.map(parseExactDecimal))
	let maxScale = 0
	for (const row of parsed) {
		for (const cell of row) {
			if (cell.scale > maxScale) maxScale = cell.scale
		}
	}
	const scaled = parsed.map((row) =>
		row.map(({ num, scale }) => num * 10n ** BigInt(maxScale - scale)),
	)

	// Generate permutations using Heap's algorithm iteratively, tracking inversion parity.
	const perm = Array.from({ length: n }, (_, i) => i)
	const c = new Array(n).fill(0)

	const permSign = (p) => {
		let inversions = 0
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				if (p[i] > p[j]) inversions++
			}
		}
		return inversions % 2 === 0 ? 1n : -1n
	}

	const termFor = (p) => {
		let prod = permSign(p)
		for (let i = 0; i < n; i++) {
			prod *= scaled[i][p[i]]
		}
		return prod
	}

	let sum = termFor(perm)
	let i = 0
	while (i < n) {
		if (c[i] < i) {
			const swapIdx = i % 2 === 0 ? 0 : c[i]
			const tmp = perm[swapIdx]
			perm[swapIdx] = perm[i]
			perm[i] = tmp
			sum += termFor(perm)
			c[i]++
			i = 0
		} else {
			c[i] = 0
			i++
		}
	}

	return formatExactScaled(sum, maxScale * n, precision)
}

/**
 * Independent helper: exact decimal string matrix multiplication A * B.
 */
function multiplyDecimalMatrices(A, B) {
	const n = A.length
	const pA = A.map((r) => r.map(parseExactDecimal))
	const pB = B.map((r) => r.map(parseExactDecimal))
	const res = Array.from({ length: n }, () => new Array(n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let maxS = 0
			for (let k = 0; k < n; k++) {
				const s = pA[i][k].scale + pB[k][j].scale
				if (s > maxS) maxS = s
			}
			let sum = 0n
			for (let k = 0; k < n; k++) {
				const s = pA[i][k].scale + pB[k][j].scale
				sum += pA[i][k].num * pB[k][j].num * 10n ** BigInt(maxS - s)
			}
			res[i][j] = formatExactScaled(sum, maxS, maxS)
		}
	}
	return res
}

/**
 * Independent helper: exact decimal string multiplication a * b.
 */
function multiplyDecimals(aStr, bStr, precision) {
	const a = parseExactDecimal(aStr)
	const b = parseExactDecimal(bStr)
	return formatExactScaled(a.num * b.num, a.scale + b.scale, precision)
}

/**
 * Compute exact rounded decimal string for BigInt fraction p / q to `digits` decimal places.
 */
function rationalToDecimal(p, q, digits) {
	const scale = 10n ** BigInt(digits)
	const scaled = p * scale
	let quot = scaled / q
	const rem = scaled % q
	if (rem * 2n >= q) quot += 1n
	return formatExactScaled(quot, digits, digits)
}

describe('determinantDecimalIterative', () => {
	describe('normal cases', () => {
		test('1x1 matrices', () => {
			assert.equal(determinantDecimalIterative([['42']]), '42')
			assert.equal(determinantDecimalIterative([['-3.14159']]), '-3.14159')
			assert.equal(determinantDecimalIterative([['+0.00500']]), '0.005')
			assert.equal(determinantDecimalIterative([['.25']]), '0.25')
			assert.equal(determinantDecimalIterative([['7.']]), '7')
			assert.equal(determinantDecimalIterative([['1.5e-4']]), '0.00015')
			assert.equal(determinantDecimalIterative([['2.5E+3']]), '2500')
		})

		test('2x2 matrices', () => {
			assert.equal(
				determinantDecimalIterative([
					['1', '2'],
					['3', '4'],
				]),
				'-2',
			)
			assert.equal(
				determinantDecimalIterative([
					['1.5', '2.25'],
					['0.5', '4.75'],
				]),
				'6',
			)
		})

		test('3x3 matrices', () => {
			assert.equal(
				determinantDecimalIterative([
					['6', '1', '1'],
					['4', '-2', '5'],
					['2', '8', '7'],
				]),
				'-306',
			)
			assert.equal(
				determinantDecimalIterative([
					['0.1', '0.2', '0.3'],
					['0.4', '0.5', '0.7'],
					['0.8', '0.9', '1.1'],
				]),
				'0.004',
			)
		})

		test('4x4 matrices', () => {
			assert.equal(
				determinantDecimalIterative([
					['1', '3', '5', '9'],
					['1', '3', '1', '7'],
					['4', '3', '9', '7'],
					['5', '2', '0', '9'],
				]),
				'-376',
			)
		})

		test('does not mutate input matrix', () => {
			const input = [
				['0', '1', '2'],
				['3', '4', '5'],
				['6', '7', '9'],
			]
			const snapshot = structuredClone(input)
			const det = determinantDecimalIterative(input)
			assert.equal(det, '-3')
			assert.deepEqual(input, snapshot)
		})
	})

	describe('high-precision and ill-conditioned matrices', () => {
		test('catastrophic cancellation beyond IEEE-754 float64 precision', () => {
			// In float64, 1e20 + 1 === 1e20, giving det = 0; exact det is -1.
			const M = [
				['100000000000000000000', '100000000000000000001'],
				['100000000000000000001', '100000000000000000002'],
			]
			assert.equal(determinantDecimalIterative(M, 20), '-1')

			// Tiny fractional perturbation beyond float64 epsilon (~2.22e-16)
			const eps = '0.00000000000000000000000000000000001' // 1e-35
			const N = [
				['1', '1'],
				['1', '1.00000000000000000000000000000000001'],
			]
			assert.equal(determinantDecimalIterative(N, 40), eps)
		})

		test('35+ digit high-precision decimal arithmetic', () => {
			const a = '1.23456789012345678901234567890123456'
			const b = '2.34567890123456789012345678901234567'
			const c = '3.45678901234567890123456789012345678'
			const d = '4.56789012345678901234567890123456789'

			// Exact BigInt computation: (a*d - b*c) scaled by 10^70
			const ai = 123456789012345678901234567890123456n
			const bi = 234567890123456789012345678901234567n
			const ci = 345678901234567890123456789012345678n
			const di = 456789012345678901234567890123456789n
			const exact = formatExactScaled(ai * di - bi * ci, 70, 70)

			assert.equal(
				determinantDecimalIterative(
					[
						[a, b],
						[c, d],
					],
					70,
				),
				exact,
			)
		})

		test('ill-conditioned Hilbert matrices H_5 and H_6 (where float64 loses precision)', () => {
			const factorial = (k) => {
				let r = 1n
				for (let i = 2n; i <= BigInt(k); i++) r *= i
				return r
			}
			const superfactorial = (n) => {
				let r = 1n
				for (let k = 1; k < n; k++) r *= factorial(k)
				return r
			}

			for (const n of [5, 6]) {
				// Build H_n with entries 1/(i+j+1) accurate to 60 decimal places
				const H = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => rationalToDecimal(1n, BigInt(i + j + 1), 60)),
				)

				// Exact closed form: det(H_n) = c_n^4 / c_{2n}
				const cn = superfactorial(n)
				const c2n = superfactorial(2 * n)
				const exactNum = cn ** 4n
				const exactDen = c2n

				// Compare at 35 decimal places (H_6 det is ~5.367e-18, so 35 dp gives 18 accurate sig figs)
				const expected = rationalToDecimal(exactNum, exactDen, 35)
				const actual = determinantDecimalIterative(H, 35)
				assert.equal(actual, expected)
			}
		})

		test('ill-conditioned Vandermonde matrix with closely spaced nodes', () => {
			// Nodes x_k = 1 + k * 10^-6 for k = 0..4
			// Exact determinant = prod_{0 <= i < j <= 4} (x_j - x_i)
			// = (1*2*3*4 * 1*2*3 * 1*2 * 1) * (10^-6)^10 = 288 * 10^-60
			const nodes = ['1', '1.000001', '1.000002', '1.000003', '1.000004']
			const V = nodes.map((x) => {
				const row = ['1']
				let curr = '1'
				for (let p = 1; p < nodes.length; p++) {
					curr = multiplyDecimals(curr, x, 30)
					row.push(curr)
				}
				return row
			})

			const expected = '0.' + '0'.repeat(57) + '288'
			assert.equal(determinantDecimalIterative(V, 65), expected)
		})
	})

	describe('edge cases', () => {
		test('singular matrices return "0"', () => {
			// Duplicate rows
			assert.equal(
				determinantDecimalIterative([
					['1.5', '2.5', '3.5'],
					['1.5', '2.5', '3.5'],
					['4.5', '5.5', '6.5'],
				]),
				'0',
			)
			// Linearly dependent rows (row3 = 2*row1 - row2)
			assert.equal(
				determinantDecimalIterative([
					['1.25', '-0.5', '3.75'],
					['2.5', '1.0', '-1.25'],
					['0', '-2', '8.75'],
				]),
				'0',
			)
			// Zero row
			assert.equal(
				determinantDecimalIterative([
					['1', '2', '3'],
					['0', '0', '0'],
					['4', '5', '6'],
				]),
				'0',
			)
			// Zero column
			assert.equal(
				determinantDecimalIterative([
					['1', '0', '3'],
					['2', '0', '5'],
					['4', '0', '6'],
				]),
				'0',
			)
			// All-zero matrix
			assert.equal(
				determinantDecimalIterative([
					['-0.00', '0'],
					['0.0', '-0'],
				]),
				'0',
			)
		})

		test('zero pivots requiring row swaps (including intermediate pivot with prevPivot > 1)', () => {
			// Zero pivot at (0,0)
			assert.equal(
				determinantDecimalIterative([
					['0', '1', '2'],
					['1', '0', '3'],
					['4', '5', '0'],
				]),
				'22',
			)

			// Forces zero pivot at step k=1 while prevPivot = 2 (leading 2x2 minor is 2*2 - 1*4 = 0)
			assert.equal(
				determinantDecimalIterative([
					['2', '1', '3', '1'],
					['4', '2', '1', '5'],
					['1', '3', '2', '4'],
					['3', '2', '5', '1'],
				]),
				'-24',
			)

			// Anti-diagonal permutation matrices: det = (-1)^(n*(n-1)/2)
			// n = 3 -> -1, n = 4 -> +1
			assert.equal(
				determinantDecimalIterative([
					['0', '0', '1'],
					['0', '1', '0'],
					['1', '0', '0'],
				]),
				'-1',
			)
			assert.equal(
				determinantDecimalIterative([
					['0', '0', '0', '1'],
					['0', '0', '1', '0'],
					['0', '1', '0', '0'],
					['1', '0', '0', '0'],
				]),
				'1',
			)
		})

		test('identity, diagonal, and triangular matrices', () => {
			// Identity 4x4
			assert.equal(
				determinantDecimalIterative([
					['1', '0', '0', '0'],
					['0', '1', '0', '0'],
					['0', '0', '1', '0'],
					['0', '0', '0', '1'],
				]),
				'1',
			)

			// Diagonal with negative and fractional entries
			assert.equal(
				determinantDecimalIterative([
					['-2.5', '0', '0'],
					['0', '4', '0'],
					['0', '0', '-0.2'],
				]),
				'2',
			)

			// Upper triangular
			assert.equal(
				determinantDecimalIterative([
					['2.5', '99', '-12.34', '5'],
					['0', '-4', '7.89', '11'],
					['0', '0', '0.5', '-3'],
					['0', '0', '0', '6'],
				]),
				'-30',
			)

			// Lower triangular
			assert.equal(
				determinantDecimalIterative([
					['3', '0', '0'],
					['17.5', '-0.5', '0'],
					['-4.2', '8.8', '-2'],
				]),
				'3',
			)
		})

		test('precision=0, rounding half away from zero, carry propagation, and no "-0"', () => {
			// Exact det = 1.5
			assert.equal(determinantDecimalIterative([['1.5']], 0), '2')
			// Exact det = -1.5
			assert.equal(determinantDecimalIterative([['-1.5']], 0), '-2')
			// Exact det = 1.49999
			assert.equal(determinantDecimalIterative([['1.49999']], 0), '1')
			// Carry propagation: 1.995 rounded to 2 decimal places -> "2"
			assert.equal(determinantDecimalIterative([['1.995']], 2), '2')
			assert.equal(determinantDecimalIterative([['-1.995']], 2), '-2')
			// Tiny negative value rounding to zero must return "0", never "-0"
			assert.equal(determinantDecimalIterative([['-0.0004']], 2), '0')
			assert.equal(determinantDecimalIterative([['-0.0004']], 0), '0')
			assert.equal(determinantDecimalIterative([['-0.000']], 5), '0')
			// Default precision = 20 rounds 25-digit determinant cleanly
			assert.equal(
				determinantDecimalIterative([['0.123456789012345678905']]),
				'0.12345678901234567891',
			)
		})

		test('invalid inputs throw descriptive TypeError or RangeError', () => {
			// Invalid matrix type
			assert.throws(() => determinantDecimalIterative(null), TypeError)
			assert.throws(() => determinantDecimalIterative('1'), TypeError)
			assert.throws(() => determinantDecimalIterative(123), TypeError)
			assert.throws(() => determinantDecimalIterative({}), TypeError)

			// Empty matrix
			assert.throws(() => determinantDecimalIterative([]), RangeError)

			// Non-array row
			assert.throws(() => determinantDecimalIterative(['1']), TypeError)
			assert.throws(() => determinantDecimalIterative([['1', '2'], null]), TypeError)

			// Non-square / ragged matrices
			assert.throws(
				() =>
					determinantDecimalIterative([
						['1', '2', '3'],
						['4', '5', '6'],
					]),
				RangeError,
			)
			assert.throws(() => determinantDecimalIterative([['1'], ['2']]), RangeError)
			assert.throws(
				() =>
					determinantDecimalIterative([
						['1', '2'],
						['3'],
					]),
				RangeError,
			)

			// Non-string entries
			assert.throws(() => determinantDecimalIterative([[1]]), TypeError)
			assert.throws(() => determinantDecimalIterative([[1n]]), TypeError)
			assert.throws(() => determinantDecimalIterative([[null]]), TypeError)
			assert.throws(() => determinantDecimalIterative([[undefined]]), TypeError)

			// Invalid decimal strings
			for (const bad of ['', ' ', ' 1', '1 ', 'abc', 'NaN', 'Infinity', '-Infinity', '.', '+', '-', '1.2.3', '1e', '1e+', '1e1.5', '0x10', '1_000']) {
				assert.throws(
					() => determinantDecimalIterative([[bad]]),
					RangeError,
					`Expected RangeError for "${bad}"`,
				)
			}

			// Invalid entry even when another row is all zero
			assert.throws(
				() =>
					determinantDecimalIterative([
						['0', '0'],
						['0', 'bad'],
					]),
				RangeError,
			)

			// Invalid precision
			assert.throws(() => determinantDecimalIterative([['1']], '5'), TypeError)
			assert.throws(() => determinantDecimalIterative([['1']], null), TypeError)
			assert.throws(() => determinantDecimalIterative([['1']], -1), RangeError)
			assert.throws(() => determinantDecimalIterative([['1']], 1.5), RangeError)
			assert.throws(() => determinantDecimalIterative([['1']], NaN), RangeError)
			assert.throws(() => determinantDecimalIterative([['1']], Infinity), RangeError)
		})
	})

	describe('cross-checks against independent computations and identities', () => {
		test('cross-check 3x3 and 4x4 decimal matrices against Leibniz permutation expansion', () => {
			const M3 = [
				['1.23456789012345', '-0.98765432109876', '3.14159265358979'],
				['-2.71828182845904', '0.57721566490153', '1.61803398874989'],
				['4.66920160910299', '-1.41421356237309', '2.23606797749978'],
			]
			assert.equal(
				determinantDecimalIterative(M3, 50),
				leibnizDeterminantDecimal(M3, 50),
			)

			const M4 = [
				['0', '2.5001', '-1.3333333333', '4.125'],
				['3.75', '0', '5.0000000001', '-2.25'],
				['-1.125', '6.875', '0', '0.3333333333'],
				['2.0000000007', '-3.5', '1.75', '-4.625'],
			]
			assert.equal(
				determinantDecimalIterative(M4, 45),
				leibnizDeterminantDecimal(M4, 45),
			)
		})

		test('multiplicativity identity: det(A * B) === det(A) * det(B)', () => {
			const A = [
				['0.5', '-1.25', '2.75', '0.125'],
				['3.125', '0', '-0.5', '1.5'],
				['-2.25', '4.5', '1.125', '-3.75'],
				['1.75', '-0.25', '0.625', '2.5'],
			]
			const B = [
				['1.25', '0.75', '-2.5', '3.125'],
				['-0.5', '2.25', '1.75', '-1.25'],
				['4.125', '-3.5', '0', '0.875'],
				['-1.75', '1.5', '2.125', '-0.25'],
			]

			const AB = multiplyDecimalMatrices(A, B)
			const detA = determinantDecimalIterative(A, 30)
			const detB = determinantDecimalIterative(B, 30)
			const detAB = determinantDecimalIterative(AB, 30)
			const detA_times_detB = multiplyDecimals(detA, detB, 30)

			assert.equal(detAB, detA_times_detB)
		})

		test('transpose invariance det(A^T) === det(A) and row-swap sign flip', () => {
			const A = [
				['1.11111111111111111111', '2.3', '-4.5'],
				['0.7', '-3.14159265358979323846', '6.2'],
				['-5.8', '9.1', '2.71828182845904523536'],
			]
			const AT = A[0].map((_, j) => A.map((row) => row[j]))
			const swapped = [A[2], A[1], A[0]]

			const detA = determinantDecimalIterative(A, 60)
			const detAT = determinantDecimalIterative(AT, 60)
			const detSwapped = determinantDecimalIterative(swapped, 60)

			assert.equal(detAT, detA)
			assert.equal(detSwapped, detA.startsWith('-') ? detA.slice(1) : `-${detA}`)
		})
	})
})
