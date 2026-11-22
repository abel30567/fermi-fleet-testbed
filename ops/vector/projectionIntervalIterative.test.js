import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { projectionIntervalIterative } from './projectionIntervalIterative.js'

/**
 * Helper: checks that every component of interval vector `ivVec` is a valid
 * `[lo, hi]` pair enclosing the corresponding point vector `pt`.
 */
function assertEnclosesPoint(ivVec, pt, maxWidth = Infinity) {
	assert.equal(ivVec.length, pt.length)
	for (let i = 0; i < pt.length; i++) {
		const [lo, hi] = ivVec[i]
		assert.ok(lo <= hi, `component ${i}: lo (${lo}) > hi (${hi})`)
		assert.ok(lo <= pt[i], `component ${i}: lo (${lo}) > pt (${pt[i]})`)
		assert.ok(pt[i] <= hi, `component ${i}: pt (${pt[i]}) > hi (${hi})`)
		if (Number.isFinite(maxWidth)) {
			assert.ok(hi - lo <= maxWidth, `component ${i}: width ${hi - lo} > ${maxWidth}`)
		}
	}
}

/**
 * Independent scalar floating-point vector projection `((u · v) / (v · v)) * v`.
 */
function pointProjection(u, v) {
	let uv = 0
	let vv = 0
	for (let i = 0; i < u.length; i++) {
		uv += u[i] * v[i]
		vv += v[i] * v[i]
	}
	const s = uv / vv
	return v.map((vi) => s * vi)
}

/**
 * Converts a finite IEEE-754 binary64 number to an exact BigInt rational `[num, den]`
 * with `den > 0n`.
 */
function floatToExactRational(x) {
	if (x === 0) return [0n, 1n]
	const buf = new ArrayBuffer(8)
	const f64 = new Float64Array(buf)
	const u64 = new BigUint64Array(buf)
	f64[0] = x
	const bits = u64[0]
	const sign = (bits >> 63n) === 1n ? -1n : 1n
	const expBits = Number((bits >> 52n) & 0x7ffn)
	const frac = bits & ((1n << 52n) - 1n)

	let mantissa
	let exp
	if (expBits === 0) {
		mantissa = frac
		exp = -1074
	} else {
		mantissa = (1n << 52n) + frac
		exp = expBits - 1023 - 52
	}

	if (exp >= 0) {
		return [sign * (mantissa << BigInt(exp)), 1n]
	}
	return [sign * mantissa, 1n << BigInt(-exp)]
}

/**
 * Exact BigInt rational arithmetic helpers (`[num, den]` with `den > 0n`).
 */
const rat = {
	add([a, b], [c, d]) {
		return [a * d + c * b, b * d]
	},
	mul([a, b], [c, d]) {
		return [a * c, b * d]
	},
	div([a, b], [c, d]) {
		if (c < 0n) return [-a * d, -b * c]
		return [a * d, b * c]
	},
	lte([a, b], [c, d]) {
		return a * d <= c * b
	},
}

/**
 * Exact BigInt rational projection of point vectors `u` and `v` (each element `[num, den]`).
 */
function exactRationalProjection(uRat, vRat) {
	let uv = [0n, 1n]
	let vv = [0n, 1n]
	for (let i = 0; i < uRat.length; i++) {
		uv = rat.add(uv, rat.mul(uRat[i], vRat[i]))
		vv = rat.add(vv, rat.mul(vRat[i], vRat[i]))
	}
	const s = rat.div(uv, vv)
	return vRat.map((vi) => rat.mul(s, vi))
}

