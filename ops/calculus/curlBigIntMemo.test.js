import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { curlBigIntMemo, SCALE } from './curlBigIntMemo.js'

/** Fixed-point multiplication (rounded toward zero for exact test polynomials). */
const fpMul = (a, b) => (a * b) / SCALE

/** Convert integer or decimal string to 10^18 fixed-point BigInt. */
const fp = (n) => BigInt(n) * SCALE

/** Fixed-point sin(x) via Taylor series to high precision (|x| <= 4). */
function fpSin(x) {
	let term = x
	let sum = x
	const x2 = fpMul(x, x)
	for (let k = 1n; k <= 16n; k++) {
		term = (-fpMul(term, x2)) / ((2n * k) * (2n * k + 1n))
		if (term === 0n) break
		sum += term
	}
	return sum
}

/** Fixed-point cos(x) via Taylor series to high precision (|x| <= 4). */
function fpCos(x) {
	let term = SCALE
	let sum = SCALE
	const x2 = fpMul(x, x)
	for (let k = 1n; k <= 16n; k++) {
		term = (-fpMul(term, x2)) / ((2n * k - 1n) * (2n * k))
		if (term === 0n) break
		sum += term
	}
	return sum
}

const absBigInt = (v) => (v < 0n ? -v : v)

describe('curlBigIntMemo - normal analytic cases', () => {
	test('constant vector field has zero curl', () => {
		const field = () => [fp(7), fp(-3), fp(42)]
		assert.deepEqual(curlBigIntMemo(field, [fp(1), fp(2), fp(3)]), [0n, 0n, 0n])
	})

	test('rigid-body rotation F(x,y,z) = (-y, x, 0) has curl (0, 0, 2)', () => {
		const field = (x, y, _z) => [-y, x, 0n]
		assert.deepEqual(curlBigIntMemo(field, [fp(5), fp(-11), fp(3)]), [0n, 0n, fp(2)])
	})

	test('general linear field with non-integer fixed-point coefficients', () => {
		// F_i = sum_j A[i][j] * x_j + b_i
		const a01 = 1_250_000_000_000_000_000n // 1.25
		const a02 = -333_333_333_333_333_333n // -1/3 approx
		const a10 = 2_750_000_000_000_000_000n // 2.75
		const a12 = 500_000_000_000_000_000n // 0.5
		const a20 = -1_500_000_000_000_000_000n // -1.5
		const a21 = 4_125_000_000_000_000_000n // 4.125

		// Use step h = SCALE so fpMul(a, x + k*h) is exact with zero truncation noise
		const field = (x, y, z) => [
			fpMul(a01, y) + fpMul(a02, z) + fp(10),
			fpMul(a10, x) + fpMul(a12, z) - fp(2),
			fpMul(a20, x) + fpMul(a21, y) + fp(3),
		]

		const result = curlBigIntMemo(field, [fp(2), fp(-4), fp(6)], SCALE)
		assert.deepEqual(result, [
			a21 - a12, // dFz/dy - dFy/dz = 3.625
			a02 - a20, // dFx/dz - dFz/dx = 1.166666666666666667
			a10 - a01, // dFy/dx - dFx/dy = 1.5
		])
	})

	test('quadratic field F(x,y,z) = (y^2, z^2, x^2) has curl (-2z, -2x, -2y)', () => {
		const field = (x, y, z) => [fpMul(y, y), fpMul(z, z), fpMul(x, x)]
		const result = curlBigIntMemo(field, [fp(3), fp(-4), fp(5)])
		assert.deepEqual(result, [fp(-10), fp(-6), fp(8)])
	})

	test('quartic polynomial field is exact with order 4, 6, and 8 stencils', () => {
		// F(x, y, z) = (y^3 * z, z^3 * x, x^3 * y)
		// curl_x = d(x^3 y)/dy - d(z^3 x)/dz = x^3 - 3 x z^2
		// curl_y = d(y^3 z)/dz - d(x^3 y)/dx = y^3 - 3 x^2 y
		// curl_z = d(z^3 x)/dx - d(y^3 z)/dy = z^3 - 3 y^2 z
		const fpCube = (v) => fpMul(fpMul(v, v), v)
		const field = (x, y, z) => [
			fpMul(fpCube(y), z),
			fpMul(fpCube(z), x),
			fpMul(fpCube(x), y),
		]

		const [x, y, z] = [fp(2), fp(-3), fp(4)]
		// Expected:
		// x^3 - 3 x z^2 = 8 - 3*2*16 = -88
		// y^3 - 3 x^2 y = -27 - 3*4*(-3) = 9
		// z^3 - 3 y^2 z = 64 - 3*9*4 = -44
		const expected = [fp(-88), fp(9), fp(-44)]

		for (const order of [4, 6, 8]) {
			const res = curlBigIntMemo(field, [x, y, z], { order, h: SCALE })
			assert.deepEqual(res, expected, `order ${order} should be exact for cubic/quartic field`)
		}
	})

	test('component-array field [fx, fy, fz] matches single-function field', () => {
		const fx = (_x, y, z) => fpMul(y, z)
		const fy = (x, _y, z) => fpMul(z, x)
		const fz = (x, y, _z) => fpMul(x, y) * 2n

		const combined = (x, y, z) => [fx(x, y, z), fy(x, y, z), fz(x, y, z)]
		const pt = [fp(2), fp(5), fp(-3)]

		// curl_x = 2x - x = x = 2
		// curl_y = y - 2y = -y = -5
		// curl_z = z - z = 0
		const expected = [fp(2), fp(-5), 0n]
		assert.deepEqual(curlBigIntMemo([fx, fy, fz], pt), expected)
		assert.deepEqual(curlBigIntMemo(combined, pt), expected)
	})

	test('transcendental field F = (sin y, sin z, sin x) converges accurately', () => {
		// Analytic curl: (-cos z, -cos x, -cos y)
		const field = (x, y, z) => [fpSin(y), fpSin(z), fpSin(x)]
		const pt = [500_000_000_000_000_000n, 1_000_000_000_000_000_000n, 1_500_000_000_000_000_000n]
		const expected = [-fpCos(pt[2]), -fpCos(pt[0]), -fpCos(pt[1])]

		const resOrder2 = curlBigIntMemo(field, pt, { order: 2 })
		const resOrder4 = curlBigIntMemo(field, pt, { order: 4 })
		const resOrder6 = curlBigIntMemo(field, pt, { order: 6 })
		const resOrder8 = curlBigIntMemo(field, pt, { order: 8 })

		for (let i = 0; i < 3; i++) {
			assert.ok(absBigInt(resOrder2[i] - expected[i]) < 1_000_000_000n) // < 1e-9
			assert.ok(absBigInt(resOrder4[i] - expected[i]) < 100_000n) // < 1e-13
			assert.ok(absBigInt(resOrder6[i] - expected[i]) < 10_000n) // < 1e-14
			assert.ok(absBigInt(resOrder8[i] - expected[i]) < 1_000n) // < 1e-15
		}
	})
})

