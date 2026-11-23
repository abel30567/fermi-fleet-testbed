const SCALE = 10n ** 18n;
const DOUBLE_SCALE = SCALE * 2n;

/**
 * Computes `base` raised to the power of `exponent` over exact `BigInt` integers
 * using an iterative exponentiation-by-squaring algorithm.
 *
 * - When `exponent >= 0n`, returns the exact integer `BigInt` result `base ** exponent`
 *   (with `0n ** 0n === 1n`).
 * - When `exponent < 0n`, returns a fixed-point `BigInt` scaled by `10^18`
 *   representing `1 / base^(-exponent)`, rounded half away from zero.
 *
 * @param {bigint} base - The integer base.
 * @param {bigint} exponent - The integer exponent.
 * @returns {bigint} Exact integer power for `exponent >= 0n`, or `10^18`-scaled
 *   fixed-point `BigInt` for `exponent < 0n`.
 * @throws {TypeError} If `base` or `exponent` is not a `bigint`.
 * @throws {RangeError} If `base === 0n` and `exponent < 0n`.
 */
export function powerBigIntIterative(base, exponent) {
	if (typeof base !== 'bigint') {
		throw new TypeError(`Expected base to be a bigint, received ${typeof base}`);
	}
	if (typeof exponent !== 'bigint') {
		throw new TypeError(`Expected exponent to be a bigint, received ${typeof exponent}`);
	}

	if (exponent === 0n) {
		return 1n;
	}

	if (exponent > 0n) {
		if (base === 0n) {
			return 0n;
		}
		if (base === 1n) {
			return 1n;
		}
		if (base === -1n) {
			return (exponent & 1n) === 0n ? 1n : -1n;
		}

		let result = 1n;
		let factor = base;
		let exp = exponent;

		while (exp > 0n) {
			if ((exp & 1n) === 1n) {
				result *= factor;
			}
			exp >>= 1n;
			if (exp > 0n) {
				factor *= factor;
			}
		}

		return result;
	}

	// Negative exponent: fixed-point BigInt scaled by 10^18.
	if (base === 0n) {
		throw new RangeError('Cannot raise 0n to a negative exponent');
	}

	const absExp = -exponent;
	if (base === 1n) {
		return SCALE;
	}
	if (base === -1n) {
		return (absExp & 1n) === 0n ? SCALE : -SCALE;
	}

	const isNegative = base < 0n && (absExp & 1n) === 1n;
	let denom = 1n;
	let factor = base < 0n ? -base : base;
	let exp = absExp;

	// Compute |base|^|exponent| iteratively, exiting early once the denominator
	// exceeds 2 * 10^18 (where SCALE / denom < 0.5 and rounds to 0n).
	while (exp > 0n) {
		if ((exp & 1n) === 1n) {
			denom *= factor;
			if (denom > DOUBLE_SCALE) {
				return 0n;
			}
		}
		exp >>= 1n;
		if (exp > 0n) {
			factor *= factor;
			if (factor > DOUBLE_SCALE) {
				return 0n;
			}
		}
	}

	const quotient = SCALE / denom;
	const remainder = SCALE % denom;
	const rounded = remainder * 2n >= denom ? quotient + 1n : quotient;

	return isNegative ? -rounded : rounded;
}
