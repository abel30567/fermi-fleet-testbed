/**
 * Computes the exact sum of two BigInt integers using binary carry- and
 * borrow-propagation series identities.
 *
 * Algorithm / Mathematical Identities:
 * Because JavaScript BigInt bitwise operations use infinite two's-complement
 * sign extension, directly iterating carry propagation on negative values can
 * diverge. Instead, operands are decomposed into sign and non-negative
 * magnitude (`a = sgn(a) * |a|`, `b = sgn(b) * |b|`) and reduced to two
 * terminating bitwise recurrences:
 *
 * 1. Same-sign addition (`u >= 0`, `v >= 0`), binary carry-propagation series:
 *    - `s_0 = u`, `c_0 = v`
 *    - `s_{k+1} = s_k ^ c_k`
 *    - `c_{k+1} = (s_k & c_k) << 1n`
 *    Invariant: `s_k + c_k = u + v`, and the lowest `k` bits of `c_k` are zero.
 *    Since `c_k <= u + v`, convergence (`c_k === 0n`) is guaranteed in at most
 *    `max(bitLength(u), bitLength(v)) + 1` steps.
 *
 * 2. Opposite-sign difference (`u >= v >= 0`), binary borrow-propagation series:
 *    - `d_0 = u`, `w_0 = v`
 *    - `d_{k+1} = d_k ^ w_k`
 *    - `w_{k+1} = ((~d_k) & w_k) << 1n`
 *    Invariant: `d_k - w_k = u - v >= 0`, `0 <= d_k, w_k < 2^bitLength(u)`,
 *    and the lowest `k` bits of `w_k` are zero. Convergence (`w_k === 0n`) is
 *    guaranteed in at most `bitLength(u)` steps.
 *
 * Because integer addition is linear, this function also performs exact
 * addition on fixed-point BigInt values scaled by `10n ** 18n` (or any common
 * scale factor).
 *
 * @param {bigint} a - The first BigInt addend.
 * @param {bigint} b - The second BigInt addend.
 * @returns {bigint} The exact sum `a + b`.
 * @throws {TypeError} If either `a` or `b` is not a `bigint`.
 */
export function addBigIntSeries(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected parameter "a" to be a bigint, received ${a === null ? 'null' : typeof a}`);
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected parameter "b" to be a bigint, received ${b === null ? 'null' : typeof b}`);
	}

	if (a === 0n) return b;
	if (b === 0n) return a;

	const negA = a < 0n;
	const negB = b < 0n;
	const absA = negA ? -a : a;
	const absB = negB ? -b : b;

	if (negA === negB) {
		const magnitude = addNonNegativeSeries(absA, absB);
		return negA ? -magnitude : magnitude;
	}

	if (absA === absB) {
		return 0n;
	}

	if (absA > absB) {
		const magnitude = subNonNegativeSeries(absA, absB);
		return negA ? -magnitude : magnitude;
	}

	const magnitude = subNonNegativeSeries(absB, absA);
	return negB ? -magnitude : magnitude;
}

/**
 * Adds two non-negative BigInts via iterative binary carry propagation:
 * `s_{k+1} = s_k ^ c_k`, `c_{k+1} = (s_k & c_k) << 1n` until `c_k === 0n`.
 *
 * @param {bigint} u - Non-negative BigInt.
 * @param {bigint} v - Non-negative BigInt.
 * @returns {bigint} Exact sum `u + v`.
 */
function addNonNegativeSeries(u, v) {
	let sum = u;
	let carry = v;
	while (carry !== 0n) {
		const nextSum = sum ^ carry;
		carry = (sum & carry) << 1n;
		sum = nextSum;
	}
	return sum;
}

/**
 * Subtracts two non-negative BigInts (`u >= v >= 0n`) via iterative binary
 * borrow propagation: `d_{k+1} = d_k ^ w_k`, `w_{k+1} = ((~d_k) & w_k) << 1n`
 * until `w_k === 0n`.
 *
 * @param {bigint} u - Non-negative minuend (`u >= v`).
 * @param {bigint} v - Non-negative subtrahend (`0n <= v <= u`).
 * @returns {bigint} Exact difference `u - v`.
 */
function subNonNegativeSeries(u, v) {
	let diff = u;
	let borrow = v;
	while (borrow !== 0n) {
		const nextDiff = diff ^ borrow;
		borrow = ((~diff) & borrow) << 1n;
		diff = nextDiff;
	}
	return diff;
}
