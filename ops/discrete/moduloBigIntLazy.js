/**
 * Fixed-point scaling factor (10^18) for representing non-integer values as
 * exact scaled BigInts. Because modulo is positively homogeneous of degree 1
 * — `(S * x) mod (S * y) = S * (x mod y)` for `S > 0` — exact integer modulo
 * directly preserves fixed-point scaling when both operands share the same scale.
 */
export const FIXED_POINT_SCALE = 10n ** 18n;

const VALID_MODES = new Set(['euclidean', 'floored', 'truncated']);

/**
 * Check whether a value is a non-string synchronous iterable.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isIterable(value) {
	return (
		value != null &&
		typeof value !== 'string' &&
		typeof value[Symbol.iterator] === 'function'
	);
}

/**
 * Compute discrete BigInt modulo for a validated `(a, m)` pair.
 *
 * @param {bigint} a - Dividend.
 * @param {bigint} m - Non-zero modulus.
 * @param {'euclidean' | 'floored' | 'truncated'} mode - Modulo convention.
 * @returns {bigint}
 */
function computeModulo(a, m, mode) {
	if (mode === 'euclidean') {
		const absM = m < 0n ? -m : m;
		const r = a % absM;
		return r < 0n ? r + absM : r;
	}
	if (mode === 'floored') {
		const r = a % m;
		if (r === 0n) return 0n;
		return (r < 0n) !== (m < 0n) ? r + m : r;
	}
	// 'truncated'
	return a % m;
}

/**
 * Lazily compute discrete modulo over exact `BigInt` values using a streaming
 * generator.
 *
 * Exact integer modulo always yields an exact `BigInt` integer. When inputs
 * represent fixed-point values scaled by {@link FIXED_POINT_SCALE} (`10n ** 18n`),
 * passing both dividend and modulus at the same scale preserves the `10^18`
 * fixed-point scaling exactly (`(S * x) mod (S * y) === S * (x mod y)`).
 *
 * Supported call forms:
 * - `moduloBigIntLazy(dividendsIterable, modulusBigInt, options?)`:
 *   Streams `a mod modulus` for each `a` in `dividendsIterable`.
 * - `moduloBigIntLazy(dividendBigInt, moduliIterable, options?)`:
 *   Streams `dividend mod m` for each `m` in `moduliIterable`.
 * - `moduloBigIntLazy(dividendsIterable, moduliIterable, options?)`:
 *   Lazily zips both iterables and yields `a mod m` until the shorter iterable ends.
 * - `moduloBigIntLazy(dividendBigInt, modulusBigInt, options?)`:
 *   Yields the single result `dividend mod modulus`.
 * - `moduloBigIntLazy(pairsIterable, undefined, options?)` (or 1-arg `moduloBigIntLazy(pairsIterable)`):
 *   Streams `a mod m` for each `[a, m]` 2-tuple in `pairsIterable`.
 *
 * Laziness guarantee:
 * - Top-level arguments and scalar moduli are validated eagerly upon invocation.
 * - Iterable inputs are consumed strictly one item at a time on each `.next()`
 *   call and are never materialized into arrays. Infinite iterables are supported.
 * - On early termination or when the shorter zipped iterable finishes, active
 *   underlying iterators are closed via `.return()` if available.
 *
 * @param {bigint | Iterable<bigint> | Iterable<[bigint, bigint]>} dividends
 *   A `BigInt` dividend, a non-string iterable of `BigInt` dividends, or (when
 *   `moduli` is `undefined`) a non-string iterable of `[dividend, modulus]` pairs.
 * @param {bigint | Iterable<bigint>} [moduli]
 *   A non-zero `BigInt` modulus or a non-string iterable of non-zero `BigInt` moduli.
 * @param {{ mode?: 'euclidean' | 'floored' | 'truncated' }} [options]
 *   Optional configuration:
 *   - `mode`: Modulo convention (default `'euclidean'`).
 *     - `'euclidean'`: canonical remainder `r` in `[0n, |m| - 1n]`, `a = q*m + r`.
 *     - `'floored'`: remainder `r` with the same sign as `m` (or `0n`), `r = a - floor(a/m)*m`.
 *     - `'truncated'`: remainder `r` with the same sign as `a` (or `0n`), matching JS `a % m`.
 * @returns {Generator<bigint, void, undefined>} Lazy generator yielding exact `BigInt` remainders.
 * @throws {TypeError} If top-level inputs, `options`, or streamed elements have invalid types.
 * @throws {RangeError} If `options.mode` is invalid or any modulus is `0n`.
 */
