/**
 * Arbitrary-precision decimal string addition with configurable precision.
 *
 * Uses exact scaled BigInt arithmetic, exponent normalization, and cluster-based
 * sticky-bit reduction so that:
 * - Intermediate arithmetic suffers zero rounding drift and zero catastrophic
 *   cancellation (even across extreme exponent spans such as 1e1000000 + 1e-1000000).
 * - When a fixed fractional precision is requested, a single exact round-half-to-even
 *   (IEEE 754 banker's rounding) step is performed with a guaranteed <= 0.5 ULP error bound.
 *
 * @module ops/arithmetic/addDecimalStable
 */

const DECIMAL_RE = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Strips trailing base-10 zeros from a non-zero BigInt mantissa and adjusts
 * its base-10 exponent accordingly.
 *
 * @param {bigint} m Non-zero integer mantissa
 * @param {number} e Base-10 exponent
 * @returns {{ m: bigint, e: number, msd: number }}
 */
function normalizeTerm(m, e) {
	const neg = m < 0n;
	const absStr = (neg ? -m : m).toString();
	let end = absStr.length;
	while (end > 1 && absStr.charCodeAt(end - 1) === 48) {
		end--;
	}
	const trimmed = absStr.length - end;
	const normExp = e + trimmed;
	if (!Number.isSafeInteger(normExp)) {
		throw new RangeError('Decimal exponent out of safe integer range');
	}
	const normMag = trimmed === 0 ? (neg ? -m : m) : BigInt(absStr.slice(0, end));
	const normM = neg ? -normMag : normMag;
	return {
		m: normM,
		e: normExp,
		msd: normExp + end - 1,
	};
}

/**
 * Parses and validates an arbitrary-precision decimal string into a normalized
 * `{ m, e, msd }` term representing `m * 10^e`.
 *
 * @param {unknown} input
 * @param {string} label
 * @returns {{ m: bigint, e: number, msd: number }}
 */
function parseDecimal(input, label) {
	if (typeof input !== 'string') {
		throw new TypeError(`${label} must be a decimal string`);
	}
	const trimmed = input.trim();
	const match = DECIMAL_RE.exec(trimmed);
	if (!match) {
		throw new RangeError(`${label} is not a valid decimal string: ${JSON.stringify(input)}`);
	}

	const [, sign, intPart, fracPart1, fracPart2, expPart] = match;
	const fracPart = fracPart1 ?? fracPart2 ?? '';
	const rawDigits = (intPart ?? '') + fracPart;

	let start = 0;
	while (start < rawDigits.length && rawDigits.charCodeAt(start) === 48) {
		start++;
	}
	if (start === rawDigits.length) {
		return { m: 0n, e: 0, msd: -Infinity };
	}

	let end = rawDigits.length;
	while (end > start && rawDigits.charCodeAt(end - 1) === 48) {
		end--;
	}

	const trailingZeros = rawDigits.length - end;
	const parsedExp = expPart === undefined ? 0 : Number(expPart);
	if (!Number.isSafeInteger(parsedExp)) {
		throw new RangeError(`${label} exponent out of safe integer range`);
	}

	const e = parsedExp - fracPart.length + trailingZeros;
	if (!Number.isSafeInteger(e)) {
		throw new RangeError(`${label} exponent out of safe integer range`);
	}

	const magDigits = rawDigits.slice(start, end);
	const mag = BigInt(magDigits);
	const m = sign === '-' ? -mag : mag;

	return {
		m,
		e,
		msd: e + magDigits.length - 1,
	};
}

/**
 * Validates the optional `precision` parameter.
 *
 * @param {unknown} precision
 * @returns {number | null}
 */
function validatePrecision(precision) {
	if (precision === undefined || precision === null) {
		return null;
	}
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative safe integer or undefined');
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer');
	}
	return precision;
}

