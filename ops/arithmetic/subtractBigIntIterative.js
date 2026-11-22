/**
 * @fileoverview Exact BigInt subtraction using an iterative base-2^64 limb algorithm.
 *
 * Operates directly on arbitrary-precision signed BigInt integers, including
 * fixed-point BigInt values scaled by 10^18 (subtraction preserves fixed-point
 * scaling without re-scaling).
 */

const LIMB_BITS = 64n
const LIMB_BASE = 1n << LIMB_BITS
const LIMB_MASK = LIMB_BASE - 1n

/**
 * Iteratively subtracts two non-negative BigInt magnitudes (`u >= v >= 0n`)
 * using base-2^64 limb-by-limb borrow propagation.
 *
 * @param {bigint} u - Non-negative minuend magnitude (`u >= v`).
 * @param {bigint} v - Non-negative subtrahend magnitude (`0n <= v <= u`).
 * @returns {bigint} Exact non-negative difference `u - v`.
 */
function subtractMagnitudesIterative(u, v) {
	let result = 0n
	let borrow = 0n
	let shift = 0n
	let remU = u
	let remV = v

	while (remU > 0n || remV > 0n) {
		const limbU = remU & LIMB_MASK
		const limbV = remV & LIMB_MASK
		let diff = limbU - limbV - borrow

		if (diff < 0n) {
			diff += LIMB_BASE
			borrow = 1n
		} else {
			borrow = 0n
		}

		result |= diff << shift
		remU >>= LIMB_BITS
		remV >>= LIMB_BITS
		shift += LIMB_BITS
	}

	return result
}

/**
 * Iteratively adds two non-negative BigInt magnitudes (`u >= 0n, v >= 0n`)
 * using base-2^64 limb-by-limb carry propagation.
 *
 * @param {bigint} u - First non-negative magnitude.
 * @param {bigint} v - Second non-negative magnitude.
 * @returns {bigint} Exact non-negative sum `u + v`.
 */
function addMagnitudesIterative(u, v) {
	let result = 0n
	let carry = 0n
	let shift = 0n
	let remU = u
	let remV = v

	while (remU > 0n || remV > 0n || carry > 0n) {
		const limbU = remU & LIMB_MASK
		const limbV = remV & LIMB_MASK
		const sum = limbU + limbV + carry
		const limb = sum & LIMB_MASK
		carry = sum >> LIMB_BITS

		result |= limb << shift
		remU >>= LIMB_BITS
		remV >>= LIMB_BITS
		shift += LIMB_BITS
	}

	return result
}

/**
 * Computes the exact difference `a - b` of two arbitrary-precision BigInt
 * integers using a straightforward iterative base-2^64 limb algorithm.
 *
 * Also supports fixed-point BigInt values scaled by `10n ** 18n` directly,
 * since `(x * 10^18) - (y * 10^18) === (x - y) * 10^18`.
 *
 * @param {bigint} a - The minuend (must be a `bigint`).
 * @param {bigint} b - The subtrahend (must be a `bigint`).
 * @returns {bigint} The exact BigInt difference `a - b`.
 * @throws {TypeError} If `a` or `b` is not of type `bigint`.
 *
 * @example
 * subtractBigIntIterative(10n, 3n) // => 7n
 * subtractBigIntIterative(3n, 10n) // => -7n
 * subtractBigIntIterative(-5n, -8n) // => 3n
 */
export function subtractBigIntIterative(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected first argument "a" to be a bigint, got ${typeof a}`)
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected second argument "b" to be a bigint, got ${typeof b}`)
	}

	if (b === 0n) {
		return a
	}
	if (a === b) {
		return 0n
	}
	if (a === 0n) {
		return -b
	}

	const aNeg = a < 0n
	const bNeg = b < 0n
	const absA = aNeg ? -a : a
	const absB = bNeg ? -b : b

	if (aNeg === bNeg) {
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
