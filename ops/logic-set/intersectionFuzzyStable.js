/**
 * Numerically robust fuzzy set intersection over membership degrees in [0, 1]
 * using Zadeh operators (default) and optional t-norms (product, Lukasiewicz).
 *
 * Numerical stability techniques used:
 * - Strict IEEE 754 validation with canonical +0 normalization (eliminating -0)
 *   and configurable boundary clamping tolerance with tracked perturbation bounds.
 * - Neumaier compensated summation for fuzzy cardinality (sigma-count) and
 *   multi-set reductions, accompanied by Higham-style a posteriori error bounds.
 * - Knuth's TwoSum error-free transformation and deficit-form evaluation
 *   `1 - sum(1 - mu_i)` for cancellation-free Lukasiewicz t-norms.
 * - Sterbenz-exact `log1p(mu - 1)` compensated log-domain accumulation for
 *   multi-set algebraic product t-norms to resist underflow and rounding drift.
 *
 * @module ops/logic-set/intersectionFuzzyStable
 */

const UNIT_ROUNDOFF = Number.EPSILON / 2; // 2^-53 (~1.1102230246251565e-16)
const VALID_TNORMS = new Set(['zadeh', 'product', 'lukasiewicz']);

/**
 * Error-free transformation (Knuth, 1969): computes exact `s + e === a + b`.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
	const s = a + b;
	const bb = s - a;
	const e = (a - (s - bb)) + (b - bb);
	return [s, e];
}

/**
 * Creates a Neumaier compensated summation accumulator.
 * @returns {{ sum: number, comp: number, count: number }}
 */
function createNeumaier() {
	return { sum: 0, comp: 0, count: 0 };
}

/**
 * Adds a finite value to a Neumaier compensated summation accumulator.
 * @param {{ sum: number, comp: number, count: number }} acc
 * @param {number} value
 */
function neumaierAdd(acc, value) {
	const t = acc.sum + value;
	if (Math.abs(acc.sum) >= Math.abs(value)) {
		acc.comp += (acc.sum - t) + value;
	} else {
		acc.comp += (value - t) + acc.sum;
	}
	acc.sum = t;
	acc.count += 1;
}

/**
 * Returns the compensated sum, normalizing -0 to +0.
 * @param {{ sum: number, comp: number, count: number }} acc
 * @returns {number}
 */
function neumaierValue(acc) {
	const total = acc.sum + acc.comp;
	return total === 0 ? 0 : total;
}

/**
 * Computes a guaranteed upper bound on the rounding error of Neumaier
 * summation over `n` non-negative terms summing to `sum`, plus per-element
 * error contributions.
 * @param {number} sum
 * @param {number} n
 * @param {number} elementErrorSum
 * @returns {number}
 */
function compensatedSumErrorBound(sum, n, elementErrorSum) {
	if (n === 0) return 0;
	const nu = n * UNIT_ROUNDOFF;
	const quadraticFactor = nu < 0.5 ? (nu * UNIT_ROUNDOFF) / (1 - nu) : nu;
	const sumBound = (2 * UNIT_ROUNDOFF + quadraticFactor) * Math.abs(sum);
	return sumBound + elementErrorSum;
}

/**
 * Checks whether a value is a plain JavaScript object (not Array, Map, Date, etc.).
 * @param {unknown} value
 * @returns {value is Record<string, number>}
 */
