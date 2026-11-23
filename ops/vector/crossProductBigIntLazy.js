/**
 * Computes the 3D vector cross product of two exact BigInt vectors lazily.
 *
 * Consumes each input iterable lazily upon iteration of the returned generator
 * (reading at most 4 steps per input to verify exact 3D dimensionality without
 * materializing unbounded streams) and yields the three exact BigInt components
 * of `a × b` one by one:
 *
 *   (a1 * b2 - a2 * b1, a2 * b0 - a0 * b2, a0 * b1 - a1 * b0)
 *
 * Because the cross product uses only integer multiplication and subtraction,
 * every yielded component is an exact BigInt integer with arbitrary precision.
 *
 * @param {Iterable<bigint>} a - First 3D vector iterable yielding exactly 3 BigInt elements.
 * @param {Iterable<bigint>} b - Second 3D vector iterable yielding exactly 3 BigInt elements.
 * @returns {Generator<bigint, void, undefined>} Lazy generator yielding the 3 exact BigInt components of `a × b`.
 * @throws {TypeError} If `a` or `b` is not a non-string iterable, returns an invalid iterator, or yields a non-BigInt element.
 * @throws {RangeError} If `a` or `b` does not contain exactly 3 elements.
 */
export function crossProductBigIntLazy(a, b) {
	assertVectorIterable(a, 'a');
	assertVectorIterable(b, 'b');
	return crossProductGenerator(a, b);
}

/**
 * Validates that an argument is a non-string iterable.
 *
 * @param {unknown} value
 * @param {string} name
 */
function assertVectorIterable(value, name) {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(`${name} must be an iterable of 3 BigInt elements`);
	}
}

/**
 * Lazily consumes exactly 3 BigInt elements from an iterable, verifying
 * exact 3D length without hanging on infinite streams and closing the
 * iterator cleanly on validation failure.
 *
 * @param {Iterable<bigint>} iterable
 * @param {string} name
 * @returns {[bigint, bigint, bigint]}
 */
function readVector3(iterable, name) {
	const iterator = iterable[Symbol.iterator]();
	if (
		iterator === null ||
		typeof iterator !== 'object' ||
		typeof iterator.next !== 'function'
	) {
		throw new TypeError(`${name}[Symbol.iterator]() must return an iterator object`);
	}

	const coords = [0n, 0n, 0n];
	let finished = false;

	const closeQuietly = () => {
		if (!finished) {
			finished = true;
			if (typeof iterator.return === 'function') {
				try {
					iterator.return();
				} catch {
					// Preserve original error
				}
			}
		}
	};

	try {
		for (let i = 0; i < 3; i++) {
			const step = iterator.next();
			if (step.done) {
				finished = true;
				throw new RangeError(
					`${name} must be a 3D vector (expected exactly 3 BigInt elements, got ${i})`
				);
			}
			if (typeof step.value !== 'bigint') {
				throw new TypeError(
					`${name}[${i}] must be a BigInt, got ${step.value === null ? 'null' : typeof step.value}`
				);
			}
			coords[i] = step.value;
		}

		const extra = iterator.next();
		if (!extra.done) {
			throw new RangeError(
				`${name} must be a 3D vector (expected exactly 3 BigInt elements, got more than 3)`
			);
		}
		finished = true;
		return coords;
	} catch (err) {
		closeQuietly();
		throw err;
	}
}

/**
 * Internal generator yielding the 3 components of `a × b` on demand.
 *
 * @param {Iterable<bigint>} a
 * @param {Iterable<bigint>} b
 * @returns {Generator<bigint, void, undefined>}
 */
function* crossProductGenerator(a, b) {
	const [a0, a1, a2] = readVector3(a, 'a');
	const [b0, b1, b2] = readVector3(b, 'b');

	yield a1 * b2 - a2 * b1;
	yield a2 * b0 - a0 * b2;
	yield a0 * b1 - a1 * b0;
}
