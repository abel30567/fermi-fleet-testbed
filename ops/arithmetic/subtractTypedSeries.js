/**
 * Element-wise arithmetic subtraction over two or more {@link Float64Array}
 * series using Knuth's error-free TwoDiff compensated difference identity.
 *
 * For each index `i`, this computes `a[i] - b[i] - c[i] - ...` by applying the
 * exact real-arithmetic identity
 *
 *   x - y = s + e,   s = fl(x - y),   v = fl(s - x),   e = fl((x - fl(s - v)) - (y + v))
 *
 * at every subtraction step and accumulating the rounding residuals `e` into a
 * running compensation term. For two inputs this reproduces IEEE-754 exact
 * rounding (including signed zeros and non-finite values); for three or more
 * inputs it preserves low-order bits that naive left-to-right subtraction loses
 * to catastrophic cancellation.
 *
 * @module ops/arithmetic/subtractTypedSeries
 */

/**
 * Validates that a value is a non-detached {@link Float64Array}.
 *
 * @param {unknown} value - Candidate input series.
 * @param {string} label - Descriptive parameter name for error reporting.
 * @returns {Float64Array} The validated {@link Float64Array}.
 * @throws {TypeError} If `value` is not a {@link Float64Array} or its buffer is detached.
 */
function assertFloat64Array(value, label) {
	if (!(value instanceof Float64Array)) {
		throw new TypeError(`Expected ${label} to be a Float64Array`);
	}
	if (value.buffer.detached === true) {
		throw new TypeError(`Expected ${label} not to have a detached ArrayBuffer`);
	}
	return value;
}

/**
 * Computes the element-wise difference of two or more equal-length
 * {@link Float64Array} inputs using compensated TwoDiff identities.
 *
 * Returns a newly allocated {@link Float64Array} without mutating any input.
 *
 * @param {Float64Array} minuend - Base series (`a`).
 * @param {Float64Array} subtrahend - First series to subtract (`b`).
 * @param {...Float64Array} rest - Optional additional series to subtract in sequence.
 * @returns {Float64Array} New {@link Float64Array} containing element-wise compensated differences.
 * @throws {TypeError} If any argument is not a valid non-detached {@link Float64Array}.
 * @throws {RangeError} If any input {@link Float64Array} has a length different from `minuend`.
 */
export function subtractTypedSeries(minuend, subtrahend, ...rest) {
	assertFloat64Array(minuend, "minuend");
	assertFloat64Array(subtrahend, "subtrahend");

	const length = minuend.length;
	if (subtrahend.length !== length) {
		throw new RangeError(
			`Length mismatch for subtrahend: expected ${length}, received ${subtrahend.length}`,
		);
	}

	const extraCount = rest.length;
	for (let k = 0; k < extraCount; k++) {
		const series = assertFloat64Array(rest[k], `argument at index ${k + 2}`);
		if (series.length !== length) {
			throw new RangeError(
				`Length mismatch for argument at index ${k + 2}: expected ${length}, received ${series.length}`,
			);
		}
	}

	const result = new Float64Array(length);

	// Fast path for the common 2-series case using Knuth's TwoDiff identity.
	if (extraCount === 0) {
		for (let i = 0; i < length; i++) {
			const x = minuend[i];
			const y = subtrahend[i];
			const s = x - y;
			if (Number.isFinite(s) && Number.isFinite(x) && Number.isFinite(y)) {
				const v = s - x;
				const err = (x - (s - v)) - (y + v);
				result[i] = Number.isFinite(err) && err !== 0 ? s + err : s;
			} else {
				result[i] = s;
			}
		}
		return result;
	}

	// General path for 3+ series: apply Knuth's TwoDiff iteratively and
	// accumulate rounding residuals to mitigate catastrophic cancellation.
	for (let i = 0; i < length; i++) {
		let s = minuend[i];
		let comp = 0;

		// Step 1: subtract `subtrahend[i]`
		{
			const y = subtrahend[i];
			const next = s - y;
			if (Number.isFinite(next) && Number.isFinite(s) && Number.isFinite(y)) {
				const v = next - s;
				const err = (s - (next - v)) - (y + v);
				if (Number.isFinite(err)) {
					comp += err;
				}
			} else if (!Number.isFinite(next)) {
				comp = 0;
			}
			s = next;
		}

		// Remaining subtrahends in `rest`
		for (let k = 0; k < extraCount; k++) {
			const y = rest[k][i];
			const next = s - y;
			if (Number.isFinite(next) && Number.isFinite(s) && Number.isFinite(y)) {
				const v = next - s;
				const err = (s - (next - v)) - (y + v);
				if (Number.isFinite(err)) {
					comp += err;
				}
			} else if (!Number.isFinite(next)) {
				comp = 0;
			}
			s = next;
		}

		result[i] = comp !== 0 ? s + comp : s;
	}

	return result;
}