function isPlainObject(value) {
	if (value === null || typeof value !== 'object') return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Checks whether a value is a numeric vector (Array or TypedArray, excluding DataView).
 * @param {unknown} value
 * @returns {value is ArrayLike<number>}
 */
function isTypedArray(value) {
	return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

/**
 * Classifies a single fuzzy set representation.
 * @param {unknown} value
 * @returns {'number'|'object'|'map'|'vector'|'invalid'}
 */
function classifyFuzzyInput(value) {
	if (typeof value === 'number') return 'number';
	if (value instanceof Map) return 'map';
	if (Array.isArray(value) || isTypedArray(value)) return 'vector';
	if (isPlainObject(value)) return 'object';
	return 'invalid';
}

/**
 * Safely assigns a property onto a plain object without risking prototype pollution.
 * @param {Record<string, number>} target
 * @param {string} key
 * @param {number} value
 */
function safeSetProp(target, key, value) {
	if (key === '__proto__') {
		Object.defineProperty(target, key, {
			value,
			enumerable: true,
			writable: true,
			configurable: true,
		});
	} else {
		target[key] = value;
	}
}

/**
 * Validates and normalizes a single membership degree into [0, 1].
 * Returns the normalized value and any clamping perturbation applied.
 * @param {unknown} raw
 * @param {number} clampTolerance
 * @param {string} context
 * @returns {{ value: number, perturbation: number }}
 */
function validateMembership(raw, clampTolerance, context) {
	if (typeof raw !== 'number') {
		throw new TypeError(`Invalid membership value at ${context}: expected finite number, got ${typeof raw}`);
	}
	if (!Number.isFinite(raw)) {
		throw new RangeError(`Invalid membership value at ${context}: expected finite number in [0, 1], got ${raw}`);
	}
	if (raw < -clampTolerance || raw > 1 + clampTolerance) {
		throw new RangeError(
			`Membership value out of [0, 1] at ${context}: got ${raw} (clampTolerance=${clampTolerance})`
		);
	}
	if (raw < 0) {
		return { value: 0, perturbation: -raw };
	}
	if (raw > 1) {
		return { value: 1, perturbation: raw - 1 };
	}
	return { value: raw === 0 ? 0 : raw, perturbation: 0 };
}

/**
 * Validates and normalizes the options object.
 * @param {unknown} rawOptions
 * @returns {{
 *   tNorm: 'zadeh' | 'product' | 'lukasiewicz',
 *   clampTolerance: number,
 *   zeroThreshold: number,
 *   pruneZeros: boolean,
 *   withMetrics: boolean
 * }}
 */
function parseOptions(rawOptions) {
	if (rawOptions === undefined) {
		return {
			tNorm: 'zadeh',
			clampTolerance: 0,
			zeroThreshold: 0,
			pruneZeros: true,
			withMetrics: false,
		};
	}
	if (!isPlainObject(rawOptions)) {
		throw new TypeError('Options must be a plain object');
	}

	const {
		tNorm = 'zadeh',
		clampTolerance = 0,
		zeroThreshold = 0,
		pruneZeros = true,
		withMetrics = false,
	} = rawOptions;

	if (typeof tNorm !== 'string' || !VALID_TNORMS.has(tNorm)) {
		throw new RangeError(`Unsupported tNorm "${String(tNorm)}"; expected one of: zadeh, product, lukasiewicz`);
	}
	if (typeof clampTolerance !== 'number' || !Number.isFinite(clampTolerance) || clampTolerance < 0 || clampTolerance > 0.5) {
		throw new RangeError('options.clampTolerance must be a finite number in [0, 0.5]');
	}
	if (typeof zeroThreshold !== 'number' || !Number.isFinite(zeroThreshold) || zeroThreshold < 0 || zeroThreshold > 1) {
		throw new RangeError('options.zeroThreshold must be a finite number in [0, 1]');
	}
	if (typeof pruneZeros !== 'boolean') {
		throw new TypeError('options.pruneZeros must be a boolean');
	}
	if (typeof withMetrics !== 'boolean') {
		throw new TypeError('options.withMetrics must be a boolean');
	}

	return { tNorm, clampTolerance, zeroThreshold, pruneZeros, withMetrics };
}

/**
 * Evaluates a numerically robust fuzzy t-norm over validated memberships in [0, 1].
 *
 * @param {number[]} values - Validated membership degrees in [0, 1].
 * @param {number[]} perturbations - Input clamping perturbations per value.
 * @param {'zadeh'|'product'|'lukasiewicz'} tNorm
 * @param {number} zeroThreshold
 * @returns {{ value: number, errorBound: number }}
 */
function evaluateTNorm(values, perturbations, tNorm, zeroThreshold) {
	const k = values.length;
	let value = 0;
	let errorBound = 0;

	if (tNorm === 'zadeh') {
		let minVal = values[0];
		let minPert = perturbations[0];
		for (let i = 1; i < k; i++) {
			const v = values[i];
			if (v < minVal) {
				minVal = v;
				minPert = perturbations[i];
			} else if (v === minVal && perturbations[i] > minPert) {
				minPert = perturbations[i];
			}
		}
		value = minVal === 0 ? 0 : minVal;
		// Min is exact in IEEE 754; only input perturbations bound output perturbation.
		let maxPert = minPert;
		for (let i = 0; i < k; i++) {
			if (perturbations[i] > maxPert) maxPert = perturbations[i];
		}
		errorBound = maxPert;
	} else if (tNorm === 'lukasiewicz') {
		// Exact deficit formulation: max(0, 1 - sum_i(1 - mu_i)).
		// Using TwoSum(1, -mu_i) makes every (1 - mu_i) error-free before compensated summation.
		if (k === 1) {
			value = values[0];
			errorBound = perturbations[0];
		} else if (k === 2) {
			const a = values[0];
			const b = values[1];
			if (a <= 0.5 && b <= 0.5) {
				value = 0;
				errorBound = perturbations[0] + perturbations[1];
			} else {
				// At least one operand is > 0.5; (hi - 1) is exact by Sterbenz's lemma.
				const hi = a >= b ? a : b;
				const lo = a >= b ? b : a;
				const diff = hi - 1; // exact in IEEE 754
				const raw = diff + lo;
				if (raw <= 0) {
					value = 0;
					errorBound = perturbations[0] + perturbations[1];
				} else {
					value = raw > 1 ? 1 : raw;
					errorBound = UNIT_ROUNDOFF * value + perturbations[0] + perturbations[1];
				}
			}
		} else {
			const deficitAcc = createNeumaier();
			let pertSum = 0;
			for (let i = 0; i < k; i++) {
				const [hi, lo] = twoSum(1, -values[i]);
				neumaierAdd(deficitAcc, hi);
				if (lo !== 0) {
					neumaierAdd(deficitAcc, lo);
				}
				pertSum += perturbations[i];
			}
			const deficit = neumaierValue(deficitAcc);
			if (deficit >= 1) {
				value = 0;
				errorBound = pertSum;
			} else {
				// Compute (1 - deficitAcc.sum) - deficitAcc.comp to preserve low-order bits.
				const [s1, e1] = twoSum(1, -deficitAcc.sum);
				const raw = s1 + (e1 - deficitAcc.comp);
				if (raw <= 0) {
					value = 0;
					errorBound = pertSum;
				} else {
					value = raw > 1 ? 1 : raw;
					const sumErr = compensatedSumErrorBound(deficit, deficitAcc.count, 0);
					errorBound = sumErr + 2 * UNIT_ROUNDOFF * value + pertSum;
				}
			}
		}
	} else {
		// tNorm === 'product'
		let hasZero = false;
		let allOnes = true;
		let pertSum = 0;
		for (let i = 0; i < k; i++) {
			if (values[i] === 0) hasZero = true;
			if (values[i] !== 1) allOnes = false;
			pertSum += perturbations[i];
		}

		if (hasZero) {
			value = 0;
			errorBound = pertSum;
		} else if (allOnes) {
			value = 1;
			errorBound = pertSum;
		} else if (k === 1) {
			value = values[0];
			errorBound = pertSum;
		} else if (k === 2) {
			const prod = values[0] * values[1];
			value = prod === 0 ? 0 : prod;
			errorBound = UNIT_ROUNDOFF * value + pertSum;
		} else {
			// Log-domain Neumaier compensated summation using Sterbenz-exact log1p(v - 1) near 1.
			const logAcc = createNeumaier();
			for (let i = 0; i < k; i++) {
				const v = values[i];
				if (v === 1) continue;
				const lv = v >= 0.5 ? Math.log1p(v - 1) : Math.log(v);
				neumaierAdd(logAcc, lv);
			}
			const logSum = neumaierValue(logAcc);
			const prod = Math.exp(logSum);
			value = prod <= 0 ? 0 : prod > 1 ? 1 : prod;
			// Relative error from k log evaluations + compensated sum + exp
			const relErr = (k + 3) * UNIT_ROUNDOFF;
			errorBound = relErr * value + pertSum;
		}
	}

	if (value <= zeroThreshold) {
		const snapErr = value;
		value = 0;
		errorBound += snapErr;
	}

	return { value: value === 0 ? 0 : value, errorBound };
}

/**
 * Normalizes and validates the full set list from either binary `(a, b, options?)`
 * or N-ary `([set1, set2, ...], options?)` invocation forms.
 *
 * @param {unknown} first
 * @param {unknown} second
 * @param {unknown} third
 * @returns {{
 *   kind: 'number'|'object'|'map'|'vector',
 *   sets: unknown[],
 *   options: ReturnType<typeof parseOptions>
 * }}
 */
function normalizeInvocation(first, second, third) {
	// N-ary form: intersectionFuzzyStable([setA, setB, ...], options?)
	if (Array.isArray(first) && !Array.isArray(second) && !isTypedArray(second)) {
		if (third !== undefined) {
			throw new TypeError('Too many arguments for N-ary fuzzy intersection');
		}
		if (second !== undefined && !isPlainObject(second)) {
			throw new TypeError(
				'Mismatched input types: expected two matching fuzzy sets or an array of fuzzy sets with optional options object'
			);
		}
		if (first.length === 0) {
			throw new RangeError('Cannot compute fuzzy intersection of an empty list of sets');
		}
		const firstKind = classifyFuzzyInput(first[0]);
		if (firstKind === 'invalid' || firstKind === 'number') {
			throw new TypeError(
				'Single array argument must contain fuzzy sets (plain objects, Maps, or numeric arrays); for two numeric vectors pass both as separate arguments'
			);
		}
		for (let i = 1; i < first.length; i++) {
			if (classifyFuzzyInput(first[i]) !== firstKind) {
				throw new TypeError(
					`All fuzzy sets in N-ary intersection must have the same representation (expected ${firstKind} at index ${i})`
				);
			}
		}
		return {
			kind: firstKind,
			sets: first,
			options: parseOptions(second),
		};
	}

	// Binary form: intersectionFuzzyStable(setA, setB, options?)
	if (second === undefined) {
		throw new TypeError('intersectionFuzzyStable requires two fuzzy sets (or a non-empty array of fuzzy sets)');
	}
	const kindA = classifyFuzzyInput(first);
	const kindB = classifyFuzzyInput(second);
	if (kindA === 'invalid') {
		throw new TypeError('First argument must be a fuzzy set (plain object, Map, numeric array/TypedArray, or scalar membership in [0, 1])');
	}
	if (kindB === 'invalid' || kindA !== kindB) {
		throw new TypeError(`Mismatched fuzzy set representations: ${kindA} vs ${kindB}`);
	}
	return {
		kind: kindA,
		sets: [first, second],
		options: parseOptions(third),
	};
}

/**
 * Computes the numerically robust fuzzy set intersection under Zadeh operators
 * (default: pointwise `min`) or optional fuzzy t-norms (`'product'`, `'lukasiewicz'`).
 *
 * Supports four fuzzy representations:
 * - Scalar membership degrees in `[0, 1]`: `intersectionFuzzyStable(0.8, 0.3)`
 * - Plain objects (`Record<string, number>`): `intersectionFuzzyStable({ a: 0.8 }, { a: 0.5 })`
 * - `Map<K, number>`: `intersectionFuzzyStable(mapA, mapB)`
 * - Numeric vectors (`Array<number>` or `TypedArray`) of equal length: `intersectionFuzzyStable([0.8, 0.2], [0.5, 0.9])`
 * - N-ary intersection of 1+ fuzzy sets of the same representation: `intersectionFuzzyStable([setA, setB, setC], options)`
 *
 * All input memberships are validated to be finite numbers in `[0, 1]` (or within
 * `[-clampTolerance, 1 + clampTolerance]` when boundary clamping is enabled).
 *
 * @template T
 * @param {T | T[]} setA - First fuzzy set (or non-empty array of fuzzy sets for N-ary intersection).
 * @param {T | IntersectionFuzzyOptions} [setB] - Second fuzzy set (or options when `setA` is an array of fuzzy sets).
 * @param {IntersectionFuzzyOptions} [options] - Optional configuration.
 * @returns {T | IntersectionFuzzyMetrics<T>} Intersected fuzzy set, or metrics object when `options.withMetrics` is `true`.
 *
 * @typedef {Object} IntersectionFuzzyOptions
 * @property {'zadeh'|'product'|'lukasiewicz'} [tNorm='zadeh'] - Fuzzy intersection t-norm operator.
 * @property {number} [clampTolerance=0] - Allowed overshoot outside [0, 1] to clamp cleanly (in [0, 0.5]).
 * @property {number} [zeroThreshold=0] - Snap memberships `<= zeroThreshold` to exact `0` (in [0, 1]).
 * @property {boolean} [pruneZeros=true] - For plain object / Map inputs, omit keys with resulting membership `0`.
 * @property {boolean} [withMetrics=false] - When `true`, return `{ result, cardinality, cardinalityErrorBound, maxPerturbation, supportSize, height, tNorm }`.
 *
 * @typedef {Object} IntersectionFuzzyMetrics
 * @template R
 * @property {R} result - The intersected fuzzy set.
 * @property {number} cardinality - Fuzzy sigma-count `sum_x mu(x)` via Neumaier compensated summation.
 * @property {number} cardinalityErrorBound - Guaranteed upper bound on floating-point summation and t-norm error.
 * @property {number} maxPerturbation - Maximum per-element clamping/t-norm error bound across the support.
 * @property {number} supportSize - Count of elements with strictly positive membership `> 0`.
 * @property {number} height - Fuzzy height `sup_x mu(x)` (0 if empty).
 * @property {'zadeh'|'product'|'lukasiewicz'} tNorm - The t-norm used.
 */
export function intersectionFuzzyStable(setA, setB, options) {
	const { kind, sets, options: opts } = normalizeInvocation(setA, setB, options);
	const { tNorm, clampTolerance, zeroThreshold, pruneZeros, withMetrics } = opts;

	const cardAcc = createNeumaier();
	const errSumAcc = createNeumaier();
	let maxPerturbation = 0;
	let supportSize = 0;
	let height = 0;

	const recordElement = (val, err) => {
		if (val > 0) {
			neumaierAdd(cardAcc, val);
			neumaierAdd(errSumAcc, err);
			supportSize += 1;
			if (val > height) height = val;
		}
		if (err > maxPerturbation) maxPerturbation = err;
	};

	let result;

	if (kind === 'number') {
		const vals = new Array(sets.length);
		const perts = new Array(sets.length);
		for (let i = 0; i < sets.length; i++) {
			const v = validateMembership(sets[i], clampTolerance, `argument ${i}`);
			vals[i] = v.value;
			perts[i] = v.perturbation;
		}
		const { value, errorBound } = evaluateTNorm(vals, perts, tNorm, zeroThreshold);
		recordElement(value, errorBound);
		result = value;
	} else if (kind === 'vector') {
		const len = sets[0].length;
		for (let s = 1; s < sets.length; s++) {
			if (sets[s].length !== len) {
				throw new RangeError(
					`Fuzzy vector length mismatch: expected length ${len}, got ${sets[s].length} at set ${s}`
				);
			}
		}

		// Validate all entries upfront and keep normalized arrays.
		const validated = sets.map((vec, sIdx) => {
			const vArr = new Float64Array(len);
			const pArr = new Float64Array(len);
			for (let i = 0; i < len; i++) {
				const norm = validateMembership(vec[i], clampTolerance, `set[${sIdx}][${i}]`);
				vArr[i] = norm.value;
				pArr[i] = norm.perturbation;
			}
			return { vArr, pArr };
		});

		const out = new Array(len);
		const colVals = new Array(sets.length);
		const colPerts = new Array(sets.length);
		for (let i = 0; i < len; i++) {
			for (let s = 0; s < sets.length; s++) {
				colVals[s] = validated[s].vArr[i];
				colPerts[s] = validated[s].pArr[i];
			}
			const { value, errorBound } = evaluateTNorm(colVals, colPerts, tNorm, zeroThreshold);
			out[i] = value;
			recordElement(value, errorBound);
		}
		result = out;
	} else if (kind === 'map') {
		// Validate every entry in every Map so invalid memberships are never silently skipped.
		const validatedMaps = sets.map((map, sIdx) => {
			const normMap = new Map();
			for (const [k, raw] of map.entries()) {
				const norm = validateMembership(raw, clampTolerance, `set[${sIdx}].get(${String(k)})`);
				normMap.set(k, norm);
			}
			return normMap;
		});

		// Iterate over the smallest Map for O(min(|S_i|)) intersection.
		let smallestIdx = 0;
		for (let s = 1; s < validatedMaps.length; s++) {
			if (validatedMaps[s].size < validatedMaps[smallestIdx].size) {
				smallestIdx = s;
			}
		}

		const out = new Map();
		const kCount = validatedMaps.length;
		const colVals = new Array(kCount);
		const colPerts = new Array(kCount);

		for (const [key] of validatedMaps[smallestIdx].entries()) {
			let inAll = true;
			for (let s = 0; s < kCount; s++) {
				const entry = validatedMaps[s].get(key);
				if (entry === undefined) {
					inAll = false;
					break;
				}
				colVals[s] = entry.value;
				colPerts[s] = entry.perturbation;
			}
			if (!inAll) continue;

			const { value, errorBound } = evaluateTNorm(colVals, colPerts, tNorm, zeroThreshold);
			recordElement(value, errorBound);
			if (value > 0 || !pruneZeros) {
				out.set(key, value);
			}
		}
		result = out;
	} else {
		// kind === 'object'
		const validatedMaps = sets.map((obj, sIdx) => {
			const normMap = new Map();
			for (const key of Object.keys(obj)) {
				const norm = validateMembership(obj[key], clampTolerance, `set[${sIdx}]["${key}"]`);
				normMap.set(key, norm);
			}
			return normMap;
		});

		let smallestIdx = 0;
		for (let s = 1; s < validatedMaps.length; s++) {
			if (validatedMaps[s].size < validatedMaps[smallestIdx].size) {
				smallestIdx = s;
			}
		}

		const out = {};
		const kCount = validatedMaps.length;
		const colVals = new Array(kCount);
		const colPerts = new Array(kCount);

		for (const [key] of validatedMaps[smallestIdx].entries()) {
			let inAll = true;
			for (let s = 0; s < kCount; s++) {
				const entry = validatedMaps[s].get(key);
				if (entry === undefined) {
					inAll = false;
					break;
				}
				colVals[s] = entry.value;
				colPerts[s] = entry.perturbation;
			}
			if (!inAll) continue;

			const { value, errorBound } = evaluateTNorm(colVals, colPerts, tNorm, zeroThreshold);
			recordElement(value, errorBound);
			if (value > 0 || !pruneZeros) {
				safeSetProp(out, key, value);
			}
		}
		result = out;
	}

	if (!withMetrics) {
		return result;
	}

	const cardinality = neumaierValue(cardAcc);
	const cardinalityErrorBound = compensatedSumErrorBound(
		cardinality,
		cardAcc.count,
		neumaierValue(errSumAcc)
	);

	return {
		result,
		cardinality,
		cardinalityErrorBound,
		maxPerturbation,
		supportSize,
		height,
		tNorm,
	};
}