describe('projectionIntervalIterative', () => {
	describe('normal cases', () => {
		test('axis-aligned point vectors in 2D', () => {
			const u = [
				[3, 3],
				[4, 4],
			]
			const v = [
				[1, 1],
				[0, 0],
			]
			const res = projectionIntervalIterative(u, v)
			assertEnclosesPoint(res, [3, 0], 1e-13)
			assert.deepEqual(res[1], [0, 0])
		})

		test('general point vectors in 3D with non-dyadic exact result', () => {
			// u = (1, 2, 3), v = (2, -1, 2) => u·v = 6, v·v = 9 => proj = (4/3, -2/3, 4/3)
			const u = [
				[1, 1],
				[2, 2],
				[3, 3],
			]
			const v = [
				[2, 2],
				[-1, -1],
				[2, 2],
			]
			const res = projectionIntervalIterative(u, v)
			const exact = [
				[4n, 3n],
				[-2n, 3n],
				[4n, 3n],
			]
			for (let i = 0; i < 3; i++) {
				const loR = floatToExactRational(res[i][0])
				const hiR = floatToExactRational(res[i][1])
				assert.ok(rat.lte(loR, exact[i]), `lo must be <= exact[${i}]`)
				assert.ok(rat.lte(exact[i], hiR), `exact[${i}] must be <= hi`)
				assert.ok(res[i][1] - res[i][0] < 1e-14)
			}
		})

		test('1D interval vector projection encloses source u', () => {
			const u = [[-2.5, 4.25]]
			const v = [[3, 5]]
			const res = projectionIntervalIterative(u, v)
			assertEnclosesPoint(res, [-2.5])
			assertEnclosesPoint(res, [0])
			assertEnclosesPoint(res, [4.25])
		})

		test('target vector with zero-crossing component and non-zero component succeeds', () => {
			// v_0 ∈ [-2, 2] contains 0, but v_1 ∈ [1, 1] keeps v · v >= 1 > 0.
			// Naive ivMul(v[0], v[0]) would give [-4, 4], producing v · v = [-3, 5] and failing!
			const u = [
				[1, 2],
				[3, 4],
			]
			const v = [
				[-2, 2],
				[1, 1],
			]
			const res = projectionIntervalIterative(u, v)
			assertEnclosesPoint(res, pointProjection([1, 3], [0, 1]))
			assertEnclosesPoint(res, pointProjection([2, 4], [-2, 1]))
			assertEnclosesPoint(res, pointProjection([2, 4], [2, 1]))
		})

		test('negative target vector components', () => {
			const u = [
				[2, 3],
				[-4, -1],
			]
			const v = [
				[-3, -2],
				[-5, -4],
			]
			const res = projectionIntervalIterative(u, v)
			assertEnclosesPoint(res, pointProjection([2, -4], [-3, -5]))
			assertEnclosesPoint(res, pointProjection([3, -1], [-2, -4]))
		})
	})

	describe('edge cases', () => {
		test('axis-aligned orthogonal vectors yield exact zero', () => {
			const u = [
				[5, 7],
				[0, 0],
			]
			const v = [
				[0, 0],
				[3, 6],
			]
			const res = projectionIntervalIterative(u, v)
			assert.deepEqual(res, [
				[0, 0],
				[0, 0],
			])
		})

		test('non-axis-aligned orthogonal vectors enclose zero tightly', () => {
			const u = [
				[1, 1],
				[1, 1],
			]
			const v = [
				[1, 1],
				[-1, -1],
			]
			const res = projectionIntervalIterative(u, v)
			assertEnclosesPoint(res, [0, 0], 1e-14)
		})

		test('zero source vector u yields exact zero projection', () => {
			const u = [
				[0, 0],
				[0, 0],
				[0, 0],
			]
			const v = [
				[1, 2],
				[-3, -1],
				[0.5, 4],
			]
			const res = projectionIntervalIterative(u, v)
			assert.deepEqual(res, [
				[0, 0],
				[0, 0],
				[0, 0],
			])
		})

		test('parallel vectors (positive scalar multiple) enclose u', () => {
			const v = [
				[1.5, 1.5],
				[-2.5, -2.5],
				[4, 4],
			]
			const u = v.map(([a, b]) => [2.5 * a, 2.5 * b])
			const res = projectionIntervalIterative(u, v)
			assertEnclosesPoint(res, [3.75, -6.25, 10], 1e-13)
		})

		test('anti-parallel vectors (negative scalar multiple) enclose u', () => {
			const v = [
				[2, 2],
				[-3, -3],
			]
			const u = [
				[-6, -6],
				[9, 9],
			]
			const res = projectionIntervalIterative(u, v)
			assertEnclosesPoint(res, [-6, 9], 1e-13)
		})

		test('projection of vector onto itself encloses itself', () => {
			const v = [
				[0.1, 0.1],
				[0.2, 0.2],
				[0.3, 0.3],
			]
			const res = projectionIntervalIterative(v, v)
			assertEnclosesPoint(res, [0.1, 0.2, 0.3], 1e-14)
		})

		test('very large magnitudes causing v·v overflow remain sound without NaN', () => {
			const u = [
				[1e200, 1e200],
				[2e200, 2e200],
			]
			const v = [
				[1e200, 1e200],
				[1e200, 1e200],
			]
			const res = projectionIntervalIterative(u, v)
			for (let i = 0; i < res.length; i++) {
				const [lo, hi] = res[i]
				assert.ok(!Number.isNaN(lo) && !Number.isNaN(hi), 'bounds must not be NaN')
				assert.ok(lo <= hi, 'lo <= hi must hold')
				// Exact projection is [1.5e200, 1.5e200]
				assert.ok(lo <= 1.5e200 && 1.5e200 <= hi, 'must enclose exact projection 1.5e200')
			}
		})

		test('throws RangeError when target vector is exact zero', () => {
			assert.throws(
				() =>
					projectionIntervalIterative(
						[
							[1, 1],
							[2, 2],
						],
						[
							[0, 0],
							[0, 0],
						]
					),
				RangeError
			)
		})

		test('throws RangeError when target vector box contains zero vector', () => {
			assert.throws(
				() =>
					projectionIntervalIterative(
						[
							[1, 2],
							[3, 4],
						],
						[
							[-1, 1],
							[-2, 3],
						]
					),
				RangeError
			)
			// Boundary case where 0 is an endpoint of every component
			assert.throws(
				() =>
					projectionIntervalIterative(
						[
							[1, 1],
							[1, 1],
						],
						[
							[0, 2],
							[-2, 0],
						]
					),
				RangeError
			)
		})

		test('throws RangeError when target vector squared norm underflows to zero', () => {
			assert.throws(() => projectionIntervalIterative([[1, 1]], [[1e-200, 1e-200]]), RangeError)
		})

		test('throws RangeError on mismatched lengths and empty vectors', () => {
			assert.throws(
				() =>
					projectionIntervalIterative(
						[
							[1, 1],
							[2, 2],
						],
						[[1, 1]]
					),
				RangeError
			)
			assert.throws(() => projectionIntervalIterative([], []), RangeError)
		})

		test('throws TypeError or RangeError on invalid inputs', () => {
			// Non-array vectors
			assert.throws(() => projectionIntervalIterative(null, [[1, 1]]), TypeError)
			assert.throws(() => projectionIntervalIterative([[1, 1]], 'not-an-array'), TypeError)
			assert.throws(() => projectionIntervalIterative(undefined, [[1, 1]]), TypeError)

			// Malformed intervals
			assert.throws(() => projectionIntervalIterative([[1]], [[1, 1]]), TypeError)
			assert.throws(() => projectionIntervalIterative([[1, 2, 3]], [[1, 1]]), TypeError)
			assert.throws(() => projectionIntervalIterative([null], [[1, 1]]), TypeError)
			assert.throws(() => projectionIntervalIterative([['1', 2]], [[1, 1]]), TypeError)
			assert.throws(() => projectionIntervalIterative([[1, 2]], [[1, '2']]), TypeError)

			// Non-finite bounds
			assert.throws(() => projectionIntervalIterative([[NaN, 1]], [[1, 1]]), RangeError)
			assert.throws(() => projectionIntervalIterative([[0, Infinity]], [[1, 1]]), RangeError)
			assert.throws(() => projectionIntervalIterative([[1, 1]], [[-Infinity, 1]]), RangeError)

			// Inverted bounds (lo > hi)
			assert.throws(() => projectionIntervalIterative([[2, 1]], [[1, 1]]), RangeError)
			assert.throws(() => projectionIntervalIterative([[1, 2]], [[3, 2]]), RangeError)
		})

		test('does not mutate input interval vectors', () => {
			const u = [
				[1, 2],
				[3, 4],
			]
			const v = [
				[2, 3],
				[-1, 1],
			]
			projectionIntervalIterative(u, v)
			assert.deepEqual(u, [
				[1, 2],
				[3, 4],
			])
			assert.deepEqual(v, [
				[2, 3],
				[-1, 1],
			])
		})
	})

	describe('independent cross-checks', () => {
		test('dense grid sampling confirms componentwise enclosure in 2D', () => {
			const u = [
				[-1.5, 2.5],
				[0.25, 3.75],
			]
			const v = [
				[-1.0, 2.0],
				[1.5, 3.0],
			]
			const proj = projectionIntervalIterative(u, v)

			const steps = 6 // 7^4 = 2401 sample points
			for (let iu0 = 0; iu0 <= steps; iu0++) {
				const u0 = u[0][0] + ((u[0][1] - u[0][0]) * iu0) / steps
				for (let iu1 = 0; iu1 <= steps; iu1++) {
					const u1 = u[1][0] + ((u[1][1] - u[1][0]) * iu1) / steps
					for (let iv0 = 0; iv0 <= steps; iv0++) {
						const v0 = v[0][0] + ((v[0][1] - v[0][0]) * iv0) / steps
						for (let iv1 = 0; iv1 <= steps; iv1++) {
							const v1 = v[1][0] + ((v[1][1] - v[1][0]) * iv1) / steps
							const ptProj = pointProjection([u0, u1], [v0, v1])
							assertEnclosesPoint(proj, ptProj)
						}
					}
				}
			}
		})

		test('dense sampling across 3D interval vectors confirms componentwise enclosure', () => {
			const u = [
				[-2.1, 1.3],
				[0.7, 2.9],
				[-1.4, -0.2],
			]
			const v = [
				[0.8, 1.9],
				[-1.2, 0.9],
				[-2.5, -1.1],
			]
			const proj = projectionIntervalIterative(u, v)

			// All 2^6 = 64 extreme corners
			for (let mask = 0; mask < 64; mask++) {
				const uPt = [
					u[0][(mask >> 0) & 1],
					u[1][(mask >> 1) & 1],
					u[2][(mask >> 2) & 1],
				]
				const vPt = [
					v[0][(mask >> 3) & 1],
					v[1][(mask >> 4) & 1],
					v[2][(mask >> 5) & 1],
				]
				assertEnclosesPoint(proj, pointProjection(uPt, vPt))
			}

			// Deterministic LCG sampling of 2000 interior points
			let seed = 0x12345678
			const rand = () => {
				seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
				return seed / 0x100000000
			}
			for (let k = 0; k < 2000; k++) {
				const uPt = u.map(([lo, hi]) => lo + (hi - lo) * rand())
				const vPt = v.map(([lo, hi]) => lo + (hi - lo) * rand())
				assertEnclosesPoint(proj, pointProjection(uPt, vPt))
			}
		})

		test('exact BigInt rational cross-check confirms rigorous IEEE-754 outward rounding', () => {
			// Use dyadic float inputs whose exact rational values are represented exactly,
			// so exact BigInt rational projection gives ground truth with zero rounding error.
			const u = [
				[-0.375, 0.625],
				[0.125, 0.875],
				[-0.5, 0.25],
			]
			const v = [
				[0.75, 1.25],
				[-0.5, 0.5],
				[0.25, 0.75],
			]
			const proj = projectionIntervalIterative(u, v)
			const projLoRat = proj.map(([lo]) => floatToExactRational(lo))
			const projHiRat = proj.map(([, hi]) => floatToExactRational(hi))

			// Check all 64 vertices + midpoint using exact BigInt rational arithmetic
			for (let mask = 0; mask < 64; mask++) {
				const uRat = [
					floatToExactRational(u[0][(mask >> 0) & 1]),
					floatToExactRational(u[1][(mask >> 1) & 1]),
					floatToExactRational(u[2][(mask >> 2) & 1]),
				]
				const vRat = [
					floatToExactRational(v[0][(mask >> 3) & 1]),
					floatToExactRational(v[1][(mask >> 4) & 1]),
					floatToExactRational(v[2][(mask >> 5) & 1]),
				]
				const exact = exactRationalProjection(uRat, vRat)
				for (let i = 0; i < 3; i++) {
					assert.ok(
						rat.lte(projLoRat[i], exact[i]),
						`vertex ${mask} comp ${i}: lo must be <= exact rational`
					)
					assert.ok(
						rat.lte(exact[i], projHiRat[i]),
						`vertex ${mask} comp ${i}: exact rational must be <= hi`
					)
				}
			}

			// Also verify degenerate non-dyadic rational point vector:
			// True rational point u = (1/3, 1/7, -1/11), v = (1/5, -1/9, 1/13)
			// enclosed in tightest binary64 intervals
			const uR = [
				[1n, 3n],
				[1n, 7n],
				[-1n, 11n],
			]
			const vR = [
				[1n, 5n],
				[-1n, 9n],
				[1n, 13n],
			]
			const toEnclosingInterval = ([num, den]) => {
				const approx = Number(num) / Number(den)
				const approxR = floatToExactRational(approx)
				const buf = new ArrayBuffer(8)
				const f64 = new Float64Array(buf)
				const u64 = new BigUint64Array(buf)
				const step = (x, dir) => {
					f64[0] = x
					if (x > 0) u64[0] += dir > 0 ? 1n : -1n
					else u64[0] += dir > 0 ? -1n : 1n
					return f64[0]
				}
				if (rat.lte(approxR, [num, den])) {
					return [approx, step(approx, 1)]
				}
				return [step(approx, -1), approx]
			}
			const uIv = uR.map(toEnclosingInterval)
			const vIv = vR.map(toEnclosingInterval)
			const res = projectionIntervalIterative(uIv, vIv)
			const exact = exactRationalProjection(uR, vR)
			for (let i = 0; i < 3; i++) {
				assert.ok(rat.lte(floatToExactRational(res[i][0]), exact[i]))
				assert.ok(rat.lte(exact[i], floatToExactRational(res[i][1])))
				assert.ok(res[i][1] - res[i][0] < 1e-13)
			}
		})
	})
})
