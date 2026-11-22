import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductIntervalIterative } from './crossProductIntervalIterative.js'

/**
 * Exact dyadic rational representation `m * 2^e` for any finite IEEE-754 binary64
 * number, enabling zero-rounding-error ground-truth verification of enclosure.
 */
const _buf = new ArrayBuffer(8)
const _f64 = new Float64Array(_buf)
const _u64 = new BigUint64Array(_buf)

/**
 * Decompose a finite IEEE-754 binary64 number into exact `{ m: BigInt, e: number }`
 * such that `x === Number(m) * 2^e` exactly in the reals.
 *
 * @param {number} x
 * @returns {{ m: bigint, e: number }}
 */
function floatToDyadic(x) {
	if (x === 0) return { m: 0n, e: 0 }
	_f64[0] = x
	const bits = _u64[0]
	const sign = (bits >> 63n) === 1n ? -1n : 1n
	const expBits = Number((bits >> 52n) & 0x7ffn)
	const fracBits = bits & 0xfffffffffffffn
	if (expBits === 0) {
		// Subnormal: (-1)^s * frac * 2^-1074
		return { m: sign * fracBits, e: -1074 }
	}
	// Normal: (-1)^s * (2^52 + frac) * 2^(expBits - 1023 - 52)
	return { m: sign * ((1n << 52n) | fracBits), e: expBits - 1075 }
}

/**
 * Multiply two dyadic rationals exactly.
 *
 * @param {{ m: bigint, e: number }} a
 * @param {{ m: bigint, e: number }} b
 * @returns {{ m: bigint, e: number }}
 */
function dyadicMul(a, b) {
	if (a.m === 0n || b.m === 0n) return { m: 0n, e: 0 }
	return { m: a.m * b.m, e: a.e + b.e }
}

/**
 * Subtract two dyadic rationals `a - b` exactly.
 *
 * @param {{ m: bigint, e: number }} a
 * @param {{ m: bigint, e: number }} b
 * @returns {{ m: bigint, e: number }}
 */
function dyadicSub(a, b) {
	if (b.m === 0n) return a
	if (a.m === 0n) return { m: -b.m, e: b.e }
	if (a.e === b.e) return { m: a.m - b.m, e: a.e }
	if (a.e > b.e) {
		return { m: (a.m << BigInt(a.e - b.e)) - b.m, e: b.e }
	}
	return { m: a.m - (b.m << BigInt(b.e - a.e)), e: a.e }
}

/**
 * Compare two dyadic rationals: returns -1, 0, or 1.
 *
 * @param {{ m: bigint, e: number }} a
 * @param {{ m: bigint, e: number }} b
 * @returns {number}
 */
function dyadicCmp(a, b) {
	const diff = dyadicSub(a, b)
	if (diff.m < 0n) return -1
	if (diff.m > 0n) return 1
	return 0
}

/**
 * Exact 3D cross product of two binary64 point vectors in dyadic rationals.
 *
 * @param {[number, number, number]} u
 * @param {[number, number, number]} v
 * @returns {[{ m: bigint, e: number }, { m: bigint, e: number }, { m: bigint, e: number }]}
 */
function exactCross(u, v) {
	const ud = u.map(floatToDyadic)
	const vd = v.map(floatToDyadic)
	return [
		dyadicSub(dyadicMul(ud[1], vd[2]), dyadicMul(ud[2], vd[1])),
		dyadicSub(dyadicMul(ud[2], vd[0]), dyadicMul(ud[0], vd[2])),
		dyadicSub(dyadicMul(ud[0], vd[1]), dyadicMul(ud[1], vd[0])),
	]
}

/**
 * Exact dot product of a dyadic vector with a binary64 point vector.
 *
 * @param {Array<{ m: bigint, e: number }>} w
 * @param {[number, number, number]} u
 * @returns {{ m: bigint, e: number }}
 */
function exactDot(w, u) {
	const ud = u.map(floatToDyadic)
	let sum = { m: 0n, e: 0 }
	for (let i = 0; i < 3; i++) {
		const term = dyadicMul(w[i], ud[i])
		// sum + term = sum - (-term)
		sum = dyadicSub(sum, { m: -term.m, e: term.e })
	}
	return sum
}

