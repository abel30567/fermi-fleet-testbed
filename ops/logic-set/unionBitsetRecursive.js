/**
 * Computes the bit-length of a non-negative BigInt (0 for 0n).
 *
 * @param {bigint} value - Non-negative BigInt.
 * @returns {number} Number of bits required to represent `value`.
 */
function bitLength(value) {
	if (value === 0n) {
		return 0;
	}
	const hex = value.toString(16);
	const topNibble = parseInt(hex[0], 16);
	const topBits = 32 - Math.clz32(topNibble);
	return (hex.length - 1) * 4 + topBits;
}

/**
 * Validates that a value is a non-negative BigInt bitset.
 *
 * @param {unknown} value - Candidate bitset value.
 * @param {string} label - Descriptive label used in error messages.
 * @throws {TypeError} If `value` is not a `bigint`.
 * @throws {RangeError} If `value` is negative.
 */
function assertValidBitset(value, label) {
	if (typeof value !== 'bigint') {
		throw new TypeError(
			`unionBitsetRecursive: expected ${label} to be a non-negative BigInt, got ${value === null ? 'null' : typeof value}`
		);
	}
	if (value < 0n) {
		throw new RangeError(
			`unionBitsetRecursive: expected ${label} to be a non-negative BigInt (>= 0n), got ${value}n`
		);
	}
}

/**
 * Recursively computes the bitwise union of two non-negative BigInt bitsets
 * bounded by `width` bits by dividing the bit-width in half at each step.
 *
 * @param {bigint} a - First bitset (`0n <= a < 2^width`).
 * @param {bigint} b - Second bitset (`0n <= b < 2^width`).
 * @param {number} width - Current bit-width slice (`>= 1`).
 * @returns {bigint} Bitset representing the union of `a` and `b`.
 */
function unionPairByWidth(a, b, width) {
	if (a === 0n) {
		return b;
	}
	if (b === 0n) {
		return a;
	}
	if (a === b) {
		return a;
	}
	if (width <= 1) {
		// Both a and b are non-zero 1-bit values, so both are 1n.
		return 1n;
	}

	const half = Math.floor(width / 2);
	const shift = BigInt(half);
	const mask = (1n << shift) - 1n;

	const aLo = a & mask;
	const aHi = a >> shift;
	const bLo = b & mask;
	const bHi = b >> shift;

	const lo = unionPairByWidth(aLo, bLo, half);
	const hi = unionPairByWidth(aHi, bHi, width - half);

	return (hi << shift) + lo;
}

/**
 * Computes the union of two validated non-negative BigInt bitsets.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Union bitset of `a` and `b`.
 */
function unionTwoBitsets(a, b) {
	if (a === 0n) {
		return b;
	}
	if (b === 0n) {
		return a;
	}
	if (a === b) {
		return a;
	}
	const width = Math.max(bitLength(a), bitLength(b));
	return unionPairByWidth(a, b, width);
}

/**
 * Recursively combines a slice `[start, end)` of validated bitsets using
 * divide-and-conquer reduction.
 *
 * @param {readonly bigint[]} bitsets - Validated list of non-negative BigInt bitsets.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {bigint} Union of all bitsets in `bitsets[start..end)`.
 */
function unionListRecursive(bitsets, start, end) {
	const count = end - start;
	if (count === 0) {
		return 0n;
	}
	if (count === 1) {
		return bitsets[start];
	}
	if (count === 2) {
		return unionTwoBitsets(bitsets[start], bitsets[start + 1]);
	}

	const mid = start + Math.floor(count / 2);
	const left = unionListRecursive(bitsets, start, mid);
	const right = unionListRecursive(bitsets, mid, end);
	return unionTwoBitsets(left, right);
}

/**
 * Computes the set union over arbitrary-width non-negative BigInt bitsets using
 * a two-level recursive divide-and-conquer algorithm:
 *
 * 1. Across multiple input bitsets, the list is recursively split in half and
 *    combined in a balanced binary reduction tree (`O(log k)` stack depth).
 * 2. For each pairwise union, the bit-width is recursively split into low and
 *    high halves (`O(log w)` stack depth) with short-circuits for empty (`0n`)
 *    and equal bit-slices.
 *
 * Accepts either variadic non-negative `bigint` arguments or a single `Array`
 * of non-negative `bigint` bitsets. An empty argument list or empty array
 * returns the identity element `0n` (the empty set).
 *
 * @param {...(bigint | readonly bigint[])} args - Either variadic non-negative
 *   BigInt bitsets or a single array of non-negative BigInt bitsets.
 * @returns {bigint} Non-negative BigInt bitset representing the set union.
 * @throws {TypeError} If any input is not a `bigint` (or if an array is mixed
 *   with extra arguments, or contains non-`bigint` elements / holes).
 * @throws {RangeError} If any input bitset is negative (`< 0n`).
 *
 * @example
 * unionBitsetRecursive(0b1010n, 0b0110n); // 0b1110n (14n)
 * unionBitsetRecursive(0b001n, 0b010n, 0b100n); // 0b111n (7n)
 * unionBitsetRecursive([1n << 600n, 1n << 1024n]); // (1n << 1024n) + (1n << 600n)
 */
export function unionBitsetRecursive(...args) {
	if (args.length === 0) {
		return 0n;
	}

	/** @type {bigint[]} */
	let bitsets;

	if (args.length === 1 && Array.isArray(args[0])) {
		const input = args[0];
		bitsets = new Array(input.length);
		for (let i = 0; i < input.length; i++) {
			if (!(i in input)) {
				throw new TypeError(
					`unionBitsetRecursive: expected bitsets[${i}] to be a non-negative BigInt, got empty slot`
				);
			}
			const value = input[i];
			assertValidBitset(value, `bitsets[${i}]`);
			bitsets[i] = value;
		}
	} else {
		bitsets = new Array(args.length);
		for (let i = 0; i < args.length; i++) {
			const value = args[i];
			assertValidBitset(value, `argument ${i}`);
			bitsets[i] = value;
		}
	}

	return unionListRecursive(bitsets, 0, bitsets.length);
}
