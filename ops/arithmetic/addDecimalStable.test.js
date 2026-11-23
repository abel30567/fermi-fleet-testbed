import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDecimalStable } from './addDecimalStable.js';

/**
 * Independent BigInt rational oracle: parses a decimal string into an exact
 * fraction (num / 10^scale) and sums/rounds with a completely separate algorithm
 * (global common denominator, direct BigInt comparison for round-half-to-even).
 *
 * @param {string[]} values
 * @param {number | null} precision
 * @returns {string}
 */
function naiveRationalAddOracle(values, precision = null) {
	const parsed = values.map((raw) => {
		const s = raw.trim();
		const m = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(s);
		if (!m) throw new Error(`Oracle parse failed: ${raw}`);
		const sign = m[1] === '-' ? -1n : 1n;
		const intPart = m[2] ?? '';
		const fracPart = m[3] ?? m[4] ?? '';
		const exp = (m[5] ? Number(m[5]) : 0) - fracPart.length;
		const digits = BigInt(intPart + fracPart || '0');
		return { num: sign * digits, exp };
	});

	if (parsed.length === 0) {
		return precision === null || precision === 0 ? '0' : `0.${'0'.repeat(precision)}`;
	}

	const minExp = Math.min(...parsed.map((p) => p.exp), precision === null ? 0 : -precision);
	let total = 0n;
	for (const p of parsed) {
		total += p.num * (10n ** BigInt(p.exp - minExp));
	}

	if (precision === null) {
		if (total === 0n) return '0';
		const neg = total < 0n;
		let str = (neg ? -total : total).toString();
		let e = minExp;
		while (e < 0 && str.endsWith('0')) {
			str = str.slice(0, -1);
			e++;
		}
		if (e >= 0) return (neg ? '-' : '') + str + '0'.repeat(e);
		const pt = str.length + e;
		if (pt > 0) return `${neg ? '-' : ''}${str.slice(0, pt)}.${str.slice(pt)}`;
		return `${neg ? '-' : ''}0.${'0'.repeat(-pt)}${str}`;
	}

	// Scale total (at 10^minExp) to 10^-precision: shift = -precision - minExp >= 0.
	const shift = -precision - minExp;
	const denom = 10n ** BigInt(shift);
	const neg = total < 0n;
	const absTotal = neg ? -total : total;
	let q = absTotal / denom;
	const r = absTotal % denom;
	const twiceR = r * 2n;
	if (twiceR > denom || (twiceR === denom && q % 2n === 1n)) {
		q += 1n;
	}
	if (q === 0n) {
		return precision === 0 ? '0' : `0.${'0'.repeat(precision)}`;
	}
	const digits = q.toString();
	if (precision === 0) return (neg ? '-' : '') + digits;
	if (digits.length <= precision) {
		return `${neg ? '-' : ''}0.${'0'.repeat(precision - digits.length)}${digits}`;
	}
	const cut = digits.length - precision;
	return `${neg ? '-' : ''}${digits.slice(0, cut)}.${digits.slice(cut)}`;
}

