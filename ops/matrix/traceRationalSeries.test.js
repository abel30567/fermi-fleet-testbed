import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { traceRationalSeries } from './traceRationalSeries.js'

const R = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function norm(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

function addQ(a, b) {
	return norm(a.num * b.den + b.num * a.den, a.den * b.den)
}

function mulQ(a, b) {
	return norm(a.num * b.num, a.den * b.den)
}

function matAdd(A, B) {
	return A.map((row, i) => row.map((v, j) => addQ(v, B[i][j])))
}

function matScale(c, A) {
	return A.map((row) => row.map((v) => mulQ(c, v)))
}

function matMul(A, B) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let acc = R(0n, 1n)
			for (let k = 0; k < n; k++) {
				acc = addQ(acc, mulQ(A[i][k], B[k][j]))
			}
			return acc
		})
	)
}

function matTranspose(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => A[j][i])
	)
}

function assertCanonical(actual, expectedNum, expectedDen) {
	assert.equal(typeof actual.num, 'bigint')
	assert.equal(typeof actual.den, 'bigint')
	assert.ok(actual.den > 0n, `expected den > 0n, got ${actual.den}`)
	assert.equal(gcd(actual.num, actual.den), 1n, `expected lowest terms for ${actual.num}/${actual.den}`)
	if (actual.num === 0n) {
		assert.equal(actual.den, 1n, 'zero must be represented as 0n/1n')
	}
	assert.deepEqual(actual, { num: expectedNum, den: expectedDen })
}

