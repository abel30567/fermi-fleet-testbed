import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { addFloatRecursive } from './addFloatRecursive.js'

/**
 * Independent Kahan compensated summation reference implementation.
 *
 * @param {readonly number[]} values
 * @returns {number}
 */
function kahanSum(values) {
	let sum = 0
	let compensation = 0
	for (let i = 0; i < values.length; i++) {
		const y = values[i] - compensation
		const t = sum + y
		compensation = (t - sum) - y
		sum = t
	}
	return sum
}

/**
 * Independent naive left-to-right sequential summation for error comparison.
 *
 * @param {readonly number[]} values
 * @returns {number}
 */
function sequentialSum(values) {
	let sum = 0
	for (let i = 0; i < values.length; i++) {
		sum += values[i]
	}
	return sum
}

/**
 * Decomposes a finite IEEE-754 float64 number into exact `{ mantissa: BigInt, exp: number }`
 * such that `value === Number(mantissa) * 2**exp`.
 *
 * @param {number} x
 * @returns {{ mantissa: bigint, exp: number }}
 */
function decomposeFloat64(x) {
	if (x === 0) {
		return { mantissa: 0n, exp: 0 }
	}
	const buf = new ArrayBuffer(8)
	const f64 = new Float64Array(buf)
	const u64 = new BigUint64Array(buf)
	f64[0] = x
	const bits = u64[0]
	const sign = (bits >> 63n) === 1n ? -1n : 1n
	const rawExp = Number((bits >> 52n) & 0x7ffn)
	const frac = bits & ((1n << 52n) - 1n)

	if (rawExp === 0) {
		// Subnormal: (-1)^s * frac * 2^(-1074)
		return { mantissa: sign * frac, exp: -1074 }
	}
	// Normal: (-1)^s * (2^52 + frac) * 2^(rawExp - 1023 - 52)
	return { mantissa: sign * ((1n << 52n) + frac), exp: rawExp - 1075 }
}

/**
 * Computes the exact float64-rounded sum of finite IEEE-754 numbers via exact
 * dyadic rational BigInt arithmetic (suitable when exponent span is moderate).
 *
 * @param {readonly number[]} values
 * @returns {number}
 */
function exactDyadicSum(values) {
	const parts = values.filter((v) => v !== 0).map(decomposeFloat64)
	if (parts.length === 0) {
		return 0
	}
	let minExp = parts[0].exp
	for (let i = 1; i < parts.length; i++) {
		if (parts[i].exp < minExp) {
			minExp = parts[i].exp
		}
	}
	let totalMantissa = 0n
	for (const { mantissa, exp } of parts) {
		totalMantissa += mantissa << BigInt(exp - minExp)
	}
	if (totalMantissa === 0n) {
		return 0
	}
	// Convert exact totalMantissa * 2^minExp to nearest float64 using bit-length scaling
	const sign = totalMantissa < 0n ? -1 : 1
	const absM = totalMantissa < 0n ? -totalMantissa : totalMantissa
	const bitLen = absM.toString(2).length
	// Keep top 53 bits with round-to-nearest-even when bitLen > 53
	if (bitLen <= 53) {
		return sign * Number(absM) * Math.pow(2, minExp)
	}
	const shift = BigInt(bitLen - 53)
	let top = absM >> shift
	const remainder = absM & ((1n << shift) - 1n)
	const half = 1n << (shift - 1n)
	if (remainder > half || (remainder === half && (top & 1n) === 1n)) {
		top += 1n
	}
	return sign * Number(top) * Math.pow(2, minExp + Number(shift))
}

describe('addFloatRecursive — normal cases', () => {
	test('2-argument variadic addition', () => {
		assert.equal(addFloatRecursive(2, 3), 5)
		assert.equal(addFloatRecursive(-4.5, 1.25), -3.25)
		assert.equal(addFloatRecursive(0.1, 0.2), 0.1 + 0.2)
		assert.equal(addFloatRecursive(123456.789, -123456.789), 0)
		assert.equal(addFloatRecursive(0.5, 0.25), 0.75)
	})

	test('variadic addition with odd and even argument counts', () => {
		assert.equal(addFloatRecursive(1, 2, 3), 6)
		assert.equal(addFloatRecursive(1, 2, 3, 4), 10)
		assert.equal(addFloatRecursive(1, 2, 3, 4, 5), 15)
		assert.equal(addFloatRecursive(1, 2, 3, 4, 5, 6, 7, 8), 36)
		assert.equal(addFloatRecursive(0.25, 0.5, 0.125, 0.125, -0.5), 0.5)
	})

	test('array input matches variadic input and does not mutate input array', () => {
		const input = [1.5, -2.25, 3.75, 4.0, -0.5, 2.5, 1.0]
		const snapshot = [...input]

		const fromArray = addFloatRecursive(input)
		const fromVariadic = addFloatRecursive(...input)

		assert.equal(fromArray, 10)
		assert.equal(fromArray, fromVariadic)
		assert.deepEqual(input, snapshot)
	})
})