export function moduloBigIntLazy(dividends, moduli, options) {
	let mode = 'euclidean';
	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('options must be a plain object when provided');
		}
		if (options.mode !== undefined) {
			if (typeof options.mode !== 'string' || !VALID_MODES.has(options.mode)) {
				throw new RangeError(
					`Invalid modulo mode "${String(options.mode)}"; expected "euclidean", "floored", or "truncated"`
				);
			}
			mode = options.mode;
		}
	}

	// 1-argument / pairs-iterable mode: moduloBigIntLazy(pairsIterable)
	if (moduli === undefined) {
		if (!isIterable(dividends)) {
			throw new TypeError(
				'When moduli is omitted, dividends must be a non-string iterable of [dividend, modulus] BigInt pairs'
			);
		}
		return (function* streamPairs() {
			for (const pair of dividends) {
				if (!Array.isArray(pair) || pair.length !== 2) {
					throw new TypeError('Each element in pairs iterable must be a [dividend, modulus] 2-element array');
				}
				const [a, m] = pair;
				if (typeof a !== 'bigint') {
					throw new TypeError(`Expected dividend to be a BigInt, got ${typeof a}`);
				}
				if (typeof m !== 'bigint') {
					throw new TypeError(`Expected modulus to be a BigInt, got ${typeof m}`);
				}
				if (m === 0n) {
					throw new RangeError('Modulus cannot be zero');
				}
				yield computeModulo(a, m, mode);
			}
		})();
	}

	const dividendsIsBigInt = typeof dividends === 'bigint';
	const dividendsIsIter = !dividendsIsBigInt && isIterable(dividends);
	if (!dividendsIsBigInt && !dividendsIsIter) {
		throw new TypeError('dividends must be a BigInt or a non-string iterable of BigInts');
	}

	const moduliIsBigInt = typeof moduli === 'bigint';
	const moduliIsIter = !moduliIsBigInt && isIterable(moduli);
	if (!moduliIsBigInt && !moduliIsIter) {
		throw new TypeError('moduli must be a BigInt or a non-string iterable of BigInts');
	}

	if (moduliIsBigInt && moduli === 0n) {
		throw new RangeError('Modulus cannot be zero');
	}

	// Scalar dividend, scalar modulus
	if (dividendsIsBigInt && moduliIsBigInt) {
		return (function* streamScalar() {
			yield computeModulo(dividends, moduli, mode);
		})();
	}

	// Iterable dividends, scalar modulus
	if (dividendsIsIter && moduliIsBigInt) {
		return (function* streamDividends() {
			for (const a of dividends) {
				if (typeof a !== 'bigint') {
					throw new TypeError(`Expected dividend to be a BigInt, got ${typeof a}`);
				}
				yield computeModulo(a, moduli, mode);
			}
		})();
	}

	// Scalar dividend, iterable moduli
	if (dividendsIsBigInt && moduliIsIter) {
		return (function* streamModuli() {
			for (const m of moduli) {
				if (typeof m !== 'bigint') {
					throw new TypeError(`Expected modulus to be a BigInt, got ${typeof m}`);
				}
				if (m === 0n) {
					throw new RangeError('Modulus cannot be zero');
				}
				yield computeModulo(dividends, m, mode);
			}
		})();
	}

	// Iterable dividends, iterable moduli (lazy zip)
	return (function* streamZipped() {
		let doneA = false;
		let doneM = false;
		const iterA = dividends[Symbol.iterator]();
		let iterM;
		try {
			iterM = moduli[Symbol.iterator]();
			while (true) {
				const nextA = iterA.next();
				if (nextA.done) {
					doneA = true;
					break;
				}
				const nextM = iterM.next();
				if (nextM.done) {
					doneM = true;
					break;
				}
				const a = nextA.value;
				const m = nextM.value;
				if (typeof a !== 'bigint') {
					throw new TypeError(`Expected dividend to be a BigInt, got ${typeof a}`);
				}
				if (typeof m !== 'bigint') {
					throw new TypeError(`Expected modulus to be a BigInt, got ${typeof m}`);
				}
				if (m === 0n) {
					throw new RangeError('Modulus cannot be zero');
				}
				yield computeModulo(a, m, mode);
			}
		} finally {
			if (!doneA && typeof iterA.return === 'function') {
				iterA.return();
			}
			if (iterM !== undefined && !doneM && typeof iterM.return === 'function') {
				iterM.return();
			}
		}
	})();
}
