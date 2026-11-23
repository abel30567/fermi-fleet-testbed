import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceBigIntStable } from './traceBigIntStable.js';

/**
 * Deterministic linear congruential generator returning signed BigInt values
 * across wide magnitude ranges for reproducible property-based tests.
 */
function createPrng(seed) {
	let state = BigInt(seed);
	const mod = 1n << 64n;
	const mul = 6364136223846793005n;
	const inc = 1442695040888963407n;
	return function nextBigInt(scale = 1n) {
		state = (state * mul + inc) % mod;
		const centered = state - (1n << 63n);
		return centered * scale;
	};
}

function makeMatrix(rows, cols, fn) {
	return Array.from({ length: rows }, (_, i) =>
		Array.from({ length: cols }, (_, j) => fn(i, j))
	);
}

function transpose(m) {
	const rows = m.length;
	const cols = rows === 0 ? 0 : m[0].length;
	return makeMatrix(cols, rows, (i, j) => m[j][i]);
}

function matMul(a, b) {
	const m = a.length;
	const k = m === 0 ? 0 : a[0].length;
	const p = b.length === 0 ? 0 : b[0].length;
	return makeMatrix(m, p, (i, j) => {
		let sum = 0n;
		for (let t = 0; t < k; t++) {
			sum += a[i][t] * b[t][j];
		}
		return sum;
	});
}

