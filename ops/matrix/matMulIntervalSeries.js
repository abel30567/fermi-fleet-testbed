/**
 * Interval arithmetic matrix multiplication with guaranteed outward-rounded enclosure.
 *
 * Computes the interval matrix product `C = A * B` for `m x k` interval matrix `A`
 * and `k x n` interval matrix `B`, where every entry is a closed real interval
 * `[lo, hi]` with finite IEEE 754 binary64 endpoints (`lo <= hi`).
 *
 * Mathematical method:
 * - Elementary interval multiplication uses the closed-form 9-case sign identity over
 *   endpoint products `[aLo, aHi] * [bLo, bHi]`.
 * - Directed outward rounding (`mulDown`/`mulUp`, `addDown`/`addUp`) combines
 *   error-free transformation identities — Veltkamp–Dekker `TwoProd` (`a * b = p + err`)
 *   and Knuth `TwoSum` (`a + b = s + err`) — with IEEE 754 binary64 `nextDown`/`nextUp`
 *   via `Float64Array`/`BigUint64Array` bit stepping, with conservative `nextDown`/`nextUp`
 *   fallbacks near overflow/underflow boundaries.
 * - Each inner-product series `sum_{p=0}^{k-1} A[i][p] * B[p][j]` is accumulated via
 *   TwoSum-compensated series summation (`s + c`) where residuals are folded outward
 *   (`compLo = addDown(compLo, err)`, `compHi = addUp(compHi, err)`), preserving
 *   strict mathematical enclosure while remaining sharp under catastrophic cancellation.
 *
 * @module ops/matrix/matMulIntervalSeries
 */

const f64View = new Float64Array(1);
const u64View = new BigUint64Array(f64View.buffer);

/** Veltkamp splitting factor 2^27 + 1 for IEEE 754 binary64 TwoProd. */
const VELTKAMP_SPLIT = 134217729;

/** Safe exponent bounds guaranteeing overflow-free and underflow-free Dekker TwoProd. */
const TWOPROD_MAX_OP = 1e299;
const TWOPROD_MAX_PROD = 1e307;
const TWOPROD_MIN_PROD = 1e-290;

