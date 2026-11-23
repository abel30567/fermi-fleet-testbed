/**
 * Exact BigInt arithmetic subtraction using algebraic sign identities and a
 * finite base-2^64 telescoping borrow/carry power series.
 *
 * For non-negative integers u >= v >= 0 expanded in base B = 2^64:
 *   u = sum_{k=0}^{n-1} u_k * B^k,  v = sum_{k=0}^{n-1} v_k * B^k
 * the difference is evaluated via the exact telescoping borrow series:
 *   u - v = sum_{k=0}^{n-1} d_k * B^k,
 * where d_k = (u_k - v_k - beta_k) mod B, beta_0 = 0, and
 * beta_{k+1} = 1 if u_k < v_k + beta_k else 0 (with beta_n = 0).
 *
 * All signed cases reduce to non-negative series subtraction or addition via
 * exact algebraic identities:
 *   a - 0 = a,  0 - b = -b,  a - a = 0,
 *   a - b = -(b - a),  a - (-b) = a + b,  (-a) - (-b) = b - a.
 *
 * Because subtraction is closed over Z and linear under scaling, this also
 * preserves exactness for fixed-point BigInt values scaled by 10^18.
 */

const RADIX_BITS = 64n;
const RADIX = 1n << RADIX_BITS;
const RADIX_MASK = RADIX - 1n;

/**
 * Evaluates u - v for non-negative BigInts with u >= v via base-2^64
 * telescoping borrow series.
 *
 * @param {bigint} u - Non-negative minuend (u >= v).
 * @param {bigint} v - Non-negative subtrahend (0n <= v <= u).
 * @returns {bigint} Exact difference u - v.
 */
function subtractNonNegativeSeries(u, v) {
	let remU = u;
	let remV = v;
	let borrow = 0n;
	let result = 0n;
	let shift = 0n;

	while (remU > 0n || remV > 0n) {
		const uk = remU & RADIX_MASK;
		const vk = remV & RADIX_MASK;
		const subtrahend = vk + borrow;

		let dk;
		if (uk >= subtrahend) {
			dk = uk - subtrahend;
			borrow = 0n;
		} else {
			dk = (uk + RADIX) - subtrahend;
			borrow = 1n;
		}

		result |= dk << shift;
		remU >>= RADIX_BITS;
		remV >>= RADIX_BITS;
		shift += RADIX_BITS;
	}

	return result;
}

/**
 * Evaluates u + v for non-negative BigInts via base-2^64 carry series.
 *
 * @param {bigint} u - Non-negative addend.
 * @param {bigint} v - Non-negative addend.
 * @returns {bigint} Exact sum u + v.
 */
function addNonNegativeSeries(u, v) {
	let remU = u;
	let remV = v;
	let carry = 0n;
	let result = 0n;
	let shift = 0n;

	while (remU > 0n || remV > 0n || carry > 0n) {
		const uk = remU & RADIX_MASK;
		const vk = remV & RADIX_MASK;
		const limbSum = uk + vk + carry;
		const sk = limbSum & RADIX_MASK;
		carry = limbSum >> RADIX_BITS;

		result |= sk << shift;
		remU >>= RADIX_BITS;
		remV >>= RADIX_BITS;
		shift += RADIX_BITS;
	}

	return result;
}

/**
 * Subtracts two exact BigInt integers (`a - b`) using algebraic sign identities
 * and a finite base-2^64 telescoping borrow/carry series.
 *
 * @param {bigint} a - The minuend (must be a BigInt).
 * @param {bigint} b - The subtrahend (must be a BigInt).
 * @returns {bigint} The exact difference `a - b`.
 * @throws {TypeError} If `a` or `b` is not a BigInt.
 */
export function subtractBigIntSeries(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected minuend "a" to be a bigint, received ${typeof a}`);
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected subtrahend "b" to be a bigint, received ${typeof b}`);
	}

	if (b === 0n) {
		return a;
	}
	if (a === 0n) {
		return -b;
	}
	if (a === b) {
		return 0n;
	}

	if (a > 0n && b > 0n) {
		return a > b
			? subtractNonNegativeSeries(a, b)
			: -subtractNonNegativeSeries(b, a);
	}

	if (a < 0n && b < 0n) {
		const absA = -a;
		const absB = -b;
		return absB > absA
			? subtractNonNegativeSeries(absB, absA)
			: -subtractNonNegativeSeries(absA, absB);
	}

	if (a > 0n && b < 0n) {
		return addNonNegativeSeries(a, -b);
	}

	return -addNonNegativeSeries(-a, b);
}
