/**
 * Computes the base-2 logarithm (log2) of an IEEE-754 float64 number using a
 * straightforward iterative shift-and-square algorithm.
 *
 * Algorithm:
 * 1. Validate that the input is a primitive `number` and handle IEEE-754
 *    special values (`NaN`, negative numbers, `±0`, `+Infinity`, and `1`).
 * 2. Iteratively scale `x` by exact factors of `2` or `0.5` into the interval
 *    `[sqrt(1/2), sqrt(2))`, accumulating the integer exponent `k` such that
 *    `x = m * 2^k`. Centering around `1` prevents catastrophic cancellation
 *    when `k + frac` is combined for inputs near `1`.
 * 3. Write `m = 1 + t` (exact by Sterbenz's lemma) and iteratively square
 *    `1 + t` via `t <- 2*t + t*t`, emitting signed binary fraction weights
 *    `2^-1, 2^-2, ...` whenever `1 + t` crosses `2` (for `t > 0`) or `0.5`
 *    (for `t < 0`) until the remaining weight falls below float64 precision.
 *
 * @param {number} x - The IEEE-754 float64 input value.
 * @returns {number} The base-2 logarithm of `x`:
 *   - `NaN` if `x` is `NaN` or `x < 0`
 *   - `-Infinity` if `x` is `+0` or `-0`
 *   - `+Infinity` if `x` is `+Infinity`
 *   - `+0` if `x === 1`
 *   - finite `log2(x)` for `0 < x < Infinity`
 * @throws {TypeError} If `x` is not a primitive `number`.
 */
export function log2FloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, got ${x === null ? 'null' : typeof x}`)
	}

	if (Number.isNaN(x) || x < 0) {
		return Number.NaN
	}
	if (x === 0) {
		return -Infinity
	}
	if (x === Infinity) {
		return Infinity
	}
	if (x === 1) {
		return 0
	}

	// Step 1: Range reduction into [Math.SQRT1_2, Math.SQRT2) using exact power-of-2 scaling.
	let k = 0
	let m = x
	while (m >= Math.SQRT2) {
		m *= 0.5
		k += 1
	}
	while (m < Math.SQRT1_2) {
		m *= 2
		k -= 1
	}

	// Exact powers of two land cleanly on m === 1.
	let t = m - 1
	if (t === 0) {
		return k
	}

	// Step 2: Iterative shift-and-square on t = m - 1 to extract fractional bits.
	let frac = 0
	let weight = 0.5

	if (t > 0) {
		while (weight > 0 && t > 0) {
			t = 2 * t + t * t
			if (t >= 1) {
				frac += weight
				t = (t - 1) * 0.5
			}
			if (frac !== 0 && frac + weight === frac) {
				break
			}
			weight *= 0.5
		}
	} else {
		while (weight > 0 && t < 0) {
			t = 2 * t + t * t
			if (t <= -0.5) {
				frac -= weight
				t = 2 * t + 1
			}
			if (frac !== 0 && frac - weight === frac) {
				break
			}
			weight *= 0.5
		}
	}

	return k + frac
}
