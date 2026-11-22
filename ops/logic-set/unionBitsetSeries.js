/**
 * Block width (in bits) for direct evaluation of the characteristic-function
 * series within safe IEEE-754 integer arithmetic (2^30 < Number.MAX_SAFE_INTEGER).
 */
const BASE_BITS = 30;
const BASE_LIMIT = 1n << BigInt(BASE_BITS);

/**
 * Computes the exact binary bit length of a positive BigInt.
 *
 * @param {bigint} n - A positive BigInt.
 * @returns {number} The number of bits required to represent `n` (`floor(log2(n)) + 1`).
 */
function bitLength(n) {
	const hex = n.toString(16);
	const lead = parseInt(hex[0], 16);
	const leadBits = 32 - Math.clz32(lead);
	return (hex.length - 1) * 4 + leadBits;
}

/**
 * Evaluates the exact characteristic-function series
 *   sum_{k >= 0} (1 - prod_i (1 - b_{i,k})) * 2^k
 * over a non-empty list of positive bitsets strictly smaller than 2^30.
 *
 * @param {bigint[]} active - Non-empty array of BigInt bitsets in `[1n, 2^30 - 1]`.
 * @returns {bigint} Exact union bitset.
 */
function evalSeriesBlock(active) {
	const vals = new Array(active.length);
	for (let i = 0; i < active.length; i++) {
		vals[i] = Number(active[i]);
	}

	let acc = 0;
	let power = 1;
	let anyNonZero = true;

	while (anyNonZero) {
		let complementProd = 1;
		anyNonZero = false;

		for (let i = 0; i < vals.length; i++) {
			const v = vals[i];
			if (v > 0) {
				const bit = v % 2;
				const next = (v - bit) / 2;
				vals[i] = next;
				if (next > 0) {
					anyNonZero = true;
				}
				complementProd *= 1 - bit;
			}
		}

		acc += (1 - complementProd) * power;
		power *= 2;
	}

	return BigInt(acc);
}

/**
 * Recursively evaluates the characteristic-function union series using exact
 * radix-2 binary splitting:
 *   U(A_1, ..., A_m) = U(A_1 mod 2^h, ..., A_m mod 2^h)
 *                    + 2^h * U(floor(A_1 / 2^h), ..., floor(A_m / 2^h))
 *
 * @param {bigint[]} active - Array of strictly positive BigInt bitsets.
 * @returns {bigint} Exact union bitset.
 */
function evalSeriesSplit(active) {
	if (active.length === 0) {
		return 0n;
	}
	if (active.length === 1) {
		// For a single set, sum_k (1 - (1 - b_k)) * 2^k = sum_k b_k * 2^k = A_1.
		return active[0];
	}

	let max1 = 0n;
	let max2 = 0n;
	let max1Idx = -1;
	for (let i = 0; i < active.length; i++) {
		const v = active[i];
		if (v >= max1) {
			max2 = max1;
			max1 = v;
			max1Idx = i;
		} else if (v > max2) {
			max2 = v;
		}
	}

	if (max1 < BASE_LIMIT) {
		return evalSeriesBlock(active);
	}

	const len1 = bitLength(max1);
	const len2 = bitLength(max2);

	if (len2 < len1) {
		// Only active[max1Idx] has bits at positions >= len2, so the upper
		// portion of the series collapses directly to its quotient term.
		const shift = BigInt(len2);
		const high = max1 >> shift;
		const lowMax = max1 - (high << shift);

		const lowActive = [];
		for (let i = 0; i < active.length; i++) {
			if (i !== max1Idx) {
				lowActive.push(active[i]);
			}
		}
		if (lowMax > 0n) {
			lowActive.push(lowMax);
		}

		return (high << shift) + evalSeriesSplit(lowActive);
	}

	// Balanced binary split at half the maximum bit width.
	const shift = BigInt(len1 >> 1);
	const highActive = [];
	const lowActive = [];

	for (let i = 0; i < active.length; i++) {
		const v = active[i];
		const q = v >> shift;
		const r = v - (q << shift);
		if (q > 0n) {
			highActive.push(q);
		}
		if (r > 0n) {
			lowActive.push(r);
		}
	}

	const high = evalSeriesSplit(highActive);
	const low = evalSeriesSplit(lowActive);
	return (high << shift) + low;
}

/**
 * Computes the set union of zero or more arbitrary-width non-negative BigInt
 * bitsets using the characteristic-function power series formulation.
 *
 * Each non-negative BigInt bitset `A_i` encodes a finite subset of non-negative
 * integers via its binary expansion `A_i = sum_{k >= 0} b_{i,k} * 2^k` where
 * `b_{i,k} in {0, 1}` is the indicator of element `k` in `A_i`.
 *
 * Algorithm:
 * Evaluates the exact De Morgan / inclusion-exclusion characteristic-function
 * series:
 *   `U(A_1, ..., A_m) = sum_{k >= 0} (1 - prod_{i=1}^{m} (1 - b_{i,k})) * 2^k`
 * which is the factored form of the general inclusion-exclusion identity
 * (reducing to `A + B - (A ∩ B)` for two sets). For arbitrary-width bitsets,
 * the series is evaluated via exact radix-2 binary splitting
 * `U(A) = U(A mod 2^h) + 2^h * U(floor(A / 2^h))` down to 30-bit blocks,
 * achieving `O(m * K log K)` time for `m` sets of width `K` without bitwise OR.
 *
 * The empty union (`unionBitsetSeries()`) returns `0n`, the identity element of
 * set union.
 *
 * @param {...bigint} bitsets - Zero or more non-negative BigInt bitsets.
 * @returns {bigint} Non-negative BigInt bitset representing the union of all inputs.
 * @throws {TypeError} If any argument is not a `bigint`.
 * @throws {RangeError} If any argument is a negative `bigint`.
 */
export function unionBitsetSeries(...bitsets) {
	const active = [];

	for (let i = 0; i < bitsets.length; i++) {
		const value = bitsets[i];
		if (typeof value !== 'bigint') {
			throw new TypeError(
				`Expected argument at index ${i} to be a BigInt bitset, received ${
					value === null ? 'null' : typeof value
				}`
			);
		}
		if (value < 0n) {
			throw new RangeError(
				`Expected argument at index ${i} to be a non-negative BigInt bitset, received ${value}`
			);
		}
		if (value > 0n) {
			active.push(value);
		}
	}

	return evalSeriesSplit(active);
}
