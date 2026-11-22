/**
 * @fileoverview Bitwise AND (set intersection) over arbitrary-width BigInt bitsets
 * computed via the algebraic bit-plane power-of-2 indicator series.
 */

const BLOCK_BITS = 30;
const BLOCK_BITS_BIGINT = 30n;
const BLOCK_BASE = 1073741824n; // 2^30

/**
 * Checks whether a value is a plain object (eligible as an options bag).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	return (
		typeof value === 'object' &&
		value !== null &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

/**
 * Validates and normalizes the optional `width` option.
 *
 * @param {Record<string, unknown>} options
 * @returns {bigint | null} Normalized non-negative BigInt width, or `null` when unbounded.
 * @throws {TypeError} If unknown option keys are present or `width` is neither a number nor a BigInt.
 * @throws {RangeError} If `width` is negative, non-integer, or not a safe finite integer.
 */
function parseOptions(options) {
	for (const key of Object.keys(options)) {
		if (key !== 'width') {
			throw new TypeError(`Unknown option "${key}"; only "width" is supported`);
		}
	}

	const { width } = options;
	if (width === undefined) {
		return null;
	}

	if (typeof width === 'number') {
		if (!Number.isFinite(width) || !Number.isInteger(width) || !Number.isSafeInteger(width) || width < 0) {
			throw new RangeError('Option "width" must be a non-negative safe integer');
		}
		return BigInt(width);
	}

	if (typeof width === 'bigint') {
		if (width < 0n) {
			throw new RangeError('Option "width" must be a non-negative integer');
		}
		return width;
	}

	throw new TypeError('Option "width" must be a non-negative safe integer or BigInt');
}

/**
 * Computes the pairwise bitwise AND of two non-negative BigInt bitsets using the
 * algebraic bit-plane indicator power-of-2 series:
 *
 *   a ∧ b = sum_{k=0}^{K-1} (a_k * b_k) * 2^k
 *
 * where a_k = floor(a / 2^k) mod 2 and b_k = floor(b / 2^k) mod 2 are the binary
 * indicator coefficients in {0, 1}. The series is decomposed into base-2^30 blocks
 * by linearity:
 *
 *   sum_{m >= 0} (2^30)^m * sum_{j=0}^{29} (a_{30m+j} * b_{30m+j}) * 2^j
 *
 * avoiding native bitwise operators while maintaining exact arbitrary-width BigInt
 * arithmetic and stopping as soon as either remaining quotient reaches 0 or `maxWidth`
 * bit-planes have been accumulated.
 *
 * @param {bigint} a - Non-negative BigInt bitset.
 * @param {bigint} b - Non-negative BigInt bitset.
 * @param {bigint | null} maxWidth - Maximum number of low-order bit-planes to include, or `null` for unbounded.
 * @returns {bigint} Exact intersection bitset.
 */
function andPairBitPlaneSeries(a, b, maxWidth) {
	if (a === 0n || b === 0n || maxWidth === 0n) {
		return 0n;
	}

	let remA = a;
	let remB = b;
	let remainingBits = maxWidth;
	let result = 0n;
	let blockWeight = 1n;

	while (remA > 0n && remB > 0n && (remainingBits === null || remainingBits > 0n)) {
		const blockA = Number(remA % BLOCK_BASE);
		const blockB = Number(remB % BLOCK_BASE);

		let limit = BLOCK_BITS;
		if (remainingBits !== null && remainingBits < BLOCK_BITS_BIGINT) {
			limit = Number(remainingBits);
		}

		let qa = blockA;
		let qb = blockB;
		let weight = 1;
		let blockSum = 0;

		for (let j = 0; j < limit && qa > 0 && qb > 0; j++) {
			const bitA = qa % 2;
			const bitB = qb % 2;
			blockSum += (bitA * bitB) * weight;
			qa = (qa - bitA) / 2;
			qb = (qb - bitB) / 2;
			weight *= 2;
		}

		if (blockSum !== 0) {
			result += BigInt(blockSum) * blockWeight;
		}

		remA = (remA - BigInt(blockA)) / BLOCK_BASE;
		remB = (remB - BigInt(blockB)) / BLOCK_BASE;
		blockWeight *= BLOCK_BASE;

		if (remainingBits !== null) {
			remainingBits -= BigInt(limit);
		}
	}

	return result;
}

/**
 * Computes the bitwise AND (set intersection) over two or more non-negative BigInt
 * bitsets of arbitrary width using the algebraic bit-plane power-of-2 indicator series:
 *
 *   and(x^(1), ..., x^(n)) = sum_{k=0}^{K-1} (prod_{i=1}^{n} x^(i)_k) * 2^k
 *
 * where each indicator coefficient x^(i)_k = floor(x^(i) / 2^k) mod 2 lies in {0, 1}.
 * Because bitwise AND is commutative and associative, multi-operand intersections fold
 * the pairwise block-linear bit-plane series starting from the smallest operand.
 *
 * @param {...(bigint | { width?: number | bigint })} args
 *   Two or more non-negative `BigInt` bitsets, optionally followed by a plain options
 *   object `{ width }` restricting the series to the lowest `width` bit positions
 *   `0 <= k < width`.
 * @returns {bigint} Non-negative `BigInt` representing the intersection bitset.
 * @throws {TypeError} If fewer than two bitset operands are provided, any bitset operand
 *   is not a `BigInt`, or an invalid options object / `width` type is passed.
 * @throws {RangeError} If any bitset operand is negative or `width` is negative or not
 *   a safe integer.
 */
export function andBitsetSeries(...args) {
	if (args.length < 2) {
		throw new TypeError('andBitsetSeries requires at least two non-negative BigInt bitsets');
	}

	let maxWidth = null;
	let bitsetCount = args.length;

	if (args.length >= 3 && isPlainObject(args[args.length - 1])) {
		maxWidth = parseOptions(args[args.length - 1]);
		bitsetCount = args.length - 1;
	}

	if (bitsetCount < 2) {
		throw new TypeError('andBitsetSeries requires at least two non-negative BigInt bitsets');
	}

	const bitsets = new Array(bitsetCount);
	let hasZero = false;

	for (let i = 0; i < bitsetCount; i++) {
		const value = args[i];
		if (typeof value !== 'bigint') {
			throw new TypeError(`Bitset operand at index ${i} must be a BigInt`);
		}
		if (value < 0n) {
			throw new RangeError(`Bitset operand at index ${i} must be non-negative`);
		}
		if (value === 0n) {
			hasZero = true;
		}
		bitsets[i] = value;
	}

	if (hasZero || maxWidth === 0n) {
		return 0n;
	}

	if (bitsetCount === 2) {
		return andPairBitPlaneSeries(bitsets[0], bitsets[1], maxWidth);
	}

	// Commutativity allows folding from smallest to largest to minimize bit-plane iterations.
	bitsets.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

	let acc = andPairBitPlaneSeries(bitsets[0], bitsets[1], maxWidth);
	for (let i = 2; i < bitsetCount && acc !== 0n; i++) {
		acc = andPairBitPlaneSeries(acc, bitsets[i], maxWidth);
	}

	return acc;
}
