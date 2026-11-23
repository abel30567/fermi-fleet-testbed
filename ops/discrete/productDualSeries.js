/**
 * Computes the discrete product over an array of dual numbers `{ v, d }`, where
 * each element represents `v + d * ε` (`ε^2 = 0`) carrying a primal value `v`
 * alongside its forward-mode derivative `d`.
 *
 * Uses a closed-form / identity-based evaluation rather than an iterative
 * binary dual-multiplication fold:
 * - Empty product identity (`n = 0`): `{ v: 1, d: 0 }`.
 * - Zero-multiplicity closed form:
 *   - `>= 2` zero primals => `{ v: 0, d: 0 }`.
 *   - Exactly `1` zero primal at index `k` => `{ v: 0, d: d_k * ∏_{j ≠ k} v_j }`.
 * - All-nonzero primals:
 *   - Generalized Leibniz / prefix-suffix leave-one-out identity
 *     `V = ∏ v_i`, `D = ∑ d_i * (∏_{j < i} v_j) * (∏_{j > i} v_j)`
 *     accumulated with Neumaier compensated summation for exactness on normal
 *     inputs without division rounding.
 *   - Automatic fallback to the log-space logarithmic-derivative series
 *     identity `ln ∏ (v_i + d_i ε) = ∑ ln|v_i| + ε ∑ (d_i / v_i)` evaluated
 *     with per-term log-scaling `exp(L - ln|v_i| + ln|d_i|)` whenever
 *     intermediate products would overflow or underflow.
 *
 * @param {Array<{ v: number, d: number }>} xs - Array of finite dual numbers.
 * @returns {{ v: number, d: number }} The dual-number discrete product `{ v, d }`.
 * @throws {TypeError} If `xs` is not an array or any element is not an object with numeric `v` and `d`.
 * @throws {RangeError} If any element has a non-finite (`NaN`, `Infinity`, `-Infinity`) `v` or `d`.
 */
