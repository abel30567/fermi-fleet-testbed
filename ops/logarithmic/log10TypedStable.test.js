import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { log10TypedStable } from './log10TypedStable.js'

/**
 * Computes the ULP distance between two finite IEEE 754 binary64 numbers.
 */
function ulpDistance(a, b) {
	if (a === b) return 0
	const buf = new ArrayBuffer(8)
	const view = new DataView(buf)
	const toOrderedBigInt = (x) => {
		view.setFloat64(0, x, false)
		const bits = view.getBigUint64(0, false)
		return (bits & 0x8000000000000000n) !== 0n
			? ~bits
			: bits | 0x8000000000000000n
	}
	const diff = toOrderedBigInt(a) - toOrderedBigInt(b)
	return Number(diff < 0n ? -diff : diff)
}

describe('log10TypedStable', () => {
	test('input validation rejects non-Float64Array inputs and invalid out buffers', () => {
		for (const bad of [null, undefined, 10, '10', [1, 10], new Float32Array([1]), new Int32Array([1]), {}]) {
			assert.throws(() => log10TypedStable(bad), TypeError)
		}

		const valid = new Float64Array([1, 10])
		assert.throws(() => log10TypedStable(valid, [0, 0]), TypeError)
		assert.throws(() => log10TypedStable(valid, new Float32Array(2)), TypeError)
		assert.throws(() => log10TypedStable(valid, new Float64Array(3)), RangeError)
		assert.throws(() => log10TypedStable(valid, new Float64Array(1)), RangeError)
	})

	test('handles empty Float64Array, immutability, optional out buffer, and in-place aliasing', () => {
		const empty = new Float64Array(0)
		const emptyOut = log10TypedStable(empty)
		assert.ok(emptyOut instanceof Float64Array)
		assert.equal(emptyOut.length, 0)

		const input = new Float64Array([1, 10, 100, 1000])
		const snapshot = new Float64Array(input)
		const out = log10TypedStable(input)
		assert.deepEqual(input, snapshot)
		assert.notEqual(out, input)
		assert.deepEqual(out, new Float64Array([0, 1, 2, 3]))

		const target = new Float64Array(4)
		const ret = log10TypedStable(input, target)
		assert.equal(ret, target)
		assert.deepEqual(target, new Float64Array([0, 1, 2, 3]))

		// In-place aliasing
		const inplace = new Float64Array([1, 10, 100, 1000])
		const inplaceRet = log10TypedStable(inplace, inplace)
		assert.equal(inplaceRet, inplace)
		assert.deepEqual(inplace, new Float64Array([0, 1, 2, 3]))
	})

	test('exact results on integer powers of 10 including cases where Math.log(x)/Math.LN10 drifts', () => {
		// Exact representable integer powers 10^0 .. 10^22
		const exactExps = []
		const exactInputs = []
		for (let k = 0; k <= 22; k++) {
			exactExps.push(k)
			exactInputs.push(10 ** k)
		}
		const exactRes = log10TypedStable(new Float64Array(exactInputs))
		for (let i = 0; i < exactExps.length; i++) {
			assert.equal(exactRes[i], exactExps[i], `10^${exactExps[i]} must be exact`)
		}

		// Extended range 10^-308 .. 10^308 (including 1e-3, 1e-6, 1e23, 1e308)
		const wideInputs = new Float64Array(617)
		const wideExps = new Int32Array(617)
		for (let i = 0; i < 617; i++) {
			const k = i - 308
			wideExps[i] = k
			wideInputs[i] = Number(`1e${k}`)
		}
		const wideRes = log10TypedStable(wideInputs)
		for (let i = 0; i < 617; i++) {
			assert.equal(wideRes[i], wideExps[i], `1e${wideExps[i]} should round to ${wideExps[i]}`)
		}
	})

	test('IEEE 754 special values and domain edge cases', () => {
		const input = new Float64Array([
			0,
			-0,
			1,
			Infinity,
			-Infinity,
			-1,
			-1e-300,
			-Number.MIN_VALUE,
			Number.NaN,
		])
		const out = log10TypedStable(input)

		assert.equal(out[0], -Infinity)
		assert.equal(out[1], -Infinity)
		assert.ok(Object.is(out[2], 0), 'log10(1) must be +0')
		assert.equal(out[3], Infinity)
		assert.ok(Number.isNaN(out[4]))
		assert.ok(Number.isNaN(out[5]))
		assert.ok(Number.isNaN(out[6]))
		assert.ok(Number.isNaN(out[7]))
		assert.ok(Number.isNaN(out[8]))
	})

	test('subnormal numbers and extreme magnitudes maintain sub-ULP accuracy', () => {
		const cases = [
			// Value, high-precision expected log10(x)
			[Number.MIN_VALUE, -323.3062153431158], // 2^-1074
			[Number.MIN_VALUE * 2, -323.0051853474518], // 2^-1073
			[2 ** -1050, -316.08149544718025],
			[2 ** -1023, -307.95368556425277], // largest subnormal power of 2
			[2.225073858507201e-308, -307.6526555685888], // largest subnormal (2^-1022 - 2^-1074)
			[2.2250738585072014e-308, -307.6526555685888], // smallest normal (2^-1022)
			[Number.MAX_VALUE, 308.25471555991675], // (2 - 2^-52) * 2^1023
			[2 ** 1023, 307.95368556425277],
		]

		const input = new Float64Array(cases.map(([x]) => x))
		const out = log10TypedStable(input)

		for (let i = 0; i < cases.length; i++) {
			const [x, expected] = cases[i]
			assert.ok(Number.isFinite(out[i]), `log10(${x}) should be finite`)
			assert.ok(
				ulpDistance(out[i], expected) <= 1,
				`log10(${x}) = ${out[i]} differs from ${expected} by ${ulpDistance(out[i], expected)} ULPs`
			)
		}
	})

	test('preserves full accuracy near x = 1 without catastrophic cancellation', () => {
		const deltas = [
			Number.EPSILON,
			-Number.EPSILON / 2,
			1e-15,
			-1e-15,
			1e-12,
			-1e-12,
			1e-8,
			-1e-8,
			1e-4,
			-1e-4,
		]
		const input = new Float64Array(deltas.map((d) => 1 + d))
		const out = log10TypedStable(input)

		for (let i = 0; i < deltas.length; i++) {
			const actualDelta = input[i] - 1 // exact by Sterbenz's lemma
			// Independent Taylor series: log10(1 + d) = (d - d^2/2 + d^3/3 - d^4/4 + d^5/5) / ln(10)
			// Dividing by rounded Math.LN10 introduces up to ~2 ULP rounding difference vs correctly rounded log10.
			const d = actualDelta
			const taylorLn = d * (1 - d * (0.5 - d * (1 / 3 - d * (0.25 - d * 0.2))))
			const expected = taylorLn / Math.LN10
			assert.ok(
				ulpDistance(out[i], expected) <= 2,
				`near-1 delta=${d}: got ${out[i]}, expected ${expected}, ULP=${ulpDistance(out[i], expected)}`
			)
		}

		// Exact 0-ULP correctly rounded checks for smallest representable steps around 1
		assert.equal(out[0], 9.64327466553287e-17) // log10(1 + 2^-52)
		assert.equal(out[1], -4.821637332766436e-17) // log10(1 - 2^-53)
	})

	test('independent cross-check 1: BigInt exact bounds on powers of 2', () => {
		// Completely independent of Math.log10 / Math.log:
		// For x = 2^k (k = 0..1023), floor(log10(2^k)) = d must satisfy 10^d <= 2^k < 10^(d+1).
		const input = new Float64Array(1024)
		for (let k = 0; k < 1024; k++) {
			input[k] = 2 ** k
		}
		const out = log10TypedStable(input)

		let pow2 = 1n
		for (let k = 0; k < 1024; k++) {
			const d = BigInt(Math.floor(out[k]))
			const lower = 10n ** d
			const upper = lower * 10n
			assert.ok(
				pow2 >= lower && pow2 < upper,
				`2^${k}: BigInt bound failed for floor(log10) = ${d}`
			)
			pow2 <<= 1n
		}
	})

	test('independent cross-check 2: algebraic identities and Math.log10 ULP agreement', () => {
		// Test across mantissa reduction boundaries (sqrt(2)/2, 1, sqrt(2), 2) and wide log grid
		const values = [
			Math.SQRT1_2,
			Math.SQRT1_2 * (1 - 1e-12),
			Math.SQRT1_2 * (1 + 1e-12),
			Math.SQRT2,
			Math.SQRT2 * (1 - 1e-12),
			Math.SQRT2 * (1 + 1e-12),
			Math.E,
			Math.PI,
			2,
			3,
			5,
			7,
			0.5,
			0.25,
			0.125,
			1 / 3,
			1 / 7,
		]
		for (let e = -300; e <= 300; e += 17) {
			values.push(1.234567890123456 * 10 ** e)
			values.push(7.891234567891234 * 10 ** e)
		}

		const input = new Float64Array(values)
		const out = log10TypedStable(input)

		for (let i = 0; i < values.length; i++) {
			const x = values[i]
			const ref = Math.log10(x)
			assert.ok(
				ulpDistance(out[i], ref) <= 1,
				`x=${x}: got ${out[i]}, Math.log10=${ref}, ULP=${ulpDistance(out[i], ref)}`
			)
			// Inverse check: 10^log10(x) ~= x within conditioning bound O(eps * |y| * ln(10))
			const reconstructed = 10 ** out[i]
			const relErr = Math.abs(reconstructed - x) / x
			const tol = Math.max(1e-14, 4 * Number.EPSILON * Math.abs(out[i]) * Math.LN10)
			assert.ok(relErr <= tol, `inverse check failed for x=${x}: relErr=${relErr} > tol=${tol}`)
		}

		// Homomorphism checks: log10(a * b) = log10(a) + log10(b), log10(1/a) = -log10(a)
		const a = 3.141592653589793
		const b = 2.718281828459045
		const [la, lb, lab, lrec] = log10TypedStable(new Float64Array([a, b, a * b, 1 / a]))
		assert.ok(Math.abs(lab - (la + lb)) <= 2 * Number.EPSILON)
		assert.ok(Math.abs(lrec + la) <= 2 * Number.EPSILON)
	})
})