describe('curlBigIntMemo - independent mathematical cross-checks', () => {
	test('identity: curl(grad(phi)) === 0 for nonlinear scalar potential', () => {
		// phi(x, y, z) = x^2 y z + y^3 - 2 x z^2
		// grad(phi) = (2 x y z - 2 z^2, x^2 z + 3 y^2, x^2 y - 4 x z)
		const gradPhi = (x, y, z) => [
			2n * fpMul(fpMul(x, y), z) - 2n * fpMul(z, z),
			fpMul(fpMul(x, x), z) + 3n * fpMul(y, y),
			fpMul(fpMul(x, x), y) - 4n * fpMul(x, z),
		]

		const points = [
			[0n, 0n, 0n],
			[fp(1), fp(2), fp(3)],
			[fp(-4), fp(3), fp(-2)],
		]
		for (const pt of points) {
			assert.deepEqual(curlBigIntMemo(gradPhi, pt, { order: 4, h: SCALE }), [0n, 0n, 0n])
		}
	})

	test('identity: div(curl(F)) === 0 for nonlinear 3D field', () => {
		// F(x, y, z) = (x * y^2 * z, y * z^2 * x, z * x^2 * y)
		const F = (x, y, z) => [
			fpMul(fpMul(x, fpMul(y, y)), z),
			fpMul(fpMul(y, fpMul(z, z)), x),
			fpMul(fpMul(z, fpMul(x, x)), y),
		]

		const curlF = (x, y, z) => curlBigIntMemo(F, [x, y, z], { order: 4, h: SCALE })
		const [x, y, z] = [fp(2), fp(-3), fp(5)]
		const h = SCALE

		// Independent central-difference divergence of curlF
		const dGx_dx = (curlF(x + h, y, z)[0] - curlF(x - h, y, z)[0]) / (2n * h / SCALE)
		const dGy_dy = (curlF(x, y + h, z)[1] - curlF(x, y - h, z)[1]) / (2n * h / SCALE)
		const dGz_dz = (curlF(x, y, z + h)[2] - curlF(x, y, z - h)[2]) / (2n * h / SCALE)

		assert.equal(dGx_dx + dGy_dy + dGz_dz, 0n)
	})

	test('Stokes theorem: surface integral of curl_z equals boundary circulation', () => {
		// F(x, y, z) = (-y^2, x^2 + z, x * y) on unit square S = [0, 1] x [0, 1] at z = 2
		// curl_z = 2x + 2y
		// Surface integral over [0,1]^2: int_0^1 int_0^1 (2x + 2y) dx dy = 1 + 1 = 2
		// Circulation around boundary (CCW):
		//   bottom (y=0, x: 0->1): int Fx dx = 0
		//   right  (x=1, y: 0->1): int Fy dy = int (1 + z) dy = 3
		//   top    (y=1, x: 1->0): -int Fx dx = -int (-1) dx = +1
		//   left   (x=0, y: 1->0): -int Fy dy = -int (0 + z) dy = -2
		//   Total circulation = 0 + 3 + 1 - 2 = 2!
		const F = (x, y, z) => [-fpMul(y, y), fpMul(x, x) + z, fpMul(x, y)]
		const z0 = fp(2)
		const N = 10n
		const ds = SCALE / N

		// Midpoint Riemann sum of curl_z over [0, 1]^2
		let surfaceIntegral = 0n
		for (let i = 0n; i < N; i++) {
			const xm = i * ds + ds / 2n
			for (let j = 0n; j < N; j++) {
				const ym = j * ds + ds / 2n
				const [, , curlZ] = curlBigIntMemo(F, [xm, ym, z0], { order: 4 })
				surfaceIntegral += fpMul(fpMul(curlZ, ds), ds)
			}
		}

		// Independent line integral around boundary of [0, 1]^2 using Simpson/midpoint
		const M = 100n
		const dl = SCALE / M
		let circulation = 0n
		for (let i = 0n; i < M; i++) {
			const t = i * dl + dl / 2n
			circulation += fpMul(F(t, 0n, z0)[0], dl) // bottom: +dx
			circulation += fpMul(F(SCALE, t, z0)[1], dl) // right: +dy
			circulation -= fpMul(F(t, SCALE, z0)[0], dl) // top: -dx
			circulation -= fpMul(F(0n, t, z0)[1], dl) // left: -dy
		}

		// Both must match 2 * SCALE to high precision
		assert.ok(absBigInt(surfaceIntegral - fp(2)) < 1_000n)
		assert.ok(absBigInt(circulation - fp(2)) < 1_000_000_000_000_000n)
		assert.ok(absBigInt(surfaceIntegral - circulation) < 1_000_000_000_000_000n)
	})

	test('linearity: curl(a*F + b*G) === a*curl(F) + b*curl(G)', () => {
		const F = (x, y, z) => [fpMul(y, z), fpMul(x, x), -fpMul(x, y)]
		const G = (x, y, z) => [fpMul(z, z), -fpMul(x, z), fpMul(y, y)]
		const a = 3_500_000_000_000_000_000n // 3.5
		const b = -2_250_000_000_000_000_000n // -2.25

		const H = (x, y, z) => {
			const fv = F(x, y, z)
			const gv = G(x, y, z)
			return [
				fpMul(a, fv[0]) + fpMul(b, gv[0]),
				fpMul(a, fv[1]) + fpMul(b, gv[1]),
				fpMul(a, fv[2]) + fpMul(b, gv[2]),
			]
		}

		const pt = [fp(4), fp(-2), fp(6)]
		const curlH = curlBigIntMemo(H, pt, { order: 4, h: SCALE })
		const curlF = curlBigIntMemo(F, pt, { order: 4, h: SCALE })
		const curlG = curlBigIntMemo(G, pt, { order: 4, h: SCALE })

		for (let i = 0; i < 3; i++) {
			assert.equal(curlH[i], fpMul(a, curlF[i]) + fpMul(b, curlG[i]))
		}
	})

	test('independent Number-based central difference cross-check', () => {
		const fNum = (x, y, z) => [y * z - x, z * x + y * y, x * y - z * z]
		const fBig = (x, y, z) => [
			fpMul(y, z) - x,
			fpMul(z, x) + fpMul(y, y),
			fpMul(x, y) - fpMul(z, z),
		]

		const ptNum = [1.25, -2.5, 3.75]
		const ptBig = ptNum.map((v) => BigInt(Math.round(v * 1e6)) * 1_000_000_000_000n)

		const hNum = 1e-5
		const [x, y, z] = ptNum
		const refCurl = [
			(fNum(x, y + hNum, z)[2] - fNum(x, y - hNum, z)[2]) / (2 * hNum) -
				(fNum(x, y, z + hNum)[1] - fNum(x, y, z - hNum)[1]) / (2 * hNum),
			(fNum(x, y, z + hNum)[0] - fNum(x, y, z - hNum)[0]) / (2 * hNum) -
				(fNum(x + hNum, y, z)[2] - fNum(x - hNum, y, z)[2]) / (2 * hNum),
			(fNum(x + hNum, y, z)[1] - fNum(x - hNum, y, z)[1]) / (2 * hNum) -
				(fNum(x, y + hNum, z)[0] - fNum(x, y - hNum, z)[0]) / (2 * hNum),
		]

		const bigCurl = curlBigIntMemo(fBig, ptBig)
		for (let i = 0; i < 3; i++) {
			const asNum = Number(bigCurl[i]) / 1e18
			assert.ok(Math.abs(asNum - refCurl[i]) < 1e-8)
		}
	})
})

