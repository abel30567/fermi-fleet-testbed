/**
 * Exact rational number in lowest terms with a positive denominator.
 * Zero is represented canonically as `{ num: 0n, den: 1n }`.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

/**
 * Normalizes a numerator/denominator pair into a canonical exact rational
 * `{ num: BigInt, den: BigInt }` in lowest terms with `den > 0n`
 * (and `0` as `{ num: 0n, den: 1n }`).
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero');
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcd(n, d);
	return { num: n / g, den: d / g };
}

/**
 * Validates and normalizes a single rational input entry.
 *
 * @param {unknown} value
 * @param {number} rowIndex
 * @param {number} colIndex
 * @returns {Rational}
 */
function validateRational(value, rowIndex, colIndex) {
	if (
		typeof value !== 'object' ||
		value === null ||
		typeof value.num !== 'bigint' ||
		typeof value.den !== 'bigint'
	) {
		throw new TypeError(
			`Matrix entry at (${rowIndex}, ${colIndex}) must be an object { num: BigInt, den: BigInt }`
		);
	}
	if (value.den === 0n) {
		throw new RangeError(
			`Matrix entry at (${rowIndex}, ${colIndex}) has zero denominator`
		);
	}
	return normalizeRational(value.num, value.den);
}

/**
 * Checks whether a value is a non-string iterable object.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isIterableSequence(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof value[Symbol.iterator] === 'function'
	);
}

/**
 * Multiplies two normalized rationals, returning a normalized rational.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const g1 = gcd(a.num, b.den);
	const g2 = gcd(b.num, a.den);
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	};
}

/**
 * Divides normalized rational `a` by non-zero normalized rational `b`.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function divRational(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero rational');
	}
	if (a.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const invB =
		b.num < 0n
			? { num: -b.den, den: -b.num }
			: { num: b.den, den: b.num };
	return mulRational(a, invB);
}

/**
 * Subtracts normalized rational `b` from normalized rational `a`.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function subRational(a, b) {
	if (b.num === 0n) {
		return { num: a.num, den: a.den };
	}
	if (a.num === 0n) {
		return { num: -b.num, den: b.den };
	}
	if (a.den === b.den) {
		return normalizeRational(a.num - b.num, a.den);
	}
	const g = gcd(a.den, b.den);
	const aDenReduced = a.den / g;
	const bDenReduced = b.den / g;
	return normalizeRational(
		a.num * bDenReduced - b.num * aDenReduced,
		aDenReduced * b.den
	);
}

/**
 * Negates a normalized rational.
 *
 * @param {Rational} a
 * @returns {Rational}
 */
function negRational(a) {
	return a.num === 0n ? { num: 0n, den: 1n } : { num: -a.num, den: a.den };
}

/**
 * Lazily consumes and validates entries from a single row iterable, yielding
 * normalized rationals one at a time. When `expectedLength` is provided, stops
 * immediately and throws if the row yields more than `expectedLength` entries.
 *
 * @param {Iterable<Rational>} rowIterable
 * @param {number | null} expectedLength
 * @param {number} rowIndex
 * @returns {Generator<Rational, void, void>}
 */
function* streamRowEntries(rowIterable, expectedLength, rowIndex) {
	if (!isIterableSequence(rowIterable)) {
		throw new TypeError(
			`Row ${rowIndex} must be an iterable of exact rationals`
		);
	}

	let colIndex = 0;
	for (const rawEntry of rowIterable) {
		if (expectedLength !== null && colIndex >= expectedLength) {
			throw new RangeError(
				`Ragged matrix: row ${rowIndex} has more than ${expectedLength} columns`
			);
		}
		yield validateRational(rawEntry, rowIndex, colIndex);
		colIndex += 1;
	}

	if (expectedLength === null) {
		if (colIndex === 0) {
			throw new RangeError('Matrix rows must not be empty');
		}
	} else if (colIndex < expectedLength) {
		throw new RangeError(
			`Ragged matrix: row ${rowIndex} has ${colIndex} columns, expected ${expectedLength}`
		);
	}
}

/**
 * Lazily streams rows from a matrix iterable, validating square dimensions and
 * normalizing rational entries on the fly without pre-materializing the matrix.
 * Fails fast if the outer iterable yields more than `n` rows.
 *
 * @param {Iterable<Iterable<Rational>>} matrix
 * @returns {Generator<{ rowIndex: number, dimension: number, row: Rational[] }, void, void>}
 */