/**
 * Pre-aggregates non-zero terms sharing the same exponent so identical-scale
 * opposite terms cancel immediately before any scaling.
 *
 * @param {Array<{ m: bigint, e: number, msd: number }>} terms
 * @returns {Array<{ m: bigint, e: number, msd: number }>}
 */
function aggregateByExponent(terms) {
	/** @type {Map<number, bigint>} */
	const byExp = new Map();
	for (const term of terms) {
		if (term.m === 0n) continue;
		const prev = byExp.get(term.e);
		byExp.set(term.e, prev === undefined ? term.m : prev + term.m);
	}
	/** @type {Array<{ m: bigint, e: number, msd: number }>} */
	const out = [];
	for (const [e, m] of byExp) {
		if (m !== 0n) {
			out.push(normalizeTerm(m, e));
		}
	}
	return out;
}

/**
 * Partitions non-zero terms into scale-separated clusters ordered by descending
 * most-significant-digit exponent (`msd`). Any terms in later clusters have a
 * combined magnitude strictly smaller than the least-significant unit of the
 * preceding cluster, preventing cross-cluster carries while avoiding unnecessary
 * scaling across huge exponent gaps.
 *
 * @param {Array<{ m: bigint, e: number, msd: number }>} terms
 * @returns {Array<{ terms: Array<{ m: bigint, e: number, msd: number }>, minE: number, maxMsd: number }>}
 */
function clusterTerms(terms) {
	if (terms.length === 0) return [];
	const sorted = terms.slice().sort((a, b) => (b.msd - a.msd) || (a.e - b.e));
	const gap = Math.max(64, String(sorted.length).length + 16);

	/** @type {Array<{ terms: Array<{ m: bigint, e: number, msd: number }>, minE: number, maxMsd: number }>} */
	const clusters = [];
	let current = {
		terms: [sorted[0]],
		minE: sorted[0].e,
		maxMsd: sorted[0].msd,
	};

	for (let i = 1; i < sorted.length; i++) {
		const t = sorted[i];
		if (current.minE - t.msd <= gap) {
			current.terms.push(t);
			if (t.e < current.minE) {
				current.minE = t.e;
			}
		} else {
			clusters.push(current);
			current = {
				terms: [t],
				minE: t.e,
				maxMsd: t.msd,
			};
		}
	}
	clusters.push(current);
	return clusters;
}

/**
 * Computes the exact scaled BigInt sum of a cluster at its `minE`.
 *
 * @param {{ terms: Array<{ m: bigint, e: number }>, minE: number }} cluster
 * @returns {bigint}
 */
function sumCluster(cluster) {
	let acc = 0n;
	for (const t of cluster.terms) {
		const shift = t.e - cluster.minE;
		acc += shift === 0 ? t.m : t.m * (10n ** BigInt(shift));
	}
	return acc;
}

/**
 * Formats an exact value `m * 10^e` as a canonical decimal string with no
 * unnecessary leading or trailing zeros and never `"-0"`.
 *
 * @param {bigint} m
 * @param {number} e
 * @returns {string}
 */