/**
 * Normalizes `-0` to `+0`.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Returns the least IEEE 754 binary64 number strictly greater than `x`.
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x;
	if (x === 0) return Number.MIN_VALUE;
	if (x === -Infinity) return -Number.MAX_VALUE;
	f64View[0] = x;
	if (x > 0) {
		u64View[0] += 1n;
	} else {
		u64View[0] -= 1n;
	}
	return normalizeZero(f64View[0]);
}

/**
 * Returns the greatest IEEE 754 binary64 number strictly less than `x`.
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	if (Number.isNaN(x) || x === -Infinity) return x;
	if (x === 0) return -Number.MIN_VALUE;
	if (x === Infinity) return Number.MAX_VALUE;
	f64View[0] = x;
	if (x > 0) {
		u64View[0] -= 1n;
	} else {
		u64View[0] += 1n;
	}
	return normalizeZero(f64View[0]);
}

/**
 * Computes a guaranteed lower bound on the exact real sum `a + b` (round toward -Infinity).
 * Uses Knuth's TwoSum identity `a + b = s + err` when finite.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addDown(a, b) {
	if (a === -Infinity || b === -Infinity) return -Infinity;
	if (a === Infinity || b === Infinity) return Infinity;
	if (a === 0) return normalizeZero(b);
	if (b === 0) return normalizeZero(a);
	const s = a + b;
	if (!Number.isFinite(s)) {
		return s > 0 ? Number.MAX_VALUE : -Infinity;
	}
	const bv = s - a;
	const av = s - bv;
	const da = a - av;
	const db = b - bv;
	const err = da + db;
	if (
		Number.isFinite(bv) &&
		Number.isFinite(av) &&
		Number.isFinite(da) &&
		Number.isFinite(db) &&
		Number.isFinite(err)
	) {
		return err < 0 ? nextDown(s) : normalizeZero(s);
	}
	return nextDown(s);
}

/**
 * Computes a guaranteed upper bound on the exact real sum `a + b` (round toward +Infinity).
 * Uses Knuth's TwoSum identity `a + b = s + err` when finite.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addUp(a, b) {
	if (a === Infinity || b === Infinity) return Infinity;
	if (a === -Infinity || b === -Infinity) return -Infinity;
	if (a === 0) return normalizeZero(b);
	if (b === 0) return normalizeZero(a);
	const s = a + b;
	if (!Number.isFinite(s)) {
		return s > 0 ? Infinity : -Number.MAX_VALUE;
	}
	const bv = s - a;
	const av = s - bv;
	const da = a - av;
	const db = b - bv;
	const err = da + db;
	if (
		Number.isFinite(bv) &&
		Number.isFinite(av) &&
		Number.isFinite(da) &&
		Number.isFinite(db) &&
		Number.isFinite(err)
	) {
		return err > 0 ? nextUp(s) : normalizeZero(s);
	}
	return nextUp(s);
}

/**
 * Computes a guaranteed lower bound on the exact real product `a * b` (round toward -Infinity).
 * Uses Veltkamp–Dekker TwoProd identity `a * b = p + err` within safe exponent range.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulDown(a, b) {
	if (a === 0 || b === 0) return 0;
	const p = a * b;
	if (!Number.isFinite(p)) {
		return p > 0 ? Number.MAX_VALUE : -Infinity;
	}
	if (p === 0) {
		return (a > 0) === (b > 0) ? 0 : -Number.MIN_VALUE;
	}
	const absA = Math.abs(a);
	const absB = Math.abs(b);
	const absP = Math.abs(p);
	if (
		absA < TWOPROD_MAX_OP &&
		absB < TWOPROD_MAX_OP &&
		absP > TWOPROD_MIN_PROD &&
		absP < TWOPROD_MAX_PROD
	) {
		const ca = VELTKAMP_SPLIT * a;
		const ah = ca - (ca - a);
		const al = a - ah;
		const cb = VELTKAMP_SPLIT * b;
		const bh = cb - (cb - b);
		const bl = b - bh;
		const err = (ah * bh - p + ah * bl + al * bh) + al * bl;
		return err < 0 ? nextDown(p) : normalizeZero(p);
	}
	return nextDown(p);
}

/**
 * Computes a guaranteed upper bound on the exact real product `a * b` (round toward +Infinity).
 * Uses Veltkamp–Dekker TwoProd identity `a * b = p + err` within safe exponent range.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulUp(a, b) {
	if (a === 0 || b === 0) return 0;
	const p = a * b;
	if (!Number.isFinite(p)) {
		return p > 0 ? Infinity : -Number.MAX_VALUE;
	}
	if (p === 0) {
		return (a > 0) === (b > 0) ? Number.MIN_VALUE : 0;
	}
	const absA = Math.abs(a);
	const absB = Math.abs(b);
	const absP = Math.abs(p);
	if (
		absA < TWOPROD_MAX_OP &&
		absB < TWOPROD_MAX_OP &&
		absP > TWOPROD_MIN_PROD &&
		absP < TWOPROD_MAX_PROD
	) {
		const ca = VELTKAMP_SPLIT * a;
		const ah = ca - (ca - a);
		const al = a - ah;
		const cb = VELTKAMP_SPLIT * b;
		const bh = cb - (cb - b);
		const bl = b - bh;
		const err = (ah * bh - p + ah * bl + al * bh) + al * bl;
		return err > 0 ? nextUp(p) : normalizeZero(p);
	}
	return nextUp(p);
}

/**
 * Closed-form 9-case sign-dispatched interval product `[aLo, aHi] * [bLo, bHi]`
 * with outward rounding.
 * @param {number} aLo
 * @param {number} aHi
 * @param {number} bLo
 * @param {number} bHi
 * @returns {[number, number]}
 */
function intervalMul(aLo, aHi, bLo, bHi) {
	if (aLo >= 0) {
		if (bLo >= 0) {
			return [mulDown(aLo, bLo), mulUp(aHi, bHi)];
		}
		if (bHi <= 0) {
			return [mulDown(aHi, bLo), mulUp(aLo, bHi)];
		}
		return [mulDown(aHi, bLo), mulUp(aHi, bHi)];
	}
	if (aHi <= 0) {
		if (bLo >= 0) {
			return [mulDown(aLo, bHi), mulUp(aHi, bLo)];
		}
		if (bHi <= 0) {
			return [mulDown(aHi, bHi), mulUp(aLo, bLo)];
		}
		return [mulDown(aLo, bHi), mulUp(aLo, bLo)];
	}
	// aLo < 0 < aHi
	if (bLo >= 0) {
		return [mulDown(aLo, bHi), mulUp(aHi, bHi)];
	}
	if (bHi <= 0) {
		return [mulDown(aHi, bLo), mulUp(aLo, bLo)];
	}
	// Both intervals straddle zero
	const lo1 = mulDown(aLo, bHi);
	const lo2 = mulDown(aHi, bLo);
	const hi1 = mulUp(aLo, bLo);
	const hi2 = mulUp(aHi, bHi);
	return [lo1 < lo2 ? lo1 : lo2, hi1 > hi2 ? hi1 : hi2];
}

/**
 * Validates that `M` is a non-empty rectangular 2D matrix of finite `[lo, hi]`
 * intervals with `lo <= hi`.
 * @param {unknown} M
 * @param {string} name
 * @returns {{ rows: number, cols: number }}
 */
