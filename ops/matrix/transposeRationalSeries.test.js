import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeRationalSeries } from './transposeRationalSeries.js';

const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) });

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

function reduce(r) {
	if (r.num === 0n) return { num: 0n, den: 1n };
	const n = r.den < 0n ? -r.num : r.num;
	const d = r.den < 0n ? -r.den : r.den;
	const g = gcd(n, d);
	return { num: n / g, den: d / g };
}

function addQ(a, b) {
	return reduce({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });
}

function mulQ(a, b) {
	return reduce({ num: a.num * b.num, den: a.den * b.den });
}

function addMat(A, B) {
	return A.map((row, i) => row.map((v, j) => addQ(v, B[i][j])));
}

function scaleMat(c, A) {
	return A.map((row) => row.map((v) => mulQ(c, v)));
}

function mulMat(A, B) {
	const m = A.length;
	const k = A[0].length;
	const n = B[0].length;
	const out = Array.from({ length: m }, () => new Array(n));
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let acc = q(0, 1);
			for (let t = 0; t < k; t++) {
				acc = addQ(acc, mulQ(A[i][t], B[t][j]));
			}
			out[i][j] = acc;
		}
	}
	return out;
}

function assertLowestTerms(M) {
	for (const row of M) {
		for (const { num, den } of row) {
			assert.equal(typeof num, 'bigint');
			assert.equal(typeof den, 'bigint');
			assert.ok(den > 0n, `expected den > 0n, got ${den}`);
			assert.equal(gcd(num, den), 1n, `expected gcd(|${num}|, ${den}) === 1n`);
			if (num === 0n) {
				assert.equal(den, 1n);
			}
		}
	}
}

