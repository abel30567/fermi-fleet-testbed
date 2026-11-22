import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { moduloTypedIterative } from './moduloTypedIterative.js'

describe('moduloTypedIterative', () => {
	describe('normal cases', () => {
		it('computes element-wise modulo for positive integers', () => {
			const dividends = new Float64Array([7, 10, 15, 0, 2, 100])
			const divisors = new Float64Array([3, 5, 4, 7, 5, 9])

			const result = moduloTypedIterative(dividends, divisors)

			assert.ok(result instanceof Float64Array)
			assert.deepEqual(result, new Float64Array([1, 0, 3, 0, 2, 1]))
		})

		it('computes element-wise modulo for fractional finite values', () => {
			const dividends = new Float64Array([5.5, 7.25, 0.75, 3.125])
			const divisors = new Float64Array([2.0, 2.5, 0.5, 1.25])

			const result = moduloTypedIterative(dividends, divisors)

			assert.deepEqual(result, new Float64Array([1.5, 2.25, 0.25, 0.625]))
		})

		it('does not mutate input arrays and returns a fresh Float64Array', () => {
			const dividends = new Float64Array([9, -4, 11])
			const divisors = new Float64Array([4, 3, 5])
			const dividendsSnapshot = new Float64Array(dividends)
			const divisorsSnapshot = new Float64Array(divisors)

			const result = moduloTypedIterative(dividends, divisors)

			assert.notEqual(result, dividends)
			assert.notEqual(result, divisors)
			assert.deepEqual(dividends, dividendsSnapshot)
			assert.deepEqual(divisors, divisorsSnapshot)
			assert.deepEqual(result, new Float64Array([1, 2, 1]))
		})
	})

	describe('negative dividends and divisors', () => {
		it('returns non-negative Euclidean remainders for negative dividends', () => {
			const dividends = new Float64Array([-7, -10, -1, -6, -5.5, -0.25])
			const divisors = new Float64Array([3, 5, 4, 3, 2, 1])

			const result = moduloTypedIterative(dividends, divisors)

			assert.deepEqual(result, new Float64Array([2, 0, 3, 0, 0.5, 0.75]))
		})

		it('returns non-negative Euclidean remainders in [0, |b|) for negative divisors', () => {
			const dividends = new Float64Array([7, -7, 6, -6, 5.5, -5.5, 2, -2])
			const divisors = new Float64Array([-3, -3, -3, -3, -2, -2, -5, -5])

			const result = moduloTypedIterative(dividends, divisors)

			assert.deepEqual(result, new Float64Array([1, 2, 0, 0, 1.5, 0.5, 2, 3]))
		})
	})

	describe('edge cases', () => {
		it('handles empty Float64Array inputs', () => {
			const result = moduloTypedIterative(new Float64Array(0), new Float64Array(0))

			assert.ok(result instanceof Float64Array)
			assert.equal(result.length, 0)
		})

		it('handles single-element Float64Array inputs', () => {
			const result = moduloTypedIterative(new Float64Array([-13]), new Float64Array([5]))

			assert.deepEqual(result, new Float64Array([2]))
		})

		it('normalizes negative zero results to +0', () => {
			const dividends = new Float64Array([-0, -6, -12, 0, -0])
			const divisors = new Float64Array([3, 3, -4, -5, -7])

			const result = moduloTypedIterative(dividends, divisors)

			for (let i = 0; i < result.length; i++) {
				assert.equal(
					Object.is(result[i], 0),
					true,
					`expected +0 at index ${i}, got ${result[i]}`,
				)
			}
		})

		it('preserves precision for tiny positive remainders and clamps boundary rounding', () => {
			const dividends = new Float64Array([1e-16, Number.MIN_VALUE, -1e-17, -Number.MIN_VALUE])
			const divisors = new Float64Array([1, 1, 1, 1])

			const result = moduloTypedIterative(dividends, divisors)

			assert.equal(result[0], 1e-16)
			assert.equal(result[1], Number.MIN_VALUE)
			assert.equal(Object.is(result[2], 0), true)
			assert.equal(Object.is(result[3], 0), true)
			for (let i = 0; i < result.length; i++) {
				assert.ok(result[i] >= 0 && result[i] < Math.abs(divisors[i]))
			}
		})

		it('handles large safe integer values accurately', () => {
			const maxSafe = Number.MAX_SAFE_INTEGER // 9007199254740991
			const dividends = new Float64Array([maxSafe, -maxSafe, maxSafe - 1])
			const divisors = new Float64Array([7, 7, 97])

			const result = moduloTypedIterative(dividends, divisors)

			const expected = new Float64Array([
				Number(((BigInt(maxSafe) % 7n) + 7n) % 7n),
				Number(((-BigInt(maxSafe) % 7n) + 7n) % 7n),
				Number(((BigInt(maxSafe - 1) % 97n) + 97n) % 97n),
			])
			assert.deepEqual(result, expected)
		})
	})

	describe('input validation', () => {
		it('throws TypeError if dividends or divisors is not a Float64Array', () => {
			const valid = new Float64Array([1, 2])

			assert.throws(() => moduloTypedIterative([1, 2], valid), TypeError)
			assert.throws(() => moduloTypedIterative(valid, [1, 2]), TypeError)
			assert.throws(() => moduloTypedIterative(new Float32Array([1, 2]), valid), TypeError)
			assert.throws(() => moduloTypedIterative(valid, new Int32Array([1, 2])), TypeError)
			assert.throws(() => moduloTypedIterative(null, valid), TypeError)
			assert.throws(() => moduloTypedIterative(valid, undefined), TypeError)
			assert.throws(() => moduloTypedIterative(42, valid), TypeError)
			assert.throws(() => moduloTypedIterative(valid, '12'), TypeError)
		})

		it('throws RangeError on length mismatch', () => {
			assert.throws(
				() => moduloTypedIterative(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
				RangeError,
			)
			assert.throws(
				() => moduloTypedIterative(new Float64Array(0), new Float64Array([1])),
				RangeError,
			)
		})

		it('throws RangeError on zero or negative-zero divisor', () => {
			assert.throws(
				() => moduloTypedIterative(new Float64Array([5]), new Float64Array([0])),
				RangeError,
			)
			assert.throws(
				() => moduloTypedIterative(new Float64Array([5]), new Float64Array([-0])),
				RangeError,
			)
			assert.throws(
				() => moduloTypedIterative(new Float64Array([1, 2, 3]), new Float64Array([2, 0, 4])),
				RangeError,
			)
		})

		it('throws RangeError on NaN or non-finite inputs', () => {
			assert.throws(
				() => moduloTypedIterative(new Float64Array([NaN]), new Float64Array([2])),
				RangeError,
			)
			assert.throws(
				() => moduloTypedIterative(new Float64Array([2]), new Float64Array([NaN])),
				RangeError,
			)
			assert.throws(
				() => moduloTypedIterative(new Float64Array([Infinity]), new Float64Array([2])),
				RangeError,
			)
			assert.throws(
				() => moduloTypedIterative(new Float64Array([-Infinity]), new Float64Array([2])),
				RangeError,
			)
			assert.throws(
				() => moduloTypedIterative(new Float64Array([2]), new Float64Array([Infinity])),
				RangeError,
			)
			assert.throws(
				() => moduloTypedIterative(new Float64Array([2]), new Float64Array([-Infinity])),
				RangeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies the Euclidean division algorithm a = b * q + r with 0 <= r < |b|', () => {
			const aValues = []
			const bValues = []
			const sampleDividends = [-25, -13, -7, -3.5, -1, 0, 0.5, 1, 7, 13, 25, 100.25]
			const sampleDivisors = [-7, -4, -2.5, -1, -0.5, 0.5, 1, 2.5, 4, 7]

			for (const a of sampleDividends) {
				for (const b of sampleDivisors) {
					aValues.push(a)
					bValues.push(b)
				}
			}

			const dividends = new Float64Array(aValues)
			const divisors = new Float64Array(bValues)
			const remainders = moduloTypedIterative(dividends, divisors)

			for (let i = 0; i < dividends.length; i++) {
				const a = dividends[i]
				const b = divisors[i]
				const r = remainders[i]
				const absB = Math.abs(b)

				assert.ok(r >= 0 && r < absB, `expected 0 <= ${r} < ${absB} for (${a}, ${b})`)

				// Independent Euclidean quotient: q = floor(a / b) for b > 0, ceil(a / b) for b < 0
				const q = b > 0 ? Math.floor(a / b) : Math.ceil(a / b)
				const reconstructed = b * q + r
				assert.ok(
					Math.abs(reconstructed - a) <= 1e-12,
					`division identity failed for (${a}, ${b}): ${b} * ${q} + ${r} = ${reconstructed}`,
				)

				// For b > 0, also matches the floored formula a - b * floor(a / b)
				if (b > 0) {
					const flooredRef = a - b * Math.floor(a / b)
					assert.ok(
						Math.abs(r - flooredRef) <= 1e-12,
						`floored reference mismatch for (${a}, ${b}): got ${r}, ref ${flooredRef}`,
					)
				}
			}
		})

		it('matches exact BigInt Euclidean modulo across a grid of signed integers', () => {
			const aValues = []
			const bValues = []

			for (let a = -50; a <= 50; a += 3) {
				for (let b = -11; b <= 11; b++) {
					if (b === 0) continue
					aValues.push(a)
					bValues.push(b)
				}
			}

			const dividends = new Float64Array(aValues)
			const divisors = new Float64Array(bValues)
			const result = moduloTypedIterative(dividends, divisors)

			for (let i = 0; i < dividends.length; i++) {
				const bigA = BigInt(dividends[i])
				const bigAbsB = BigInt(Math.abs(divisors[i]))
				const expected = Number(((bigA % bigAbsB) + bigAbsB) % bigAbsB)
				assert.equal(
					result[i],
					expected,
					`BigInt cross-check mismatch for (${dividends[i]}, ${divisors[i]})`,
				)
			}
		})

		it('satisfies shift invariance: (a + k * b) mod b === a mod b for integer k', () => {
			const baseDividends = new Float64Array([-19, -7.5, 0, 3.25, 42])
			const divisors = new Float64Array([6, 2.5, 5, -1.5, -11])
			const baseResult = moduloTypedIterative(baseDividends, divisors)

			for (const k of [-5, -1, 1, 3, 12]) {
				const shifted = new Float64Array(baseDividends.length)
				for (let i = 0; i < baseDividends.length; i++) {
					shifted[i] = baseDividends[i] + k * divisors[i]
				}
				const shiftedResult = moduloTypedIterative(shifted, divisors)
				for (let i = 0; i < baseDividends.length; i++) {
					assert.ok(
						Math.abs(shiftedResult[i] - baseResult[i]) <= 1e-12,
						`shift invariance failed for k=${k}, index=${i}`,
					)
				}
			}
		})
	})
})
