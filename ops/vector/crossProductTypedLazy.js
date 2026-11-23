/**
 * Computes the 3D vector cross product lazily over `Float64Array` inputs.
 *
 * Accepts either:
 * - Two single 3D `Float64Array` vectors `(a, b)`, yielding a single 3D `Float64Array`
 *   containing `a × b`.
 * - Two iterables (sequences/generators) of 3D `Float64Array` vectors `(a, b)`, lazily
 *   consuming one pair at a time and yielding a new 3D `Float64Array` for each pair.
 *
 * Top-level arguments are validated eagerly; elements of iterable sequences are validated
 * lazily as they are consumed. Underlying iterators are properly closed via `.return()`
 * on early termination or error.
 *
 * @param {Float64Array | Iterable<Float64Array>} a - First 3D `Float64Array` vector or iterable of 3D `Float64Array` vectors.
 * @param {Float64Array | Iterable<Float64Array>} b - Second 3D `Float64Array` vector or iterable of 3D `Float64Array` vectors.
 * @returns {Generator<Float64Array, void, undefined>} Lazy generator yielding 3D `Float64Array` cross product vectors.
 * @throws {TypeError} If inputs are not `Float64Array` or iterables of `Float64Array`, or if input shapes are mismatched (single vector vs iterable).
 * @throws {RangeError} If any `Float64Array` does not have length 3, contains non-finite values (`NaN`, `Infinity`, `-Infinity`), or if finite input iterables have different lengths.
 */
export function crossProductTypedLazy(a, b) {
	const aIsF64 = a instanceof Float64Array;
	const bIsF64 = b instanceof Float64Array;

	if (aIsF64 && bIsF64) {
		validateVec3(a, 'a');
		validateVec3(b, 'b');
		return singleCrossProduct(a, b);
	}

	if (aIsF64 !== bIsF64) {
		throw new TypeError(
			'Both inputs must either be 3D Float64Array vectors or iterables of 3D Float64Array vectors'
		);
	}

	validateSequence(a, 'a');
	validateSequence(b, 'b');

	return streamCrossProducts(a, b);
}

/**
 * Validates that a value is a 3D `Float64Array` with finite numeric components.
 *
 * @param {unknown} vec - Candidate vector.
 * @param {string} name - Parameter name for error messages.
 * @returns {Float64Array} The validated 3D `Float64Array`.
 */
function validateVec3(vec, name) {
	if (!(vec instanceof Float64Array)) {
		throw new TypeError(`Expected ${name} element to be a Float64Array`);
	}
	if (vec.length !== 3) {
		throw new RangeError(
			`Expected ${name} to be a 3D Float64Array (length 3), got length ${vec.length}`
		);
	}
	if (
		!Number.isFinite(vec[0]) ||
		!Number.isFinite(vec[1]) ||
		!Number.isFinite(vec[2])
	) {
		throw new RangeError(
			`Expected ${name} to contain only finite numbers`
		);
	}
	return vec;
}

/**
 * Validates that a top-level argument is an iterable sequence (and not a string or non-Float64Array view).
 *
 * @param {unknown} seq - Candidate iterable.
 * @param {string} name - Parameter name for error messages.
 */
function validateSequence(seq, name) {
	if (seq === null || seq === undefined) {
		throw new TypeError(
			`Expected ${name} to be a Float64Array or an iterable of Float64Array vectors`
		);
	}
	if (typeof seq === 'string' || seq instanceof String) {
		throw new TypeError(
			`Expected ${name} to be a Float64Array or an iterable of Float64Array vectors, got string`
		);
	}
	if (ArrayBuffer.isView(seq)) {
		throw new TypeError(
			`Expected ${name} to be a Float64Array or an iterable of Float64Array vectors, got ${seq.constructor.name}`
		);
	}
	if (typeof seq[Symbol.iterator] !== 'function') {
		throw new TypeError(
			`Expected ${name} to be a Float64Array or an iterable of Float64Array vectors`
		);
	}
}

/**
 * Computes the 3D cross product `u × v`, normalizing `-0` components to `+0`.
 *
 * @param {Float64Array} u - Validated 3D `Float64Array`.
 * @param {Float64Array} v - Validated 3D `Float64Array`.
 * @returns {Float64Array} New 3D `Float64Array` equal to `u × v`.
 */
function computeCross(u, v) {
	const x = u[1] * v[2] - u[2] * v[1];
	const y = u[2] * v[0] - u[0] * v[2];
	const z = u[0] * v[1] - u[1] * v[0];
	return new Float64Array([x + 0, y + 0, z + 0]);
}

/**
 * Generator yielding the cross product of a single validated 3D `Float64Array` pair.
 *
 * @param {Float64Array} u - First 3D vector.
 * @param {Float64Array} v - Second 3D vector.
 * @returns {Generator<Float64Array, void, undefined>}
 */
function* singleCrossProduct(u, v) {
	yield computeCross(u, v);
}

/**
 * Streaming generator that lazily pulls pairs of 3D `Float64Array` vectors from two
 * iterables and yields each cross product.
 *
 * @param {Iterable<Float64Array>} a - First iterable of 3D `Float64Array` vectors.
 * @param {Iterable<Float64Array>} b - Second iterable of 3D `Float64Array` vectors.
 * @returns {Generator<Float64Array, void, undefined>}
 */
function* streamCrossProducts(a, b) {
	let iterA;
	let iterB;
	let doneA = true;
	let doneB = true;

	try {
		iterA = a[Symbol.iterator]();
		doneA = false;
		iterB = b[Symbol.iterator]();
		doneB = false;

		while (true) {
			const nextA = iterA.next();
			doneA = Boolean(nextA.done);
			const nextB = iterB.next();
			doneB = Boolean(nextB.done);

			if (doneA && doneB) {
				return;
			}
			if (doneA !== doneB) {
				throw new RangeError('Input iterables must have the same length');
			}

			const u = validateVec3(nextA.value, 'a');
			const v = validateVec3(nextB.value, 'b');
			yield computeCross(u, v);
		}
	} finally {
		try {
			if (!doneA && iterA && typeof iterA.return === 'function') {
				iterA.return();
			}
		} finally {
			if (!doneB && iterB && typeof iterB.return === 'function') {
				iterB.return();
			}
		}
	}
}
