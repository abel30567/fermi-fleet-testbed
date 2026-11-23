import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtIntervalIterative } from './cbrtIntervalIterative.js'

const f64 = new Float64Array(1)
const u64 = new BigUint64Array(f64.buffer)

function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x
	if (x === 0) return Number.MIN_VALUE
	f64[0] = x
	if (x > 0) {
		u64[0] += 1n
	} else {
		u64[0] -= 1n
	}
	return f64[0] === 0 ? 0 : f64[0]
}

function nextDown(x) {
	return -nextUp(-x)
}

/**
 * Independent exact rational decomposition of a finite binary64 number
 * as `num / 2^denExp` (with `denExp >= 0`) using DataView (independent of module helpers).
 */
function exactFloat(x) {
	if (x === 0) return { num: 0n, exp: 0 }
	const buf = new ArrayBuffer(8)
	const dv = new DataView(buf)
	dv.setFloat64(0, x, false)
	const hi = dv.getUint32(0, false)
	const lo = dv.getUint32(4, false)
	const sign = (hi >>> 31) ? -1n : 1n
	const rawExp = (hi >>> 20) & 0x7ff
	const fracHi = BigInt(hi & 0xfffff)
	const fracLo = BigInt(lo)
	const frac = (fracHi << 32n) | fracLo
	if (rawExp === 0) {
		return { num: sign * frac, exp: -1074 }
	}
	return { num: sign * ((1n << 52n) | frac), exp: rawExp - 1075 }
}

/**
 * Exact comparison of `y^3` against `x` for any finite signed binary64 values.
 * Returns -1 if y^3 < x, 0 if y^3 === x, 1 if y^3 > x.
 */
function exactCompareCube(y, x) {
	if (y === 0 && x === 0) return 0
	if (y < 0 && x >= 0) return -1
	if (y > 0 && x <= 0) return 1
	if (y === 0) return x > 0 ? -1 : 1

	const fy = exactFloat(y)
	const fx = exactFloat(x)
	const lhsNum = fy.num * fy.num * fy.num
	const lhsExp = 3 * fy.exp
	const rhsNum = fx.num
	const rhsExp = fx.exp

	const absLhsBits = (lhsNum < 0n ? -lhsNum : lhsNum).toString(2).length + lhsExp
	const absRhsBits = (rhsNum < 0n ? -rhsNum : rhsNum).toString(2).length + rhsExp
	if (absLhsBits !== absRhsBits) {
		const magCmp = absLhsBits < absRhsBits ? -1 : 1
		return lhsNum > 0n ? magCmp : -magCmp
	}

	const diff = lhsExp - rhsExp
	const a = diff >= 0 ? lhsNum << BigInt(diff) : lhsNum
	const b = diff < 0 ? rhsNum << BigInt(-diff) : rhsNum
	return a < b ? -1 : a > b ? 1 : 0
}

test('exact perfect cube point and non-point intervals', () => {
	assert.deepStrictEqual(cbrtIntervalIterative([0, 0]), [0, 0])
	assert.deepStrictEqual(cbrtIntervalIterative([1, 1]), [1, 1])
	assert.deepStrictEqual(cbrtIntervalIterative([-1, -1]), [-1, -1])
	assert.deepStrictEqual(cbrtIntervalIterative([8, 8]), [2, 2])
	assert.deepStrictEqual(cbrtIntervalIterative([-8, -8]), [-2, -2])
	assert.deepStrictEqual(cbrtIntervalIterative([27, 27]), [3, 3])
	assert.deepStrictEqual(cbrtIntervalIterative([-27, 27]), [-3, 3])
	assert.deepStrictEqual(cbrtIntervalIterative([0.125, 0.125]), [0.5, 0.5])
	assert.deepStrictEqual(cbrtIntervalIterative([-125, 1000]), [-5, 10])
	assert.deepStrictEqual(cbrtIntervalIterative([1, 64]), [1, 4])
})

