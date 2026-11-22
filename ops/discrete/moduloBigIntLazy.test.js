import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { moduloBigIntLazy, FIXED_POINT_SCALE } from './moduloBigIntLazy.js';

describe('moduloBigIntLazy', () => {
	describe('normal cases across all call forms', () => {
		test('iterable dividends with scalar modulus', () => {
			const res = [...moduloBigIntLazy([0n, 1n, 7n, 14n, -1n, -7n, -14n], 5n)];
			assert.deepEqual(res, [0n, 1n, 2n, 4n, 4n, 3n, 1n]);
		});

		test('scalar dividend with iterable moduli (residue number system)', () => {
			const res = [...moduloBigIntLazy(100n, [7n, 11n, 13n, 17n])];
			assert.deepEqual(res, [2n, 1n, 9n, 15n]);
		});

		test('iterable dividends zipped with iterable moduli', () => {
			const res = [...moduloBigIntLazy([10n, -3n, 25n, 0n], [7n, 5n, 8n, 3n])];
			assert.deepEqual(res, [3n, 2n, 1n, 0n]);
		});

		test('zipped iterables stop at the shorter sequence', () => {
			assert.deepEqual(
				[...moduloBigIntLazy([10n, 20n], [7n, 6n, 5n, 4n])],
				[3n, 2n]
			);
			assert.deepEqual(
				[...moduloBigIntLazy([10n, 20n, 30n, 40n], [7n, 6n])],
				[3n, 2n]
			);
		});

		test('scalar dividend with scalar modulus yields single value', () => {
			assert.deepEqual([...moduloBigIntLazy(17n, 5n)], [2n]);
			assert.deepEqual([...moduloBigIntLazy(-17n, 5n)], [3n]);
		});

		test('pairs iterable (1-argument form)', () => {
			const pairs = [
				[10n, 7n],
				[-3n, 5n],
				[7n, -3n],
				[-7n, -3n],
				[0n, 9n],
			];
			assert.deepEqual([...moduloBigIntLazy(pairs)], [3n, 2n, 1n, 2n, 0n]);
		});

		test('pairs iterable with explicit options (moduli = undefined)', () => {
			const pairs = [
				[7n, -3n],
				[-7n, -3n],
			];
			assert.deepEqual(
				[...moduloBigIntLazy(pairs, undefined, { mode: 'floored' })],
				[-2n, -1n]
			);
		});
	});

	describe('modulo conventions across all sign combinations', () => {
		const cases = [
			[7n, 3n],
			[-7n, 3n],
			[7n, -3n],
			[-7n, -3n],
			[6n, 3n],
			[-6n, 3n],
			[6n, -3n],
			[-6n, -3n],
			[0n, 3n],
			[0n, -3n],
		];

		test('euclidean mode (default): remainder always in [0n, |m| - 1n]', () => {
			const expected = [1n, 2n, 1n, 2n, 0n, 0n, 0n, 0n, 0n, 0n];
			assert.deepEqual([...moduloBigIntLazy(cases)], expected);
			assert.deepEqual(
				[...moduloBigIntLazy(cases, undefined, { mode: 'euclidean' })],
				expected
			);
		});

		test('floored mode: remainder matches sign of modulus (Python %)', () => {
			const expected = [1n, 2n, -2n, -1n, 0n, 0n, 0n, 0n, 0n, 0n];
			assert.deepEqual(
				[...moduloBigIntLazy(cases, undefined, { mode: 'floored' })],
				expected
			);
		});

		test('truncated mode: remainder matches sign of dividend (JS %)', () => {
			const expected = [1n, -1n, 1n, -1n, 0n, 0n, 0n, 0n, 0n, 0n];
			assert.deepEqual(
				[...moduloBigIntLazy(cases, undefined, { mode: 'truncated' })],
				expected
			);
		});
	});

	describe('edge cases and huge BigInts', () => {
		test('empty iterables yield nothing', () => {
			assert.deepEqual([...moduloBigIntLazy([], 5n)], []);
			assert.deepEqual([...moduloBigIntLazy(5n, [])], []);
			assert.deepEqual([...moduloBigIntLazy([], [])], []);
			assert.deepEqual([...moduloBigIntLazy([])], []);
		});

		test('modulus 1n and -1n always yield 0n', () => {
			const values = [-1000n, -1n, 0n, 1n, 1000n, 10n ** 80n];
			for (const mode of ['euclidean', 'floored', 'truncated']) {
				assert.deepEqual(
					[...moduloBigIntLazy(values, 1n, { mode })],
					values.map(() => 0n)
				);
				assert.deepEqual(
					[...moduloBigIntLazy(values, -1n, { mode })],
					values.map(() => 0n)
				);
			}
		});

		test('huge arbitrary-precision BigInts (hundreds of digits)', () => {
			const p = 2n ** 521n - 1n; // Mersenne prime M_521
			const k = 10n ** 150n;
			const exactMultiple = k * p;
			const plusOne = exactMultiple + 1n;
			const minusOne = -exactMultiple - 1n;

			assert.deepEqual(
				[...moduloBigIntLazy([exactMultiple, plusOne, minusOne], p)],
				[0n, 1n, p - 1n]
			);
		});

		test('fixed-point BigInts scaled by 10^18 preserve scale exactly', () => {
			assert.equal(FIXED_POINT_SCALE, 1_000_000_000_000_000_000n);
			// 5.5 mod 2.0 = 1.5; -0.25 mod 1.0 = 0.75; 10.75 mod 3.5 = 0.25
			const pairs = [
				[55n * (FIXED_POINT_SCALE / 10n), 2n * FIXED_POINT_SCALE],
				[-25n * (FIXED_POINT_SCALE / 100n), 1n * FIXED_POINT_SCALE],
				[1075n * (FIXED_POINT_SCALE / 100n), 35n * (FIXED_POINT_SCALE / 10n)],
			];
			const expected = [
				15n * (FIXED_POINT_SCALE / 10n),
				75n * (FIXED_POINT_SCALE / 100n),
				25n * (FIXED_POINT_SCALE / 100n),
			];
			assert.deepEqual([...moduloBigIntLazy(pairs)], expected);
		});

		test('works with non-Array iterables such as Set and custom generators', () => {
			const set = new Set([10n, 15n, 22n]);
			assert.deepEqual([...moduloBigIntLazy(set, 7n)], [3n, 1n, 1n]);
		});
	});

	describe('input validation', () => {
		test('eagerly throws TypeError on invalid top-level arguments', () => {
			assert.throws(() => moduloBigIntLazy(), TypeError);
			assert.throws(() => moduloBigIntLazy(null, 5n), TypeError);
			assert.throws(() => moduloBigIntLazy(10, 5n), TypeError);
			assert.throws(() => moduloBigIntLazy(10n, 5), TypeError);
			assert.throws(() => moduloBigIntLazy('123', 5n), TypeError);
			assert.throws(() => moduloBigIntLazy([1n], '5'), TypeError);
			assert.throws(() => moduloBigIntLazy('123'), TypeError);
			assert.throws(() => moduloBigIntLazy(10n), TypeError);
			assert.throws(() => moduloBigIntLazy({}, 5n), TypeError);
			assert.throws(() => moduloBigIntLazy([1n], {}), TypeError);
			assert.throws(() => moduloBigIntLazy([1n], 5n, null), TypeError);
			assert.throws(() => moduloBigIntLazy([1n], 5n, []), TypeError);
			assert.throws(() => moduloBigIntLazy([1n], 5n, 'euclidean'), TypeError);
		});

		test('eagerly throws RangeError on scalar zero modulus or invalid mode', () => {
			assert.throws(() => moduloBigIntLazy([1n, 2n], 0n), RangeError);
			assert.throws(() => moduloBigIntLazy(10n, 0n), RangeError);
			assert.throws(
				() => moduloBigIntLazy([1n], 5n, { mode: 'unknown' }),
				RangeError
			);
			assert.throws(() => moduloBigIntLazy([1n], 5n, { mode: 123 }), RangeError);
		});

		test('lazily throws TypeError/RangeError on invalid streamed elements', () => {
			// Bad dividend inside iterable
			const g1 = moduloBigIntLazy([10n, 20, 30n], 7n);
			assert.equal(g1.next().value, 3n);
			assert.throws(() => g1.next(), TypeError);

			// Zero modulus inside iterable
			const g2 = moduloBigIntLazy(10n, [7n, 0n, 3n]);
			assert.equal(g2.next().value, 3n);
			assert.throws(() => g2.next(), RangeError);

			// Non-BigInt modulus inside zipped iterable
			const g3 = moduloBigIntLazy([10n, 20n], [7n, '3']);
			assert.equal(g3.next().value, 3n);
			assert.throws(() => g3.next(), TypeError);

			// Zero modulus inside zipped iterable
			const g4 = moduloBigIntLazy([10n, 20n], [7n, 0n]);
			assert.equal(g4.next().value, 3n);
			assert.throws(() => g4.next(), RangeError);

			// Malformed pairs in 1-arg form
			assert.throws(() => [...moduloBigIntLazy([10n])], TypeError);
			assert.throws(() => [...moduloBigIntLazy([[10n]])], TypeError);
			assert.throws(() => [...moduloBigIntLazy([[10n, 5n, 1n]])], TypeError);
			assert.throws(() => [...moduloBigIntLazy([[10, 5n]])], TypeError);
			assert.throws(() => [...moduloBigIntLazy([[10n, 5]])], TypeError);
			assert.throws(() => [...moduloBigIntLazy([[10n, 0n]])], RangeError);
		});
	});

	describe('laziness and resource cleanup', () => {
		test('consumes infinite generator strictly on demand and cleans up on early break', () => {
			let produced = 0;
			let closed = false;
			function* naturals() {
				let n = 0n;
				try {
					while (true) {
						produced++;
						yield n++;
					}
				} finally {
					closed = true;
				}
			}

			const stream = moduloBigIntLazy(naturals(), 4n);
			// Creating the generator must not pull any item
			assert.equal(produced, 0);
			assert.equal(closed, false);

			const taken = [];
			for (const r of stream) {
				taken.push(r);
				assert.equal(produced, taken.length);
				if (taken.length === 5) break;
			}

			assert.deepEqual(taken, [0n, 1n, 2n, 3n, 0n]);
			assert.equal(produced, 5);
			assert.equal(closed, true);
		});

		test('zipping two infinite generators pulls 1-for-1 and closes both on break', () => {
			let pulledA = 0;
			let pulledM = 0;
			let closedA = false;
			let closedM = false;

			function* infDividends() {
				let n = 10n;
				try {
					while (true) {
						pulledA++;
						yield n;
						n += 10n;
					}
				} finally {
					closedA = true;
				}
			}

			function* infModuli() {
				let m = 3n;
				try {
					while (true) {
						pulledM++;
						yield m;
						m += 2n;
					}
				} finally {
					closedM = true;
				}
			}

			const stream = moduloBigIntLazy(infDividends(), infModuli());
			assert.equal(pulledA, 0);
			assert.equal(pulledM, 0);

			const out = [];
			for (const r of stream) {
				out.push(r);
				assert.equal(pulledA, out.length);
				assert.equal(pulledM, out.length);
				if (out.length === 4) break;
			}

			// 10%3=1, 20%5=0, 30%7=2, 40%9=4
			assert.deepEqual(out, [1n, 0n, 2n, 4n]);
			assert.equal(pulledA, 4);
			assert.equal(pulledM, 4);
			assert.equal(closedA, true);
			assert.equal(closedM, true);
		});

		test('zipping an empty iterable with an infinite generator pulls zero items from the infinite one', () => {
			let pulled = 0;
			let closed = false;
			function* infModuli() {
				try {
					while (true) {
						pulled++;
						yield 7n;
					}
				} finally {
					closed = true;
				}
			}

			const result = [...moduloBigIntLazy([], infModuli())];
			assert.deepEqual(result, []);
			assert.equal(pulled, 0);
			// Generator was created (suspended at start), return() cleanly terminates it
			assert.equal(closed, false);
		});

		test('zipping a finite iterable with an infinite generator pulls only finite.length items and closes the infinite one', () => {
			let pulled = 0;
			let closed = false;
			function* infModuli() {
				let m = 2n;
				try {
					while (true) {
						pulled++;
						yield m++;
					}
				} finally {
					closed = true;
				}
			}

			const result = [...moduloBigIntLazy([5n, 10n, 15n], infModuli())];
			assert.deepEqual(result, [1n, 1n, 3n]);
			assert.equal(pulled, 3);
			assert.equal(closed, true);
		});

		test('error on element k does not consume element k + 1', () => {
			let pulled = 0;
			function* withBadElement() {
				const items = [10n, 'bad', 30n];
				for (const item of items) {
					pulled++;
					yield item;
				}
			}

			const stream = moduloBigIntLazy(withBadElement(), 7n);
			assert.equal(stream.next().value, 3n);
			assert.equal(pulled, 1);
			assert.throws(() => stream.next(), TypeError);
			assert.equal(pulled, 2); // 30n was never pulled
		});
	});

	describe('independent cross-checks', () => {
		test('cross-check against naive repeated addition/subtraction reference over [-25, 25] x ([-12, 12] \\ {0})', () => {
			function naiveEuclideanMod(a, m) {
				const absM = m < 0n ? -m : m;
				let r = a;
				while (r < 0n) r += absM;
				while (r >= absM) r -= absM;
				return r;
			}

			function naiveFlooredMod(a, m) {
				let r = a;
				if (m > 0n) {
					while (r < 0n) r += m;
					while (r >= m) r -= m;
				} else {
					while (r > 0n) r += m;
					while (r <= m) r -= m;
				}
				return r;
			}

			const pairs = [];
			for (let a = -25n; a <= 25n; a++) {
				for (let m = -12n; m <= 12n; m++) {
					if (m === 0n) continue;
					pairs.push([a, m]);
				}
			}

			const eucResults = [...moduloBigIntLazy(pairs, undefined, { mode: 'euclidean' })];
			const flrResults = [...moduloBigIntLazy(pairs, undefined, { mode: 'floored' })];

			for (let i = 0; i < pairs.length; i++) {
				const [a, m] = pairs[i];
				assert.equal(eucResults[i], naiveEuclideanMod(a, m), `euclidean (${a}, ${m})`);
				assert.equal(flrResults[i], naiveFlooredMod(a, m), `floored (${a}, ${m})`);
			}
		});

		test('cross-check Euclidean division invariant and ring homomorphisms on huge BigInts', () => {
			const moduli = [
				97n,
				-97n,
				10n ** 30n + 7n,
				-(10n ** 30n + 7n),
				2n ** 127n - 1n,
			];
			const values = [
				-(10n ** 60n) - 123456789n,
				-99999999999999999999n,
				0n,
				42n,
				10n ** 60n + 987654321n,
			];

			for (const m of moduli) {
				const absM = m < 0n ? -m : m;
				const remainders = [...moduloBigIntLazy(values, m, { mode: 'euclidean' })];

				for (let i = 0; i < values.length; i++) {
					const a = values[i];
					const r = remainders[i];
					// 1. Canonical range: 0 <= r < |m|
					assert.ok(r >= 0n && r < absM, `range violated for a=${a}, m=${m}, r=${r}`);
					// 2. Exact divisibility: (a - r) is a multiple of m
					assert.equal((a - r) % m, 0n);
					const q = (a - r) / m;
					assert.equal(q * m + r, a);
				}

				// 3. Ring homomorphism for positive modulus:
				//    (a + b) mod m === ((a mod m) + (b mod m)) mod m
				//    (a * b) mod m === ((a mod m) * (b mod m)) mod m
				if (m > 0n) {
					for (let i = 0; i < values.length; i++) {
						for (let j = 0; j < values.length; j++) {
							const a = values[i];
							const b = values[j];
							const [sumMod] = moduloBigIntLazy(a + b, m);
							const [rhsSum] = moduloBigIntLazy(remainders[i] + remainders[j], m);
							assert.equal(sumMod, rhsSum);

							const [prodMod] = moduloBigIntLazy(a * b, m);
							const [rhsProd] = moduloBigIntLazy(remainders[i] * remainders[j], m);
							assert.equal(prodMod, rhsProd);
						}
					}
				}
			}
		});

		test('cross-check closed-form Fermat Little Theorem via lazy stream of powers', () => {
			// For prime p = 1000000007n and coprime base a, a^(p-1) mod p === 1n
			// Here we verify a small prime p = 61n with exact BigInt exponentiation a**(p-1)
			const p = 61n;
			function* fermatPowers() {
				for (let a = 1n; a < p; a++) {
					yield a ** (p - 1n);
				}
			}

			const residues = [...moduloBigIntLazy(fermatPowers(), p)];
			assert.equal(residues.length, Number(p - 1n));
			for (const r of residues) {
				assert.equal(r, 1n);
			}
		});
	});
});
