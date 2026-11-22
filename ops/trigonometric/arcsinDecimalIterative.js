const DECIMAL_REGEX = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Computes the integer floor square root of a non-negative BigInt using
 * iterative Newton-Raphson (Heron's method).
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} Floor of sqrt(n).
 */
function bigintSqrt(n) {
	if (n < 2n) {
		return n;
	}
	const bitLen = n.toString(2).length;
	let x = 1n << BigInt((bitLen + 1) >> 1);
	while (true) {
		const next = (x + n / x) >> 1n;
		if (next >= x) {
			return x;
		}
		x = next;
	}
}

/**
 * Computes atan(1 / k) scaled by `scale` using the iterative Gregory-Leibniz
 * power series for integer k >= 2.
 *
 * @param {bigint} k - Positive integer reciprocal argument (k >= 2).
 * @param {bigint} scale - Fixed-point scaling factor (10^workPrec).
 * @returns {bigint} Scaled value of atan(1 / k).
 */
function atanReciprocalScaled(k, scale) {
	const k2 = k * k;
	let power = scale / k;
	let sum = power;
	let n = 1n;

	while (power > 0n) {
		power = power / k2;
		const term = power / (2n * n + 1n);
		if (term === 0n) {
			break;
		}
		if ((n & 1n) === 1n) {
			sum -= term;
		} else {
			sum += term;
		}
		n += 1n;
	}

	return sum;
}

/**
 * Computes pi / 2 scaled by `scale` using Machin's formula:
 * pi / 2 = 8 * atan(1/5) - 2 * atan(1/239).
 *
 * @param {bigint} scale - Fixed-point scaling factor (10^workPrec).
 * @returns {bigint} Scaled value of pi / 2.
 */
function halfPiScaled(scale) {
	return 8n * atanReciprocalScaled(5n, scale) - 2n * atanReciprocalScaled(239n, scale);
}

/**
 * Parses and validates a decimal string into a canonical sign + significand +
 * base-10 exponent representation without floating-point conversion.
 *
 * @param {string} x - Decimal string input.
 * @returns {{ neg: boolean, isZero: boolean, intDigits: bigint, numDigits: bigint, exp10: bigint }}
 */
function parseDecimal(x) {
	if (typeof x !== 'string') {
		throw new TypeError(`Expected x to be a decimal string, got ${typeof x}`);
	}

	const trimmed = x.trim();
	const match = DECIMAL_REGEX.exec(trimmed);
	if (!match) {
		throw new TypeError(`Invalid decimal string: "${x}"`);
	}

	const signStr = match[1];
	const intPart = match[2] ?? '';
	const fracPart = match[3] ?? match[4] ?? '';
	const expStr = match[5];

	const combined = intPart + fracPart;
	const strippedLeading = combined.replace(/^0+/, '');
	if (strippedLeading.length === 0) {
		return { neg: false, isZero: true, intDigits: 0n, numDigits: 0n, exp10: 0n };
	}

	const stripped = strippedLeading.replace(/0+$/, '');
	const trailingZeros = BigInt(strippedLeading.length - stripped.length);
	const rawExp = expStr !== undefined ? BigInt(expStr) : 0n;
	const exp10 = rawExp - BigInt(fracPart.length) + trailingZeros;

	return {
		neg: signStr === '-',
		isZero: false,
		intDigits: BigInt(stripped),
		numDigits: BigInt(stripped.length),
		exp10,
	};
}

/**
 * Scales a positive parsed decimal (intDigits * 10^exp10) to fixed-point
 * precision `targetPrec` (rounding half away from zero). Assumes |x| < 1.
 *
 * @param {bigint} intDigits - Positive significand digits.
 * @param {bigint} numDigits - Number of decimal digits in intDigits.
 * @param {bigint} exp10 - Base-10 exponent.
 * @param {number} targetPrec - Target fractional decimal places.
 * @returns {bigint} Rounded fixed-point integer scaled by 10^targetPrec.
 */
function scaleUnitDecimal(intDigits, numDigits, exp10, targetPrec) {
	const shift = exp10 + BigInt(targetPrec);
	if (shift === 0n) {
		return intDigits;
	}
	if (shift > 0n) {
		return intDigits * (10n ** shift);
	}
	const drop = -shift;
	if (drop > numDigits + 1n) {
		return 0n;
	}
	const divisor = 10n ** drop;
	return (intDigits + divisor / 2n) / divisor;
}

/**
 * Computes arcsin(u) scaled by `scale` for 0 <= u <= sqrt(2)/2 using optional
 * half-angle reduction followed by the iterative Maclaurin power series:
 *   arcsin(u) = sum_{n=0}^\infty ((2n)! / (4^n (n!)^2 (2n+1))) * u^(2n+1)
 *
 * @param {bigint} uScaled - Scaled value of u in [0, sqrt(2)/2].
 * @param {bigint} scale - Fixed-point scaling factor (10^workPrec).
 * @returns {bigint} Scaled value of arcsin(u).
 */
function arcsinSmallScaled(uScaled, scale) {
	if (uScaled === 0n) {
		return 0n;
	}

	// Half-angle reduction while u > 0.25:
	// arcsin(u) = 2 * arcsin(u / sqrt(2 * (1 + sqrt(1 - u^2))))
	// At most 2 iterations for u <= sqrt(2)/2, guaranteeing u^2 <= 1/16.
	let u = uScaled;
	let factor = 1n;
	const quarterScale = scale / 4n;

	while (u > quarterScale) {
		const oneMinusU2 = scale * scale - u * u;
		const sqrtOneMinusU2 = bigintSqrt(oneMinusU2);
		const denomSq = 2n * (scale + sqrtOneMinusU2);
		const denom = bigintSqrt(denomSq * scale);
		u = (u * scale) / denom;
		factor <<= 1n;
	}

	const u2 = (u * u) / scale;
	let termBase = u;
	let sum = u;
	let n = 1n;

	while (termBase > 0n) {
		termBase = (termBase * (2n * n - 1n) * u2) / (2n * n * scale);
		const term = termBase / (2n * n + 1n);
		if (term === 0n) {
			break;
		}
		sum += term;
		n += 1n;
	}

	return sum * factor;
}

