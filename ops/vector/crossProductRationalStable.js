/**
 * Computes the exact 3D vector cross product over rational numbers represented as
 * `{ num: bigint, den: bigint }` in canonical lowest terms (`den > 0n`,
 * `gcd(|num|, den) === 1n`, and zero represented as `{ num: 0n, den: 1n }`).
 *
 * Robustness strategy:
 * 1. Validates and normalizes all input rational components (handling unreduced
 *    fractions and negative denominators while rejecting non-BigInt or zero-denominator inputs).
 * 2. Exact rational vector scaling: factors each vector `v = (scaleNum / scaleDen) * vPrim`
 *    into a primitive integer vector `vPrim ∈ Z^3` and a reduced rational scale, stripping
 *    common denominators and large scale factors before forming determinants.
 * 3. Lagrange/Gauss 2D lattice basis reduction on `(aPrim, bPrim)` using exact integer
 *    projections, swaps, and primitive content extraction. Because every shear
 *    `v <- v - q * u` and swap `(u, v) <- (v, u)` (tracking sign) preserves `u × v`
 *    identically, this eliminates catastrophic cancellation and intermediate expression
 *    swell for nearly collinear vectors and directly detects exact collinearity.
 * 4. Cross-cancelled final scaling so every output component is produced directly in
 *    canonical lowest terms.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 *
 * @param {readonly [Rational, Rational, Rational]} a - First 3D rational vector.
 * @param {readonly [Rational, Rational, Rational]} b - Second 3D rational vector.
 * @returns {[Rational, Rational, Rational]} Exact cross product `a × b` in lowest terms.
 * @throws {TypeError} If `a` or `b` is not an array of rational objects with BigInt `num` and `den`.
 * @throws {RangeError} If `a` or `b` does not have length 3 or any denominator is `0n`.
 */
export function crossProductRationalStable(a, b) {
	const va = parseVector(a, 'a')
	const vb = parseVector(b, 'b')

	const fa = factorPrimitiveVector(va)
	const fb = factorPrimitiveVector(vb)

	if (fa.isZero || fb.isZero) {
		return zeroVector()
	}

	// Combine scalar factors (fa.scaleNum / fa.scaleDen) * (fb.scaleNum / fb.scaleDen)
	// with cross-cancellation so gcd(scaleNum, scaleDen) === 1n is maintained.
	const g1 = gcdBigInt(fa.scaleNum, fb.scaleDen)
	const g2 = gcdBigInt(fb.scaleNum, fa.scaleDen)
	let scaleNum = (fa.scaleNum / g1) * (fb.scaleNum / g2)
	let scaleDen = (fa.scaleDen / g2) * (fb.scaleDen / g1)

	// Lagrange/Gauss 2D lattice reduction in Z^3: preserves sign * (u × v) === aPrim × bPrim.
	let u = fa.prim
	let v = fb.prim
	let uu = dotBigInt(u, u)
	let vv = dotBigInt(v, v)
	let sign = 1n

	if (vv < uu) {
		;[u, v] = [v, u]
		;[uu, vv] = [vv, uu]
		sign = -sign
	}

	while (true) {
		const uv = dotBigInt(u, v)
		const q = roundDivBigInt(uv, uu)
		if (q !== 0n) {
			v = [v[0] - q * u[0], v[1] - q * u[1], v[2] - q * u[2]]
			if (v[0] === 0n && v[1] === 0n && v[2] === 0n) {
				return zeroVector()
			}
			const gv = gcd3BigInt(v[0], v[1], v[2])
			if (gv > 1n) {
				v = [v[0] / gv, v[1] / gv, v[2] / gv]
				const gCancel = gcdBigInt(gv, scaleDen)
				scaleNum *= gv / gCancel
				scaleDen /= gCancel
			}
			vv = dotBigInt(v, v)
		}
		if (vv < uu) {
			;[u, v] = [v, u]
			;[uu, vv] = [vv, uu]
			sign = -sign
		} else {
			break
		}
	}

	const cx = sign * (u[1] * v[2] - u[2] * v[1])
	const cy = sign * (u[2] * v[0] - u[0] * v[2])
	const cz = sign * (u[0] * v[1] - u[1] * v[0])

	return [
		scaleIntegerComponent(cx, scaleNum, scaleDen),
		scaleIntegerComponent(cy, scaleNum, scaleDen),
		scaleIntegerComponent(cz, scaleNum, scaleDen),
	]
}

function zeroVector() {
	return [
		{ num: 0n, den: 1n },
		{ num: 0n, den: 1n },
		{ num: 0n, den: 1n },
	]
}

function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function gcd3BigInt(a, b, c) {
	return gcdBigInt(gcdBigInt(a, b), c)
}

function lcmBigInt(a, b) {
	return (a / gcdBigInt(a, b)) * b
}

function roundDivBigInt(num, den) {
	// Exact nearest integer to num / den (den > 0n), ties away from zero.
	if (num >= 0n) {
		return (num + (den >> 1n)) / den
	}
	return -((-num + (den >> 1n)) / den)
}

function dotBigInt(u, v) {
	return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
}

function normalizeRational(r, name, index) {
	if (r === null || typeof r !== 'object') {
		throw new TypeError(`${name}[${index}] must be a rational object { num: bigint, den: bigint }`)
	}
	const { num, den } = r
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}[${index}] must have BigInt num and den`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}[${index}].den must not be 0n`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = den < 0n ? -1n : 1n
	const n = num * sign
	const d = den * sign
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

function parseVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of 3 rational objects`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, got ${vec.length}`)
	}
	return [
		normalizeRational(vec[0], name, 0),
		normalizeRational(vec[1], name, 1),
		normalizeRational(vec[2], name, 2),
	]
}

function factorPrimitiveVector(v) {
	const [r0, r1, r2] = v
	if (r0.num === 0n && r1.num === 0n && r2.num === 0n) {
		return { isZero: true, scaleNum: 0n, scaleDen: 1n, prim: [0n, 0n, 0n] }
	}
	const lcd = lcmBigInt(lcmBigInt(r0.den, r1.den), r2.den)
	const i0 = r0.num * (lcd / r0.den)
	const i1 = r1.num * (lcd / r1.den)
	const i2 = r2.num * (lcd / r2.den)
	const g = gcd3BigInt(i0, i1, i2)
	const prim = [i0 / g, i1 / g, i2 / g]
	const gs = gcdBigInt(g, lcd)
	return {
		isZero: false,
		scaleNum: g / gs,
		scaleDen: lcd / gs,
		prim,
	}
}

function scaleIntegerComponent(c, scaleNum, scaleDen) {
	if (c === 0n) {
		return { num: 0n, den: 1n }
	}
	const g = gcdBigInt(c, scaleDen)
	return {
		num: (c / g) * scaleNum,
		den: scaleDen / g,
	}
}