/**
 * Check whether an exact dyadic value `val` lies within `[lo, hi]` (allowing ±Infinity).
 *
 * @param {[number, number]} interval
 * @param {{ m: bigint, e: number }} val
 * @returns {boolean}
 */
function intervalContainsExact(interval, val) {
	const [lo, hi] = interval
	if (lo > hi || Number.isNaN(lo) || Number.isNaN(hi)) return false
	const aboveLo = lo === -Infinity || dyadicCmp(floatToDyadic(lo), val) <= 0
	const belowHi = hi === Infinity || dyadicCmp(val, floatToDyadic(hi)) <= 0
	return aboveLo && belowHi
}

/**
 * Compute an outer interval enclosure of the dot product `a · b` using
 * naive outward-padded bounds (for independent orthogonality verification).
 *
 * @param {Array<[number, number]>} a
 * @param {Array<[number, number]>} b
 * @returns {[number, number]}
 */
function roughIntervalDot(a, b) {
	let lo = 0
	let hi = 0
	for (let i = 0; i < 3; i++) {
		const corners = [
			a[i][0] * b[i][0],
			a[i][0] * b[i][1],
			a[i][1] * b[i][0],
			a[i][1] * b[i][1],
		]
		const pLo = Math.min(...corners)
		const pHi = Math.max(...corners)
		lo += pLo - Math.abs(pLo) * 1e-12 - 1e-300
		hi += pHi + Math.abs(pHi) * 1e-12 + 1e-300
	}
	return [lo, hi]
}

