/**
 * Recursively finds an upper bound `width` (a power of two) such that
 * `a < (m << width)`, given `a >= m > 0n`.
 *
 * @param {bigint} a - Non-negative dividend satisfying `a >= m`.
 * @param {bigint} m - Positive divisor.
 * @param {bigint} width - Current candidate bit-width (starts at `1n`).
 * @returns {bigint} Bit-width upper bound `w` with `a < (m << w)`.
 */
function findBitWidthUpper(a, m, width) {
	if (a < (m << width)) {
		return width
	}
	return findBitWidthUpper(a, m, width << 1n)
}

/**
 * Recursively binary-searches `[low, high]` for the exact smallest bit-width
 * `w` such that `a < (m << w)`, given `(m << low) <= a < (m << high)`.
 *
 * @param {bigint} a - Non-negative dividend.
 * @param {bigint} m - Positive divisor.
 * @param {bigint} low - Lower bound with `(m << low) <= a`.
 * @param {bigint} high - Upper bound with `a < (m << high)`.
 * @returns {bigint} Minimal bit-width `w` satisfying `a < (m << w)`.
 */
function refineBitWidth(a, m, low, high) {
	if (high - low <= 1n) {
		return high
	}
	const mid = (low + high) >> 1n
	if (a < (m << mid)) {
		return refineBitWidth(a, m, low, mid)
	}
	return refineBitWidth(a, m, mid, high)
}

/**
 * Divide-and-conquer recursive reduction of non-negative `a` modulo positive `m`,
 * given the precondition `0n <= a < (m << width)`.
 *
 * Splitting `a` at `half = width >> 1n`:
 *   - `hi = a >> half` satisfies `0n <= hi < (m << (width - half))`
 *   - `lo = a - (hi << half)` satisfies `0n <= lo < (1n << half)`
 * Reducing `hi` recursively yields `rHi` in `[0n, m - 1n]`.
 * Recombining `combined = (rHi << half) + lo` satisfies `0n <= combined < (m << half)`,
 * which is then reduced recursively in the second half.
 *
 * Maximum call-stack depth is O(log(width)), so arbitrarily large BigInts
 * are reduced without risking stack overflow.
 *
 * @param {bigint} a - Non-negative dividend with `a < (m << width)`.
 * @param {bigint} m - Positive divisor.
 * @param {bigint} width - Bit-width bound satisfying `a < (m << width)`.
 * @returns {bigint} Remainder `r` satisfying `0n <= r < m` and `a ≡ r (mod m)`.
 */
function reduceBounded(a, m, width) {
	if (a < m) {
		return a
	}
	if (width <= 1n) {
		return a - m
	}
	const half = width >> 1n
	const other = width - half
	const hi = a >> half
	const lo = a - (hi << half)
	const rHi = reduceBounded(hi, m, other)
	const combined = (rHi << half) + lo
	return reduceBounded(combined, m, half)
}

/**
 * Computes the exact Euclidean modulo of two BigInt integers using a
 * recursive divide-and-conquer binary reduction algorithm.
 *
 * For any integers `dividend` (a) and non-zero `divisor` (b), returns the
 * unique BigInt remainder `r` such that:
 *   `a = b * q + r`  and  `0n <= r < |b|`
 *
 * @param {bigint} dividend - The integer dividend.
 * @param {bigint} divisor - The non-zero integer divisor.
 * @returns {bigint} The exact Euclidean remainder in `[0n, |divisor| - 1n]`.
 * @throws {TypeError} If `dividend` or `divisor` is not a `bigint`.
 * @throws {RangeError} If `divisor` is `0n`.
 */
export function moduloBigIntRecursive(dividend, divisor) {
	if (typeof dividend !== 'bigint') {
		throw new TypeError(`Expected dividend to be a bigint, got ${typeof dividend}`)
	}
	if (typeof divisor !== 'bigint') {
		throw new TypeError(`Expected divisor to be a bigint, got ${typeof divisor}`)
	}
	if (divisor === 0n) {
		throw new RangeError('Division by zero: divisor must be a non-zero bigint')
	}

	const absDivisor = divisor < 0n ? -divisor : divisor
	if (dividend === 0n || absDivisor === 1n) {
		return 0n
	}

	const absDividend = dividend < 0n ? -dividend : dividend
	let remainder
	if (absDividend < absDivisor) {
		remainder = absDividend
	} else {
		const upper = findBitWidthUpper(absDividend, absDivisor, 1n)
		const width = upper === 1n ? 1n : refineBitWidth(absDividend, absDivisor, upper >> 1n, upper)
		remainder = reduceBounded(absDividend, absDivisor, width)
	}

	if (dividend < 0n && remainder !== 0n) {
		return absDivisor - remainder
	}
	return remainder
}
