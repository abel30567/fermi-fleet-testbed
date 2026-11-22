/**
 * Computes the greatest common divisor of two non-negative safe integers
 * using the Euclidean algorithm.
 *
 * @param {number} a - First non-negative safe integer.
 * @param {number} b - Second non-negative safe integer.
 * @returns {number} The greatest common divisor of `a` and `b`.
 */
function gcd(a, b) {
	return b === 0 ? a : gcd(b, a % b)
}

/**
 * Validates that an argument is a non-negative safe integer IEEE-754 float64 Number.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a `number`.
 * @throws {RangeError} If `value` is not a non-negative safe integer.
 */
function assertNonNegativeSafeInteger(value, name) {
	if (typeof value !== 'number') {
		throw new TypeError(`${name} must be a number, received ${typeof value}`)
	}
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`${name} must be a non-negative safe integer, received ${value}`)
	}
}

/**
 * Recursively computes C(n, k) using the multiplicative recurrence
 * C(n, k) = C(n - 1, k - 1) * n / k.
 *
 * While intermediate values remain within IEEE-754 safe integer range,
 * factors are reduced by gcd(C(n - 1, k - 1), k) so exact integer results
 * up to Number.MAX_SAFE_INTEGER incur zero rounding error. Beyond safe
 * integer range, division is ordered to avoid premature overflow to Infinity.
 *
 * @param {number} n - Total items (non-negative safe integer).
 * @param {number} k - Chosen items (0 <= k <= min(n - k, 514)).
 * @returns {number} Binomial coefficient C(n, k) as an IEEE-754 float64 Number.
 */
function computeRecursive(n, k) {
	if (k === 0) return 1
	if (k === 1) return n

	const prev = computeRecursive(n - 1, k - 1)
	if (!Number.isFinite(prev)) return Infinity

	if (prev <= Number.MAX_SAFE_INTEGER) {
		const divisor = gcd(prev, k)
		return (prev / divisor) * (n / (k / divisor))
	}

	return prev > Number.MAX_VALUE / n ? (prev / k) * n : (prev * n) / k
}

/**
 * Smallest reduced k (with k <= n - k) for which C(n, k) >= C(2k, k)
 * is guaranteed to exceed Number.MAX_VALUE (~1.7976931348623157e+308):
 * C(1029, 514) ~= 1.4298e+308 (finite), while C(1030, 515) ~= 2.857e+308 (Infinity).
 */
const OVERFLOW_K_THRESHOLD = 515

/**
 * Computes the discrete binomial coefficient C(n, k) ("n choose k") over
 * IEEE-754 float64 Numbers using a recursive multiplicative recurrence.
 *
 * Exploits symmetry C(n, k) = C(n, n - k) and bounds recursion depth to at
 * most 514 frames by short-circuiting inputs guaranteed to overflow float64.
 *
 * @param {number} n - Total number of items (non-negative safe integer).
 * @param {number} k - Number of chosen items (non-negative safe integer).
 * @returns {number} The binomial coefficient C(n, k), `0` if `k > n`, or
 *   `Infinity` when the exact value exceeds `Number.MAX_VALUE`.
 * @throws {TypeError} If `n` or `k` is not a `number`.
 * @throws {RangeError} If `n` or `k` is not a non-negative safe integer.
 */
export function combinationsFloatRecursive(n, k) {
	assertNonNegativeSafeInteger(n, 'n')
	assertNonNegativeSafeInteger(k, 'k')

	if (k > n) return 0

	const r = k > n - k ? n - k : k
	if (r === 0) return 1
	if (r === 1) return n
	if (r >= OVERFLOW_K_THRESHOLD) return Infinity

	return computeRecursive(n, r)
}