describe('crossProductIntervalIterative', () => {
	test('standard basis vectors and right-hand rule', () => {
		const ex = [
			[1, 1],
			[0, 0],
			[0, 0],
		]
		const ey = [
			[0, 0],
			[1, 1],
			[0, 0],
		]
		const ez = [
			[0, 0],
			[0, 0],
			[1, 1],
		]

		assert.deepStrictEqual(crossProductIntervalIterative(ex, ey), ez)
		assert.deepStrictEqual(crossProductIntervalIterative(ey, ez), ex)
		assert.deepStrictEqual(crossProductIntervalIterative(ez, ex), ey)

		// Anti-commutativity on basis vectors
		assert.deepStrictEqual(crossProductIntervalIterative(ey, ex), [
			[0, 0],
			[0, 0],
			[-1, -1],
		])
		assert.deepStrictEqual(crossProductIntervalIterative(ex, ex), [
			[0, 0],
			[0, 0],
			[0, 0],
		])
	})

	test('exact integer interval cross product', () => {
		const a = [
			[1, 2],
			[3, 4],
			[5, 6],
		]
		const b = [
			[7, 8],
			[9, 10],
			[11, 12],
		]
		// c0 = [3,4]*[11,12] - [5,6]*[9,10] = [33,48] - [45,60] = [-27, 3]
		// c1 = [5,6]*[7,8]   - [1,2]*[11,12] = [35,48] - [11,24] = [11, 37]
		// c2 = [1,2]*[9,10]  - [3,4]*[7,8]   = [9,20]  - [21,32] = [-23, -1]
		assert.deepStrictEqual(crossProductIntervalIterative(a, b), [
			[-27, 3],
			[11, 37],
			[-23, -1],
		])
	})

	test('parallel vectors (point and interval)', () => {
		// Exact point parallel vectors -> exact zero vector
		const p1 = [
			[2, 2],
			[4, 4],
			[6, 6],
		]
		const p2 = [
			[-3, -3],
			[-6, -6],
			[-9, -9],
		]
		assert.deepStrictEqual(crossProductIntervalIterative(p1, p2), [
			[0, 0],
			[0, 0],
			[0, 0],
		])

		// Fat parallel interval vector crossed with itself encloses 0 in every component
		const fat = [
			[1, 2],
			[2, 4],
			[3, 6],
		]
		const res = crossProductIntervalIterative(fat, fat)
		for (let i = 0; i < 3; i++) {
			assert.ok(res[i][0] <= 0 && 0 <= res[i][1], `component ${i} must enclose 0`)
		}
	})

	test('zero vector produces exact zero interval vector without -0', () => {
		const zero = [
			[0, 0],
			[0, 0],
			[0, 0],
		]
		const v = [
			[-5.5, 3.25],
			[-10, -2],
			[0.1, 0.9],
		]
		const r1 = crossProductIntervalIterative(zero, v)
		const r2 = crossProductIntervalIterative(v, zero)
		assert.deepStrictEqual(r1, zero)
		assert.deepStrictEqual(r2, zero)
		for (const iv of [...r1, ...r2]) {
			assert.ok(!Object.is(iv[0], -0))
			assert.ok(!Object.is(iv[1], -0))
		}
	})

	test('sign-straddling intervals enclose all corners and interior samples', () => {
		const a = [
			[-2, 3],
			[-4, 1],
			[-1, 5],
		]
		const b = [
			[-3, 2],
			[-2, 4],
			[-5, 1],
		]
		const res = crossProductIntervalIterative(a, b)

		// Exact hand-verified bounds for integer endpoints:
		// c0 = [-4,1]*[-5,1] - [-1,5]*[-2,4] = [-5, 20] - [-10, 20] = [-25, 30]
		// c1 = [-1,5]*[-3,2] - [-2,3]*[-5,1] = [-15, 10] - [-15, 10] = [-25, 25]
		// c2 = [-2,3]*[-2,4] - [-4,1]*[-3,2] = [-8, 12] - [-8, 12] = [-20, 20]
		assert.deepStrictEqual(res, [
			[-25, 30],
			[-25, 25],
			[-20, 20],
		])
	})

	test('outward rounding guarantees strict enclosure for non-exact floating-point point intervals', () => {
		const a = [
			[0.1, 0.1],
			[0.2, 0.2],
			[0.3, 0.3],
		]
		const b = [
			[1 / 3, 1 / 3],
			[Math.SQRT2, Math.SQRT2],
			[Math.PI, Math.PI],
		]
		const res = crossProductIntervalIterative(a, b)
		const exact = exactCross([0.1, 0.2, 0.3], [1 / 3, Math.SQRT2, Math.PI])

		for (let i = 0; i < 3; i++) {
			assert.ok(
				intervalContainsExact(res[i], exact[i]),
				`component ${i} interval [${res[i][0]}, ${res[i][1]}] must enclose exact cross product`,
			)
			// Verify width is strictly positive (rounding occurred) yet tiny (<= 4 ulps)
			assert.ok(res[i][1] >= res[i][0])
			const scale = Math.max(Math.abs(res[i][0]), Math.abs(res[i][1]), 1)
			assert.ok(res[i][1] - res[i][0] <= 4 * Number.EPSILON * scale)
		}
	})

	test('catastrophic cancellation in point intervals preserves mathematical enclosure', () => {
		// a1 * b2 and a2 * b1 are nearly equal huge numbers whose true difference is tiny
		const x = 1e8 + 0.1
		const y = 1e8 + 0.2
		const a = [
			[1, 1],
			[x, x],
			[y, y],
		]
		const b = [
			[1, 1],
			[x, x],
			[y + 1e-7, y + 1e-7],
		]
		const res = crossProductIntervalIterative(a, b)
		const exact = exactCross([1, x, y], [1, x, y + 1e-7])

		for (let i = 0; i < 3; i++) {
			assert.ok(
				intervalContainsExact(res[i], exact[i]),
				`cancellation component ${i} must enclose exact value`,
			)
		}
	})

	test('extreme magnitudes (underflow and overflow) remain valid enclosures without NaN', () => {
		// Subnormal underflow case: 1e-200 * 1e-200 = 1e-400 (exact > 0, underflows to 0)
		const tinyA = [
			[0, 0],
			[1e-200, 1e-200],
			[0, 0],
		]
		const tinyB = [
			[0, 0],
			[0, 0],
			[1e-200, 1e-200],
		]
		const tinyRes = crossProductIntervalIterative(tinyA, tinyB)
		assert.deepStrictEqual(tinyRes[0], [0, Number.MIN_VALUE])
		assert.ok(
			intervalContainsExact(
				tinyRes[0],
				exactCross([0, 1e-200, 0], [0, 0, 1e-200])[0],
			),
		)

		// Overflow case: 1e200 * 1e200 overflows to +Infinity
		const hugeA = [
			[0, 0],
			[1e200, 1e200],
			[1e200, 1e200],
		]
		const hugeB = [
			[0, 0],
			[1e200, 1e200],
			[1e200, 1e200],
		]
		const hugeRes = crossProductIntervalIterative(hugeA, hugeB)
		assert.deepStrictEqual(hugeRes[0], [-Infinity, Infinity])
		assert.ok(!Number.isNaN(hugeRes[0][0]) && !Number.isNaN(hugeRes[0][1]))
		assert.ok(intervalContainsExact(hugeRes[0], { m: 0n, e: 0 }))
	})

	test('anti-commutativity: cross(b, a) equals -cross(a, b)', () => {
		const a = [
			[-1.3, 2.7],
			[0.1, 4.9],
			[-7.2, -0.3],
		]
		const b = [
			[0.7, 3.1],
			[-5.4, 1.8],
			[-2.2, 6.5],
		]
		const ab = crossProductIntervalIterative(a, b)
		const ba = crossProductIntervalIterative(b, a)
		for (let i = 0; i < 3; i++) {
			assert.strictEqual(ba[i][0], -ab[i][1])
			assert.strictEqual(ba[i][1], -ab[i][0])
		}
	})

	test('cross-check: 64-corner enumeration, interior sampling, exact enclosure, tightness, and orthogonality', () => {
		const cases = [
			{
				name: 'integer box (exact tightness check)',
				exactTight: true,
				a: [
					[-3, 2],
					[1, 5],
					[-4, 0],
				],
				b: [
					[2, 6],
					[-2, 3],
					[1, 4],
				],
			},
			{
				name: 'non-representable decimal box',
				exactTight: false,
				a: [
					[-0.3, 0.7],
					[-1.1, 0.2],
					[0.1, 2.9],
				],
				b: [
					[0.3, 1.7],
					[-0.9, 0.6],
					[-2.3, 0.4],
				],
			},
			{
				name: 'mixed scales and sign-straddling',
				exactTight: false,
				a: [
					[-1e6, 1e6],
					[-1e-6, 2e-6],
					[Math.PI - 0.1, Math.PI + 0.1],
				],
				b: [
					[-1e-5, 3e-5],
					[1e5, 2e5],
					[-Math.SQRT2, Math.SQRT2],
				],
			},
		]

		for (const tc of cases) {
			const res = crossProductIntervalIterative(tc.a, tc.b)

			// 1. Enumerate all 2^6 = 64 extreme corners using exact dyadic arithmetic
			const exactMin = [null, null, null]
			const exactMax = [null, null, null]

			for (let mask = 0; mask < 64; mask++) {
				const u = [
					tc.a[0][(mask >> 0) & 1],
					tc.a[1][(mask >> 1) & 1],
					tc.a[2][(mask >> 2) & 1],
				]
				const v = [
					tc.b[0][(mask >> 3) & 1],
					tc.b[1][(mask >> 4) & 1],
					tc.b[2][(mask >> 5) & 1],
				]
				const exactW = exactCross(u, v)

				// Exact orthogonality of each point sample: (u × v) · u === 0 and (u × v) · v === 0
				assert.strictEqual(exactDot(exactW, u).m, 0n)
				assert.strictEqual(exactDot(exactW, v).m, 0n)

				for (let i = 0; i < 3; i++) {
					assert.ok(
						intervalContainsExact(res[i], exactW[i]),
						`${tc.name}: corner ${mask} component ${i} must be enclosed`,
					)
					if (exactMin[i] === null || dyadicCmp(exactW[i], exactMin[i]) < 0) {
						exactMin[i] = exactW[i]
					}
					if (exactMax[i] === null || dyadicCmp(exactW[i], exactMax[i]) > 0) {
						exactMax[i] = exactW[i]
					}
				}
			}

			// Because each component c_i = a_j*b_k - a_k*b_j uses 4 distinct variables,
			// there is zero dependency overestimation: for exact integer cases, bounds
			// must equal exact corner min/max.
			if (tc.exactTight) {
				for (let i = 0; i < 3; i++) {
					assert.strictEqual(
						dyadicCmp(floatToDyadic(res[i][0]), exactMin[i]),
						0,
						`${tc.name}: lower bound of component ${i} should be exact`,
					)
					assert.strictEqual(
						dyadicCmp(floatToDyadic(res[i][1]), exactMax[i]),
						0,
						`${tc.name}: upper bound of component ${i} should be exact`,
					)
				}
			}

			// 2. Deterministic pseudo-random interior point sampling (200 samples)
			let seed = 0x12345678
			const nextRand = () => {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
				return seed / 0x100000000
			}
			for (let s = 0; s < 200; s++) {
				const u = tc.a.map(([lo, hi]) => lo + (hi - lo) * nextRand())
				const v = tc.b.map(([lo, hi]) => lo + (hi - lo) * nextRand())
				// Clamp in case of floating-point interpolation overshoot at endpoints
				for (let i = 0; i < 3; i++) {
					u[i] = Math.min(Math.max(u[i], tc.a[i][0]), tc.a[i][1])
					v[i] = Math.min(Math.max(v[i], tc.b[i][0]), tc.b[i][1])
				}
				const exactW = exactCross(u, v)
				for (let i = 0; i < 3; i++) {
					assert.ok(
						intervalContainsExact(res[i], exactW[i]),
						`${tc.name}: interior sample ${s} component ${i} must be enclosed`,
					)
				}
			}

			// 3. Interval orthogonality property: 0 ∈ (a × b) · a and 0 ∈ (a × b) · b
			const dotA = roughIntervalDot(res, tc.a)
			const dotB = roughIntervalDot(res, tc.b)
			assert.ok(
				dotA[0] <= 0 && 0 <= dotA[1],
				`${tc.name}: (a × b) · a must enclose 0, got [${dotA}]`,
			)
			assert.ok(
				dotB[0] <= 0 && 0 <= dotB[1],
				`${tc.name}: (a × b) · b must enclose 0, got [${dotB}]`,
			)
		}
	})

	test('input validation rejects non-3D and malformed inputs', () => {
		const valid = [
			[0, 1],
			[0, 1],
			[0, 1],
		]

		// Non-array vectors
		assert.throws(() => crossProductIntervalIterative(null, valid), TypeError)
		assert.throws(() => crossProductIntervalIterative(valid, undefined), TypeError)
		assert.throws(() => crossProductIntervalIterative('abc', valid), TypeError)
		assert.throws(() => crossProductIntervalIterative(valid, {}), TypeError)

		// Wrong dimension
		assert.throws(() => crossProductIntervalIterative([], valid), RangeError)
		assert.throws(
			() =>
				crossProductIntervalIterative(
					[
						[0, 1],
						[0, 1],
					],
					valid,
				),
			RangeError,
		)
		assert.throws(
			() =>
				crossProductIntervalIterative(valid, [
					[0, 1],
					[0, 1],
					[0, 1],
					[0, 1],
				]),
			RangeError,
		)

		// Malformed interval elements
		assert.throws(
			() => crossProductIntervalIterative([1, [0, 1], [0, 1]], valid),
			TypeError,
		)
		assert.throws(
			() => crossProductIntervalIterative(valid, [[0], [0, 1], [0, 1]]),
			RangeError,
		)
		assert.throws(
			() => crossProductIntervalIterative([[0, 1, 2], [0, 1], [0, 1]], valid),
			RangeError,
		)

		// Non-numeric bounds
		assert.throws(
			() => crossProductIntervalIterative([['0', 1], [0, 1], [0, 1]], valid),
			TypeError,
		)
		assert.throws(
			() => crossProductIntervalIterative(valid, [[0, null], [0, 1], [0, 1]]),
			TypeError,
		)

		// Non-finite bounds
		assert.throws(
			() => crossProductIntervalIterative([[NaN, 1], [0, 1], [0, 1]], valid),
			RangeError,
		)
		assert.throws(
			() =>
				crossProductIntervalIterative(valid, [[0, Infinity], [0, 1], [0, 1]]),
			RangeError,
		)
		assert.throws(
			() =>
				crossProductIntervalIterative([[-Infinity, 0], [0, 1], [0, 1]], valid),
			RangeError,
		)

		// Inverted bounds (lo > hi)
		assert.throws(
			() => crossProductIntervalIterative([[2, 1], [0, 1], [0, 1]], valid),
			RangeError,
		)
		assert.throws(
			() => crossProductIntervalIterative(valid, [[0, 1], [0, -1e-15], [0, 1]]),
			RangeError,
		)
	})
})
