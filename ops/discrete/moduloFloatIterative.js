const HALF_MAX_VALUE = Number.MAX_VALUE / 2

/**
 * Computes the discrete (floored) modulo `a mod b` over IEEE-754 float64
 * numbers using a straightforward iterative binary shift-and-subtract
 * reduction.
 *
 * For any finite `a` and finite non-zero `b`, the result `r` satisfies:
 * - `0 <= r < b` when `b > 0`
 * - `b < r <= 0` when `b < 0`
 * - `r` is never `-0` (zero is always returned as `+0`)
 *
 * The magnitude remainder is computed iteratively by scaling `|b|` upward by
 * powers of two up to `|a|` and then iteratively subtracting and halving back
 * down to `|b|`. Each subtraction satisfies `scaled <= r < 2 * scaled`, which
 * is exact in IEEE-754 arithmetic by Sterbenz's lemma and completes in
 * `O(log(|a| / |b|))` iterations without floating-point accumulation drift.
 *
 * @param {number} a - Finite IEEE-754 float64 dividend.
 * @param {number} b - Finite non-zero IEEE-754 float64 modulus (divisor).
 * @returns {number} The discrete (floored) modulo of `a` with respect to `b`.
 * @throws {TypeError} If `a` or `b` is not a number.
 * @throws {RangeError} If `a` or `b` is not finite (`NaN`, `±Infinity`), or if `b === 0`.
 */
export function moduloFloatIterative(a, b) {
	if (typeof a !== 'number' || typeof b !== 'number') {
		throw new TypeError('Both a and b must be numbers')
	}
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		throw new RangeError('Both a and b must be finite numbers')
	}
	if (b === 0) {
		throw new RangeError('Modulus b must be non-zero')
	}

	let r = Math.abs(a)
	const absB = Math.abs(b)

	if (r >= absB) {
		let scaled = absB
		let steps = 0

		while (scaled <= HALF_MAX_VALUE && scaled * 2 <= r) {
			scaled *= 2
			steps += 1
		}

		for (let i = steps; i >= 0; i -= 1) {
			if (r >= scaled) {
				r -= scaled
				if (r < absB) {
					break
				}
			}
			if (i > 0) {
				scaled /= 2
			}
		}
	}

	if (r === 0) {
		return 0
	}

	if (a < 0) {
		if (b > 0) {
			const result = b - r
			return result === b ? 0 : result
		}
		return -r
	}

	if (b < 0) {
		const result = b + r
		return result === b ? 0 : result
	}

	return r
}