test('non-exact intervals enclose true cube roots tightly', () => {
	const cases = [
		[2, 2],
		[-2, -2],
		[-2, 2],
		[2, 3],
		[-10, -2],
		[0.1, 0.5],
		[-0.5, 0.1],
		[10, 100],
		[1e-20, 1e20],
	]

	for (const [lo, hi] of cases) {
		const [outLo, outHi] = cbrtIntervalIterative([lo, hi])
		assert.ok(outLo <= outHi, `expected ${outLo} <= ${outHi}`)
		// Exact outward enclosure: outLo^3 <= lo and outHi^3 >= hi
		assert.ok(exactCompareCube(outLo, lo) <= 0, `lower bound failed for ${lo}`)
		assert.ok(exactCompareCube(outHi, hi) >= 0, `upper bound failed for ${hi}`)
		// Tightness: moving either endpoint inward by 1 ULP must violate enclosure
		assert.ok(exactCompareCube(nextUp(outLo), lo) > 0, `lower bound not tight for ${lo}`)
		assert.ok(exactCompareCube(nextDown(outHi), hi) < 0, `upper bound not tight for ${hi}`)
	}

	// For a non-exact point interval like [2, 2], outHi should be exactly 1 ULP above outLo
	const [lo2, hi2] = cbrtIntervalIterative([2, 2])
	assert.strictEqual(nextUp(lo2), hi2)
})

test('signed zero normalization', () => {
	const r1 = cbrtIntervalIterative([-0, 0])
	const r2 = cbrtIntervalIterative([-0, -0])
	assert.ok(Object.is(r1[0], 0) && Object.is(r1[1], 0))
	assert.ok(Object.is(r2[0], 0) && Object.is(r2[1], 0))
})

test('subnormal, extreme finite, and adjacent float edge cases', () => {
	// Number.MIN_VALUE === 2^-1074 === (2^-358)^3 (exact cube!)
	const exactMinCbrt = 2 ** -358
	assert.deepStrictEqual(
		cbrtIntervalIterative([Number.MIN_VALUE, Number.MIN_VALUE]),
		[exactMinCbrt, exactMinCbrt],
	)
	assert.deepStrictEqual(
		cbrtIntervalIterative([-Number.MIN_VALUE, Number.MIN_VALUE]),
		[-exactMinCbrt, exactMinCbrt],
	)

	const extremes = [
		[2 * Number.MIN_VALUE, 3 * Number.MIN_VALUE],
		[-3 * Number.MIN_VALUE, -2 * Number.MIN_VALUE],
		[Number.MIN_VALUE, 2.2250738585072014e-308],
		[Number.MAX_VALUE, Number.MAX_VALUE],
		[-Number.MAX_VALUE, -Number.MAX_VALUE],
		[-Number.MAX_VALUE, Number.MAX_VALUE],
		[1e300, Number.MAX_VALUE],
		[1, 1 + Number.EPSILON],
		[nextDown(8), nextUp(8)],
		[nextDown(-8), nextUp(-8)],
	]

	for (const [lo, hi] of extremes) {
		const [outLo, outHi] = cbrtIntervalIterative([lo, hi])
		assert.ok(Number.isFinite(outLo) && Number.isFinite(outHi))
		assert.ok(outLo <= outHi)
		assert.ok(exactCompareCube(outLo, lo) <= 0, `enclosure lo failed for [${lo}, ${hi}]`)
		assert.ok(exactCompareCube(outHi, hi) >= 0, `enclosure hi failed for [${lo}, ${hi}]`)
		assert.ok(exactCompareCube(nextUp(outLo), lo) > 0, `tightness lo failed for [${lo}, ${hi}]`)
		assert.ok(exactCompareCube(nextDown(outHi), hi) < 0, `tightness hi failed for [${lo}, ${hi}]`)
	}
})

test('infinite interval endpoints', () => {
	assert.deepStrictEqual(cbrtIntervalIterative([-Infinity, Infinity]), [-Infinity, Infinity])
	assert.deepStrictEqual(cbrtIntervalIterative([-Infinity, 8]), [-Infinity, 2])
	assert.deepStrictEqual(cbrtIntervalIterative([-8, Infinity]), [-2, Infinity])
	assert.deepStrictEqual(cbrtIntervalIterative([-Infinity, -Infinity]), [-Infinity, -Infinity])
	assert.deepStrictEqual(cbrtIntervalIterative([Infinity, Infinity]), [Infinity, Infinity])
	assert.deepStrictEqual(cbrtIntervalIterative([-Infinity, 0]), [-Infinity, 0])
	assert.deepStrictEqual(cbrtIntervalIterative([0, Infinity]), [0, Infinity])
})

