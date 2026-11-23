/**
 * Default fixed-point scale factor (10^18) used for fixed-point BigInt inputs
 * and non-integer normalized convolution outputs.
 *
 * @type {bigint}
 */
export const FIXED_POINT_SCALE = 10n ** 18n;

const VALID_MODES = new Set(['full', 'same', 'valid', 'circular']);

/**
 * Validates that a value is an array containing only BigInt elements.
 *
 * @param {unknown} arr - Candidate array to validate.
 * @param {string} name - Parameter name for error messages.
 */
function validateBigIntArray(arr, name) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an array of BigInt values`);
	}
	for (let i = 0; i < arr.length; i++) {
		if (typeof arr[i] !== 'bigint') {
			throw new TypeError(`${name}[${i}] must be a bigint, got ${typeof arr[i]}`);
		}
	}
}

/**
 * Counts trailing zero bits of a positive power-of-two BigInt (2^k -> k).
 *
 * @param {bigint} powerOfTwo - A positive BigInt with exactly one bit set.
 * @returns {bigint} The exponent k such that powerOfTwo === 1n << k.
 */
function ctzPowerOfTwo(powerOfTwo) {
	const hex = powerOfTwo.toString(16);
	const first = hex[0];
	const highBits = first === '1' ? 0 : first === '2' ? 1 : first === '4' ? 2 : 3;
	return BigInt((hex.length - 1) * 4 + highBits);
}

/**
 * Finds the common power-of-two trailing-zero shift across all nonzero elements
 * of a BigInt array, enabling exact bit-shift prescaling before multiplication.
 *
 * @param {bigint[]} arr - Validated BigInt array.
 * @returns {{ allZero: boolean, shift: bigint }} Prescaling metadata.
 */
function findCommonBitShift(arr) {
	let minLowBit = 0n;
	for (let i = 0; i < arr.length; i++) {
		const x = arr[i];
		if (x === 0n) continue;
		if ((x & 1n) !== 0n) {
			return { allZero: false, shift: 0n };
		}
		const lowBit = x & -x;
		if (minLowBit === 0n || lowBit < minLowBit) {
			minLowBit = lowBit;
		}
	}
	if (minLowBit === 0n) {
		return { allZero: true, shift: 0n };
	}
	return { allZero: false, shift: ctzPowerOfTwo(minLowBit) };
}

/**
 * Balanced pairwise (divide-and-conquer) summation over a BigInt array slice.
 * Keeps operand bit-lengths balanced in O(log n) tree depth without sub-array
 * allocations.
 *
 * @param {bigint[]} terms - Non-negative BigInt terms to sum.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {bigint} Exact sum of terms[start..end-1].
 */
function pairwiseSum(terms, start, end) {
	const len = end - start;
	if (len === 0) return 0n;
	if (len === 1) return terms[start];
	if (len === 2) return terms[start] + terms[start + 1];
	const mid = start + (len >>> 1);
	return pairwiseSum(terms, start, mid) + pairwiseSum(terms, mid, end);
}

/**
 * Exact sign-separated summation: sums all positive and negative terms in
 * independent balanced binary trees before performing a single final
 * subtraction, avoiding intermediate cancellation.
 *
 * @param {bigint[]} arr - Array of BigInt values.
 * @returns {bigint} Exact sum of all elements.
 */
function exactSignSeparatedSum(arr) {
	const pos = [];
	const neg = [];
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i];
		if (v > 0n) pos.push(v);
		else if (v < 0n) neg.push(-v);
	}
	return pairwiseSum(pos, 0, pos.length) - pairwiseSum(neg, 0, neg.length);
}

/**
 * Exact BigInt division with IEEE-754 round-half-to-even (banker's rounding),
 * guaranteeing an error bound of at most 0.5 ULP.
 *
 * @param {bigint} numerator - Exact dividend.
 * @param {bigint} denominator - Nonzero exact divisor.
 * @returns {bigint} Nearest BigInt to numerator / denominator (ties to even).
 */
function divRoundHalfToEven(numerator, denominator) {
	if (denominator === 0n) {
		throw new RangeError('Division by zero in fixed-point or normalized convolution');
	}
	if (numerator === 0n) return 0n;

	const negative = (numerator < 0n) !== (denominator < 0n);
	const absNum = numerator < 0n ? -numerator : numerator;
	const absDen = denominator < 0n ? -denominator : denominator;

	let quotient = absNum / absDen;
	const remainder = absNum % absDen;
	const twiceRem = remainder << 1n;

	if (twiceRem > absDen || (twiceRem === absDen && (quotient & 1n) === 1n)) {
		quotient += 1n;
	}

	return negative ? (quotient === 0n ? 0n : -quotient) : quotient;
}

/**
 * Computes the discrete 1D convolution of two exact BigInt sequences using a
 * numerically robust implementation:
 * - Exact common power-of-two prescaling to reduce intermediate operand sizes.
 * - Sign-separated balanced pairwise summation to eliminate intermediate
 *   cancellation and keep operand growth balanced.
 * - Full-precision accumulation with a single final round-half-to-even scaling
 *   step in fixed-point or normalized modes (strictly <= 0.5 ULP error bound).
 *
 * By default (`fixedPoint: false`, `normalize: false`, `mode: 'full'`), computes
 * the exact full linear discrete convolution over BigInt integers:
 *   (a * b)[k] = sum_{i} a[i] * b[k - i],  for k = 0 .. a.length + b.length - 2.
 *
 * When `fixedPoint: true`, inputs are treated as fixed-point BigInts scaled by
 * `scale` (default 10^18); all products are accumulated exactly at `scale^2`
 * before a single unbiased round-half-to-even division by `scale`.
 *
 * When `normalize: true`, the convolution is divided by the exact sum of the
 * kernel `b`, returning fixed-point BigInts scaled by `scale` (default 10^18).
 *
 * @param {bigint[]} a - Input signal sequence of exact BigInt values.
 * @param {bigint[]} b - Convolution kernel sequence of exact BigInt values.
 * @param {object} [options] - Optional configuration.
 * @param {'full'|'same'|'valid'|'circular'} [options.mode='full'] - Output shape mode.
 * @param {boolean} [options.fixedPoint=false] - Whether inputs are fixed-point BigInts scaled by `scale`.
 * @param {boolean} [options.normalize=false] - Whether to normalize by the sum of `b` (result scaled by `scale`).
 * @param {bigint} [options.scale=10n**18n] - Positive BigInt fixed-point scale factor.
 * @param {number} [options.circularLength] - Period length for `'circular'` mode (defaults to `Math.max(a.length, b.length)`).
 * @returns {bigint[]} The convolved BigInt sequence.
 */
export function convolutionBigIntStable(a, b, options = {}) {
	validateBigIntArray(a, 'a');
	validateBigIntArray(b, 'b');

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object');
	}

	const {
		mode = 'full',
		fixedPoint = false,
		normalize = false,
		scale = FIXED_POINT_SCALE,
		circularLength,
	} = options;

	if (typeof mode !== 'string' || !VALID_MODES.has(mode)) {
		throw new RangeError(`Unsupported mode "${String(mode)}"; expected 'full', 'same', 'valid', or 'circular'`);
	}
	if (typeof fixedPoint !== 'boolean') {
		throw new TypeError('options.fixedPoint must be a boolean');
	}
	if (typeof normalize !== 'boolean') {
		throw new TypeError('options.normalize must be a boolean');
	}
	if (typeof scale !== 'bigint') {
		throw new TypeError('options.scale must be a bigint');
	}
	if (scale <= 0n) {
		throw new RangeError('options.scale must be positive');
	}
	if (circularLength !== undefined) {
		if (!Number.isSafeInteger(circularLength) || circularLength <= 0) {
			throw new RangeError('options.circularLength must be a positive safe integer');
		}
	}

	const m = a.length;
	const n = b.length;
	if (m === 0 || n === 0) {
		return [];
	}

	let kernelSum = 0n;
	if (normalize) {
		kernelSum = exactSignSeparatedSum(b);
		if (kernelSum === 0n) {
			throw new RangeError('Cannot normalize convolution when kernel sum is zero');
		}
	}

	const fullLen = m + n - 1;
	const outLen =
		mode === 'full'
			? fullLen
			: mode === 'same'
				? m
				: mode === 'valid'
					? Math.max(m, n) - Math.min(m, n) + 1
					: (circularLength ?? Math.max(m, n));

	const metaA = findCommonBitShift(a);
	const metaB = findCommonBitShift(b);
	if (metaA.allZero || metaB.allZero) {
		return new Array(outLen).fill(0n);
	}

	const shiftA = metaA.shift;
	const shiftB = metaB.shift;
	const totalShift = shiftA + shiftB;

	const scaledA = shiftA > 0n ? a.map((v) => v >> shiftA) : a;
	const scaledB = shiftB > 0n ? b.map((v) => v >> shiftB) : b;

	/**
	 * Finalizes an exact prescaled sum by restoring bit shifts and applying a
	 * single unbiased round-half-to-even scaling step when required.
	 *
	 * @param {bigint} rawSum - Exact sum of prescaled products.
	 * @returns {bigint} Final output value.
	 */
	function finalize(rawSum) {
		if (rawSum === 0n) return 0n;
		const exactSum = totalShift > 0n ? rawSum << totalShift : rawSum;
		if (!fixedPoint && !normalize) {
			return exactSum;
		}
		if (fixedPoint && !normalize) {
			return divRoundHalfToEven(exactSum, scale);
		}
		if (!fixedPoint && normalize) {
			return divRoundHalfToEven(exactSum * scale, kernelSum);
		}
		// fixedPoint && normalize: exactSum has scale^2 and kernelSum has scale -> ratio has scale
		return divRoundHalfToEven(exactSum, kernelSum);
	}

	const result = new Array(outLen);
	const pos = [];
	const neg = [];

	if (mode === 'circular') {
		for (let outIdx = 0; outIdx < outLen; outIdx++) {
			pos.length = 0;
			neg.length = 0;
			for (let k = outIdx; k < fullLen; k += outLen) {
				const iStart = Math.max(0, k - (n - 1));
				const iEnd = Math.min(m - 1, k);
				for (let i = iStart; i <= iEnd; i++) {
					const prod = scaledA[i] * scaledB[k - i];
					if (prod > 0n) pos.push(prod);
					else if (prod < 0n) neg.push(-prod);
				}
			}
			const rawSum = pairwiseSum(pos, 0, pos.length) - pairwiseSum(neg, 0, neg.length);
			result[outIdx] = finalize(rawSum);
		}
		return result;
	}

	const kOffset =
		mode === 'full'
			? 0
			: mode === 'same'
				? Math.floor((n - 1) / 2)
				: Math.min(m, n) - 1;

	for (let outIdx = 0; outIdx < outLen; outIdx++) {
		const k = kOffset + outIdx;
		const iStart = Math.max(0, k - (n - 1));
		const iEnd = Math.min(m - 1, k);
		pos.length = 0;
		neg.length = 0;

		for (let i = iStart; i <= iEnd; i++) {
			const prod = scaledA[i] * scaledB[k - i];
			if (prod > 0n) pos.push(prod);
			else if (prod < 0n) neg.push(-prod);
		}

		const rawSum = pairwiseSum(pos, 0, pos.length) - pairwiseSum(neg, 0, neg.length);
		result[outIdx] = finalize(rawSum);
	}

	return result;
}