describe('addFloatRecursive — edge cases', () => {
	test('empty input returns +0', () => {
		assert.ok(Object.is(addFloatRecursive(), 0))
		assert.ok(Object.is(addFloatRecursive([]), 0))
	})

	test('single element returns the element unchanged', () => {
		assert.equal(addFloatRecursive(42.5), 42.5)
		assert.equal(addFloatRecursive([42.5]), 42.5)
		assert.equal(addFloatRecursive(-99.125), -99.125)
		assert.equal(addFloatRecursive([-99.125]), -99.125)
		assert.ok(Object.is(addFloatRecursive(0), 0))
		assert.ok(Object.is(addFloatRecursive([0]), 0))
	})

	test('preserves IEEE-754 negative zero semantics', () => {
		assert.ok(Object.is(addFloatRecursive(-0), -0))
		assert.ok(Object.is(addFloatRecursive([-0]), -0))
		assert.ok(Object.is(addFloatRecursive(-0, -0), -0))
		assert.ok(Object.is(addFloatRecursive([-0, -0, -0, -0, -0]), -0))
		assert.ok(Object.is(addFloatRecursive(-0, 0), 0))
		assert.ok(Object.is(addFloatRecursive(0, -0), 0))
		assert.ok(Object.is(addFloatRecursive([-0, -0, 0]), 0))
		assert.ok(Object.is(addFloatRecursive(1, -1), 0))
	})

	test('very small magnitudes and subnormal numbers', () => {
		assert.equal(addFloatRecursive(Number.MIN_VALUE, Number.MIN_VALUE), 2 * Number.MIN_VALUE)
		const subnormals = new Array(1024).fill(Number.MIN_VALUE)
		assert.equal(addFloatRecursive(subnormals), 1024 * Number.MIN_VALUE)
		assert.equal(addFloatRecursive(1, Number.EPSILON), 1 + Number.EPSILON)
	})

	test('very large magnitudes and IEEE-754 overflow', () => {
		assert.equal(addFloatRecursive(Number.MAX_VALUE, -Number.MAX_VALUE), 0)
		assert.equal(
			addFloatRecursive([Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE]),
			0
		)
		assert.equal(addFloatRecursive(Number.MAX_VALUE, Number.MAX_VALUE), Infinity)
		assert.equal(addFloatRecursive(-Number.MAX_VALUE, -Number.MAX_VALUE), -Infinity)
		assert.equal(addFloatRecursive(Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER), 0)
	})

	test('handles large arrays without stack overflow (O(log n) depth)', () => {
		const n = 200_000
		const values = new Array(n).fill(0.5)
		assert.equal(addFloatRecursive(values), n * 0.5)
	})
})

describe('addFloatRecursive — input validation', () => {
	test('throws RangeError for non-finite float64 values', () => {
		assert.throws(() => addFloatRecursive(NaN), RangeError)
		assert.throws(() => addFloatRecursive(1, NaN), RangeError)
		assert.throws(() => addFloatRecursive([1, 2, NaN]), RangeError)
		assert.throws(() => addFloatRecursive(Infinity), RangeError)
		assert.throws(() => addFloatRecursive(-Infinity), RangeError)
		assert.throws(() => addFloatRecursive(1, Infinity), RangeError)
		assert.throws(() => addFloatRecursive([1, -Infinity, 3]), RangeError)
	})

	test('throws TypeError for non-number arguments and elements', () => {
		const badInputs = [null, undefined, '1', true, false, 1n, {}, Symbol('s'), new Number(1)]
		for (const bad of badInputs) {
			assert.throws(() => addFloatRecursive(bad), TypeError)
			assert.throws(() => addFloatRecursive(1, bad), TypeError)
			assert.throws(() => addFloatRecursive([1, bad, 2]), TypeError)
		}
	})

	test('throws TypeError for mixed array + variadic arguments, nested arrays, sparse arrays, and array-likes', () => {
		assert.throws(() => addFloatRecursive([1, 2], 3), TypeError)
		assert.throws(() => addFloatRecursive(1, [2, 3]), TypeError)
		assert.throws(() => addFloatRecursive([[1, 2]]), TypeError)
		assert.throws(() => addFloatRecursive({ 0: 1, 1: 2, length: 2 }), TypeError)

		// Sparse arrays
		// eslint-disable-next-line no-sparse-arrays
		const sparse = [1, , 3]
		assert.throws(() => addFloatRecursive(sparse), TypeError)
		assert.throws(() => addFloatRecursive(new Array(4)), TypeError)
	})
})