function validateIntervalMatrix(M, name) {
	if (!Array.isArray(M)) {
		throw new TypeError(`${name} must be a 2D array of [lo, hi] intervals`);
	}
	const rows = M.length;
	if (rows === 0) {
		throw new RangeError(`${name} must not be empty`);
	}
	if (!Array.isArray(M[0])) {
		throw new TypeError(`${name}[0] must be an array of [lo, hi] intervals`);
	}
	const cols = M[0].length;
	if (cols === 0) {
		throw new RangeError(`${name} rows must not be empty`);
	}

	for (let r = 0; r < rows; r++) {
		const row = M[r];
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${r}] must be an array of [lo, hi] intervals`);
		}
		if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular: row ${r} has length ${row.length}, expected ${cols}`
			);
		}
		for (let c = 0; c < cols; c++) {
			const cell = row[c];
			if (!Array.isArray(cell) || cell.length !== 2) {
				throw new TypeError(
					`${name}[${r}][${c}] must be a 2-element [lo, hi] array`
				);
			}
			const lo = cell[0];
			const hi = cell[1];
			if (typeof lo !== 'number' || typeof hi !== 'number') {
				throw new TypeError(
					`${name}[${r}][${c}] endpoints must be numbers`
				);
			}
			if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
				throw new RangeError(
					`${name}[${r}][${c}] endpoints must be finite numbers`
				);
			}
			if (lo > hi) {
				throw new RangeError(
					`${name}[${r}][${c}] is an inverted interval: lo (${lo}) > hi (${hi})`
				);
			}
		}
	}

	return { rows, cols };
}

/**
 * Multiplies two interval matrices `A` (m x k) and `B` (k x n) over closed intervals
 * `[lo, hi]` using closed-form sign-dispatched interval multiplication and
 * TwoSum-compensated series accumulation with IEEE 754 outward rounding.
 *
 * Guarantees mathematical enclosure: for every real matrix `a in A` and `b in B`
 * (entrywise `A[i][p][0] <= a[i][p] <= A[i][p][1]` and `B[p][j][0] <= b[p][j] <= B[p][j][1]`),
 * the exact real matrix product satisfies `C[i][j][0] <= (a * b)[i][j] <= C[i][j][1]`.
 *
 * @param {Array<Array<[number, number]>>} A - Left `m x k` interval matrix.
 * @param {Array<Array<[number, number]>>} B - Right `k x n` interval matrix.
 * @returns {Array<Array<[number, number]>>} Resulting `m x n` interval matrix enclosing `A * B`.
 * @throws {TypeError} If `A` or `B` is not a 2D array of `[number, number]` pairs.
 * @throws {RangeError} If matrices are empty, ragged, have incompatible dimensions,
 *   contain non-finite endpoints, or contain any inverted interval (`lo > hi`).
 */
export function matMulIntervalSeries(A, B) {
	const { rows: m, cols: kA } = validateIntervalMatrix(A, 'A');
	const { rows: kB, cols: n } = validateIntervalMatrix(B, 'B');

	if (kA !== kB) {
		throw new RangeError(
			`Incompatible matrix dimensions: A is ${m}x${kA} but B is ${kB}x${n}`
		);
	}

	const k = kA;
	const C = new Array(m);

	for (let i = 0; i < m; i++) {
		const rowA = A[i];
		const rowC = new Array(n);
		for (let j = 0; j < n; j++) {
			let sumLo = 0;
			let compLo = 0;
			let sumHi = 0;
			let compHi = 0;

			for (let p = 0; p < k; p++) {
				const aCell = rowA[p];
				const bCell = B[p][j];
				const [pLo, pHi] = intervalMul(aCell[0], aCell[1], bCell[0], bCell[1]);

				// Compensated downward series step: maintains sumLo + compLo <= exact sum of pLo
				if (Number.isFinite(sumLo) && Number.isFinite(pLo)) {
					const s = sumLo + pLo;
					const bv = s - sumLo;
					const av = s - bv;
					const da = sumLo - av;
					const db = pLo - bv;
					const err = da + db;
					if (
						Number.isFinite(s) &&
						Number.isFinite(bv) &&
						Number.isFinite(av) &&
						Number.isFinite(da) &&
						Number.isFinite(db) &&
						Number.isFinite(err)
					) {
						sumLo = s;
						compLo = addDown(compLo, err);
					} else {
						sumLo = addDown(sumLo, pLo);
					}
				} else {
					sumLo = addDown(sumLo, pLo);
				}

				// Compensated upward series step: maintains sumHi + compHi >= exact sum of pHi
				if (Number.isFinite(sumHi) && Number.isFinite(pHi)) {
					const s = sumHi + pHi;
					const bv = s - sumHi;
					const av = s - bv;
					const da = sumHi - av;
					const db = pHi - bv;
					const err = da + db;
					if (
						Number.isFinite(s) &&
						Number.isFinite(bv) &&
						Number.isFinite(av) &&
						Number.isFinite(da) &&
						Number.isFinite(db) &&
						Number.isFinite(err)
					) {
						sumHi = s;
						compHi = addUp(compHi, err);
					} else {
						sumHi = addUp(sumHi, pHi);
					}
				} else {
					sumHi = addUp(sumHi, pHi);
				}
			}

			rowC[j] = [
				normalizeZero(addDown(sumLo, compLo)),
				normalizeZero(addUp(sumHi, compHi)),
			];
		}
		C[i] = rowC;
	}

	return C;
}
