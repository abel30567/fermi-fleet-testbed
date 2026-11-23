/**
 * High-precision split of ln(2) = LN2_HI + LN2_LO.
 * LN2_HI is the exact binary32 rounding of ln(2) (24-bit significand, 29
 * trailing zero bits in binary64), so `k * LN2_HI` is exact for all integer
 * |k| < 2^29. Together, LN2_HI + LN2_LO approximates ln(2) to ~77 bits.
 */
const LN2_HI = 0.6931471824645996 // 11629080 * 2^-24 (exact float32)
const LN2_LO = -1.904654299957768e-9 // ln(2) - LN2_HI

/** Exact IEEE-754 power-of-two scaling factor 2^512. */
const POW2_512 = 2 ** 512

/**
 * Threshold above which e^(-2|y|) < 2^-63, so cosh(|y|) = sinh(|y|) = 0.5 * e^|y|
 * to well beyond IEEE-754 binary64 precision.
 */
const ASYMPTOTIC_Y = 22

/**
 * Threshold above which e^|y| approaches overflow (exp(709.78) ~ MAX_VALUE),
 * switching to Cody-Waite ln(2) reduction and exact power-of-2 scaling.
 */
const SCALE_Y = 700

/**
 * Threshold above which 0.5 * e^|y| * MIN_VALUE > MAX_VALUE (~2099 * ln(2) ~ 1455),
 * guaranteeing overflow for every finite nonzero trigonometric factor.
 */
const GUARANTEED_OVERFLOW_Y = 1460

/**
 * Computes `factor * 0.5 * exp(ay)` without spurious overflow or subnormal
 * precision loss for `ay` in `[SCALE_Y, GUARANTEED_OVERFLOW_Y]`.
 *
 * Uses Cody-Waite range reduction `ay = k * (LN2_HI + LN2_LO) + r` so that
 * `0.5 * exp(ay) = exp(r) * 2^(k - 1)` with `|r| <= ln(2) / 2`, then scales
 * by exact IEEE-754 powers of two.
 *
 * @param {number} factor - Finite real factor with `|factor| <= 1`.
 * @param {number} ay - Non-negative real exponent in `[700, 1460]`.
 * @returns {number} Accurately scaled product `factor * 0.5 * exp(ay)`.
 */
function scaleHalfExp(factor, ay) {
	if (factor === 0) {
		return factor
	}

	const k = Math.round(ay * Math.LOG2E)
	const r = ay - k * LN2_HI - k * LN2_LO
	const er = Math.exp(r)

	// Scale up by 2^512 first so even subnormal factors become normal before
	// multiplying by exp(r), avoiding premature subnormal rounding.
	let value = factor * POW2_512
	let rem = k - 1 - 512
	value *= er

	while (rem > 512) {
		value *= POW2_512
		rem -= 512
	}

	return value * 2 ** rem
}

/**
 * Computes `cosh(ay)` and `sinh(ay)` for `0 < ay < ASYMPTOTIC_Y` without
 * catastrophic cancellation near zero.
 *
 * @param {number} ay - Positive real value with `0 < ay < 22`.
 * @returns {{ ch: number, sh: number }} Accurate hyperbolic cosine and sine.
 */
function coshSinhSmall(ay) {
	if (ay <= 1e-4) {
		const y2 = ay * ay
		const ch = 1 + y2 * (0.5 + y2 * (1 / 24 + y2 / 720))
		const sh = ay + ay * y2 * (1 / 6 + y2 * (1 / 120 + y2 / 5040))
		return { ch, sh }
	}

	// Cancellation-free identities using expm1(ay) = e^ay - 1:
	//   cosh(ay) = 1 + t^2 / (2 * (t + 1))
	//   sinh(ay) = 0.5 * (t + t / (t + 1))
	const t = Math.expm1(ay)
	const u = t + 1
	const ch = 1 + (t * t) / (2 * u)
	const sh = 0.5 * (t + t / u)
	return { ch, sh }
}

/**
 * Validates that the input is a complex number object `{ re, im }` with
 * numeric `re` and `im` properties.
 *
 * @param {unknown} z - Candidate complex number object.
 * @throws {TypeError} If `z` is not a non-null non-array object with numeric `re` and `im`.
 */
function validateComplex(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object of shape { re, im }')
	}
	if (typeof z.re !== 'number') {
		throw new TypeError('Complex number property "re" must be a number')
	}
	if (typeof z.im !== 'number') {
		throw new TypeError('Complex number property "im" must be a number')
	}
}