export function productDualSeries(xs) {
	if (!Array.isArray(xs)) {
		throw new TypeError("productDualSeries: expected an array of dual numbers { v, d }");
	}

	const n = xs.length;
	const vals = new Float64Array(n);
	const ders = new Float64Array(n);
	let zeroCount = 0;
	let zeroIndex = -1;

	for (let i = 0; i < n; i++) {
		const item = xs[i];
		if (item === null || typeof item !== "object") {
			throw new TypeError(`productDualSeries: element at index ${i} must be an object { v, d }`);
		}
		const { v, d } = item;
		if (typeof v !== "number" || typeof d !== "number") {
			throw new TypeError(`productDualSeries: element at index ${i} must have numeric v and d`);
		}
		if (!Number.isFinite(v) || !Number.isFinite(d)) {
			throw new RangeError(`productDualSeries: element at index ${i} must have finite v and d`);
		}
		vals[i] = v;
		ders[i] = d;
		if (v === 0) {
			zeroCount++;
			zeroIndex = i;
		}
	}

	// Empty product identity: ∏_{i ∈ ∅} (v_i + d_i ε) = 1 + 0ε.
	if (n === 0) {
		return { v: 1, d: 0 };
	}

	// Single-element identity.
	if (n === 1) {
		return {
			v: normalizeZero(vals[0]),
			d: normalizeZero(ders[0]),
		};
	}

	// Closed-form zero-multiplicity identity: two or more zero primals annihilate both v and d.
	if (zeroCount >= 2) {
		return { v: 0, d: 0 };
	}

	// Closed-form single-zero identity: V = 0, D = d_k * ∏_{j ≠ k} v_j.
	if (zeroCount === 1) {
		const dk = ders[zeroIndex];
		if (dk === 0) {
			return { v: 0, d: 0 };
		}
		let prod = dk;
		let unstable = false;
		for (let i = 0; i < n; i++) {
			if (i === zeroIndex) continue;
			prod *= vals[i];
			if (!Number.isFinite(prod) || prod === 0) {
				unstable = true;
				break;
			}
		}
		if (!unstable) {
			return { v: 0, d: normalizeZero(prod) };
		}
		// Log-space fallback for intermediate overflow/underflow.
		let sign = dk < 0 ? -1 : 1;
		const logAcc = { sum: Math.log(Math.abs(dk)), comp: 0 };
		for (let i = 0; i < n; i++) {
			if (i === zeroIndex) continue;
			const vi = vals[i];
			if (vi < 0) sign = -sign;
			neumaierAdd(logAcc, Math.log(Math.abs(vi)));
		}
		const dVal = sign * Math.exp(logAcc.sum + logAcc.comp);
		return { v: 0, d: normalizeZero(dVal) };
	}

	// All primals are nonzero.
	// Build prefix products P[i] = ∏_{j < i} v_j and suffix products S[i] = ∏_{j > i} v_j.
	const prefix = new Float64Array(n);
	const suffix = new Float64Array(n);
	let prefixUnstable = false;
	let suffixUnstable = false;

	prefix[0] = 1;
	for (let i = 1; i < n; i++) {
		const next = prefix[i - 1] * vals[i - 1];
		prefix[i] = next;
		if (!Number.isFinite(next) || next === 0) {
			prefixUnstable = true;
		}
	}

	suffix[n - 1] = 1;
	for (let i = n - 2; i >= 0; i--) {
		const next = suffix[i + 1] * vals[i + 1];
		suffix[i] = next;
		if (!Number.isFinite(next) || next === 0) {
			suffixUnstable = true;
		}
	}

	// Lazy log-space state (computed at most once if any product overflows/underflows).
	let logState = null;
	const getLogState = () => {
		if (logState !== null) return logState;
		let sign = 1;
		const logAcc = { sum: 0, comp: 0 };
		for (let i = 0; i < n; i++) {
			const vi = vals[i];
			if (vi < 0) sign = -sign;
			neumaierAdd(logAcc, Math.log(Math.abs(vi)));
		}
		logState = { sign, totalLog: logAcc.sum + logAcc.comp };
		return logState;
	};

	// Primal product V = ∏ v_i.
	let totalV;
	const directV = prefix[n - 1] * vals[n - 1];
	if (!prefixUnstable && Number.isFinite(directV) && directV !== 0) {
		totalV = directV;
	} else {
		const { sign, totalLog } = getLogState();
		totalV = sign * Math.exp(totalLog);
	}

	// Derivative via generalized Leibniz / prefix-suffix identity with log-space series fallback.
	const derAcc = { sum: 0, comp: 0 };
	const directAvailable = !prefixUnstable && !suffixUnstable;

	for (let i = 0; i < n; i++) {
		const di = ders[i];
		if (di === 0) continue;

		let term;
		if (directAvailable) {
			const leaveOneOut = prefix[i] * suffix[i];
			const candidate = di * leaveOneOut;
			if (
				Number.isFinite(leaveOneOut) &&
				leaveOneOut !== 0 &&
				Number.isFinite(candidate) &&
				candidate !== 0
			) {
				term = candidate;
			} else {
				term = logSpaceTerm(di, vals[i], getLogState());
			}
		} else {
			term = logSpaceTerm(di, vals[i], getLogState());
		}

		neumaierAdd(derAcc, term);
	}

	return {
		v: normalizeZero(totalV),
		d: normalizeZero(derAcc.sum + derAcc.comp),
	};
}

/**
 * Evaluates a single leave-one-out derivative term `d_i * ∏_{j ≠ i} v_j`
 * using the logarithmic-derivative series identity in log-space:
 * `sgn(d_i) * sgn(V) * sgn(v_i) * exp(∑ ln|v_j| - ln|v_i| + ln|d_i|)`.
 *
 * @param {number} di - Nonzero derivative `d_i`.
 * @param {number} vi - Nonzero primal `v_i`.
 * @param {{ sign: number, totalLog: number }} logState - Precomputed total sign and log-magnitude.
 * @returns {number}
 */
function logSpaceTerm(di, vi, logState) {
	const sign = (di < 0 ? -1 : 1) * logState.sign * (vi < 0 ? -1 : 1);
	const logMag = logState.totalLog - Math.log(Math.abs(vi)) + Math.log(Math.abs(di));
	return sign * Math.exp(logMag);
}

/**
 * Neumaier compensated summation step.
 *
 * @param {{ sum: number, comp: number }} acc
 * @param {number} x
 */
function neumaierAdd(acc, x) {
	const t = acc.sum + x;
	if (!Number.isFinite(t)) {
		acc.sum = t;
		acc.comp = 0;
		return;
	}
	if (Math.abs(acc.sum) >= Math.abs(x)) {
		acc.comp += (acc.sum - t) + x;
	} else {
		acc.comp += (x - t) + acc.sum;
	}
	acc.sum = t;
}

/**
 * Normalizes `-0` to `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}
