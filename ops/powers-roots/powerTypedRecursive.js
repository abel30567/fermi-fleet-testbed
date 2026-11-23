/**
 * Recursively computes element-wise exponentiation over `[start, end)` using
 * divide-and-conquer and writes results into `out`.
 *
 * @param {Float64Array} bases - Input base values.
 * @param {Float64Array} exponents - Input exponent values (same length as `bases`).
 * @param {Float64Array} out - Preallocated output buffer.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 */
function powRangeTyped(bases, exponents, out, start, end) {
	if (end - start === 1) {
		out[start] = Math.pow(bases[start], exponents[start]);
		return;
	}
	const mid = start + ((end - start) >>> 1);
	powRangeTyped(bases, exponents, out, start, mid);
	powRangeTyped(bases, exponents, out, mid, end);
}

/**
 * Recursively computes element-wise exponentiation with a scalar exponent over
 * `[start, end)` using divide-and-conquer and writes results into `out`.
 *
 * @param {Float64Array} bases - Input base values.
 * @param {number} exponent - Scalar exponent applied to every base.
 * @param {Float64Array} out - Preallocated output buffer.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 */
function powRangeScalar(bases, exponent, out, start, end) {
	if (end - start === 1) {
		out[start] = Math.pow(bases[start], exponent);
		return;
	}
	const mid = start + ((end - start) >>> 1);
	powRangeScalar(bases, exponent, out, start, mid);
	powRangeScalar(bases, exponent, out, mid, end);
}

/**
 * Computes element-wise exponentiation (`bases[i] ** exponents[i]`) over
 * `Float64Array` inputs using a recursive divide-and-conquer traversal.
 *
 * Also supports a scalar numeric exponent, in which case `bases[i] ** exponents`
 * is computed for every element of `bases`. Input arrays are never mutated.
 *
 * @param {Float64Array} bases - Base values.
 * @param {Float64Array | number} exponents - Element-wise exponents (same length as `bases`) or a scalar number.
 * @returns {Float64Array} A new `Float64Array` containing the element-wise powers.
 * @throws {TypeError} If `bases` is not a `Float64Array`, or `exponents` is neither a `Float64Array` nor a number.
 * @throws {RangeError} If `exponents` is a `Float64Array` whose length differs from `bases.length`.
 */
export function powerTypedRecursive(bases, exponents) {
	if (!(bases instanceof Float64Array)) {
		throw new TypeError('Expected "bases" to be a Float64Array');
	}

	const isTypedExp = exponents instanceof Float64Array;
	const isScalarExp = typeof exponents === 'number';

	if (!isTypedExp && !isScalarExp) {
		throw new TypeError('Expected "exponents" to be a Float64Array or a number');
	}

	const len = bases.length;
	if (isTypedExp && exponents.length !== len) {
		throw new RangeError(
			`Length mismatch: bases has length ${len}, but exponents has length ${exponents.length}`
		);
	}

	const out = new Float64Array(len);
	if (len === 0) {
		return out;
	}

	if (isTypedExp) {
		powRangeTyped(bases, exponents, out, 0, len);
	} else {
		powRangeScalar(bases, exponents, out, 0, len);
	}

	return out;
}
