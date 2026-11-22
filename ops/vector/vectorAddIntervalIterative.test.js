import { describe, it } from 'node:test'
import assert from 'node:assert'
import { vectorAddIntervalIterative } from './vectorAddIntervalIterative.js'

/**
 * Independent exact oracle: converts any finite IEEE-754 binary64 number `x`
 * into an exact BigInt representing `x * 2^1074`.
 *
 * Since every finite binary64 value (normal or subnormal) is an exact integer
 * multiple of 2^-1074 (`Number.MIN_VALUE`), this representation has zero
 * rounding error and allows exact comparison of real sums `x + y`.
 *
 * @param {number} x
 * @returns {bigint}
 */
function floatToScaledBigInt(x) {
	assert.ok(Number.isFinite(x), `Expected finite number, got ${x}`)
	if (x === 0) return 0n
	const buf = new ArrayBuffer(8)
	const view = new DataView(buf)
	view.setFloat64(0, x, false) // big-endian
	const bits = view.getBigUint64(0, false)
	const sign = (bits >> 63n) !== 0n
	const exponent = Number((bits >> 52n) & 0x7ffn)
	const fraction = bits & 0xfffffffffffffn

	let scaled
	if (exponent === 0) {
		// Subnormal: fraction * 2^-1074
		scaled = fraction
	} else {
		// Normal: (2^52 + fraction) * 2^(exponent - 1023 - 52)
		// Scaled by 2^1074 => (2^52 + fraction) * 2^(exponent - 1)
		scaled = ((1n << 52n) | fraction) << BigInt(exponent - 1)
	}
	return sign ? -scaled : scaled
}

/**
 * Independent nextUp/nextDown via DataView for tightness verification.
 */
function stepFloat(x, delta) {
	if (x === 0) return delta > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE
	const buf = new ArrayBuffer(8)
	const view = new DataView(buf)
	view.setFloat64(0, x, false)
	let bits = view.getBigUint64(0, false)
	const isNeg = (bits >> 63n) !== 0n
	bits += isNeg ? BigInt(-delta) : BigInt(delta)
	view.setBigUint64(0, bits, false)
	const out = view.getFloat64(0, false)
	return out === 0 ? 0 : out
}