function* streamValidatedRows(matrix) {
	if (!isIterableSequence(matrix)) {
		throw new TypeError('Matrix must be an iterable of row iterables');
	}

	let dimension = null;
	let rowIndex = 0;

	for (const rawRow of matrix) {
		if (dimension !== null && rowIndex >= dimension) {
			throw new RangeError(
				`Matrix must be square: received more than ${dimension} rows for ${dimension} columns`
			);
		}

		const row = [];
		for (const entry of streamRowEntries(rawRow, dimension, rowIndex)) {
			row.push(entry);
		}

		if (dimension === null) {
			dimension = row.length;
		}

		yield { rowIndex, dimension, row };
		rowIndex += 1;
	}

	if (dimension === null) {
		throw new RangeError('Matrix must not be empty');
	}

	if (rowIndex < dimension) {
		throw new RangeError(
			`Matrix must be square: received ${rowIndex} rows for ${dimension} columns`
		);
	}
}

/**
 * Performs streaming row-by-row Gaussian elimination over exact rationals,
 * lazily yielding signed pivot factors as each row arrives.
 *
 * Because each incoming row is reduced against previously placed pivot rows
 * using type-III row operations (which preserve the determinant), placing a
 * new pivot at column `c` contributes a sign flip for every previously placed
 * pivot column `c' > c` (counting permutation inversions incrementally).
 *
 * If linear dependence is detected, yields `{ factor: { num: 0n, den: 1n }, singular: true }`
 * and continues draining remaining rows only for strict shape/type validation
 * without performing further elimination work.
 *
 * @param {Iterable<Iterable<Rational>>} matrix
 * @returns {Generator<{ factor: Rational, singular: boolean }, void, void>}
 */
function* streamPivotFactors(matrix) {
	/** @type {(Rational[] | null)[] | null} */
	let pivots = null;
	let singular = false;

	for (const { dimension, row } of streamValidatedRows(matrix)) {
		if (pivots === null) {
			pivots = new Array(dimension).fill(null);
		}

		if (singular) {
			continue;
		}

		let pivotCol = -1;
		for (let c = 0; c < dimension; c += 1) {
			const val = row[c];
			if (val.num === 0n) {
				continue;
			}

			const existingPivotRow = pivots[c];
			if (existingPivotRow === null) {
				pivotCol = c;
				break;
			}

			row[c] = { num: 0n, den: 1n };
			for (let k = c + 1; k < dimension; k += 1) {
				const pivotEntry = existingPivotRow[k];
				if (pivotEntry.num !== 0n) {
					row[k] = subRational(row[k], mulRational(val, pivotEntry));
				}
			}
		}

		if (pivotCol === -1) {
			singular = true;
			pivots = [];
			yield { factor: { num: 0n, den: 1n }, singular: true };
			continue;
		}

		const pivotVal = row[pivotCol];

		let flipSign = false;
		for (let c = pivotCol + 1; c < dimension; c += 1) {
			if (pivots[c] !== null) {
				flipSign = !flipSign;
			}
		}

		row[pivotCol] = { num: 1n, den: 1n };
		for (let k = pivotCol + 1; k < dimension; k += 1) {
			if (row[k].num !== 0n) {
				row[k] = divRational(row[k], pivotVal);
			}
		}
		pivots[pivotCol] = row;

		yield {
			factor: flipSign ? negRational(pivotVal) : pivotVal,
			singular: false,
		};
	}
}

/**
 * Computes the exact determinant of a square matrix over exact rationals
 * `{ num: BigInt, den: BigInt }` using a streaming, generator-based Gaussian
 * elimination algorithm that consumes outer and inner iterables lazily.
 *
 * Inputs may be any non-string iterables (arrays, generators, sets, custom
 * iterables) yielding rows of `{ num: BigInt, den: BigInt }` objects with
 * non-zero denominators. Input rationals need not be pre-reduced; the returned
 * determinant is always normalized to lowest terms with `den > 0n` (and zero
 * returned as `{ num: 0n, den: 1n }`).
 *
 * @param {Iterable<Iterable<Rational>>} matrix - Square non-empty iterable of row iterables of exact rationals.
 * @returns {Rational} Exact determinant normalized to lowest terms with `den > 0n`.
 * @throws {TypeError} If `matrix`, any row, or any rational entry has an invalid type.
 * @throws {RangeError} If `matrix` is empty, ragged, non-square, or contains a zero denominator.
 */
export function determinantRationalLazy(matrix) {
	let det = { num: 1n, den: 1n };
	let isSingular = false;

	for (const { factor, singular } of streamPivotFactors(matrix)) {
		if (singular) {
			isSingular = true;
			det = { num: 0n, den: 1n };
		} else if (!isSingular) {
			det = mulRational(det, factor);
		}
	}

	return det;
}
