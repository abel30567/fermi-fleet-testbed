/**
 * Exact, numerically robust subtraction over arbitrary-precision BigInt integers.
 *
 * Because JavaScript `BigInt` represents integers with arbitrary precision,
 * subtraction is exact with zero rounding error, zero overflow, and immunity to
 * catastrophic cancellation even for operands with hundreds or thousands of bits.
 * Because subtraction is linear, this function is equally exact for fixed-point
 * `BigInt` values scaled by `10n ** 18n` (or any common scaling factor).
 *
 * Inputs are strictly validated to be `bigint` primitives to prevent silent
 * IEEE-754 floating-point precision loss or implicit type coercion, and the
 * exact additive-inverse invariant (`result + b === a`, zero residual error) is
 * verified before returning.
 *
 * @param {bigint} a - The minuend (exact BigInt integer or scaled fixed-point BigInt).
 * @param {bigint} b - The subtrahend (exact BigInt integer or scaled fixed-point BigInt).
 * @returns {bigint} The exact difference `a - b`.
 * @throws {TypeError} If `a` or `b` is not a `bigint`.
 * @throws {RangeError} If the exactness post-condition `result + b === a` fails.
 */
export function subtractBigIntStable(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`subtractBigIntStable: expected minuend "a" to be a bigint, got ${a === null ? 'null' : typeof a}`);
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`subtractBigIntStable: expected subtrahend "b" to be a bigint, got ${b === null ? 'null' : typeof b}`);
	}

	const diff = a - b;

	// Exact error-bound check: residual r = a - (diff + b) must be identically 0n.
	if (diff + b !== a) {
		throw new RangeError('subtractBigIntStable: exactness invariant violated');
	}

	return diff;
}
