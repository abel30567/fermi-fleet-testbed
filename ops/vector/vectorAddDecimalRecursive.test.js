import { describe, it } from 'node:test';
import assert from 'node:assert';
import { vectorAddDecimalRecursive } from './vectorAddDecimalRecursive.js';

/**
 * Independent non-recursive schoolbook string-digit column adder for
 * non-negative decimal strings (no BigInt, no recursion) used as an
 * independent oracle for cross-checking.
 *
 * @param {string} x
 * @param {string} y
 * @returns {string}
 */
function independentColumnAddNonNegative(x, y) {
	const [xIntRaw = '0', xFrac = ''] = x.split('.');
	const [yIntRaw = '0', yFrac = ''] = y.split('.');
	const xInt = xIntRaw || '0';
	const yInt = yIntRaw || '0';

	const fracLen = Math.max(xFrac.length, yFrac.length);
	const intLen = Math.max(xInt.length, yInt.length);

	const xDigits = xInt.padStart(intLen, '0') + xFrac.padEnd(fracLen, '0');
	const yDigits = yInt.padStart(intLen, '0') + yFrac.padEnd(fracLen, '0');

	let carry = 0;
	const sumDigits = new Array(xDigits.length);
	for (let i = xDigits.length - 1; i >= 0; i--) {
		const s = (xDigits.charCodeAt(i) - 48) + (yDigits.charCodeAt(i) - 48) + carry;
		sumDigits[i] = String(s % 10);
		carry = s >= 10 ? 1 : 0;
	}

	const combined = (carry ? '1' : '') + sumDigits.join('');
	const splitAt = combined.length - fracLen;
	const intOut = combined.slice(0, splitAt).replace(/^0+(?=\d)/, '');
	const fracOut = combined.slice(splitAt).replace(/0+$/, '');
	return fracOut ? `${intOut}.${fracOut}` : intOut;
}

/**
 * Simple deterministic PRNG (Mulberry32) for reproducible cross-check tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Generates a deterministic arbitrary-precision decimal string.
 *
 * @param {() => number} rng
 * @param {number} maxIntDigits
 * @param {number} maxFracDigits
 * @param {boolean} allowNegative
 * @returns {string}
 */
function randomDecimalString(rng, maxIntDigits, maxFracDigits, allowNegative) {
	const intCount = 1 + Math.floor(rng() * maxIntDigits);
	const fracCount = Math.floor(rng() * (maxFracDigits + 1));
	let intStr = '';
	for (let i = 0; i < intCount; i++) {
		intStr += String(Math.floor(rng() * 10));
	}
	let fracStr = '';
	for (let i = 0; i < fracCount; i++) {
		fracStr += String(Math.floor(rng() * 10));
	}
	const sign = allowNegative && rng() < 0.5 ? '-' : '';
	return fracCount > 0 ? `${sign}${intStr}.${fracStr}` : `${sign}${intStr}`;
}

/**
 * Negates a decimal string syntactically.
 *
 * @param {string} s
 * @returns {string}
 */
function negateDecimal(s) {
	if (s.startsWith('-')) return s.slice(1);
	if (s.startsWith('+')) return `-${s.slice(1)}`;
	return `-${s}`;
}