describe('traceRationalSeries', () => {
	test('computes trace for 1x1 matrices', () => {
		assertCanonical(traceRationalSeries([[R(7n, 3n)]]), 7n, 3n)
		assertCanonical(traceRationalSeries([[R(-5n, 4n)]]), -5n, 4n)
		assertCanonical(traceRationalSeries([[R(0n, 9n)]]), 0n, 1n)
	})

	test('computes trace for 2x2 matrices in lowest terms', () => {
		const M = [
			[R(1n, 2n), R(99n, 7n)],
			[R(-42n, 5n), R(1n, 6n)],
		]
		// 1/2 + 1/6 = 4/6 = 2/3
		assertCanonical(traceRationalSeries(M), 2n, 3n)

		const M2 = [
			[R(3n, 4n), R(1n, 2n)],
			[R(5n, 6n), R(5n, 4n)],
		]
		// 3/4 + 5/4 = 8/4 = 2/1
		assertCanonical(traceRationalSeries(M2), 2n, 1n)
	})

	test('computes trace for 3x3 matrices', () => {
		const M = [
			[R(1n, 2n), R(2n, 3n), R(3n, 4n)],
			[R(4n, 5n), R(1n, 3n), R(5n, 6n)],
			[R(6n, 7n), R(7n, 8n), R(1n, 6n)],
		]
		// 1/2 + 1/3 + 1/6 = 1
		assertCanonical(traceRationalSeries(M), 1n, 1n)

		const M2 = [
			[R(5n, 12n), R(1n, 1n), R(-2n, 3n)],
			[R(0n, 1n), R(-7n, 18n), R(4n, 9n)],
			[R(3n, 5n), R(11n, 2n), R(13n, 24n)],
		]
		// 5/12 - 7/18 + 13/24 = (30 - 28 + 39) / 72 = 41/72
		assertCanonical(traceRationalSeries(M2), 41n, 72n)
	})

	test('handles zero and negative cancellation to exact canonical zero', () => {
		const zeroDiag = [
			[R(0n, 1n), R(3n, 2n)],
			[R(-5n, 7n), R(0n, 1n)],
		]
		assertCanonical(traceRationalSeries(zeroDiag), 0n, 1n)

		const cancels = [
			[R(1n, 3n), R(5n, 1n), R(-2n, 7n)],
			[R(9n, 4n), R(1n, 6n), R(8n, 3n)],
			[R(-1n, 2n), R(4n, 9n), R(-1n, 2n)],
		]
		// 1/3 + 1/6 - 1/2 = 0/1
		assertCanonical(traceRationalSeries(cancels), 0n, 1n)

		const negativeTrace = [
			[R(-7n, 10n), R(1n, 2n), R(3n, 4n)],
			[R(2n, 5n), R(-3n, 10n), R(-1n, 3n)],
			[R(6n, 7n), R(0n, 1n), R(-1n, 5n)],
		]
		// -7/10 - 3/10 - 1/5 = -6/5
		assertCanonical(traceRationalSeries(negativeTrace), -6n, 5n)
	})

	test('normalizes unreduced inputs and negative denominators', () => {
		const M = [
			[{ num: 6n, den: -9n }, { num: -4n, den: -8n }],
			[{ num: 0n, den: -5n }, { num: -10n, den: -15n }],
		]
		// -2/3 + 2/3 = 0/1
		assertCanonical(traceRationalSeries(M), 0n, 1n)

		const M2 = [
			[{ num: 12n, den: 18n }, { num: 3n, den: -6n }],
			[{ num: 14n, den: 21n }, { num: -15n, den: -20n }],
		]
		// 2/3 + 3/4 = 17/12
		assertCanonical(traceRationalSeries(M2), 17n, 12n)
	})

	test('preserves exact precision for large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 30n
		const M = [
			[R(big + 1n, big), R(1n, 2n)],
			[R(3n, 4n), R(-big + 2n, big)],
		]
		// (big + 1)/big + (-big + 2)/big = 3 / big
		assertCanonical(traceRationalSeries(M), 3n, big)
	})

	test('validates inputs and throws TypeError or RangeError appropriately', () => {
		// Non-array M -> TypeError
		for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
			assert.throws(() => traceRationalSeries(bad), TypeError)
		}

		// Empty matrix -> RangeError
		assert.throws(() => traceRationalSeries([]), RangeError)

		// Non-array row -> TypeError
		assert.throws(() => traceRationalSeries([null]), TypeError)
		assert.throws(() => traceRationalSeries([[R(1n), R(2n)], 'row']), TypeError)

		// Non-square matrices -> RangeError
		assert.throws(() => traceRationalSeries([[]]), RangeError)
		assert.throws(() => traceRationalSeries([[R(1n), R(2n)]]), RangeError)
		assert.throws(() => traceRationalSeries([[R(1n)], [R(2n)]]), RangeError)
		assert.throws(
			() =>
				traceRationalSeries([
					[R(1n), R(2n)],
					[R(3n)],
				]),
			RangeError
		)

		// Invalid rational objects (both diagonal and off-diagonal) -> TypeError
		assert.throws(() => traceRationalSeries([[null]]), TypeError)
		assert.throws(() => traceRationalSeries([[{ num: 1, den: 2 }]]), TypeError)
		assert.throws(() => traceRationalSeries([[{ num: 1n, den: 2 }]]), TypeError)
		assert.throws(() => traceRationalSeries([[{ num: 1, den: 2n }]]), TypeError)
		assert.throws(() => traceRationalSeries([[{ num: 1n }]]), TypeError)
		assert.throws(
			() =>
				traceRationalSeries([
					[R(1n), { num: 2, den: 3 }],
					[R(4n), R(5n)],
				]),
			TypeError
		)

		// Zero denominators (both diagonal and off-diagonal) -> RangeError
		assert.throws(() => traceRationalSeries([[{ num: 1n, den: 0n }]]), RangeError)
		assert.throws(() => traceRationalSeries([[{ num: 0n, den: 0n }]]), RangeError)
		assert.throws(
			() =>
				traceRationalSeries([
					[R(1n), R(2n)],
					[{ num: 3n, den: 0n }, R(4n)],
				]),
			RangeError
		)
	})

	test('cross-check: cyclic property tr(AB) = tr(BA) and tr(ABC) = tr(BCA) = tr(CAB)', () => {
		const A = [
			[R(1n, 2n), R(-3n, 4n), R(5n, 6n)],
			[R(7n, 3n), R(2n, 5n), R(-1n, 7n)],
			[R(-4n, 9n), R(11n, 8n), R(3n, 10n)],
		]
		const B = [
			[R(2n, 7n), R(5n, 3n), R(-1n, 2n)],
			[R(-6n, 5n), R(1n, 4n), R(9n, 11n)],
			[R(4n, 3n), R(-7n, 6n), R(8n, 9n)],
		]
		const C = [
			[R(-1n, 5n), R(3n, 2n), R(2n, 3n)],
			[R(4n, 7n), R(-5n, 6n), R(1n, 8n)],
			[R(7n, 4n), R(2n, 9n), R(-3n, 5n)],
		]

		const AB = matMul(A, B)
		const BA = matMul(B, A)
		assert.notDeepEqual(AB, BA, 'A and B should not commute')

		const trAB = traceRationalSeries(AB)
		const trBA = traceRationalSeries(BA)
		assert.deepEqual(trAB, trBA)
		assert.equal(gcd(trAB.num, trAB.den), 1n)
		assert.ok(trAB.den > 0n)

		const trABC = traceRationalSeries(matMul(AB, C))
		const trBCA = traceRationalSeries(matMul(matMul(B, C), A))
		const trCAB = traceRationalSeries(matMul(matMul(C, A), B))
		assert.deepEqual(trABC, trBCA)
		assert.deepEqual(trBCA, trCAB)
	})

	test('cross-check: linearity tr(A + B) = tr(A) + tr(B), scaling tr(cA) = c*tr(A), and transpose invariance', () => {
		const A = [
			[R(3n, 7n), R(-2n, 5n), R(1n, 4n)],
			[R(8n, 9n), R(-5n, 12n), R(7n, 6n)],
			[R(-1n, 3n), R(4n, 11n), R(9n, 14n)],
		]
		const B = [
			[R(-11n, 6n), R(1n, 2n), R(-3n, 8n)],
			[R(5n, 4n), R(13n, 15n), R(2n, 7n)],
			[R(6n, 5n), R(-9n, 10n), R(-4n, 21n)],
		]
		const c = R(-7n, 13n)

		// tr(A + B) === tr(A) + tr(B)
		assert.deepEqual(
			traceRationalSeries(matAdd(A, B)),
			addQ(traceRationalSeries(A), traceRationalSeries(B))
		)

		// tr(c * A) === c * tr(A)
		assert.deepEqual(
			traceRationalSeries(matScale(c, A)),
			mulQ(c, traceRationalSeries(A))
		)

		// tr(A^T) === tr(A)
		assert.deepEqual(traceRationalSeries(matTranspose(A)), traceRationalSeries(A))
	})

	test('cross-check: matches independent common-denominator formula and floating-point arithmetic', () => {
		const M = [
			[R(1n, 3n), R(2n, 5n), R(3n, 7n), R(4n, 9n)],
			[R(5n, 11n), R(-7n, 13n), R(1n, 2n), R(-3n, 4n)],
			[R(8n, 15n), R(9n, 17n), R(11n, 19n), R(13n, 21n)],
			[R(-2n, 3n), R(4n, 5n), R(-6n, 7n), R(17n, 23n)],
		]

		const result = traceRationalSeries(M)

		// Independent brute-force common-denominator computation
		let commonDen = 1n
		for (let i = 0; i < M.length; i++) {
			commonDen *= M[i][i].den
		}
		let commonNum = 0n
		for (let i = 0; i < M.length; i++) {
			commonNum += M[i][i].num * (commonDen / M[i][i].den)
		}
		assert.deepEqual(result, norm(commonNum, commonDen))

		// Cross-check against JS floating-point Math arithmetic within tolerance
		let floatSum = 0
		for (let i = 0; i < M.length; i++) {
			floatSum += Number(M[i][i].num) / Number(M[i][i].den)
		}
		const rationalAsFloat = Number(result.num) / Number(result.den)
		assert.ok(Math.abs(rationalAsFloat - floatSum) < 1e-12)
	})
})
