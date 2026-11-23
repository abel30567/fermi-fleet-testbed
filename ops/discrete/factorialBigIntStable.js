/**
 * Computes the exact discrete factorial `n!` over BigInt integers using an
 * iterative binary-splitting (2-adic odd-product decomposition) algorithm with
 * a balanced binary product tree.
 *
 * Factoring out powers of 2 via Legendre's identity:
 *   n! = (2 ** s) * prod_{j >= 0} oddProduct(floor(n / 2^j))
 * where `s = sum_{j >= 1} floor(n / 2^j)` and each odd-factor segment is
 * multiplied using a bottom-up balanced binary product tree. This avoids
 * recursion (preventing stack overflow for large inputs) and keeps operand bit
 * lengths balanced for subquadratic BigInt multiplication.
 *
 * @param {bigint} n - Non-negative BigInt integer whose factorial is computed.
 * @returns {bigint} The exact value of `n!`.
 * @throws {TypeError} If `n` is not a `bigint`.
 * @throws {RangeError} If `n` is negative.
 */

const LEAF_BATCH = 8;

/**
 * Computes the exact product of all odd BigInts `k` with `lo < k <= hi`
 * using an iterative binary-counter balanced product tree (O(log N) memory,
 * zero recursion).
 *
 * @param {bigint} lo - Exclusive lower bound (non-negative).
 * @param {bigint} hi - Inclusive upper bound.
 * @returns {bigint} Product of odd integers in `(lo, hi]`, or `1n` if empty.
 */
function oddProductBalanced(lo, hi) {
	let cur = (lo + 1n) | 1n;
	const last = (hi & 1n) === 1n ? hi : hi - 1n;
	if (cur > last) {
		return 1n;
	}

	/** @type {(bigint | null)[]} */
	const tree = [];

	while (cur <= last) {
		let acc = cur;
		cur += 2n;
		for (let i = 1; i < LEAF_BATCH && cur <= last; i += 1) {
			acc *= cur;
			cur += 2n;
		}

		let level = 0;
		while (level < tree.length && tree[level] !== null) {
			acc *= tree[level];
			tree[level] = null;
			level += 1;
		}
		tree[level] = acc;
	}

	let result = 1n;
	for (let i = 0; i < tree.length; i += 1) {
		if (tree[i] !== null) {
			result *= tree[i];
		}
	}
	return result;
}

/**
 * Computes the exact BigInt factorial `n!`.
 *
 * @param {bigint} n - Non-negative BigInt integer.
 * @returns {bigint} Exact factorial `n!`.
 * @throws {TypeError} If `n` is not a BigInt.
 * @throws {RangeError} If `n < 0n`.
 */
export function factorialBigIntStable(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`factorialBigIntStable: expected a BigInt, got ${typeof n}`);
	}
	if (n < 0n) {
		throw new RangeError(`factorialBigIntStable: expected a non-negative BigInt, got ${n}`);
	}
	if (n <= 1n) {
		return 1n;
	}

	/** @type {bigint[]} */
	const levels = [];
	let cur = n;
	while (cur > 1n) {
		levels.push(cur);
		cur >>= 1n;
	}

	let oddPrefix = 1n;
	let oddProduct = 1n;
	let shift = 0n;
	let prev = 1n;

	for (let i = levels.length - 1; i >= 0; i -= 1) {
		const hi = levels[i];
		const segment = oddProductBalanced(prev, hi);
		oddPrefix *= segment;
		oddProduct *= oddPrefix;
		shift += hi >> 1n;
		prev = hi;
	}

	return oddProduct << shift;
}