describe('vectorAddIntervalIterative', () => {
	it('adds exact integer and dyadic interval vectors', () => {
		const a = [
			[1, 2],
			[-5, 3],
			[0.25, 0.5],
			[10, 10]
		]
		const b = [
			[3, 4],
			[-2, 7],
			[0.75, 1.5],
			[-10, -10]
		]
		const result = vectorAddIntervalIterative(a, b)
		assert.deepStrictEqual(result, [
			[4, 6],
			[-7, 10],
			[1, 2],
			[0, 0]
		])
	})

	it('does not mutate input vectors or intervals', () => {
		const a = [[1, 2], [0.1, 0.2]]
		const b = [[3, 4], [0.2, 0.3]]
		const aCopy = structuredClone(a)
		const bCopy = structuredClone(b)

		vectorAddIntervalIterative(a, b)

		assert.deepStrictEqual(a, aCopy)
		assert.deepStrictEqual(b, bCopy)
	})

	it('handles empty and 1D vectors', () => {
		assert.deepStrictEqual(vectorAddIntervalIterative([], []), [])
		assert.deepStrictEqual(vectorAddIntervalIterative([[2, 5]], [[-1, 3]]), [[1, 8]])
	})

	it('normalizes negative zero results to +0', () => {
		const res = vectorAddIntervalIterative([[-0, -0]], [[-0, -0]])
		assert.strictEqual(Object.is(res[0][0], 0), true)
		assert.strictEqual(Object.is(res[0][1], 0), true)
	})

	it('applies outward rounding on non-exact floats like 0.1 + 0.2', () => {
		const [[lo, hi]] = vectorAddIntervalIterative([[0.1, 0.1]], [[0.2, 0.2]])
		// Exact sum of binary64(0.1) + binary64(0.2) rounds up in RN to 0.30000000000000004,
		// so outward rounding must step lo down to 0.3 while keeping hi at 0.1 + 0.2.
		assert.strictEqual(lo, 0.3)
		assert.strictEqual(hi, 0.1 + 0.2)
		assert.ok(lo < hi, 'inexact point addition should widen by 1 ULP')

		const exactSum = floatToScaledBigInt(0.1) + floatToScaledBigInt(0.2)
		assert.ok(floatToScaledBigInt(lo) < exactSum)
		assert.ok(exactSum < floatToScaledBigInt(hi))
	})

	it('encloses large + small magnitude additions without losing small contributions', () => {
		const a = [
			[1e16, 1e16],
			[-1e16, -1e16],
			[1, 1],
			[1e300, 1e300]
		]
		const b = [
			[1, 1],
			[-1, -1],
			[Number.MIN_VALUE, Number.MIN_VALUE],
			[1e-300, 1e-300]
		]
		const res = vectorAddIntervalIterative(a, b)

		// 1e16 + 1 rounds down to 1e16 in IEEE-754 RN, so upper bound must step up to 1e16 + 2
		assert.strictEqual(res[0][0], 1e16)
		assert.strictEqual(res[0][1], 10000000000000002)

		// -1e16 + (-1) rounds up to -1e16 in RN, so lower bound must step down to -1e16 - 2
		assert.strictEqual(res[1][0], -10000000000000002)
		assert.strictEqual(res[1][1], -1e16)

		// 1 + MIN_VALUE: exact sum > 1, so hi must be 1 + Number.EPSILON
		assert.strictEqual(res[2][0], 1)
		assert.strictEqual(res[2][1], 1 + Number.EPSILON)

		// 1e300 + 1e-300: hi must step up by 1 ULP above 1e300
		assert.strictEqual(res[3][0], 1e300)
		assert.ok(res[3][1] > 1e300)
	})

	it('handles subnormal numbers and subnormal-normal boundary', () => {
		const minNormal = 2 ** -1022
		const sub = Number.MIN_VALUE
		const res = vectorAddIntervalIterative(
			[[sub, sub], [minNormal - sub, minNormal], [-sub, sub]],
			[[sub, sub], [sub, sub], [-sub, sub]]
		)
		assert.deepStrictEqual(res, [
			[2 * sub, 2 * sub],
			[minNormal, minNormal + sub],
			[-2 * sub, 2 * sub]
		])
	})

	it('handles overflow at Number.MAX_VALUE and -Number.MAX_VALUE while preserving enclosure', () => {
		const max = Number.MAX_VALUE
		const min = Number.MIN_VALUE
		const res = vectorAddIntervalIterative(
			[[max, max], [-max, -max], [max, max], [-max, -max]],
			[[max, max], [-max, -max], [min, min], [-min, -min]]
		)
		assert.deepStrictEqual(res, [
			[max, Infinity],
			[-Infinity, -max],
			[max, Infinity],
			[-Infinity, -max]
		])
	})

	it('throws RangeError on mismatched vector lengths', () => {
		assert.throws(
			() => vectorAddIntervalIterative([[1, 2]], [[1, 2], [3, 4]]),
			RangeError
		)
		assert.throws(
			() => vectorAddIntervalIterative([], [[0, 0]]),
			RangeError
		)
	})

	it('throws TypeError and RangeError on invalid inputs', () => {
		// Non-array vectors
		assert.throws(() => vectorAddIntervalIterative(null, []), TypeError)
		assert.throws(() => vectorAddIntervalIterative([], undefined), TypeError)
		assert.throws(() => vectorAddIntervalIterative('[]', []), TypeError)
		assert.throws(() => vectorAddIntervalIterative({}, []), TypeError)

		// Malformed interval elements
		assert.throws(() => vectorAddIntervalIterative([1], [[1, 2]]), TypeError)
		assert.throws(() => vectorAddIntervalIterative([[1, 2]], [null]), TypeError)
		assert.throws(() => vectorAddIntervalIterative([[1]], [[1, 2]]), TypeError)
		assert.throws(() => vectorAddIntervalIterative([[1, 2, 3]], [[1, 2]]), TypeError)
		assert.throws(() => vectorAddIntervalIterative([['1', 2]], [[1, 2]]), TypeError)
		assert.throws(() => vectorAddIntervalIterative([[1, 2]], [[1, null]]), TypeError)

		// Non-finite bounds
		assert.throws(() => vectorAddIntervalIterative([[NaN, 1]], [[0, 1]]), RangeError)
		assert.throws(() => vectorAddIntervalIterative([[0, 1]], [[0, NaN]]), RangeError)
		assert.throws(() => vectorAddIntervalIterative([[-Infinity, 1]], [[0, 1]]), RangeError)
		assert.throws(() => vectorAddIntervalIterative([[0, 1]], [[0, Infinity]]), RangeError)

		// Inverted intervals (lo > hi)
		assert.throws(() => vectorAddIntervalIterative([[5, 2]], [[0, 1]]), RangeError)
		assert.throws(() => vectorAddIntervalIterative([[0, 1]], [[1, -1]]), RangeError)
	})

	it('cross-checks enclosure and 1-ULP tightness against exact BigInt arithmetic and sampled points', () => {
		// Deterministic PRNG (xorshift32) for reproducible coverage across scales
		let seed = 0x13579bdf
		function nextU32() {
			seed ^= seed << 13
			seed ^= seed >>> 17
			seed ^= seed << 5
			return seed >>> 0
		}
		function randomFloat() {
			const sign = (nextU32() & 1) === 0 ? 1 : -1
			// Mix normal exponents across a wide range plus special decimals and subnormals
			const mode = nextU32() % 5
			if (mode === 0) return sign * (nextU32() / 1e7)
			if (mode === 1) return sign * Math.pow(2, (nextU32() % 200) - 100) * (1 + nextU32() / 0xffffffff)
			if (mode === 2) return sign * Number.MIN_VALUE * (nextU32() % 1000)
			if (mode === 3) return sign * (1e16 + (nextU32() % 17) - 8)
			return sign * (nextU32() % 1000) / 3 // repeating binary fractions
		}

		const n = 200
		const a = []
		const b = []
		for (let i = 0; i < n; i++) {
			const a1 = randomFloat()
			const a2 = randomFloat()
			const b1 = randomFloat()
			const b2 = randomFloat()
			a.push(a1 <= a2 ? [a1, a2] : [a2, a1])
			b.push(b1 <= b2 ? [b1, b2] : [b2, b1])
		}

		const result = vectorAddIntervalIterative(a, b)
		assert.strictEqual(result.length, n)

		for (let i = 0; i < n; i++) {
			const [aLo, aHi] = a[i]
			const [bLo, bHi] = b[i]
			const [rLo, rHi] = result[i]

			assert.ok(rLo <= rHi, `index ${i}: result interval must satisfy lo <= hi`)

			const exactLoSum = floatToScaledBigInt(aLo) + floatToScaledBigInt(bLo)
			const exactHiSum = floatToScaledBigInt(aHi) + floatToScaledBigInt(bHi)

			// 1. Exact endpoint enclosure
			if (Number.isFinite(rLo)) {
				const rLoScaled = floatToScaledBigInt(rLo)
				assert.ok(
					rLoScaled <= exactLoSum,
					`index ${i}: lower bound ${rLo} exceeds exact sum of ${aLo} + ${bLo}`
				)
				// Tightness: stepping rLo up by 1 ULP must strictly exceed exactLoSum
				const rLoUp = stepFloat(rLo, 1)
				if (Number.isFinite(rLoUp)) {
					assert.ok(
						floatToScaledBigInt(rLoUp) > exactLoSum,
						`index ${i}: lower bound ${rLo} is not optimally tight`
					)
				}
			}

			if (Number.isFinite(rHi)) {
				const rHiScaled = floatToScaledBigInt(rHi)
				assert.ok(
					rHiScaled >= exactHiSum,
					`index ${i}: upper bound ${rHi} is below exact sum of ${aHi} + ${bHi}`
				)
				// Tightness: stepping rHi down by 1 ULP must be strictly below exactHiSum
				const rHiDown = stepFloat(rHi, -1)
				if (Number.isFinite(rHiDown)) {
					assert.ok(
						floatToScaledBigInt(rHiDown) < exactHiSum,
						`index ${i}: upper bound ${rHi} is not optimally tight`
					)
				}
			}

			// 2. Sampled point enclosure: x in [aLo, aHi], y in [bLo, bHi] => x + y in [rLo, rHi]
			const aMid = aLo + (aHi - aLo) * 0.5
			const bMid = bLo + (bHi - bLo) * 0.5
			const xs = [aLo, Number.isFinite(aMid) && aMid >= aLo && aMid <= aHi ? aMid : aLo, aHi]
			const ys = [bLo, Number.isFinite(bMid) && bMid >= bLo && bMid <= bHi ? bMid : bLo, bHi]
			for (const x of xs) {
				for (const y of ys) {
					const exactPointSum = floatToScaledBigInt(x) + floatToScaledBigInt(y)
					if (Number.isFinite(rLo)) {
						assert.ok(floatToScaledBigInt(rLo) <= exactPointSum)
					}
					if (Number.isFinite(rHi)) {
						assert.ok(exactPointSum <= floatToScaledBigInt(rHi))
					}
				}
			}
		}
	})
})
