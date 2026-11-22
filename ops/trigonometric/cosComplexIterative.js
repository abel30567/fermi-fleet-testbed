const PI_HALF = Math.PI / 2
// Three-part Cody-Waite split of pi/2 (26-bit hi, 26-bit mid, remainder lo)
// so k * PI_HALF_HI and k * PI_HALF_MID are exact for |k| <= 2^27 (~1.34e8).
const PI_HALF_HI = 1.5707963109016418
const PI_HALF_MID = 1.5893254712295857e-8
const PI_HALF_LO = 6.123233995736766e-17
const TWO_PI = 2 * Math.PI
const CODY_WAITE_LIMIT = 1e8
const MAX_SERIES_TERMS = 30

/**
 * Computes sin(a) and cos(a) for a finite real angle using quadrant range
 * reduction into [-pi/4, pi/4] followed by iterative Taylor series evaluation.
 *
 * @param {number} a - Finite real angle in radians.
 * @returns {{ sin: number, cos: number }} Sine and cosine of `a`.
 */
function sinCosIterative(a) {
	const angle = Math.abs(a) > CODY_WAITE_LIMIT ? a % TWO_PI : a
	const k = Math.round(angle / PI_HALF)
	const r = ((angle - k * PI_HALF_HI) - k * PI_HALF_MID) - k * PI_HALF_LO

	const r2 = r * r
	let cosTerm = 1
	let cosSum = 1
	let sinTerm = r
	let sinSum = r

	for (let n = 1; n <= MAX_SERIES_TERMS; n++) {
		cosTerm = (-cosTerm * r2) / ((2 * n - 1) * (2 * n))
		const nextCos = cosSum + cosTerm

		sinTerm = (-sinTerm * r2) / ((2 * n) * (2 * n + 1))
		const nextSin = sinSum + sinTerm

		if (nextCos === cosSum && nextSin === sinSum) {
			break
		}

		cosSum = nextCos
		sinSum = nextSin
	}

	const quadrant = ((k % 4) + 4) % 4
	if (quadrant === 0) {
		return { sin: sinSum, cos: cosSum }
	}
	if (quadrant === 1) {
		return { sin: cosSum, cos: -sinSum }
	}
	if (quadrant === 2) {
		return { sin: -sinSum, cos: -cosSum }
	}
	return { sin: -cosSum, cos: sinSum }
}

/**
 * Computes sinh(b) and cosh(b) for a finite real value using iterative argument
 * halving into [-0.5, 0.5], iterative Taylor series evaluation of sinh(u) and
 * cosh(u) - 1, and iterative double-angle reconstruction.
 *
 * @param {number} b - Finite real value.
 * @returns {{ sinh: number, cosh: number }} Hyperbolic sine and cosine of `b`.
 */
function sinhCoshIterative(b) {
	if (b === 0) {
		return { sinh: 0, cosh: 1 }
	}

	let u = b
	let halvings = 0
	while (Math.abs(u) > 0.5) {
		u *= 0.5
		halvings += 1
	}

	// Evaluate sinh(u) and cosh(u) - 1 via iterative Taylor series.
	// Tracking cosh(u) - 1 avoids precision loss for small |u|.
	const u2 = u * u
	let sinhTerm = u
	let sinhSum = u
	let coshM1Term = u2 * 0.5
	let coshM1Sum = coshM1Term

	for (let n = 2; n <= MAX_SERIES_TERMS; n++) {
		sinhTerm = (sinhTerm * u2) / ((2 * n - 2) * (2 * n - 1))
		const nextSinh = sinhSum + sinhTerm

		coshM1Term = (coshM1Term * u2) / ((2 * n - 1) * (2 * n))
		const nextCoshM1 = coshM1Sum + coshM1Term

		if (nextSinh === sinhSum && nextCoshM1 === coshM1Sum) {
			break
		}

		sinhSum = nextSinh
		coshM1Sum = nextCoshM1
	}

	// Reconstruct using exact double-angle identities:
	//   sinh(2x)     = 2 * sinh(x) * (1 + (cosh(x) - 1))
	//   cosh(2x) - 1 = 2 * sinh(x)^2
	for (let i = 0; i < halvings; i++) {
		const nextSinh = 2 * (sinhSum * (1 + coshM1Sum))
		const nextCoshM1 = 2 * (sinhSum * sinhSum)
		sinhSum = nextSinh
		coshM1Sum = nextCoshM1

		if (!Number.isFinite(coshM1Sum)) {
			return {
				sinh: b < 0 ? -Infinity : Infinity,
				cosh: Infinity,
			}
		}
	}

	return {
		sinh: sinhSum,
		cosh: 1 + coshM1Sum,
	}
}

/**
 * Computes the trigonometric cosine of a complex number `z = { re, im }`
 * using a straightforward iterative implementation.
 *
 * Uses the identity:
 *   cos(a + bi) = cos(a)cosh(b) - i * sin(a)sinh(b)
 *
 * Circular components `cos(a)` and `sin(a)` are evaluated via Cody-Waite
 * quadrant range reduction and iterative Taylor series. Hyperbolic components
 * `cosh(b)` and `sinh(b)` are evaluated via iterative argument halving,
 * iterative Taylor series, and iterative double-angle doubling.
 *
 * Note: For very large `|z.im|` (approximately `|z.im| > 710.48`), the
 * mathematical magnitude exceeds `Number.MAX_VALUE` and the overflowing
 * component(s) saturate to `±Infinity`.
 *
 * @param {{ re: number, im: number }} z - Complex number `{ re, im }` with finite numeric parts.
 * @returns {{ re: number, im: number }} The complex cosine `cos(z)`.
 * @throws {TypeError} If `z` is not a non-null, non-array object or if `z.re` or `z.im` is not a number.
 * @throws {RangeError} If `z.re` or `z.im` is not a finite number (`NaN`, `Infinity`, or `-Infinity`).
 */
export function cosComplexIterative(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('z must be a complex number object with numeric re and im properties')
	}

	const { re: a, im: b } = z
	if (typeof a !== 'number' || typeof b !== 'number') {
		throw new TypeError('z.re and z.im must be numbers')
	}
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		throw new RangeError('z.re and z.im must be finite numbers')
	}

	const { sin: sinA, cos: cosA } = sinCosIterative(a)
	const { sinh: sinhB, cosh: coshB } = sinhCoshIterative(b)

	// Guard against 0 * Infinity -> NaN when one factor is identically 0.
	const rawRe = cosA === 0 ? 0 : cosA * coshB
	const rawIm = sinA === 0 ? 0 : -sinA * sinhB

	return {
		re: rawRe === 0 ? 0 : rawRe,
		im: rawIm === 0 ? 0 : rawIm,
	}
}
