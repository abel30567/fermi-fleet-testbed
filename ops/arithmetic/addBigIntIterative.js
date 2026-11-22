const LIMB_BITS = 64n
const LIMB_BASE = 1n << LIMB_BITS
const LIMB_MASK = LIMB_BASE - 1n

/**
 * Iteratively adds two non-negative BigInt magnitudes using 64-bit limb
 * arithmetic with explicit carry propagation.
 *
 * @param {bigint} u - First non-negative magnitude.
 * @param {bigint} v - Second non-negative magnitude.
 * @returns {bigint} Exact sum `u + v`.
 */
function addMagnitudesIterative(u, v) {
	let result = 0n
	let carry = 0n
	let shift = 0n

	while (u > 0n || v > 0n || carry > 0n) {
		const limbSum = (u & LIMB_MASK) + (v & LIMB_MASK) + carry
		result |= (limbSum & LIMB_MASK) << shift
		carry = limbSum >> LIMB_BITS
		u >>= LIMB_BITS
		v >>= LIMB_BITS
		shift += LIMB_BITS
	}

	return result
}

/**
 * Iteratively subtracts two non-negative BigInt magnitudes (`u >= v`) using
 * 64-bit limb arithmetic with explicit borrow propagation.
 *
 * @param {bigint} u - Minuend magnitude (`u >= v >= 0n`).
 * @param {bigint} v - Subtrahend magnitude (`0n <= v <= u`).
 * @returns {bigint} Exact difference `u - v`.
 */
function subMagnitudesIterative(u, v) {
	let result = 0n
	let borrow = 0n
	let shift = 0n

	while (u > 0n || v > 0n) {
		let limbDiff = (u & LIMB_MASK) - (v & LIMB_MASK) - borrow
		if (limbDiff < 0n) {
			limbDiff += LIMB_BASE
			borrow = 1n
		} else {
			borrow = 0n
		}
		result |= limbDiff << shift
		u >>= LIMB_BITS
		v >>= LIMB_BITS
		shift += LIMB_BITS
	}

	return result
}

/**
 * Iteratively adds two signed BigInt values by dispatching on their signs and
 * performing 64-bit limb-by-limb carry or borrow propagation.
 *
 * @param {bigint} a - First signed BigInt operand.
 * @param {bigint} b - Second signed BigInt operand.
 * @returns {bigint} Exact sum of `a` and `b`.
 */
function addPairIterative(a, b) {
	if (a === 0n) return b
	if (b === 0n) return a

	if (a > 0n && b > 0n) {
		return addMagnitudesIterative(a, b)
	}
	if (a < 0n && b < 0n) {
		return -addMagnitudesIterative(-a, -b)
	}

	const absA = a < 0n ? -a : a
	const absB = b < 0n ? -b : b

	if (absA === absB) return 0n
	if (absA > absB) {
		const diff = subMagnitudesIterative(absA, absB)
		return a < 0n ? -diff : diff
	}

	const diff = subMagnitudesIterative(absB, absA)
	return b < 0n ? -diff : diff
}

/**
 * Adds two or more exact BigInt integers using a straightforward iterative
 * 64-bit limb-carry / limb-borrow implementation.
 *
 * Works identically for unscaled exact integers and fixed-point BigInt values
 * scaled by `10^18` (since addition preserves scale without introducing
 * non-integer results).
 *
 * @param {bigint} a - First BigInt addend.
 * @param {bigint} b - Second BigInt addend.
 * @param {...bigint} rest - Optional additional BigInt addends.
 * @returns {bigint} The exact BigInt sum of all operands.
 * @throws {TypeError} If fewer than two arguments are provided or any argument
 *   is not a primitive `bigint`.
 */
export function addBigIntIterative(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			`addBigIntIterative requires at least 2 BigInt arguments, received ${arguments.length}`
		)
	}

	const operands = [a, b, ...rest]
	for (let i = 0; i < operands.length; i++) {
		if (typeof operands[i] !== 'bigint') {
			const actual = operands[i] === null ? 'null' : typeof operands[i]
			throw new TypeError(
				`Expected argument at index ${i} to be a BigInt, received ${actual}`
			)
		}
	}

	let total = addPairIterative(operands[0], operands[1])
	for (let i = 2; i < operands.length; i++) {
		total = addPairIterative(total, operands[i])
	}

	return total
}
