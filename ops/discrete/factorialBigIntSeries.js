/**
 * Computes the product of all odd integers in the inclusive range [low, high]
 * using a balanced binary-splitting product tree.
 *
 * Precondition: `low` and `high` are odd positive BigInts with `low <= high`.
 *
 * @param {bigint} low - Lower odd bound (inclusive).
 * @param {bigint} high - Upper odd bound (inclusive).
 * @returns {bigint} Product of all odd integers in [low, high].
 */
function oddRangeProduct(low, high) {
	if (low === high) {
		return low;
	}
	if (high - low === 2n) {
		return low * high;
	}
	const mid = (low + high) >> 1n;
	const leftHigh = (mid & 1n) === 1n ? mid : mid - 1n;
	const rightLow = leftHigh + 2n;
	return oddRangeProduct(low, leftHigh) * oddRangeProduct(rightLow, high);
}

/**
 * Computes the exact factorial `n!` for a non-negative BigInt `n`.
 *
 * Uses the 2-adic odd-factorial decomposition (Legendre's identity for the
 * power of 2 combined with a balanced binary-splitting product tree over
 * disjoint odd intervals):
 *
 *   n! = 2^(n - popcount(n)) * prod_{k >= 0} oddFactorial(floor(n / 2^k))
 *
 * Every odd integer in [1, n] is multiplied at most once in the leaf product
 * trees, and the entire power-of-2 factor is applied in a single final left
 * shift.
 *
 * @param {bigint} n - Non-negative integer to compute the factorial of.
 * @returns {bigint} Exact value of `n!`.
 * @throws {TypeError} If `n` is not a BigInt.
 * @throws {RangeError} If `n` is negative.
 */
export function factorialBigIntSeries(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof n}`);
	}
	if (n < 0n) {
		throw new RangeError(`Expected a non-negative BigInt, received ${n}`);
	}
	if (n <= 1n) {
		return 1n;
	}

	let popcount = 0n;
	let bitLength = 0n;
	let temp = n;
	while (temp > 0n) {
		popcount += temp & 1n;
		temp >>= 1n;
		bitLength += 1n;
	}

	let oddFactorial = 1n;
	let runningOdd = 1n;

	for (let k = bitLength - 2n; k >= 0n; k -= 1n) {
		const prev = n >> (k + 1n);
		const curr = n >> k;
		const lowOdd = (prev + 1n) | 1n;
		const highOdd = (curr - 1n) | 1n;

		if (lowOdd <= highOdd) {
			runningOdd *= oddRangeProduct(lowOdd, highOdd);
		}
		oddFactorial *= runningOdd;
	}

	const twoAdicExponent = n - popcount;
	return oddFactorial << twoAdicExponent;
}