describe('curlBigIntMemo - memoization behavior', () => {
	test('memoizes repeated curl calls and isolates returned arrays from cache mutation', () => {
		let calls = 0
		const field = (x, y, z) => {
			calls++
			return [-y, x, z]
		}

		const first = curlBigIntMemo(field, [fp(1), fp(2), fp(3)], { order: 4 })
		assert.equal(calls, 12) // 3 axes * 4 stencil points
		assert.deepEqual(first, [0n, 0n, fp(2)])

		// Mutate returned array to verify cache immutability
		first[0] = 999n

		const second = curlBigIntMemo(field, [fp(1), fp(2), fp(3)], { order: 4 })
		assert.equal(calls, 12) // zero additional evaluations
		assert.deepEqual(second, [0n, 0n, fp(2)])
	})

	test('reuses overlapping stencil point evaluations on adjacent grid points', () => {
		let calls = 0
		const field = (x, y, z) => {
			calls++
			return [-y, x, 0n]
		}
		const h = 1_000_000_000_000n

		curlBigIntMemo(field, [0n, 0n, 0n], { order: 4, h })
		assert.equal(calls, 12)

		// Moving +h along x overlaps x-h and x+2h with previous x-axis stencil points
		curlBigIntMemo(field, [h, 0n, 0n], { order: 4, h })
		assert.equal(calls, 22) // 10 new points instead of 12
	})

	test('memo: false disables persistent caching', () => {
		let calls = 0
		const field = (x, y, _z) => {
			calls++
			return [-y, x, 0n]
		}

		curlBigIntMemo(field, [0n, 0n, 0n], { order: 2, memo: false })
		assert.equal(calls, 6)
		curlBigIntMemo(field, [0n, 0n, 0n], { order: 2, memo: false })
		assert.equal(calls, 12)
	})

	test('component-array fields skip diagonal axis evaluations and cache across array instances', () => {
		const counts = [0, 0, 0]
		const fx = (_x, y, _z) => {
			counts[0]++
			return -y
		}
		const fy = (x, _y, _z) => {
			counts[1]++
			return x
		}
		const fz = (_x, _y, _z) => {
			counts[2]++
			return 0n
		}

		// With order 2: each component is evaluated on only 2 of the 3 axes (2 * 2 = 4 calls each)
		const r1 = curlBigIntMemo([fx, fy, fz], [fp(1), fp(2), fp(3)], { order: 2 })
		assert.deepEqual(r1, [0n, 0n, fp(2)])
		assert.deepEqual(counts, [4, 4, 4])

		// Fresh array wrapper with the same component functions still hits tupleCurlCache
		const r2 = curlBigIntMemo([fx, fy, fz], [fp(1), fp(2), fp(3)], { order: 2 })
		assert.deepEqual(r2, [0n, 0n, fp(2)])
		assert.deepEqual(counts, [4, 4, 4])
	})
})