describe('addDecimalStable', () => {
	describe('normal binary and array addition', () => {
		it('avoids IEEE-754 binary floating-point representation errors', () => {
			assert.equal(addDecimalStable('0.1', '0.2'), '0.3');
			assert.equal(addDecimalStable('0.1', '0.2', 2), '0.30');
			assert.equal(addDecimalStable('0.1', '0.2', 20), '0.30000000000000000000');
			assert.equal(addDecimalStable('1.005', '2.005'), '3.01');
		});

		it('handles positive, negative, and mixed-sign decimals', () => {
			assert.equal(addDecimalStable('123.45', '67.89'), '191.34');
			assert.equal(addDecimalStable('-123.45', '-67.89'), '-191.34');
			assert.equal(addDecimalStable('123.45', '-67.89'), '55.56');
			assert.equal(addDecimalStable('-123.45', '67.89'), '-55.56');
			assert.equal(addDecimalStable('+42.5', '-42.5'), '0');
		});

		it('supports arbitrary precision far beyond Number.MAX_SAFE_INTEGER and 1e308', () => {
			const bigA = '9'.repeat(120) + '.' + '1'.repeat(60);
			const bigB = '1' + '.' + '8'.repeat(60);
			assert.equal(
				addDecimalStable(bigA, bigB),
				'1' + '0'.repeat(120) + '.' + '9'.repeat(60),
			);
			assert.equal(addDecimalStable('1e400', '2e400'), '3' + '0'.repeat(400));
		});

		it('parses scientific notation and optional leading/trailing dots or whitespace', () => {
			assert.equal(addDecimalStable('1.5e-4', '2.5E-4'), '0.0004');
			assert.equal(addDecimalStable('.5', '5.'), '5.5');
			assert.equal(addDecimalStable('-.25', '+.75'), '0.5');
			assert.equal(addDecimalStable('  1.25e+2  ', '  -25.00  '), '100');
			assert.equal(addDecimalStable('5.e2', '.5e1'), '505');
		});

		it('supports array summation form including empty and single-element arrays', () => {
			assert.equal(addDecimalStable([]), '0');
			assert.equal(addDecimalStable([], 0), '0');
			assert.equal(addDecimalStable([], 3), '0.000');
			assert.equal(addDecimalStable(['3.14159'], 2), '3.14');
			assert.equal(addDecimalStable(['0.1', '0.2', '0.3', '0.4']), '1');
			assert.equal(addDecimalStable(['0.1', '0.2', '0.3'], 4), '0.6000');
		});
	});

	describe('numerical stability, cancellation, and exact rounding', () => {
		it('prevents catastrophic cancellation across huge magnitude spans', () => {
			assert.equal(
				addDecimalStable(['1e100', '0.1234567890123456789', '-1e100']),
				'0.1234567890123456789',
			);
			assert.equal(
				addDecimalStable(['1e1000000', '-9.9999e999999', '-1e999995', '0.12345'], 2),
				'0.12',
			);
			assert.equal(
				addDecimalStable(['1e1000000', '-9.9999e999999', '-1e999995', '0.12345']),
				'0.12345',
			);
		});

		it('implements exact round-half-to-even (banker rounding) at ties', () => {
			// Precision 0 ties
			assert.equal(addDecimalStable('0.5', '0', 0), '0');
			assert.equal(addDecimalStable('1.5', '0', 0), '2');
			assert.equal(addDecimalStable('2.5', '0', 0), '2');
			assert.equal(addDecimalStable('-0.5', '0', 0), '0');
			assert.equal(addDecimalStable('-1.5', '0', 0), '-2');
			assert.equal(addDecimalStable('-2.5', '0', 0), '-2');

			// Precision 2 ties
			assert.equal(addDecimalStable('1.005', '0', 2), '1.00');
			assert.equal(addDecimalStable('1.015', '0', 2), '1.02');
			assert.equal(addDecimalStable('1.025', '0', 2), '1.02');
			assert.equal(addDecimalStable('-1.005', '0', 2), '-1.00');
			assert.equal(addDecimalStable('-1.015', '0', 2), '-1.02');
		});

		it('breaks exact ties accurately using sticky-bit reduction across extreme exponent gaps', () => {
			// Positive tie nudged up, nudged down, or cancelled back to exact tie
			assert.equal(addDecimalStable(['1.005', '1e-10000'], 2), '1.01');
			assert.equal(addDecimalStable(['1.005', '-1e-10000'], 2), '1.00');
			assert.equal(addDecimalStable(['1.005', '1e-10000', '-1e-10000'], 2), '1.00');
			assert.equal(addDecimalStable(['1.015', '-1e-10000'], 2), '1.01');
			assert.equal(addDecimalStable(['1.015', '1e-10000', '-1e-10000'], 2), '1.02');

			// Negative tie nudged away from zero, toward zero, or cancelled back to exact tie
			assert.equal(addDecimalStable(['-1.005', '-1e-10000'], 2), '-1.01');
			assert.equal(addDecimalStable(['-1.005', '1e-10000'], 2), '-1.00');
			assert.equal(addDecimalStable(['-1.015', '1e-10000'], 2), '-1.01');
			assert.equal(addDecimalStable(['-1.015', '-1e-10000', '1e-10000'], 2), '-1.02');

			// Multi-cluster cascading cancellation before a deeper non-zero sticky cluster
			assert.equal(
				addDecimalStable(['1.005', '1e-500', '-1e-500', '1e-20000'], 2),
				'1.01',
			);
			assert.equal(
				addDecimalStable(['1.005', '1e-500', '-1e-500', '-1e-20000'], 2),
				'1.00',
			);
		});

		it('prevents sub-ULP rounding drift when summing many tiny terms', () => {
			// 1000 copies of 0.0005 sum to exactly 0.5; naive step-by-step rounding to 1 dp gives 0.0
			const terms = Array.from({ length: 1000 }, () => '0.0005');
			assert.equal(addDecimalStable(terms, 1), '0.5');
			assert.equal(addDecimalStable(terms), '0.5');

			// 50 copies of 0.0001 sum to exact tie 0.005 -> rounds to even 0.00 at precision 2
			const fifty = Array.from({ length: 50 }, () => '0.0001');
			assert.equal(addDecimalStable(fifty, 2), '0.00');
			// 51 copies sum to 0.0051 -> rounds up to 0.01
			assert.equal(addDecimalStable([...fifty, '0.0001'], 2), '0.01');
		});

		it('is strictly order-invariant under permutations of mixed-scale terms', () => {
			const terms = ['1e50', '0.005', '-1e50', '1e-50', '100.25', '-100.25', '0.005', '-1e-50'];
			const reversed = terms.slice().reverse();
			const interleaved = ['1e-50', '1e50', '-100.25', '0.005', '-1e-50', '100.25', '-1e50', '0.005'];
			assert.equal(addDecimalStable(terms, 2), '0.01');
			assert.equal(addDecimalStable(reversed, 2), '0.01');
			assert.equal(addDecimalStable(interleaved, 2), '0.01');
		});
	});

	describe('edge cases and input validation', () => {
		it('canonicalizes zero and never produces negative zero', () => {
			assert.equal(addDecimalStable('-0', '-0'), '0');
			assert.equal(addDecimalStable('-0.000', '+0.000', 2), '0.00');
			assert.equal(addDecimalStable('-0.0001', '0', 2), '0.00');
			assert.equal(addDecimalStable('-0.0001', '0', 0), '0');
			assert.equal(addDecimalStable('0', '0', null), '0');
		});

		it('rejects non-string operands with TypeError', () => {
			assert.throws(() => addDecimalStable(1, '2'), TypeError);
			assert.throws(() => addDecimalStable('1', 2), TypeError);
			assert.throws(() => addDecimalStable(null, '2'), TypeError);
			assert.throws(() => addDecimalStable('1', undefined), TypeError);
			assert.throws(() => addDecimalStable(['1', 2]), TypeError);
			assert.throws(() => addDecimalStable(['1', '2'], 2, 3), TypeError);
		});

		it('rejects malformed decimal strings with RangeError', () => {
			for (const bad of ['', '   ', '.', '+.', '-.', 'NaN', 'Infinity', '-Infinity', '1.2.3', '1e', '1e+', '1_000', 'abc', '1e2.5']) {
				assert.throws(() => addDecimalStable(bad, '1'), RangeError, `expected RangeError for ${JSON.stringify(bad)}`);
				assert.throws(() => addDecimalStable('1', bad), RangeError, `expected RangeError for ${JSON.stringify(bad)}`);
			}
		});

		it('rejects invalid precision arguments', () => {
			assert.throws(() => addDecimalStable('1', '2', '2'), TypeError);
			assert.throws(() => addDecimalStable('1', '2', true), TypeError);
			assert.throws(() => addDecimalStable('1', '2', -1), RangeError);
			assert.throws(() => addDecimalStable('1', '2', 1.5), RangeError);
			assert.throws(() => addDecimalStable('1', '2', Number.NaN), RangeError);
			assert.throws(() => addDecimalStable('1', '2', Number.POSITIVE_INFINITY), RangeError);
			assert.throws(() => addDecimalStable(['1', '2'], -3), RangeError);
		});

		it('rejects exponents outside the safe integer range', () => {
			assert.throws(() => addDecimalStable('1e99999999999999999999', '1'), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches an independent BigInt rational oracle across pseudo-random decimal inputs', () => {
			// Deterministic LCG for reproducible testing
			let seed = 0x12345678;
			const nextRand = () => {
				seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
				return seed;
			};

			const randomDecimal = () => {
				const neg = (nextRand() & 1) === 1 ? '-' : '';
				const intDigits = (nextRand() % 12) + 1;
				const fracDigits = nextRand() % 14;
				let intStr = '';
				for (let i = 0; i < intDigits; i++) intStr += String(nextRand() % 10);
				let fracStr = '';
				for (let i = 0; i < fracDigits; i++) fracStr += String(nextRand() % 10);
				const exp = (nextRand() % 21) - 10;
				const base = fracDigits > 0 ? `${neg}${intStr}.${fracStr}` : `${neg}${intStr}`;
				return (nextRand() % 3 === 0) ? `${base}e${exp}` : base;
			};

			for (let trial = 0; trial < 80; trial++) {
				const a = randomDecimal();
				const b = randomDecimal();
				assert.equal(addDecimalStable(a, b), naiveRationalAddOracle([a, b], null));
				for (const p of [0, 1, 2, 5, 12]) {
					assert.equal(addDecimalStable(a, b, p), naiveRationalAddOracle([a, b], p));
				}

				// Multi-term array cross-check
				const arr = Array.from({ length: 6 }, () => randomDecimal());
				assert.equal(addDecimalStable(arr), naiveRationalAddOracle(arr, null));
				assert.equal(addDecimalStable(arr, 4), naiveRationalAddOracle(arr, 4));
			}
		});

		it('satisfies exact algebraic identities and dyadic telescoping sum cross-check', () => {
			// Exact dyadic telescoping sum: sum_{k=1..60} (2^-k - 2^-(k+1)) === 0.5 - 2^-61
			const halfPow = (k) => {
				// 2^-k = 5^k * 10^-k
				const digits = (5n ** BigInt(k)).toString().padStart(k, '0');
				return `0.${digits}`;
			};
			const terms = [];
			for (let k = 1; k <= 60; k++) {
				terms.push(halfPow(k));
				terms.push(`-${halfPow(k + 1)}`);
			}
			const expected = addDecimalStable('0.5', `-${halfPow(61)}`);
			assert.equal(addDecimalStable(terms), expected);
			assert.equal(addDecimalStable(terms, 20), addDecimalStable('0.5', `-${halfPow(61)}`, 20));

			// Exact associativity and commutativity
			const x = '98765432109876543210.1234567890123456789';
			const y = '-98765432109876543210.0000000000000000001';
			const z = '0.8765432109876543212';
			assert.equal(addDecimalStable(x, y), addDecimalStable(y, x));
			assert.equal(
				addDecimalStable(addDecimalStable(x, y), z),
				addDecimalStable(x, addDecimalStable(y, z)),
			);
			assert.equal(addDecimalStable(addDecimalStable(x, y), z), '1');
		});
	});
});