describe('traceBigIntStable', () => {
	describe('normal cases', () => {
		it('computes trace of 1x1 matrices', () => {
			assert.equal(traceBigIntStable([[0n]]), 0n);
			assert.equal(traceBigIntStable([[42n]]), 42n);
			assert.equal(traceBigIntStable([[-17n]]), -17n);
		});

		it('computes trace of 2x2 and 3x3 matrices', () => {
			assert.equal(
				traceBigIntStable([
					[1n, 2n],
					[3n, 4n],
				]),
				5n
			);
			assert.equal(
				traceBigIntStable([
					[10n, -99n, 500n],
					[7n, -3n, 12n],
					[1000n, 4n, 8n],
				]),
				15n
			);
		});

		it('returns n for an n x n identity matrix and 0n for zero/skew-symmetric matrices', () => {
			for (const n of [1, 2, 5, 10]) {
				const identity = makeMatrix(n, n, (i, j) => (i === j ? 1n : 0n));
				const zeros = makeMatrix(n, n, () => 0n);
				const skew = makeMatrix(n, n, (i, j) => BigInt(i - j));
				assert.equal(traceBigIntStable(identity), BigInt(n));
				assert.equal(traceBigIntStable(zeros), 0n);
				assert.equal(traceBigIntStable(skew), 0n);
			}
		});

		it('ignores off-diagonal values in the sum while still validating them', () => {
			const a = [
				[2n, 10n ** 50n, -(10n ** 40n)],
				[10n ** 30n, 5n, 999999999999999999999n],
				[-1n, 2n, -7n],
			];
			assert.equal(traceBigIntStable(a), 0n);
		});
	});

	describe('edge cases', () => {
		it('returns 0n for an empty 0x0 matrix', () => {
			assert.equal(traceBigIntStable([]), 0n);
		});

		it('handles huge BigInt values and exact catastrophic cancellation', () => {
			const huge = 10n ** 120n;
			const m = [
				[huge, 0n, 0n, 0n],
				[0n, 1n, 0n, 0n],
				[0n, 0n, -huge, 0n],
				[0n, 0n, 0n, 2n],
			];
			assert.equal(traceBigIntStable(m), 3n);

			const asymmetric = [
				[1n << 256n, 5n, -3n],
				[7n, 1n, 9n],
				[-2n, 4n, -(1n << 256n)],
			];
			assert.equal(traceBigIntStable(asymmetric), 1n);
		});

		it('handles power-of-two, non-power-of-two, and larger dimensions', () => {
			for (const n of [4, 5, 7, 8, 9, 15, 16, 17, 64, 100]) {
				const m = makeMatrix(n, n, (i, j) => (i === j ? BigInt(i + 1) : 0n));
				const expected = (BigInt(n) * BigInt(n + 1)) / 2n;
				assert.equal(traceBigIntStable(m), expected);
			}
		});

		it('does not mutate the input matrix', () => {
			const m = [
				[1n, 2n],
				[3n, 4n],
			];
			const snapshot = m.map((row) => [...row]);
			assert.equal(traceBigIntStable(m), 5n);
			assert.deepEqual(m, snapshot);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array matrix inputs', () => {
			for (const bad of [null, undefined, 0, 42, 42n, '[[1]]', {}, () => {}]) {
				assert.throws(() => traceBigIntStable(bad), TypeError);
			}
		});

		it('throws TypeError for non-array rows or sparse outer arrays', () => {
			assert.throws(() => traceBigIntStable([1n]), TypeError);
			assert.throws(() => traceBigIntStable([[1n, 2n], null]), TypeError);
			assert.throws(() => traceBigIntStable([[1n, 2n], 'row']), TypeError);
			assert.throws(() => traceBigIntStable(new Array(2)), TypeError);
		});

		it('throws RangeError for non-square or jagged matrices', () => {
			assert.throws(() => traceBigIntStable([[]]), RangeError);
			assert.throws(() => traceBigIntStable([[1n, 2n]]), RangeError);
			assert.throws(() => traceBigIntStable([[1n], [2n]]), RangeError);
			assert.throws(
				() =>
					traceBigIntStable([
						[1n, 2n],
						[3n],
					]),
				RangeError
			);
			assert.throws(
				() =>
					traceBigIntStable([
						[1n, 2n],
						[3n, 4n, 5n],
					]),
				RangeError
			);
		});

		it('throws TypeError for non-BigInt entries on or off the diagonal', () => {
			assert.throws(() => traceBigIntStable([[1]]), TypeError);
			assert.throws(() => traceBigIntStable([[NaN]]), TypeError);
			assert.throws(() => traceBigIntStable([[Infinity]]), TypeError);
			assert.throws(
				() =>
					traceBigIntStable([
						[1n, 2],
						[3n, 4n],
					]),
				TypeError
			);
			assert.throws(
				() =>
					traceBigIntStable([
						[1n, '2'],
						[3n, 4n],
					]),
				TypeError
			);
			assert.throws(
				() =>
					traceBigIntStable([
						[1n, null],
						[3n, 4n],
					]),
				TypeError
			);
			assert.throws(
				() =>
					traceBigIntStable([
						[1n, undefined],
						[3n, 4n],
					]),
				TypeError
			);
			assert.throws(() => traceBigIntStable([new Array(1)]), TypeError);
			assert.throws(() => traceBigIntStable([[Object(1n)]]), TypeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent naive diagonal summation across dimensions 0..33', () => {
			const next = createPrng(123456789n);
			for (let n = 0; n <= 33; n++) {
				const scale = 10n ** BigInt(n % 25);
				const m = makeMatrix(n, n, () => next(scale));
				let naive = 0n;
				for (let i = 0; i < n; i++) {
					naive += m[i][i];
				}
				assert.equal(traceBigIntStable(m), naive);
			}
		});

		it('satisfies linearity tr(aA + bB) = a*tr(A) + b*tr(B) and transpose invariance', () => {
			const next = createPrng(987654321n);
			const n = 11;
			const a = next(10n ** 10n);
			const b = next(10n ** 10n);
			const A = makeMatrix(n, n, () => next(10n ** 18n));
			const B = makeMatrix(n, n, () => next(10n ** 18n));
			const combined = makeMatrix(n, n, (i, j) => a * A[i][j] + b * B[i][j]);

			assert.equal(
				traceBigIntStable(combined),
				a * traceBigIntStable(A) + b * traceBigIntStable(B)
			);
			assert.equal(traceBigIntStable(transpose(A)), traceBigIntStable(A));

			const sym = makeMatrix(n, n, (i, j) => A[i][j] + A[j][i]);
			const anti = makeMatrix(n, n, (i, j) => A[i][j] - A[j][i]);
			assert.equal(traceBigIntStable(sym), 2n * traceBigIntStable(A));
			assert.equal(traceBigIntStable(anti), 0n);
		});

		it('satisfies cyclic property tr(AB) = tr(BA) for square and rectangular factors', () => {
			const next = createPrng(20261123n);
			for (const [m, k] of [
				[4, 4],
				[3, 7],
				[6, 2],
			]) {
				const A = makeMatrix(m, k, () => next(10n ** 12n));
				const B = makeMatrix(k, m, () => next(10n ** 12n));
				const AB = matMul(A, B);
				const BA = matMul(B, A);
				assert.equal(traceBigIntStable(AB), traceBigIntStable(BA));
			}
		});
	});
});
