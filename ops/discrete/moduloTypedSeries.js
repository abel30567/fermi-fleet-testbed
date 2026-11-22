// Veltkamp splitting factor 2^27 + 1 for error-free float64 multiplication (Dekker's TwoProd)
const SPLIT = 134217729;
// Safe magnitude bound so SPLIT * x does not overflow float64 (~6.7e299)
const SPLIT_BOUND = 1e150;

/**
 * Computes the element-wise discrete (floored) modulo over two Float64Array inputs
 * using the closed-form Knuth floored-division identity with error-free product
 * compensation (Dekker's TwoProd):
 *
 *   r[i] = a[i] - b[i] * floor(a[i] / b[i])
 *
 * For positive divisors `b[i] > 0`, the result lies in `[0, b[i])`.
 * For negative divisors `b[i] < 0`, the result lies in `(b[i], 0]`.
 * Zero results are normalized to `+0` (never `-0`).
 *
 * Neither input array is mutated; a new `Float64Array` of the same length is returned.
 *
 * @param {Float64Array} dividends - Input array of finite dividend values.
 * @param {Float64Array} divisors - Input array of finite, non-zero divisor values (same length as `dividends`).
 * @returns {Float64Array} A new `Float64Array` containing the element-wise discrete modulo results.
 * @throws {TypeError} If `dividends` or `divisors` is not a `Float64Array`.
 * @throws {RangeError} If the arrays differ in length, contain non-finite values (`NaN`, `±Infinity`), or contain a zero divisor.
 */
export function moduloTypedSeries(dividends, divisors) {
	if (!(dividends instanceof Float64Array)) {
		throw new TypeError('dividends must be a Float64Array');
	}
	if (!(divisors instanceof Float64Array)) {
		throw new TypeError('divisors must be a Float64Array');
	}
	if (dividends.length !== divisors.length) {
		throw new RangeError(
			`Input Float64Arrays must have the same length (received ${dividends.length} and ${divisors.length})`
		);
	}

	const n = dividends.length;
	const result = new Float64Array(n);

	for (let i = 0; i < n; i++) {
		const a = dividends[i];
		const b = divisors[i];

		if (!Number.isFinite(a)) {
			throw new RangeError(`dividends[${i}] must be a finite number (received ${a})`);
		}
		if (!Number.isFinite(b)) {
			throw new RangeError(`divisors[${i}] must be a finite number (received ${b})`);
		}
		if (b === 0) {
			throw new RangeError(`divisors[${i}] must be non-zero (modulo by zero)`);
		}

		const qRaw = a / b;
		const q = Math.floor(qRaw);
		let r;

		if (
			Number.isFinite(q) &&
			Math.abs(b) <= SPLIT_BOUND &&
			Math.abs(q) <= SPLIT_BOUND &&
			Math.abs(b) >= 1e-150
		) {
			// Closed-form Knuth floored-division identity with Dekker's TwoProd for exact b * q
			const p = b * q;
			const cb = SPLIT * b;
			const bHi = cb - (cb - b);
			const bLo = b - bHi;
			const cq = SPLIT * q;
			const qHi = cq - (cq - q);
			const qLo = q - qHi;
			const err = ((bHi * qHi - p) + bHi * qLo + bLo * qHi) + bLo * qLo;

			r = (a - p) - err;

			// Correct for ±1 quotient rounding when a / b sits within 0.5 ULP of an integer
			if (b > 0) {
				if (r < 0) r += b;
				else if (r >= b) r -= b;
			} else {
				if (r > 0) r += b;
				else if (r <= b) r -= b;
			}
		} else {
			// Extreme-magnitude fallback avoiding overflow/underflow in TwoProd
			r = a % b;
			if (r !== 0 && (r < 0) !== (b < 0)) {
				r += b;
			}
		}

		// Guard against IEEE-754 rounding to exact divisor boundary (e.g., a = -1e-17, b = 1)
		if (r === b) {
			r = 0;
		}

		// Normalize -0 to +0
		result[i] = r === 0 ? 0 : r;
	}

	return result;
}
