const LIMB_BITS = 32n
const LIMB_BASE = 1n << LIMB_BITS
const LIMB_MASK = LIMB_BASE - 1n

/**
 * Iteratively subtracts two non-negative BigInt magnitudes (`hi >= lo`).
 *
 * @param {bigint} hi - Non-negative minuend magnitude (`hi >= lo`).
 * @param {bigint} lo - Non-negative subtrahend magnitude.
 * @returns {bigint} Exact difference `hi - lo`.
 */
function subtractMagnitudesIterative(hi, lo) {
	let result = 0n
	let borrow = 0n
	let shift = 0n
	let x = hi
	let y = lo

	while (x > 0n || y > 0n) {
		const lx = x & LIMB_MASK
		const ly = y & LIMB_MASK
		let diff = lx - ly - borrow
		if (diff < 0n) {
			diff += LIMB_BASE
			borrow = 1n
		} else {
			borrow = 0n
		}
		result |= diff << shift
		x >>= LIMB_BITS
		y >>= LIMB_BITS
		shift += LIMB_BITS
	}

	return result
}

/**
 * Iteratively adds two non-negative BigInt magnitudes.
 *
 * @param {bigint} left - First non-negative magnitude.
 * @param {bigint} right - Second non-negative magnitude.
 * @returns {bigint} Exact sum `left + right`.
 */
function addMagnitudesIterative(left, right) {
	let result = 0n
	let carry = 0n
	let shift = 0n
	let x = left
	let y = right

	while (x > 0n || y > 0n || carry > 0n) {
		const lx = x & LIMB_MASK
		const ly = y & LIMB_MASK
		let sum = lx + ly + carry
		if (sum >= LIMB_BASE) {
			sum -= LIMB_BASE
			carry = 1n
		} else {
			carry = 0n
		}
		result |= sum << shift
		x >>= LIMB_BITS
		y >>= LIMB_BITS
		shift += LIMB_BITS
	}

	return result
}

/**
 * Computes the exact arithmetic difference `a - b` over `BigInt` integers
 * (including fixed-point `BigInt` values scaled by `10^18`) using a
 * straightforward iterative 32-bit limb-by-limb algorithm with explicit borrow
 * and carry propagation.
 *
 * @param {bigint} a - The minuend (exact BigInt).
 * @param {bigint} b - The subtrahend (exact BigInt).
 * @returns {bigint} The exact BigInt difference `a - b`.
 * @throws {TypeError} If either `a` or `b` is not a `bigint`.
 */
export function subtractBigIntIterative(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected bigint for argument "a", received ${typeof a}`)
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected bigint for argument "b", received ${typeof b}`)
	}

	const aNeg = a < 0n
	const bNeg = b < 0n
	const absA = aNeg ? -a : a
	const absB = bNeg ? -b : b

	if (aNeg === bNeg) {
		if (absA === absB) {
			return 0n
		}
		if (absA > absB) {
			const mag = subtractMagnitudesIterative(absA, absB)
			return aNeg ? -mag : mag
		}
		const mag = subtractMagnitudesIterative(absB, absA)
		return aNeg ? mag : -mag
	}

	const mag = addMagnitudesIterative(absA, absB)
	return aNeg ? -mag : mag
}
