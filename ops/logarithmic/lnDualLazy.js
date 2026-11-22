/**
 * Validates that an element is a well-formed dual number `{ v, d }`
 * within the strict real domain of the natural logarithm (`v > 0`).
 *
 * @param {unknown} item
 * @returns {{ v: number, d: number }}
 * @throws {TypeError} If `item` is not a non-null non-array object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is non-finite (`NaN`, `±Infinity`), or if `v <= 0` (logarithmic domain singularity).
 */
function validateDualForLn(item) {
	if (item === null || typeof item !== 'object' || Array.isArray(item)) {
		throw new TypeError(
			'lnDualLazy: each element must be a dual number object of shape { v, d }'
		);
	}

	const { v, d } = item;

	if (typeof v !== 'number') {
		throw new TypeError(
			`lnDualLazy: dual.v must be a number, got ${typeof v}`
		);
	}
	if (typeof d !== 'number') {
		throw new TypeError(
			`lnDualLazy: dual.d must be a number, got ${typeof d}`
		);
	}
	if (!Number.isFinite(v)) {
		throw new RangeError(
			`lnDualLazy: dual.v must be a finite number, got ${v}`
		);
	}
	if (!Number.isFinite(d)) {
		throw new RangeError(
			`lnDualLazy: dual.d must be a finite number, got ${d}`
		);
	}
	if (v <= 0) {
		throw new RangeError(
			`lnDualLazy: dual.v must be strictly positive (> 0) for ln; got ${v}`
		);
	}

	return { v, d };
}

/**
 * Computes the forward-mode natural logarithm of a single validated dual number.
 *
 * For `x = v + d*ε` (`ε² = 0`), `ln(v + d*ε) = ln(v) + (d / v)*ε`.
 *
 * @param {{ v: number, d: number }} dual
 * @returns {{ v: number, d: number }}
 */
function lnDualScalar(dual) {
	const { v, d } = validateDualForLn(dual);
	const value = Math.log(v);
	const derivative = d / v;
	return {
		v: value === 0 ? 0 : value,
		d: derivative === 0 ? 0 : derivative,
	};
}

/**
 * Lazily computes the natural logarithm (`ln`) over an iterable sequence of
 * forward-mode dual numbers `{ v, d }`, where `v` is the primal value and `d`
 * is the first-order derivative (tangent).
 *
 * For each element `{ v, d }` pulled from `source`, yields:
 * `{ v: Math.log(v), d: d / v }`.
 *
 * Inputs are consumed strictly on demand via a generator without eagerly
 * materializing `source`, so single-pass iterators and infinite streams are
 * supported. Closing the returned generator early (e.g. via `break` or
 * `.return()`) propagates iterator cleanup to `source`.
 *
 * @param {Iterable<{ v: number, d: number }>} source - An iterable sequence of dual numbers `{ v, d }` with finite `v > 0` and finite `d`.
 * @returns {Generator<{ v: number, d: number }, void, unknown>} A lazy generator yielding dual numbers `{ v, d }`.
 * @throws {TypeError} Immediately if `source` is not a non-string iterable; lazily during iteration if any element is not a `{ v, d }` object with numeric `v` and `d`.
 * @throws {RangeError} Lazily during iteration if any element has non-finite `v` or `d`, or `v <= 0` (logarithmic domain boundary / singularity).
 */
export function lnDualLazy(source) {
	if (
		source === null ||
		(typeof source !== 'object' && typeof source !== 'function') ||
		typeof source[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'lnDualLazy: source must be a non-string iterable of dual numbers { v, d }'
		);
	}

	return (function* () {
		for (const item of source) {
			yield lnDualScalar(item);
		}
	})();
}