describe('vectorAddDecimalRecursive', () => {
	describe('normal cases', () => {
		it('adds integer and decimal vectors exactly without floating-point drift', () => {
			const a = ['0.1', '0.14', '100', '-2.5', '12.345'];
			const b = ['0.2', '0.28', '200', '7.25', '-0.045'];
			assert.deepStrictEqual(vectorAddDecimalRecursive(a, b), [
				'0.3',
				'0.42',
				'300',
				'4.75',
				'12.3',
			]);
		});

		it('handles explicit plus signs, negative values, and differing fractional scales', () => {
			const a = ['+1.5', '-10.25', '+0.0001', '-3'];
			const b = ['+2.5', '-4.75', '9.9999', '+1.125'];
			assert.deepStrictEqual(vectorAddDecimalRecursive(a, b), [
				'4',
				'-15',
				'10',
				'-1.875',
			]);
		});

		it('applies configurable precision with round-half-away-from-zero and fixed padding', () => {
			const a = ['1.234', '1.235', '-1.235', '2', '0.996', '-9.995'];
			const b = ['0', '0', '0', '3.1', '0', '0'];
			assert.deepStrictEqual(vectorAddDecimalRecursive(a, b, 2), [
				'1.23',
				'1.24',
				'-1.24',
				'5.10',
				'1.00',
				'-10.00',
			]);
		});

		it('supports precision = 0 for exact integer rounding', () => {
			const a = ['0.499999999999999999999999', '0.5', '-0.5', '-0.499999999999999999999999', '99.6'];
			const b = ['0', '0', '0', '0', '0.4'];
			assert.deepStrictEqual(vectorAddDecimalRecursive(a, b, 0), [
				'0',
				'1',
				'-1',
				'0',
				'100',
			]);
		});

		it('pads fractional digits when precision exceeds input scale', () => {
			assert.deepStrictEqual(
				vectorAddDecimalRecursive(['0.1', '5', '-3.2'], ['0.2', '0', '0'], 6),
				['0.300000', '5.000000', '-3.200000']
			);
		});
	});

	describe('edge cases', () => {
		it('handles empty vectors with and without precision', () => {
			assert.deepStrictEqual(vectorAddDecimalRecursive([], []), []);
			assert.deepStrictEqual(vectorAddDecimalRecursive([], [], 0), []);
			assert.deepStrictEqual(vectorAddDecimalRecursive([], [], 4), []);
		});

		it('handles single-element, odd-length, and power-of-two-length vectors', () => {
			assert.deepStrictEqual(vectorAddDecimalRecursive(['42.5'], ['0.5']), ['43']);
			assert.deepStrictEqual(
				vectorAddDecimalRecursive(['1', '2', '3'], ['4', '5', '6']),
				['5', '7', '9']
			);
			assert.deepStrictEqual(
				vectorAddDecimalRecursive(['1', '2', '3', '4'], ['4', '3', '2', '1']),
				['5', '5', '5', '5']
			);
		});

		it('normalizes negative zero, leading zeros, trailing fractional zeros, and leading-dot notation', () => {
			const a = ['-0', '-0.000', '00042.5000', '.5', '-.25', '-0.004'];
			const b = ['-0', '+0.00', '+000.50', '+.5', '.25', '0'];
			assert.deepStrictEqual(vectorAddDecimalRecursive(a, b), [
				'0',
				'0',
				'43',
				'1',
				'0',
				'-0.004',
			]);
			assert.deepStrictEqual(vectorAddDecimalRecursive(a, b, 2), [
				'0.00',
				'0.00',
				'43.00',
				'1.00',
				'0.00',
				'0.00',
			]);
		});

		it('maintains exactness far beyond IEEE-754 MAX_SAFE_INTEGER and MAX_VALUE', () => {
			const bigA = `${'9'.repeat(120)}.${'9'.repeat(80)}`;
			const bigB = `0.${'0'.repeat(79)}1`;
			const expected = `1${'0'.repeat(120)}`;
			assert.deepStrictEqual(vectorAddDecimalRecursive([bigA], [bigB]), [expected]);

			const huge = `1${'0'.repeat(350)}`;
			const tiny = `0.${'0'.repeat(99)}1`;
			assert.deepStrictEqual(vectorAddDecimalRecursive([huge], [tiny]), [
				`${huge}.${'0'.repeat(99)}1`,
			]);
			assert.deepStrictEqual(vectorAddDecimalRecursive([huge], [tiny], 50), [
				`${huge}.${'0'.repeat(50)}`,
			]);
		});

		it('handles large vectors cleanly via O(log n) divide-and-conquer recursion without mutating inputs', () => {
			const n = 10000;
			const a = Array.from({ length: n }, (_, i) => `${i}.25`);
			const b = Array.from({ length: n }, (_, i) => `${n - i}.75`);
			const aSnap = a.slice();
			const bSnap = b.slice();

			const result = vectorAddDecimalRecursive(a, b);
			assert.strictEqual(result.length, n);
			for (let i = 0; i < n; i++) {
				assert.strictEqual(result[i], String(n + 1));
			}
			assert.deepStrictEqual(a, aSnap);
			assert.deepStrictEqual(b, bSnap);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when a or b is not an Array', () => {
			for (const bad of [null, undefined, '123', 42, {}, new Float64Array([1])]) {
				assert.throws(() => vectorAddDecimalRecursive(bad, []), TypeError);
				assert.throws(() => vectorAddDecimalRecursive([], bad), TypeError);
			}
		});

		it('throws RangeError on vector length mismatch', () => {
			assert.throws(() => vectorAddDecimalRecursive(['1'], ['1', '2']), RangeError);
			assert.throws(() => vectorAddDecimalRecursive(['1', '2'], []), RangeError);
		});

		it('throws TypeError or RangeError on invalid precision argument', () => {
			for (const badType of [null, '2', true, {}, [], 2n]) {
				assert.throws(() => vectorAddDecimalRecursive(['1'], ['2'], badType), TypeError);
			}
			for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => vectorAddDecimalRecursive([], [], badRange), RangeError);
				assert.throws(() => vectorAddDecimalRecursive(['1'], ['2'], badRange), RangeError);
			}
		});

		it('throws TypeError on non-string elements, sparse arrays, and malformed decimal strings', () => {
			for (const badElem of [1, null, undefined, 1n, {}, [], true]) {
				assert.throws(() => vectorAddDecimalRecursive([badElem], ['1']), TypeError);
				assert.throws(() => vectorAddDecimalRecursive(['1'], [badElem]), TypeError);
			}

			// Sparse array with holes
			// eslint-disable-next-line no-sparse-arrays
			const sparse = new Array(2);
			assert.throws(() => vectorAddDecimalRecursive(sparse, ['1', '2']), TypeError);

			const malformed = [
				'',
				' ',
				'.',
				'+',
				'-',
				'+.',
				'-.',
				'1.',
				'1.2.3',
				'NaN',
				'Infinity',
				'-Infinity',
				'1e5',
				'1E-3',
				' 1.2',
				'1.2 ',
				'1_000',
				'1,000',
				'0x10',
				'--1',
				'++1',
			];
			for (const badStr of malformed) {
				assert.throws(() => vectorAddDecimalRecursive([badStr], ['0']), TypeError);
				assert.throws(() => vectorAddDecimalRecursive(['0'], [badStr]), TypeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches an independent non-recursive string-digit column adder across 50 high-precision pairs', () => {
			const rng = makeRng(20261123);
			const n = 50;
			const a = [];
			const b = [];
			const expected = [];

			for (let i = 0; i < n; i++) {
				const x = randomDecimalString(rng, 45, 45, false);
				const y = randomDecimalString(rng, 45, 45, false);
				a.push(x);
				b.push(y);
				expected.push(independentColumnAddNonNegative(x, y));
			}

			assert.deepStrictEqual(vectorAddDecimalRecursive(a, b), expected);
		});

		it('satisfies vector-space axioms (commutativity, associativity, identity, inverse)', () => {
			const rng = makeRng(987654321);
			const n = 37;
			const a = Array.from({ length: n }, () => randomDecimalString(rng, 25, 25, true));
			const b = Array.from({ length: n }, () => randomDecimalString(rng, 25, 25, true));
			const c = Array.from({ length: n }, () => randomDecimalString(rng, 25, 25, true));
			const zeros = Array.from({ length: n }, () => '0');

			// Commutativity: a + b === b + a
			assert.deepStrictEqual(
				vectorAddDecimalRecursive(a, b),
				vectorAddDecimalRecursive(b, a)
			);
			assert.deepStrictEqual(
				vectorAddDecimalRecursive(a, b, 10),
				vectorAddDecimalRecursive(b, a, 10)
			);

			// Associativity: (a + b) + c === a + (b + c)
			assert.deepStrictEqual(
				vectorAddDecimalRecursive(vectorAddDecimalRecursive(a, b), c),
				vectorAddDecimalRecursive(a, vectorAddDecimalRecursive(b, c))
			);

			// Additive inverse: a + (-a) === 0
			const negA = a.map(negateDecimal);
			assert.deepStrictEqual(vectorAddDecimalRecursive(a, negA), zeros);

			// Additive identity: (a + 0) + 0 === a + 0
			const canonicalA = vectorAddDecimalRecursive(a, zeros);
			assert.deepStrictEqual(vectorAddDecimalRecursive(canonicalA, zeros), canonicalA);
		});

		it('agrees with IEEE-754 Number addition within floating-point tolerance for small decimals', () => {
			const rng = makeRng(42);
			const a = Array.from({ length: 30 }, () => randomDecimalString(rng, 3, 4, true));
			const b = Array.from({ length: 30 }, () => randomDecimalString(rng, 3, 4, true));

			const exact = vectorAddDecimalRecursive(a, b);
			const rounded = vectorAddDecimalRecursive(a, b, 4);

			for (let i = 0; i < a.length; i++) {
				const expectedFloat = Number(a[i]) + Number(b[i]);
				assert.ok(Math.abs(Number(exact[i]) - expectedFloat) < 1e-9);
				assert.ok(Math.abs(Number(rounded[i]) - expectedFloat) < 1e-4 + 1e-9);
			}
		});
	});
});
