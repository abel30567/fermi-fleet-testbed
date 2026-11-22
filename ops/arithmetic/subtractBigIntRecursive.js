const LIMB_BITS = 32;

/**
 * Recursively adds two non-negative BigInts using bitwise carry propagation.
 *
 * @param {bigint} x - Non-negative minuend/addend.
 * @param {bigint} y - Non-negative carry/addend.
 * @returns {bigint} Exact sum x + y.
 */
function addBitwise(x, y) {
	if (y === 0n) {
		return x;
	}
	return addBitwise(x ^ y, (x & y) << 1n);
}

/**
 * Recursively subtracts two non-negative BigInts (x >= y) using bitwise borrow propagation.
 *
 * @param {bigint} x - Non-negative minuend (x >= y).
 * @param {bigint} y - Non-negative subtrahend/borrow.
 * @returns {bigint} Exact difference x - y.
 */
function subBitwise(x, y) {
	if (y === 0n) {
		return x;
	}
	return subBitwise(x ^ y, (~x & y) << 1n);
}

/**
 * Divide-and-conquer recursive addition with carry over fixed bit-width non-negative BigInts.
 * Splits operands into low and high limbs recursively until reaching LIMB_BITS.
 *
 * @param {bigint} x - Non-negative operand satisfying 0n <= x < 2^bits.
 * @param {bigint} y - Non-negative operand satisfying 0n <= y < 2^bits.
 * @param {bigint} carryIn - Incoming carry bit (0n or 1n).
 * @param {number} bits - Positive bit width bounding x and y.
 * @returns {{ sum: bigint, carryOut: bigint }} Sum within [0, 2^bits) and outgoing carry bit.
 */
function addMagWithCarry(x, y, carryIn, bits) {
	if (bits <= LIMB_BITS) {
		const total = addBitwise(addBitwise(x, y), carryIn);
		const shift = BigInt(bits);
		const carryOut = total >> shift;
		const sum = total ^ (carryOut << shift);
		return { sum, carryOut };
	}

	const half = bits >> 1;
	const hiBits = bits - half;
	const halfBig = BigInt(half);

	const xHi = x >> halfBig;
	const xLo = x ^ (xHi << halfBig);
	const yHi = y >> halfBig;
	const yLo = y ^ (yHi << halfBig);

	const lo = addMagWithCarry(xLo, yLo, carryIn, half);
	const hi = addMagWithCarry(xHi, yHi, lo.carryOut, hiBits);

	return {
		sum: (hi.sum << halfBig) | lo.sum,
		carryOut: hi.carryOut,
	};
}

/**
 * Divide-and-conquer recursive subtraction with borrow over fixed bit-width non-negative BigInts.
 * Splits operands into low and high limbs recursively until reaching LIMB_BITS.
 *
 * @param {bigint} x - Non-negative operand satisfying 0n <= x < 2^bits.
 * @param {bigint} y - Non-negative operand satisfying 0n <= y < 2^bits.
 * @param {bigint} borrowIn - Incoming borrow bit (0n or 1n).
 * @param {number} bits - Positive bit width bounding x and y.
 * @returns {{ diff: bigint, borrowOut: bigint }} Difference within [0, 2^bits) and outgoing borrow bit.
 */
function subMagWithBorrow(x, y, borrowIn, bits) {
	if (bits <= LIMB_BITS) {
		const yWithBorrow = addBitwise(y, borrowIn);
		if (x >= yWithBorrow) {
			return { diff: subBitwise(x, yWithBorrow), borrowOut: 0n };
		}
		const borrowedX = (1n << BigInt(bits)) | x;
		return { diff: subBitwise(borrowedX, yWithBorrow), borrowOut: 1n };
	}

	const half = bits >> 1;
	const hiBits = bits - half;
	const halfBig = BigInt(half);

	const xHi = x >> halfBig;
	const xLo = x ^ (xHi << halfBig);
	const yHi = y >> halfBig;
	const yLo = y ^ (yHi << halfBig);

	const lo = subMagWithBorrow(xLo, yLo, borrowIn, half);
	const hi = subMagWithBorrow(xHi, yHi, lo.borrowOut, hiBits);

	return {
		diff: (hi.diff << halfBig) | lo.diff,
		borrowOut: hi.borrowOut,
	};
}

/**
 * Returns a tight upper bound on the bit width needed to represent both non-negative BigInts.
 *
 * @param {bigint} x - Non-negative BigInt.
 * @param {bigint} y - Non-negative BigInt.
 * @returns {number} Bit width >= 4 such that x < 2^bits and y < 2^bits.
 */
function boundBitWidth(x, y) {
	return Math.max(x.toString(16).length, y.toString(16).length) * 4;
}

/**
 * Computes exact sum x + y for non-negative BigInts via divide-and-conquer limb splitting.
 *
 * @param {bigint} x - Non-negative BigInt.
 * @param {bigint} y - Non-negative BigInt.
 * @returns {bigint} Exact sum x + y.
 */
function addMag(x, y) {
	if (x === 0n) return y;
	if (y === 0n) return x;
	const bits = boundBitWidth(x, y);
	const { sum, carryOut } = addMagWithCarry(x, y, 0n, bits);
	return (carryOut << BigInt(bits)) | sum;
}

/**
 * Computes exact difference x - y for non-negative BigInts with x >= y via divide-and-conquer limb splitting.
 *
 * @param {bigint} x - Non-negative BigInt (x >= y).
 * @param {bigint} y - Non-negative BigInt.
 * @returns {bigint} Exact difference x - y.
 */
function subMag(x, y) {
	if (y === 0n) return x;
	if (x === y) return 0n;
	const bits = boundBitWidth(x, y);
	return subMagWithBorrow(x, y, 0n, bits).diff;
}

/**
 * Subtracts two exact BigInt integers (`a - b`) using sign-magnitude decomposition
 * and a recursive divide-and-conquer limb-splitting algorithm with recursive
 * bitwise borrow/carry propagation at the base limb level.
 *
 * @param {bigint} a - The minuend (must be a BigInt).
 * @param {bigint} b - The subtrahend (must be a BigInt).
 * @returns {bigint} The exact BigInt difference `a - b`.
 * @throws {TypeError} If either `a` or `b` is not a BigInt.
 */
export function subtractBigIntRecursive(a, b) {
	if (typeof a !== 'bigint' || typeof b !== 'bigint') {
		throw new TypeError('subtractBigIntRecursive expects both arguments to be BigInt values');
	}

	if (a === b) {
		return 0n;
	}
	if (b === 0n) {
		return a;
	}
	if (a === 0n) {
		return -b;
	}

	const aNeg = a < 0n;
	const bNeg = b < 0n;
	const magA = aNeg ? -a : a;
	const magB = bNeg ? -b : b;

	if (!aNeg && !bNeg) {
		// (+magA) - (+magB)
		return magA >= magB ? subMag(magA, magB) : -subMag(magB, magA);
	}

	if (aNeg && bNeg) {
		// (-magA) - (-magB) = magB - magA
		return magB >= magA ? subMag(magB, magA) : -subMag(magA, magB);
	}

	if (!aNeg && bNeg) {
		// (+magA) - (-magB) = +(magA + magB)
		return addMag(magA, magB);
	}

	// (-magA) - (+magB) = -(magA + magB)
	return -addMag(magA, magB);
}
