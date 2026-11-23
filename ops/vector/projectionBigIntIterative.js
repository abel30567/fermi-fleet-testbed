const SCALE = 10n ** 18n;

/**
 * Divide `numerator` by positive `denominator`, rounding half away from zero.
 *
 * @param {bigint} numerator
 * @param {bigint} denominator - Must be strictly positive (> 0n).
 * @returns {bigint}
 */
function divRoundHalfAwayFromZero(numerator, denominator) {
	if (numerator === 0n) {
		return 0n;
	}
	if (numerator > 0n) {
		return (numerator * 2n + denominator) / (denominator * 2n);
	}
	return -(((-numerator) * 2n + denominator) / (denominator * 2n));
}

/**
 * Compute the vector projection of `u` onto `v` over exact BigInt integers
 * using a straightforward iterative implementation.
 *
 * Mathematically, `proj_v(u) = ((u · v) / (v · v)) * v`.
 * Because projection components are generally non-integer, every element of
 * the returned vector is a fixed-point BigInt scaled by `10n ** 18n`
 * (rounded half away from zero).
 *
 * @param {bigint[]} u - The vector to project (non-empty array of BigInt).
 * @param {bigint[]} v - The target vector to project onto (non-empty, non-zero array of BigInt with same length as `u`).
 * @returns {bigint[]} The projected vector with each component scaled by `10n ** 18n`.
 * @throws {TypeError} If `u` or `v` is not an array or contains any non-BigInt element.
 * @throws {RangeError} If `u` or `v` is empty, lengths differ, or `v` is the zero vector.
 */
export function projectionBigIntIterative(u, v) {
	if (!Array.isArray(u) || !Array.isArray(v)) {
		throw new TypeError('Both u and v must be arrays of BigInt');
	}

	const n = u.length;
	if (n === 0 || v.length === 0) {
		throw new RangeError('Vectors u and v must be non-empty');
	}
	if (n !== v.length) {
		throw new RangeError('Vectors u and v must have the same length');
	}

	let dotUV = 0n;
	let dotVV = 0n;

	for (let i = 0; i < n; i++) {
		const ui = u[i];
		const vi = v[i];
		if (typeof ui !== 'bigint' || typeof vi !== 'bigint') {
			throw new TypeError(`Vector elements must be BigInt (invalid element at index ${i})`);
		}
		dotUV += ui * vi;
		dotVV += vi * vi;
	}

	if (dotVV === 0n) {
		throw new RangeError('Cannot project onto the zero vector');
	}

	const result = new Array(n);
	for (let i = 0; i < n; i++) {
		result[i] = divRoundHalfAwayFromZero(dotUV * v[i] * SCALE, dotVV);
	}

	return result;
}