/**
 * Computes the trigonometric cosine of a complex number `z = { re, im }` using
 * a numerically robust implementation:
 *
 *   cos(x + i*y) = cos(x) * cosh(y) - i * sin(x) * sinh(y)
 *
 * Key numerical safeguards:
 * - **Cancellation-free hyperbolic evaluation**: uses Taylor series for
 *   `|y| <= 1e-4` and `Math.expm1`-based identities for `1e-4 < |y| < 22`.
 * - **Overflow-safe power-of-2 scaling**: for large `|y|` near or above the
 *   `cosh`/`sinh` overflow threshold (~710.48), reduces `|y|` with a high-precision
 *   Cody-Waite split of `ln(2)` and scales by exact powers of two so products
 *   with small `|cos(x)|` or `|sin(x)|` do not spuriously overflow and zero
 *   factors never yield `0 * Infinity = NaN`.
 * - **C99 Annex G special-value handling**: handles `NaN`, `±Infinity`, and
 *   signed zeros consistently with ISO C99 Annex G.6.2.4 (`ccos`).
 *
 * @param {{ re: number, im: number }} z - Input complex number.
 * @returns {{ re: number, im: number }} The complex cosine `cos(z)`.
 * @throws {TypeError} If `z` is not a valid `{ re, im }` object with numeric fields.
 */
export function cosComplexStable(z) {
	validateComplex(z)

	const x = z.re
	const y = z.im

	// Handle NaN and ±Infinity according to C99 Annex G.6.2.4 (ccos(z) = ccosh(i*z)).
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		const yInf = y === Infinity || y === -Infinity
		const xInf = x === Infinity || x === -Infinity

		if (yInf) {
			if (x === 0) {
				// ccos(±0 + i*(±Inf)) = +Inf - i*(±0)
				return { re: Infinity, im: -(x * Math.sign(y)) }
			}
			if (Number.isNaN(x) || xInf) {
				// ccos((NaN|±Inf) + i*(±Inf)) = +Inf + i*NaN
				return { re: Infinity, im: NaN }
			}
			// Finite nonzero x, infinite y: cos(x) and sin(x) are strictly nonzero.
			return {
				re: Infinity * Math.cos(x),
				im: -Math.sin(x) * y,
			}
		}

		if (y === 0) {
			// x is NaN or ±Infinity, y is ±0 -> re = NaN, im = ±0.
			return { re: NaN, im: xInf ? -(Math.sign(x) * y) : 0 }
		}

		if (Number.isNaN(y) && x === 0) {
			// ccos(±0 + i*NaN) = NaN + i*±0
			return { re: NaN, im: 0 }
		}

		return { re: NaN, im: NaN }
	}

	// Exact real axis: cos(x + i*(±0)) = cos(x) - i*(sin(x) * (±0)).
	if (y === 0) {
		return {
			re: Math.cos(x),
			im: -Math.sin(x) * y,
		}
	}

	const ay = Math.abs(y)

	// Exact imaginary axis: cos(±0 + i*y) = cosh(y) - i*(±0 * sign(y)).
	if (x === 0) {
		let re
		if (ay < ASYMPTOTIC_Y) {
			re = coshSinhSmall(ay).ch
		} else if (ay < SCALE_Y) {
			re = 0.5 * Math.exp(ay)
		} else if (ay <= GUARANTEED_OVERFLOW_Y) {
			re = scaleHalfExp(1, ay)
		} else {
			re = Infinity
		}
		return { re, im: -(x * Math.sign(y)) }
	}

	const cx = Math.cos(x)
	const sx = Math.sin(x)
	const imFactor = y < 0 ? sx : -sx

	if (ay < ASYMPTOTIC_Y) {
		const { ch, sh } = coshSinhSmall(ay)
		return {
			re: cx * ch,
			im: imFactor * sh,
		}
	}

	if (ay < SCALE_Y) {
		const halfExp = 0.5 * Math.exp(ay)
		return {
			re: cx * halfExp,
			im: imFactor * halfExp,
		}
	}

	if (ay <= GUARANTEED_OVERFLOW_Y) {
		return {
			re: scaleHalfExp(cx, ay),
			im: scaleHalfExp(imFactor, ay),
		}
	}

	// |y| > 1460: every nonzero finite factor overflows binary64.
	return {
		re: cx === 0 ? cx : cx > 0 ? Infinity : -Infinity,
		im: imFactor === 0 ? imFactor : imFactor > 0 ? Infinity : -Infinity,
	}
}
