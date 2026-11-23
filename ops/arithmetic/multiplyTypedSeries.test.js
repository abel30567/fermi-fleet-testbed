import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyTypedSeries } from './multiplyTypedSeries.js'

describe('multiplyTypedSeries', () => {
	describe('normal cases', () => {
		it('multiplies positive, negative, and fractional Float64Array elements', () => {
			const a = new Float64Array([1, -2, 3.5, 0.25, 123456.789])
			const b = new Float64Array([4, 5, -2, 8, 987654.321])
			const result = multiplyTypedSeries(a, b)

			assert.ok(result instanceof Float64Array)
			assert.equal(result.length, a.length)
			for (let i = 0; i < a.length; i += 1) {
				assert.equal(result[i], a[i] * b[i])
			}
		})

		it('does not mutate inputs and returns a fresh Float64Array', () => {
			const a = new Float64Array([2, 3, 4])
			const b = new Float64Array([5, 6, 7])
			const aSnap = Float64Array.from(a)
			const bSnap = Float64Array.from(b)

			const result = multiplyTypedSeries(a, b)
			assert.notEqual(result, a)
			assert.notEqual(result, b)
			assert.deepEqual(a, aSnap)
			assert.deepEqual(b, bSnap)
			assert.deepEqual(result, new Float64Array([10, 18, 28]))
		})

		it('handles aliased inputs (squaring a series) and subarray views', () => {
			const buf = new ArrayBuffer(6 * Float64Array.BYTES_PER_ELEMENT)
			const full = new Float64Array(buf)
			full.set([10, 2, -3, 4.5, 5, 6])

			const viewA = new Float64Array(buf, 1 * Float64Array.BYTES_PER_ELEMENT, 3)
			const viewB = new Float64Array(buf, 2 * Float64Array.BYTES_PER_ELEMENT, 3)

			assert.deepEqual(
				multiplyTypedSeries(viewA, viewA),
				new Float64Array([4, 9, 20.25]),
			)
			assert.deepEqual(
				multiplyTypedSeries(viewA, viewB),
				new Float64Array([-6, -13.5, 22.5]),
			)
		})
	})

	describe('edge cases', () => {
		it('returns an empty Float64Array for empty inputs', () => {
			const result = multiplyTypedSeries(
				new Float64Array(0),
				new Float64Array(0),
			)
			assert.ok(result instanceof Float64Array)
			assert.equal(result.length, 0)
		})

		it('preserves IEEE-754 signed zero semantics', () => {
			const a = new Float64Array([0, -0, 0, -0, 5, -5])
			const b = new Float64Array([0, 0, -0, -0, -0, -0])
			const result = multiplyTypedSeries(a, b)

			assert.ok(Object.is(result[0], 0))
			assert.ok(Object.is(result[1], -0))
			assert.ok(Object.is(result[2], -0))
			assert.ok(Object.is(result[3], 0))
			assert.ok(Object.is(result[4], -0))
			assert.ok(Object.is(result[5], 0))
		})

		it('handles NaN and ±Infinity according to IEEE-754 rules', () => {
			const a = new Float64Array([
				NaN,
				1,
				Infinity,
				-Infinity,
				Infinity,
				0,
				-0,
				-Infinity,
			])
			const b = new Float64Array([
				5,
				NaN,
				2,
				3,
				-4,
				Infinity,
				-Infinity,
				-Infinity,
			])
			const result = multiplyTypedSeries(a, b)

			assert.ok(Number.isNaN(result[0]))
			assert.ok(Number.isNaN(result[1]))
			assert.equal(result[2], Infinity)
			assert.equal(result[3], -Infinity)
			assert.equal(result[4], -Infinity)
			assert.ok(Number.isNaN(result[5]))
			assert.ok(Number.isNaN(result[6]))
			assert.equal(result[7], Infinity)
		})

		it('handles extreme exponents, cross-scale products, subnormals, overflow, and underflow', () => {
			const a = new Float64Array([
				1e305,
				-1e305,
				Number.MAX_VALUE,
				Number.MIN_VALUE,
				1e-310,
				1e200,
				-1e-200,
				2 ** 997,
			])
			const b = new Float64Array([
				1e-300,
				1e-300,
				0.5,
				2 ** 54,
				1e305,
				1e200,
				1e-200,
				2 ** -997,
			])
			const result = multiplyTypedSeries(a, b)

			for (let i = 0; i < a.length; i += 1) {
				const expected = a[i] * b[i]
				if (Number.isFinite(expected) && expected !== 0) {
					const relErr = Math.abs(result[i] - expected) / Math.abs(expected)
					assert.ok(
						relErr <= Number.EPSILON,
						`index ${i}: got ${result[i]}, expected ${expected}, relErr=${relErr}`,
					)
				} else {
					assert.ok(
						Object.is(result[i], expected),
						`index ${i}: got ${result[i]}, expected ${expected}`,
					)
				}
			}
		})

		it('handles high-precision 53-bit significands across Veltkamp split boundary', () => {
			const a = new Float64Array([
				1 + Number.EPSILON,
				1 - Number.EPSILON / 2,
				Math.PI,
				Math.SQRT2,
				(2 ** 27 + 1) * (1 + 2 ** -52),
				Number.MAX_SAFE_INTEGER,
			])
			const b = new Float64Array([
				1 + Number.EPSILON,
				1 + 3 * Number.EPSILON,
				Math.E,
				Math.SQRT1_2,
				1 / 3,
				1 / Number.MAX_SAFE_INTEGER,
			])
			const result = multiplyTypedSeries(a, b)

			for (let i = 0; i < a.length; i += 1) {
				assert.equal(result[i], a[i] * b[i])
			}
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when either argument is not a Float64Array', () => {
			const valid = new Float64Array([1, 2, 3])
			const badInputs = [
				null,
				undefined,
				[1, 2, 3],
				new Float32Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
				new Uint8Array([1, 2, 3]),
				'123',
				42,
				{ length: 3, 0: 1, 1: 2, 2: 3 },
			]

			for (const bad of badInputs) {
				assert.throws(() => multiplyTypedSeries(bad, valid), TypeError)
				assert.throws(() => multiplyTypedSeries(valid, bad), TypeError)
			}
		})

		it('throws RangeError when Float64Array lengths do not match', () => {
			assert.throws(
				() =>
					multiplyTypedSeries(
						new Float64Array([1, 2]),
						new Float64Array([1, 2, 3]),
					),
				RangeError,
			)
			assert.throws(
				() =>
					multiplyTypedSeries(new Float64Array([1]), new Float64Array(0)),
				RangeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		it('matches exact BigInt fixed-point multiplication for dyadic rationals', () => {
			// Represent exact dyadic numbers k / 2^10 with 26-bit signed integers
			// so exact products fit comfortably inside binary64's 53-bit mantissa.
			const n = 200
			const a = new Float64Array(n)
			const b = new Float64Array(n)
			const expected = new Float64Array(n)

			let seed = 0x12345678
			const nextInt = () => {
				seed = (Math.imul(seed, 1664525) + 1013904223) | 0
				return seed >> 6 // 26-bit signed integer
			}

			for (let i = 0; i < n; i += 1) {
				const ka = nextInt()
				const kb = nextInt()
				a[i] = ka / 1024
				b[i] = kb / 1024
				const exactProd = BigInt(ka) * BigInt(kb)
				expected[i] = Number(exactProd) / 1048576
			}

			const actual = multiplyTypedSeries(a, b)
			assert.deepEqual(actual, expected)
		})

		it('matches the quarter-square identity ((a+b)^2 - (a-b)^2) / 4 and algebraic laws', () => {
			const a = new Float64Array([1, -7, 13.5, 42.25, -100.5, 0.125])
			const b = new Float64Array([3, 11, -4.5, 8.75, -2.5, 16.0])
			const c = new Float64Array([2, -5, 4.0, -2.0, 0.5, 8.0])

			const ab = multiplyTypedSeries(a, b)
			const ba = multiplyTypedSeries(b, a)

			// Commutativity
			assert.deepEqual(ab, ba)

			// Quarter-square identity cross-check
			for (let i = 0; i < a.length; i += 1) {
				const sum = a[i] + b[i]
				const diff = a[i] - b[i]
				const quarterSquare = (sum * sum - diff * diff) / 4
				assert.ok(Math.abs(ab[i] - quarterSquare) <= 1e-12)
			}

			// Distributivity: a * (b + c) === a * b + a * c (exact for dyadics here)
			const bPlusC = new Float64Array(b.length)
			for (let i = 0; i < b.length; i += 1) {
				bPlusC[i] = b[i] + c[i]
			}
			const lhs = multiplyTypedSeries(a, bPlusC)
			const ac = multiplyTypedSeries(a, c)
			for (let i = 0; i < a.length; i += 1) {
				assert.equal(lhs[i], ab[i] + ac[i])
			}
		})

		it('cross-checks against IEEE-754 * over 2,000 deterministic pseudo-random pairs', () => {
			const n = 2000
			const a = new Float64Array(n)
			const b = new Float64Array(n)

			let s = 0xdeadbeef
			const randUnit = () => {
				s = (Math.imul(s, 1103515245) + 12345) >>> 0
				return (s / 0x100000000) * 2 - 1
			}

			for (let i = 0; i < n; i += 1) {
				const expA = ((i * 37) % 1800) - 900
				const expB = ((i * 53) % 1800) - 900
				a[i] = randUnit() * 2 ** expA
				b[i] = randUnit() * 2 ** expB
			}

			const actual = multiplyTypedSeries(a, b)
			for (let i = 0; i < n; i += 1) {
				const expected = a[i] * b[i]
				if (Number.isFinite(expected) && expected !== 0) {
					const relErr = Math.abs(actual[i] - expected) / Math.abs(expected)
					assert.ok(
						relErr <= Number.EPSILON,
						`index ${i}: actual=${actual[i]}, expected=${expected}, relErr=${relErr}`,
					)
				} else {
					assert.ok(
						Object.is(actual[i], expected),
						`index ${i}: actual=${actual[i]}, expected=${expected}`,
					)
				}
			}
		})
	})
})
