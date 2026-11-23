const SCALE = 10n ** 18n;

/**
 * Exact BigInt division with round-half-away-from-zero semantics.
 * Assumes `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function divRoundHalfAwayFromZero(num, den) {
	if (num === 0n) {
		return 0n;
	}
	const twoDen = den << 1n;
	if (num > 0n) {
		return ((num << 1n) + den) / twoDen;
	}
	return -(((-num << 1n) + den) / twoDen);
}

/**
 * Divide-and-conquer computation of `(u · v)` and `(v · v)` over `[lo, hi)`,
 * validating that every element in the slice is a `bigint`.
 *
 * @param {readonly bigint[]} u
 * @param {readonly bigint[]} v
 * @param {number} lo
 * @param {number} hi
 * @returns {[bigint, bigint]} Tuple `[dotUV, dotVV]`
 */
function dotAndNormSqRecursive(u, v, lo, hi) {
	if (hi - lo === 1) {
		const ui = u[lo];
		if (typeof ui !== 'bigint') {
			throw new TypeError(`Expected BigInt at u[${lo}], received ${typeof ui}`);
		}
		const vi = v[lo];
		if (typeof vi !== 'bigint') {
			throw new TypeError(`Expected BigInt at v[${lo}], received ${typeof vi}`);
		}
		return [ui * vi, vi * vi];
	}

	const mid = lo + ((hi - lo) >>> 1);
	const [leftDot, leftNormSq] = dotAndNormSqRecursive(u, v, lo, mid);
	const [rightDot, rightNormSq] = dotAndNormSqRecursive(u, v, mid, hi);
	return [leftDot + rightDot, leftNormSq + rightNormSq];
}

/**
 * Divide-and-conquer computation of each fixed-point projected component
 * `round((dotUV * v[i] * 10^18) / dotVV)` over `[lo, hi)`.
 *
 * @param {readonly bigint[]} v
 * @param {bigint} dotUV
 * @param {bigint} dotVV
 * @param {number} lo
 * @param {number} hi
 * @param {bigint[]} out
 */
function projectSliceRecursive(v, dotUV, dotVV, lo, hi, out) {
	if (hi - lo === 1) {
		out[lo] = divRoundHalfAwayFromZero(dotUV * v[lo] * SCALE, dotVV);
		return;
	}

	const mid = lo + ((hi - lo) >>> 1);
	projectSliceRecursive(v, dotUV, dotVV, lo, mid, out);
	projectSliceRecursive(v, dotUV, dotVV, mid, hi, out);
}

/**
 * Computes the orthogonal vector projection of `u` onto `v` over exact BigInt
 * integers using a recursive divide-and-conquer algorithm:
 *
 *   proj_v(u) = ((u · v) / (v · v)) * v
 *
 * Because vector projections are generally non-integer rationals, every
 * component of the returned vector is a fixed-point `bigint` scaled by `10^18`
 * (`1_000_000_000_000_000_000n` represents `1`), rounded half away from zero
 * in a single final division per component for maximum precision.
 *
 * Time complexity: O(n) arithmetic operations; recursion depth: O(log n).
 *
 * @param {readonly bigint[]} u - Non-empty vector of `bigint` values to project.
 * @param {readonly bigint[]} v - Non-empty, non-zero target vector of `bigint` values with the same length as `u`.
 * @returns {bigint[]} Projected vector with each component scaled by `10n ** 18n`.
 * @throws {TypeError} If `u` or `v` is not an Array, or contains any non-`bigint` element.
 * @throws {RangeError} If either vector is empty, their lengths differ, or `v` is the zero vector.
 */
export function projectionBigIntRecursive(u, v) {
	if (!Array.isArray(u)) {
		throw new TypeError(`Expected first argument u to be an Array, received ${typeof u}`);
	}
	if (!Array.isArray(v)) {
		throw new TypeError(`Expected second argument v to be an Array, received ${typeof v}`);
	}
	if (u.length === 0 || v.length === 0) {
		throw new RangeError('Input vectors must be non-empty');
	}
	if (u.length !== v.length) {
		throw new RangeError(`Vector dimension mismatch: u has length ${u.length}, v has length ${v.length}`);
	}

	const [dotUV, dotVV] = dotAndNormSqRecursive(u, v, 0, u.length);
	if (dotVV === 0n) {
		throw new RangeError('Cannot project onto the zero vector');
	}

	const out = new Array(u.length);
	projectSliceRecursive(v, dotUV, dotVV, 0, u.length, out);
	return out;
}