describe('transposeRationalSeries', () => {
	it('transposes a square 2x2 matrix', () => {
		const A = [
			[q(1, 2), q(-3, 4)],
			[q(5, 6), q(0, 1)],
		];
		const T = transposeRationalSeries(A);
		assert.deepEqual(T, [
			[q(1, 2), q(5, 6)],
			[q(-3, 4), q(0, 1)],
		]);
		assertLowestTerms(T);
	});

	it('transposes a square 3x3 matrix', () => {
		const A = [
			[q(1, 1), q(2, 3), q(-5, 7)],
			[q(4, 9), q(0, 3), q(11, 13)],
			[q(-8, 5), q(7, 2), q(3, 1)],
		];
		const T = transposeRationalSeries(A);
		assert.deepEqual(T, [
			[q(1, 1), q(4, 9), q(-8, 5)],
			[q(2, 3), q(0, 1), q(7, 2)],
			[q(-5, 7), q(11, 13), q(3, 1)],
		]);
		assertLowestTerms(T);
	});

	it('transposes rectangular matrices (2x3 -> 3x2 and 3x2 -> 2x3)', () => {
		const A = [
			[q(1, 2), q(3, 5), q(-7, 11)],
			[q(2, 9), q(-4, 7), q(13, 17)],
		];
		const T = transposeRationalSeries(A);
		assert.equal(T.length, 3);
		assert.equal(T[0].length, 2);
		assert.deepEqual(T, [
			[q(1, 2), q(2, 9)],
			[q(3, 5), q(-4, 7)],
			[q(-7, 11), q(13, 17)],
		]);
		assertLowestTerms(T);
	});

	it('transposes row vector (1xN) to column vector (Nx1) and back', () => {
		const rowVec = [[q(1, 3), q(-2, 5), q(7, 1), q(0, 9)]];
		const colVec = transposeRationalSeries(rowVec);
		assert.deepEqual(colVec, [
			[q(1, 3)],
			[q(-2, 5)],
			[q(7, 1)],
			[q(0, 1)],
		]);
		assert.deepEqual(transposeRationalSeries(colVec), [
			[q(1, 3), q(-2, 5), q(7, 1), q(0, 1)],
		]);
	});

	it('handles 1x1 edge case and normalizes unreduced/negative-denominator entries', () => {
		assert.deepEqual(transposeRationalSeries([[q(6, 9)]]), [[q(2, 3)]]);
		assert.deepEqual(transposeRationalSeries([[q(6, -9)]]), [[q(-2, 3)]]);
		assert.deepEqual(transposeRationalSeries([[q(-6, -9)]]), [[q(2, 3)]]);
		assert.deepEqual(transposeRationalSeries([[q(0, -42)]]), [[q(0, 1)]]);
	});

	it('reduces all unreduced rationals and canonicalizes negative denominators and zeros', () => {
		const A = [
			[q(12, 18), q(-15, -25), q(0, -100)],
			[q(14, -21), q(0, 7), q(-100, 25)],
		];
		const T = transposeRationalSeries(A);
		assert.deepEqual(T, [
			[q(2, 3), q(-2, 3)],
			[q(3, 5), q(0, 1)],
			[q(0, 1), q(-4, 1)],
		]);
		assertLowestTerms(T);
	});

	it('preserves exact precision for very large BigInt rationals', () => {
		const bigA = 10n ** 40n + 7n;
		const bigB = 10n ** 40n + 9n;
		const factor = 12345678901234567890123456789n;
		const A = [
			[{ num: bigA * factor, den: bigB * factor }],
			[{ num: -(bigB * factor), den: -(bigA * factor) }],
		];
		const T = transposeRationalSeries(A);
		assert.deepEqual(T, [
			[
				{ num: bigA, den: bigB },
				{ num: bigB, den: bigA },
			],
		]);
		assertLowestTerms(T);
	});

	it('does not mutate input or alias output objects', () => {
		const entry = { num: 4n, den: -6n };
		const A = [[entry]];
		const T = transposeRationalSeries(A);
		assert.deepEqual(entry, { num: 4n, den: -6n });
		T[0][0].num = 999n;
		assert.deepEqual(entry, { num: 4n, den: -6n });
	});

	it('throws on invalid matrix structures and invalid rational entries', () => {
		assert.throws(() => transposeRationalSeries(null), TypeError);
		assert.throws(() => transposeRationalSeries(undefined), TypeError);
		assert.throws(() => transposeRationalSeries(42), TypeError);
		assert.throws(() => transposeRationalSeries('[[1]]'), TypeError);
		assert.throws(() => transposeRationalSeries([]), RangeError);
		assert.throws(() => transposeRationalSeries([[]]), RangeError);
		assert.throws(() => transposeRationalSeries([[], []]), RangeError);
		assert.throws(() => transposeRationalSeries([q(1, 2)]), TypeError);
		assert.throws(() => transposeRationalSeries([[q(1, 2)], 'not-a-row']), TypeError);
		assert.throws(
			() => transposeRationalSeries([[q(1, 2), q(3, 4)], [q(5, 6)]]),
			RangeError,
		);
		assert.throws(() => transposeRationalSeries([[null]]), TypeError);
		assert.throws(() => transposeRationalSeries([[{ num: 1, den: 2n }]]), TypeError);
		assert.throws(() => transposeRationalSeries([[{ num: 1n, den: 2 }]]), TypeError);
		assert.throws(() => transposeRationalSeries([[{ num: 1n }]]), TypeError);
		assert.throws(() => transposeRationalSeries([[{ num: 1n, den: 0n }]]), RangeError);
		assert.throws(() => transposeRationalSeries([[{ num: 0n, den: 0n }]]), RangeError);
	});

	it('satisfies involution identity: (A^T)^T === normalize(A)', () => {
		const A = [
			[q(6, -8), q(0, 5), q(21, 14)],
			[q(-9, -12), q(5, 13), q(-4, 6)],
		];
		const expectedNormalized = A.map((row) => row.map(reduce));
		const doubleT = transposeRationalSeries(transposeRationalSeries(A));
		assert.deepEqual(doubleT, expectedNormalized);
		assertLowestTerms(doubleT);
	});

	it('satisfies linearity identities: (A + B)^T === A^T + B^T and (cA)^T === c(A^T)', () => {
		const A = [
			[q(1, 2), q(-2, 3), q(5, 6)],
			[q(7, 4), q(0, 1), q(-11, 12)],
		];
		const B = [
			[q(3, 4), q(5, 6), q(-1, 3)],
			[q(-7, 4), q(2, 9), q(1, 4)],
		];
		const lhsAdd = transposeRationalSeries(addMat(A, B));
		const rhsAdd = addMat(transposeRationalSeries(A), transposeRationalSeries(B));
		assert.deepEqual(lhsAdd, rhsAdd);

		const c = q(-7, 11);
		const lhsScale = transposeRationalSeries(scaleMat(c, A));
		const rhsScale = scaleMat(c, transposeRationalSeries(A));
		assert.deepEqual(lhsScale, rhsScale);
	});

	it('satisfies reverse-order product identity: (A * B)^T === B^T * A^T', () => {
		const A = [
			[q(1, 2), q(-3, 5), q(2, 7)],
			[q(4, 3), q(0, 1), q(-5, 6)],
		];
		const B = [
			[q(3, 4), q(-1, 2)],
			[q(5, 9), q(7, 3)],
			[q(-2, 5), q(11, 8)],
		];
		const lhs = transposeRationalSeries(mulMat(A, B));
		const rhs = mulMat(transposeRationalSeries(B), transposeRationalSeries(A));
		assert.deepEqual(lhs, rhs);
		assertLowestTerms(lhs);
	});
});