describe('addFloatRecursive — cross-checks against independent computations', () => {
	test('cross-check vs exact BigInt scaled sum for 100,000 copies of 0.1 (and beats naive sequential sum)', () => {
		const n = 100_000
		const values = new Array(n).fill(0.1)

		// Independent exact BigInt computation: sum of 100,000 * (1/10) = 10,000
		const exactBigIntSum = (BigInt(n) * 1n) / 10n
		const exactFloat = Number(exactBigIntSum)

		const pairwise = addFloatRecursive(values)
		const sequential = sequentialSum(values)

		const pairwiseErr = Math.abs(pairwise - exactFloat)
		const sequentialErr = Math.abs(sequential - exactFloat)

		// Pairwise rounding error is O(eps * log2(n) * sum) << naive O(eps * n * sum)
		assert.ok(pairwiseErr < 1e-11, `Expected pairwise error < 1e-11, got ${pairwiseErr}`)
		assert.ok(
			pairwiseErr < sequentialErr,
			`Expected pairwise error (${pairwiseErr}) < sequential error (${sequentialErr})`
		)
	})

	test('cross-check vs exact BigInt scaled sum on signed deterministic millesimal series', () => {
		const n = 10_000
		const values = new Array(n)
		let scaledBigSum = 0n
		for (let k = 0; k < n; k++) {
			const scaled = ((k * 37 + 13) % 2001) - 1000
			scaledBigSum += BigInt(scaled)
			values[k] = scaled / 1000
		}

		const exact = Number(scaledBigSum) / 1000
		const pairwise = addFloatRecursive(values)
		const sumAbs = values.reduce((acc, v) => acc + Math.abs(v), 0)
		const bound = Math.ceil(Math.log2(n)) * Number.EPSILON * sumAbs

		assert.ok(
			Math.abs(pairwise - exact) <= bound,
			`Pairwise sum ${pairwise} differed from exact ${exact} by ${Math.abs(pairwise - exact)} > bound ${bound}`
		)
	})

	test('cross-check vs Kahan compensated summation on harmonic and trigonometric series', () => {
		// Harmonic series 1/k for k = 1..50,000
		const harmonic = Array.from({ length: 50_000 }, (_, i) => 1 / (i + 1))
		const pairwiseHarmonic = addFloatRecursive(harmonic)
		const kahanHarmonic = kahanSum(harmonic)
		const harmonicBound = Math.ceil(Math.log2(harmonic.length)) * Number.EPSILON * kahanHarmonic

		assert.ok(
			Math.abs(pairwiseHarmonic - kahanHarmonic) <= harmonicBound,
			`Harmonic pairwise ${pairwiseHarmonic} vs Kahan ${kahanHarmonic} exceeded bound ${harmonicBound}`
		)

		// Oscillatory trigonometric series with positive and negative values
		const trig = Array.from({ length: 20_000 }, (_, i) => Math.sin(i + 1) * 100 + Math.cos((i + 1) * 0.5))
		const pairwiseTrig = addFloatRecursive(trig)
		const kahanTrig = kahanSum(trig)
		const trigAbsSum = trig.reduce((acc, v) => acc + Math.abs(v), 0)
		const trigBound = Math.ceil(Math.log2(trig.length)) * Number.EPSILON * trigAbsSum

		assert.ok(
			Math.abs(pairwiseTrig - kahanTrig) <= trigBound,
			`Trig pairwise ${pairwiseTrig} vs Kahan ${kahanTrig} exceeded bound ${trigBound}`
		)
	})

	test('avoids sequential stagnation when summing large base followed by many small values', () => {
		const tailCount = 100_000
		const values = [1e16, ...new Array(tailCount).fill(1)]
		const exact = 1e16 + tailCount

		const pairwise = addFloatRecursive(values)
		const sequential = sequentialSum(values)

		// Sequential sum completely loses the 100,000 tail because 1e16 + 1 === 1e16 in float64
		assert.equal(sequential, 1e16)
		// Pairwise sum reduces the tail recursively before combining with 1e16
		assert.equal(pairwise, exact)
	})

	test('cross-check vs exact IEEE-754 dyadic rational BigInt arithmetic', () => {
		const values = Array.from({ length: 2048 }, (_, i) => {
			// Diverse floats spanning ~20 binary orders of magnitude, positive and negative
			const sign = i % 3 === 0 ? -1 : 1
			return sign * Math.pow(2, (i % 21) - 10) * (1 + ((i * 97) % 1000) / 1000)
		})

		const exact = exactDyadicSum(values)
		const pairwise = addFloatRecursive(values)
		const sumAbs = values.reduce((acc, v) => acc + Math.abs(v), 0)
		const bound = Math.ceil(Math.log2(values.length)) * Number.EPSILON * sumAbs

		assert.ok(
			Math.abs(pairwise - exact) <= bound,
			`Pairwise sum ${pairwise} differed from exact dyadic sum ${exact} by ${Math.abs(pairwise - exact)} > bound ${bound}`
		)
	})
})