describe('curlBigIntMemo - edge cases and validation', () => {
	test('handles huge BigInt coordinates far beyond Number.MAX_SAFE_INTEGER with exact precision', () => {
		const huge = 10n ** 30n * SCALE // 10^30 in 10^18 fixed point = 10^48
		const field = (x, y, z) => [-y + huge, x - huge, 0n]
		const res = curlBigIntMemo(field, [huge, -huge, huge], { order: 2, h: 1n })
		assert.deepEqual(res, [0n, 0n, fp(2)])
	})

	test('supports minimum positive step h = 1n and round-half-to-even ties', () => {
		// Choose F_y(x) such that dFy/dx has an exact half-ULP tie:
		// With order 2 and h = 2n: denom = 4n.
		// If F_y(x+2) - F_y(x-2) = 1n, then num * SCALE / 4 = 250_000_000_000_000_000n (exact).
		// With h = 4n * SCALE, denom = 8n * SCALE:
		// Let F(x, y, z) = (0, x, 0) scaled by 1/8 via piecewise values:
		// Test tie 0.5 -> 0 (even), 1.5 -> 2 (even), -1.5 -> -2 (even), -0.5 -> 0 (even)
		const h = SCALE * 2n // denom = 2 * h = 4 * SCALE
		const tieEvenZero = (x, _y, _z) => [0n, x > 0n ? 2n : 0n, 0n] // diff*SCALE/(4*SCALE) = 2/4 = 0.5 -> 0n
		const tieEvenTwo = (x, _y, _z) => [0n, x > 0n ? 6n : 0n, 0n] // 6/4 = 1.5 -> 2n
		const tieNegEvenZero = (x, _y, _z) => [0n, x > 0n ? -2n : 0n, 0n] // -2/4 = -0.5 -> 0n
		const tieNegEvenTwo = (x, _y, _z) => [0n, x > 0n ? -6n : 0n, 0n] // -6/4 = -1.5 -> -2n

		assert.equal(curlBigIntMemo(tieEvenZero, [0n, 0n, 0n], { order: 2, h })[2], 0n)
		assert.equal(curlBigIntMemo(tieEvenTwo, [0n, 0n, 0n], { order: 2, h })[2], 2n)
		assert.equal(curlBigIntMemo(tieNegEvenZero, [0n, 0n, 0n], { order: 2, h })[2], 0n)
		assert.equal(curlBigIntMemo(tieNegEvenTwo, [0n, 0n, 0n], { order: 2, h })[2], -2n)
	})

	test('validates inputs and throws descriptive TypeError / RangeError', () => {
		const okField = (x, y, z) => [x, y, z]
		const okPt = [0n, 0n, 0n]

		// Invalid field
		assert.throws(() => curlBigIntMemo(null, okPt), TypeError)
		assert.throws(() => curlBigIntMemo(123, okPt), TypeError)
		assert.throws(() => curlBigIntMemo([okField, okField], okPt), TypeError)
		assert.throws(() => curlBigIntMemo([okField, okField, 'bad'], okPt), TypeError)

		// Invalid point
		assert.throws(() => curlBigIntMemo(okField, [0, 0, 0]), TypeError)
		assert.throws(() => curlBigIntMemo(okField, [0n, 0n]), TypeError)
		assert.throws(() => curlBigIntMemo(okField, 'not-a-point'), TypeError)

		// Invalid options
		assert.throws(() => curlBigIntMemo(okField, okPt, 0n), RangeError)
		assert.throws(() => curlBigIntMemo(okField, okPt, -5n), RangeError)
		assert.throws(() => curlBigIntMemo(okField, okPt, 10), TypeError)
		assert.throws(() => curlBigIntMemo(okField, okPt, null), TypeError)
		assert.throws(() => curlBigIntMemo(okField, okPt, []), TypeError)
		assert.throws(() => curlBigIntMemo(okField, okPt, { h: 0n }), RangeError)
		assert.throws(() => curlBigIntMemo(okField, okPt, { h: 1 }), TypeError)
		assert.throws(() => curlBigIntMemo(okField, okPt, { order: 3 }), RangeError)
		assert.throws(() => curlBigIntMemo(okField, okPt, { order: '4' }), TypeError)
		assert.throws(() => curlBigIntMemo(okField, okPt, { memo: 'yes' }), TypeError)

		// Invalid runtime field return values
		assert.throws(() => curlBigIntMemo(() => [1, 2, 3], okPt), TypeError)
		assert.throws(() => curlBigIntMemo(() => [1n, 2n], okPt), TypeError)
		assert.throws(
			() => curlBigIntMemo([() => 0n, () => 42, () => 0n], okPt),
			TypeError
		)
	})
})
