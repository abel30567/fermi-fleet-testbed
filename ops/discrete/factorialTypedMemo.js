/**
 * Maximum non-negative integer whose factorial is finite in IEEE-754 binary64
 * (`170! ≈ 7.257415615307999e+306`, while `171!` overflows to `Infinity`).
 */
const MAX_FINITE_FACTORIAL = 170;

/**
 * Memoized lookup table of exact IEEE-754 binary64 factorials for `0..170`.
 * Populated lazily via BigInt arithmetic so every entry is correctly rounded.
 * @type {Float64Array}
 */
const FACTORIAL_TABLE = new Float64Array(MAX_FINITE_FACTORIAL + 1);
FACTORIAL_TABLE[0] = 1;
FACTORIAL_TABLE[1] = 1;

let computedUpTo = 1;
let lastExactBigInt = 1n;

/**
 * Ensures the memoized table is populated through `target` (clamped to `170`).
 *
 * @param {number} target - Non-negative integer upper bound to memoize.
 */
function ensureMemoized(target) {
	const limit = target > MAX_FINITE_FACTORIAL ? MAX_FINITE_FACTORIAL : target;
	for (let k = computedUpTo + 1; k <= limit; k++) {
		lastExactBigInt *= BigInt(k);
		FACTORIAL_TABLE[k] = Number(lastExactBigInt);
	}
	if (limit > computedUpTo) {
		computedUpTo = limit;
	}
}

/**
 * Computes the discrete factorial (`n!`) element-wise over a `Float64Array`
 * using a memoized lookup table of correctly rounded IEEE-754 double values.
 *
 * For integer inputs `0 <= n <= 170`, the exact IEEE-754 double representation
 * of `n!` is returned from the memoized table. For valid integer inputs
 * `n > 170`, `Infinity` is returned (standard IEEE-754 overflow).
 *
 * @param {Float64Array} input - Typed array of non-negative integer values.
 * @returns {Float64Array} New `Float64Array` containing `n!` for each element.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element is negative, non-integer, `NaN`, or non-finite.
 */
export function factorialTypedMemo(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError(
			`factorialTypedMemo expected a Float64Array, got ${input === null ? 'null' : typeof input === 'object' ? input.constructor?.name ?? 'Object' : typeof input}`,
		);
	}

	const len = input.length;
	const out = new Float64Array(len);

	for (let i = 0; i < len; i++) {
		const n = input[i];
		if (!Number.isInteger(n) || n < 0) {
			throw new RangeError(
				`factorialTypedMemo expected a non-negative integer at index ${i}, got ${n}`,
			);
		}
		if (n > MAX_FINITE_FACTORIAL) {
			out[i] = Infinity;
		} else {
			if (n > computedUpTo) {
				ensureMemoized(n);
			}
			out[i] = FACTORIAL_TABLE[n];
		}
	}

	return out;
}