/**
 * Formats a non-negative fixed-point BigInt scaled by 10^workPrec to a
 * normalized decimal string rounded half-away-from-zero to `precision`
 * fractional decimal places (stripping trailing fractional zeros and avoiding "-0").
 *
 * @param {bigint} valueScaled - Non-negative scaled result.
 * @param {boolean} neg - Whether the mathematical result is negative.
 * @param {number} workPrec - Working decimal places of valueScaled.
 * @param {number} precision - Requested output fractional decimal places.
 * @returns {string} Normalized decimal string.
 */
function formatFixed(valueScaled, neg, workPrec, precision) {
	const drop = workPrec - precision;
	const divisor = 10n ** BigInt(drop);
	const rounded = (valueScaled + divisor / 2n) / divisor;

	if (rounded === 0n) {
		return '0';
	}

	const sign = neg ? '-' : '';
	if (precision === 0) {
		return `${sign}${rounded.toString()}`;
	}

	const digits = rounded.toString().padStart(precision + 1, '0');
	const intPart = digits.slice(0, -precision);
	const fracPart = digits.slice(-precision).replace(/0+$/, '');

	return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

/**
 * Computes the inverse sine (arcsin) in radians of an arbitrary-precision
 * decimal string `x` in the domain `[-1, 1]`, using BigInt-based fixed-point
 * decimal arithmetic and an iterative power series with range reduction.
 *
 * For `|x| > sqrt(2)/2`, applies the complementary angle identity
 * `arcsin(|x|) = pi/2 - arcsin(sqrt((1 - |x|)(1 + |x|)))` with extended
 * precision on `1 - |x|` to prevent catastrophic cancellation near `±1`.
 * At `x = ±1`, returns `±pi/2` directly.
 *
 * @param {string} x - Decimal string representing a real number in `[-1, 1]`
 *   (supports optional leading sign and scientific notation).
 * @param {number} [precision=20] - Non-negative integer number of fractional
 *   decimal digits in the rounded output.
 * @returns {string} Normalized decimal string representation of `arcsin(x)` in
 *   radians, rounded half-away-from-zero to at most `precision` fractional
 *   digits (trailing fractional zeros removed, never `"-0"`).
 * @throws {TypeError} If `x` is not a valid decimal string or `precision` is not a number.
 * @throws {RangeError} If `x` is outside `[-1, 1]` or `precision` is not a non-negative safe integer.
 */
export function arcsinDecimalIterative(x, precision = 20) {
	if (typeof precision !== 'number') {
		throw new TypeError(`Expected precision to be a number, got ${typeof precision}`);
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError(`Expected precision to be a non-negative safe integer, got ${precision}`);
	}

	const parsed = parseDecimal(x);
	if (parsed.isZero) {
		return '0';
	}

	const { neg, intDigits, numDigits, exp10 } = parsed;
	const order = numDigits - 1n + exp10;

	if (order > 0n) {
		throw new RangeError(`Input x must be in [-1, 1], got "${x}"`);
	}

	const isExactOne = order === 0n && intDigits === 1n && exp10 === 0n;
	if (order === 0n && !isExactOne) {
		throw new RangeError(`Input x must be in [-1, 1], got "${x}"`);
	}

	// Fast underflow check: if |x| < 10^-(precision + 2), arcsin(|x|) < 2 * 10^-(precision + 2),
	// which rounds strictly to "0" at the requested precision.
	if (order < -BigInt(precision + 2)) {
		return '0';
	}

	const guard = Math.max(20, Math.ceil(Math.log10(precision + 10)) + 16);
	const workPrec = precision + guard;
	const scale = 10n ** BigInt(workPrec);

	if (isExactOne) {
		const res = halfPiScaled(scale);
		return formatFixed(res, neg, workPrec, precision);
	}

	const aScaled = scaleUnitDecimal(intDigits, numDigits, exp10, workPrec);

	// Check whether a^2 > 0.5 (i.e., a > sqrt(2)/2) to decide range reduction.
	let resultScaled;
	if (2n * aScaled * aScaled > scale * scale) {
		// Compute sqrt(1 - a^2) = sqrt((1 - a)(1 + a)) with doubled working
		// precision so inputs extremely close to ±1 suffer no cancellation.
		const highPrec = 2 * workPrec + 2;
		const highScale = 10n ** BigInt(highPrec);
		const aHigh = scaleUnitDecimal(intDigits, numDigits, exp10, highPrec);

		let bScaled;
		if (aHigh >= highScale) {
			bScaled = 0n;
		} else {
			const oneMinusA2 = (highScale - aHigh) * (highScale + aHigh);
			const bHigh = bigintSqrt(oneMinusA2); // scaled by 10^highPrec
			const downDiv = 10n ** BigInt(highPrec - workPrec);
			bScaled = (bHigh + downDiv / 2n) / downDiv;
		}

		const piHalf = halfPiScaled(scale);
		resultScaled = piHalf - arcsinSmallScaled(bScaled, scale);
	} else {
		resultScaled = arcsinSmallScaled(aScaled, scale);
	}

	return formatFixed(resultScaled, neg, workPrec, precision);
}