function formatExact(m, e) {
	if (m === 0n) return '0';
	const norm = normalizeTerm(m, e);
	const neg = norm.m < 0n;
	const digits = (neg ? -norm.m : norm.m).toString();
	const prefix = neg ? '-' : '';

	if (norm.e >= 0) {
		return prefix + digits + '0'.repeat(norm.e);
	}
	const pointPos = digits.length + norm.e;
	if (pointPos > 0) {
		return `${prefix}${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
	}
	return `${prefix}0.${'0'.repeat(-pointPos)}${digits}`;
}

/**
 * Formats a rounded integer `q` representing `q * 10^-precision` with exactly
 * `precision` fractional digits (and never `"-0"` / `"-0.00"`).
 *
 * @param {bigint} q
 * @param {number} precision
 * @returns {string}
 */
function formatFixed(q, precision) {
	if (q === 0n) {
		return precision === 0 ? '0' : `0.${'0'.repeat(precision)}`;
	}
	const neg = q < 0n;
	const digits = (neg ? -q : q).toString();
	const prefix = neg ? '-' : '';

	if (precision === 0) {
		return prefix + digits;
	}
	if (digits.length <= precision) {
		return `${prefix}0.${'0'.repeat(precision - digits.length)}${digits}`;
	}
	const split = digits.length - precision;
	return `${prefix}${digits.slice(0, split)}.${digits.slice(split)}`;
}

/**
 * Sums normalized terms exactly (no rounding) and returns a canonical decimal string.
 *
 * @param {Array<{ m: bigint, e: number, msd: number }>} terms
 * @returns {string}
 */
function sumExact(terms) {
	const aggregated = aggregateByExponent(terms);
	if (aggregated.length === 0) return '0';

	// Cluster first so high-magnitude cancelling clusters drop before global scaling.
	const clusters = clusterTerms(aggregated);
	/** @type {Array<{ m: bigint, e: number }>} */
	const surviving = [];
	for (const cluster of clusters) {
		const s = sumCluster(cluster);
		if (s !== 0n) {
			const norm = normalizeTerm(s, cluster.minE);
			surviving.push({ m: norm.m, e: norm.e });
		}
	}
	if (surviving.length === 0) return '0';

	let minE = surviving[0].e;
	for (let i = 1; i < surviving.length; i++) {
		if (surviving[i].e < minE) minE = surviving[i].e;
	}

	let total = 0n;
	for (const item of surviving) {
		const shift = item.e - minE;
		total += shift === 0 ? item.m : item.m * (10n ** BigInt(shift));
	}
	return formatExact(total, minE);
}

/**
 * Sums normalized terms and rounds once to `precision` fractional digits using
 * exact round-half-to-even with cluster-based sticky-bit reduction.
 *
 * @param {Array<{ m: bigint, e: number, msd: number }>} terms
 * @param {number} precision
 * @returns {string}
 */
function sumWithPrecision(terms, precision) {
	const targetExp = -precision;
	const aggregated = aggregateByExponent(terms);
	if (aggregated.length === 0) {
		return formatFixed(0n, precision);
	}

	/** @type {Array<{ m: bigint, e: number, msd: number }>} */
	const highTerms = [];
	/** @type {Array<{ m: bigint, e: number, msd: number }>} */
	const residualTerms = [];

	for (const t of aggregated) {
		if (t.e >= targetExp) {
			highTerms.push(t);
		} else if (t.msd < targetExp) {
			// Entirely sub-ULP: |m * 10^e| < 10^-precision; no division needed.
			residualTerms.push(t);
		} else {
			// Term straddles the ULP boundary 10^-precision: split into exact integer
			// ULP contribution and exact sub-ULP remainder.
			const splitDigits = targetExp - t.e;
			const divisor = 10n ** BigInt(splitDigits);
			const q = t.m / divisor;
			const r = t.m % divisor;
			if (q !== 0n) {
				highTerms.push(normalizeTerm(q, targetExp));
			}
			if (r !== 0n) {
				residualTerms.push(normalizeTerm(r, t.e));
			}
		}
	}

	// Accumulate high terms at scale 10^-precision via clusters so cancelling
	// high-magnitude clusters are eliminated before shifting to targetExp.
	let qTotal = 0n;
	const highClusters = clusterTerms(aggregateByExponent(highTerms));
	for (const cluster of highClusters) {
		const s = sumCluster(cluster);
		if (s !== 0n) {
			const shift = cluster.minE - targetExp;
			qTotal += shift === 0 ? s : s * (10n ** BigInt(shift));
		}
	}

	const normResiduals = aggregateByExponent(residualTerms);
	if (normResiduals.length === 0) {
		return formatFixed(qTotal, precision);
	}

	const resClusters = clusterTerms(normResiduals);
	const countDigits = String(normResiduals.length).length;

	// If even the worst-case upper bound on all residuals combined is strictly
	// less than 0.1 ULP (< 10^(targetExp - 1)), then |R| < 0.5 ULP and the unique
	// nearest rounded integer is guaranteed to be qTotal.
	if (resClusters[0].maxMsd + 1 + countDigits <= targetExp - 1) {
		return formatFixed(qTotal, precision);
	}

	// Evaluate the top residual cluster exactly at its minimum exponent minE0 < targetExp.
	const topCluster = resClusters[0];
	const denomShift = targetExp - topCluster.minE; // >= 1
	const denom = 10n ** BigInt(denomShift);
	let rem = sumCluster(topCluster);

	// Any lower residual clusters are strictly separated below topCluster.minE,
	// so their combined effect is completely captured by the sign of the first
	// lower cluster whose exact sum is non-zero (the sticky bit).
	let sticky = 0;
	for (let i = 1; i < resClusters.length; i++) {
		const s = sumCluster(resClusters[i]);
		if (s !== 0n) {
			sticky = s > 0n ? 1 : -1;
			break;
		}
	}

	// Normalize (qTotal, rem) to floor representation so 0 <= rem < denom.
	qTotal += rem / denom;
	rem = rem % denom;
	if (rem < 0n) {
		rem += denom;
		qTotal -= 1n;
	}

	// Round-half-to-even on qTotal + rem / denom + sticky * epsilon,
	// where denom = 10^denomShift (denomShift >= 1) is always even.
	const half = denom / 2n;
	let rounded;
	if (rem < half) {
		rounded = qTotal;
	} else if (rem > half) {
		rounded = qTotal + 1n;
	} else if (sticky > 0) {
		rounded = qTotal + 1n;
	} else if (sticky < 0) {
		rounded = qTotal;
	} else {
		// Exact tie: round to the even neighbor.
		rounded = (qTotal % 2n !== 0n) ? qTotal + 1n : qTotal;
	}

	return formatFixed(rounded, precision);
}

/**
 * Adds arbitrary-precision decimal strings with configurable output precision.
 *
 * Supports two calling forms:
 * - Binary addition: `addDecimalStable(a, b, precision?)`
 * - Array summation: `addDecimalStable(values, precision?)`
 *
 * When `precision` is omitted (or `null`), returns the exact canonical decimal
 * string without rounding. When `precision` is a non-negative safe integer,
 * returns the sum rounded once using round-half-to-even (banker's rounding) to
 * exactly `precision` fractional decimal digits.
 *
 * @param {string | readonly string[]} a First decimal string, or an array of decimal strings to sum.
 * @param {string | number | null | undefined} [b] Second decimal string (binary form), or `precision` (array form).
 * @param {number | null | undefined} [precision] Optional non-negative integer number of fractional decimal digits (binary form).
 * @returns {string} Sum formatted as a canonical (exact) or fixed-precision decimal string.
 * @throws {TypeError} If operands are not strings (or array of strings), or `precision` is not a number/undefined/null.
 * @throws {RangeError} If any string is not a valid decimal, exponent overflows safe integer range, or `precision` is invalid.
 */
export function addDecimalStable(a, b, precision) {
	/** @type {Array<{ m: bigint, e: number, msd: number }>} */
	const terms = [];
	let prec;

	if (Array.isArray(a)) {
		if (precision !== undefined) {
			throw new TypeError('Unexpected third argument when summing an array of decimal strings');
		}
		prec = validatePrecision(b);
		for (let i = 0; i < a.length; i++) {
			terms.push(parseDecimal(a[i], `values[${i}]`));
		}
	} else {
		terms.push(parseDecimal(a, 'a'));
		terms.push(parseDecimal(b, 'b'));
		prec = validatePrecision(precision);
	}

	if (prec === null) {
		return sumExact(terms);
	}
	return sumWithPrecision(terms, prec);
}