test('input validation rejects invalid intervals', () => {
	assert.throws(() => cbrtIntervalIterative(null), TypeError)
	assert.throws(() => cbrtIntervalIterative(undefined), TypeError)
	assert.throws(() => cbrtIntervalIterative(8), TypeError)
	assert.throws(() => cbrtIntervalIterative({ lo: 0, hi: 1 }), TypeError)
	assert.throws(() => cbrtIntervalIterative([]), TypeError)
	assert.throws(() => cbrtIntervalIterative([1]), TypeError)
	assert.throws(() => cbrtIntervalIterative([1, 2, 3]), TypeError)
	assert.throws(() => cbrtIntervalIterative(['1', 2]), TypeError)
	assert.throws(() => cbrtIntervalIterative([1, '2']), TypeError)
	assert.throws(() => cbrtIntervalIterative([1n, 8n]), TypeError)

	assert.throws(() => cbrtIntervalIterative([NaN, 1]), RangeError)
	assert.throws(() => cbrtIntervalIterative([1, NaN]), RangeError)
	assert.throws(() => cbrtIntervalIterative([NaN, NaN]), RangeError)
	assert.throws(() => cbrtIntervalIterative([2, 1]), RangeError)
	assert.throws(() => cbrtIntervalIterative([0, -1]), RangeError)
	assert.throws(() => cbrtIntervalIterative([Infinity, -Infinity]), RangeError)
})

test('independent cross-check against Math.cbrt, exact BigInt cubing, symmetry, and isotonicity', () => {
	const samples = [
		-Number.MAX_VALUE,
		-1e150,
		-1e50,
		-123456.789,
		-1000,
		-9.5,
		-2,
		-1,
		-0.3,
		-1e-12,
		-1e-100,
		-2.2250738585072014e-308,
		-7 * Number.MIN_VALUE,
		-Number.MIN_VALUE,
		0,
		Number.MIN_VALUE,
		7 * Number.MIN_VALUE,
		2.2250738585072014e-308,
		1e-100,
		1e-12,
		0.3,
		1,
		2,
		9.5,
		1000,
		123456.789,
		1e50,
		1e150,
		Number.MAX_VALUE,
	]

	for (let i = 0; i < samples.length; i++) {
		const x = samples[i]
		const [lo, hi] = cbrtIntervalIterative([x, x])

		// 1. Exact BigInt rational enclosure & tightness
		assert.ok(exactCompareCube(lo, x) <= 0, `exact lo failed for ${x}`)
		assert.ok(exactCompareCube(hi, x) >= 0, `exact hi failed for ${x}`)
		if (x !== 0) {
			assert.ok(exactCompareCube(nextUp(lo), x) > 0, `tight lo failed for ${x}`)
			assert.ok(exactCompareCube(nextDown(hi), x) < 0, `tight hi failed for ${x}`)
		}

		// 2. Independent cross-check with Math.cbrt (must agree within 1 ULP)
		const ref = Math.cbrt(x)
		assert.ok(lo <= nextUp(ref) && hi >= nextDown(ref), `Math.cbrt mismatch for ${x}: [${lo}, ${hi}] vs ${ref}`)
		// For correctly rounded point enclosure, hi is either lo (exact) or nextUp(lo) (1 ULP)
		assert.ok(lo === hi || nextUp(lo) === hi, `width > 1 ULP for point interval [${x}, ${x}]`)

		// 3. Odd symmetry: cbrt([-x, -x]) === [-hi, -lo]
		const [negLo, negHi] = cbrtIntervalIterative([-x, -x])
		assert.strictEqual(negLo, x === 0 ? 0 : -hi)
		assert.strictEqual(negHi, x === 0 ? 0 : -lo)
	}

	// 4. Inclusion isotonicity over nested intervals
	for (let i = 0; i < samples.length - 3; i += 3) {
		const outer = [samples[i], samples[i + 3]]
		const inner = [samples[i + 1], samples[i + 2]]
		const [oLo, oHi] = cbrtIntervalIterative(outer)
		const [iLo, iHi] = cbrtIntervalIterative(inner)
		assert.ok(oLo <= iLo && iHi <= oHi, `isotonicity violated for ${inner} in ${outer}`)
	}
})
