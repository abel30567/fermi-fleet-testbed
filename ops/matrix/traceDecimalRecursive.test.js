import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceDecimalRecursive } from './traceDecimalRecursive.js';

/**
 * Independent iterative reference implementation using scaled BigInt arithmetic
 * (fixed-point + scientific notation parser, linear loop accumulation).
 */
function iterativeTraceReference(matrix, precision = 20) {
	const parse = (str) => {
		const m = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(
			str
		);
		const sign = m[1] === '-' ? -1n : 1n;
		const intP = m[2] ?? '';
		const fracP = m[3] ?? m[4] ?? '';
		const expP = m[5] !== undefined ? Number(m[5]) : 0;
		const val = BigInt(intP + fracP);
		if (val === 0n) return { c: 0n, e: 0 };
		return { c: sign * val, e: expP - fracP.length };
	};

	const terms = matrix.map((row, i) => parse(row[i]));
	let minExp = 0;
	for (const t of terms) {
		if (t.c !== 0n && t.e < minExp) minExp = t.e;
	}

	let sum = 0n;
	for (const t of terms) {
		if (t.c !== 0n) {
			sum += t.c * 10n ** BigInt(t.e - minExp);
		}
	}

	if (sum === 0n) return '0';

	const targetExp = -precision;
	let scaled = sum;
	let scale = -minExp;

	if (minExp < targetExp) {
		const drop = targetExp - minExp;
		const neg = sum < 0n;
		const abs = neg ? -sum : sum;
		const div = 10n ** BigInt(drop);
		let q = abs / div;
		const r = abs % div;
		if (r * 2n >= div) q += 1n;
		if (q === 0n) return '0';
		scaled = neg ? -q : q;
		scale = precision;
	} else if (minExp > 0) {
		return (sum * 10n ** BigInt(minExp)).toString();
	}

	const neg = scaled < 0n;
	const s = (neg ? -scaled : scaled).toString();
	if (scale === 0) return (neg ? '-' : '') + s;
	const padded = s.length <= scale ? '0' + s.padStart(scale, '0') : s;
	const split = padded.length - scale;
	const intPart = padded.slice(0, split);
	const fracPart = padded.slice(split).replace(/0+$/, '');
	return fracPart
		? `${neg ? '-' : ''}${intPart}.${fracPart}`
		: `${neg ? '-' : ''}${intPart}`;
}

/**
 * Helper to transpose a square matrix.
 */
function transpose(matrix) {
	const n = matrix.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => matrix[j][i])
	);
}

/**
 * Helper to add two matrices of integer/fixed-scale decimal strings with equal decimal places.
 */
function addFixedMatrices(a, b, decimals) {
	const factor = 10n ** BigInt(decimals);
	const toInt = (str) => {
		const neg = str.startsWith('-');
		const clean = neg || str.startsWith('+') ? str.slice(1) : str;
		const [i, f = ''] = clean.split('.');
		const val = BigInt(i) * factor + BigInt(f.padEnd(decimals, '0'));
		return neg ? -val : val;
	};
	const toStr = (v) => {
		if (v === 0n) return '0';
		const neg = v < 0n;
		const s = (neg ? -v : v).toString().padStart(decimals + 1, '0');
		const intP = s.slice(0, s.length - decimals);
		const fracP = s.slice(s.length - decimals).replace(/0+$/, '');
		return fracP
			? `${neg ? '-' : ''}${intP}.${fracP}`
			: `${neg ? '-' : ''}${intP}`;
	};
	return a.map((row, i) =>
		row.map((cell, j) => toStr(toInt(cell) + toInt(b[i][j])))
	);
}

describe('traceDecimalRecursive', () => {
	describe('normal cases', () => {
		it('computes trace of a 1x1 matrix', () => {
			assert.equal(traceDecimalRecursive([['42.5']]), '42.5');
			assert.equal(traceDecimalRecursive([['-0.125']]), '-0.125');
			assert.equal(traceDecimalRecursive([['+7']]), '7');
		});

		it('computes trace of a 2x2 matrix without IEEE-754 error', () => {
			const m = [
				['0.1', '999.99'],
				['-123.45', '0.2'],
			];
			assert.equal(traceDecimalRecursive(m), '0.3');
		});

		it('computes trace of a 3x3 matrix with mixed signs and off-diagonal noise', () => {
			const m = [
				['1.25', '100', '-200'],
				['50', '-3.75', '300'],
				['-75', '88.88', '10.5'],
			];
			assert.equal(traceDecimalRecursive(m), '8');
		});

		it('computes trace of a 5x5 matrix with negative and fractional values', () => {
			const m = [
				['-10.125', '1', '2', '3', '4'],
				['5', '20.25', '6', '7', '8'],
				['9', '10', '-30.5', '11', '12'],
				['13', '14', '15', '40.75', '16'],
				['17', '18', '19', '20', '-5.375'],
			];
			// -10.125 + 20.25 - 30.5 + 40.75 - 5.375 = 15
			assert.equal(traceDecimalRecursive(m), '15');
		});

		it('handles high-precision decimals (> 25 digits) accurately', () => {
			const a = '3.14159265358979323846264338327950288';
			const b = '2.71828182845904523536028747135266249';
			const c = '1.41421356237309504880168872420969807';
			const m = [
				[a, '0', '0'],
				['0', b, '0'],
				['0', '0', c],
			];
			// Exact sum (35 decimal places):
			// 3.14159265358979323846264338327950288
			// 2.71828182845904523536028747135266249
			// 1.41421356237309504880168872420969807
			// = 7.27408804442193352262461957884186344
			assert.equal(
				traceDecimalRecursive(m, 35),
				'7.27408804442193352262461957884186344'
			);
			assert.equal(
				traceDecimalRecursive(m, 30),
				'7.274088044421933522624619578842'
			);
			assert.equal(traceDecimalRecursive(m, 20), '7.27408804442193352262');
			assert.equal(traceDecimalRecursive(m), '7.27408804442193352262');
		});

		it('supports varying precision arguments including 0 and rounding carry', () => {
			const m = [
				['1.9994', '0'],
				['0', '0.0002'],
			]; // exact = 1.9996
			assert.equal(traceDecimalRecursive(m, 4), '1.9996');
			assert.equal(traceDecimalRecursive(m, 3), '2');
			assert.equal(traceDecimalRecursive(m, 2), '2');
			assert.equal(traceDecimalRecursive(m, 0), '2');

			// Round half away from zero for positive and negative values
			assert.equal(traceDecimalRecursive([['2.5']], 0), '3');
			assert.equal(traceDecimalRecursive([['-2.5']], 0), '-3');
			assert.equal(traceDecimalRecursive([['-0.005']], 2), '-0.01');
			assert.equal(traceDecimalRecursive([['-0.004']], 2), '0');
		});

		it('accepts leading-dot, trailing-dot, and scientific notation strings', () => {
			const m = [
				['.5', '1e5'],
				['2.', '5.'],
			];
			assert.equal(traceDecimalRecursive(m, 5), '5.5');
		});
	});

	describe('edge cases', () => {
		it('returns "0" for zero matrices and avoids negative zero', () => {
			const zero3 = [
				['0', '0', '0'],
				['0', '-0.0', '0'],
				['0', '0', '+0.000'],
			];
			assert.equal(traceDecimalRecursive(zero3), '0');

			const cancelNeg = [
				['-0.00001', '0'],
				['0', '0.00001'],
			];
			assert.equal(traceDecimalRecursive(cancelNeg, 5), '0');

			const roundToZeroNeg = [['-0.00000001']];
			assert.equal(traceDecimalRecursive(roundToZeroNeg, 3), '0');
		});

		it('computes trace of identity matrices (tr(I_n) = n)', () => {
			for (const n of [1, 2, 4, 7, 16]) {
				const id = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => (i === j ? '1' : '0'))
				);
				assert.equal(traceDecimalRecursive(id), String(n));
			}
		});

		it('preserves precision under catastrophic cancellation (1e30 + 1e-30 - 1e30)', () => {
			const tiny = '0.000000000000000000000000000001'; // 1e-30
			const m = [
				['1e30', '0', '0'],
				['0', tiny, '0'],
				['0', '0', '-1e30'],
			];
			assert.equal(traceDecimalRecursive(m, 30), tiny);
			assert.equal(traceDecimalRecursive(m, 35), tiny);
			assert.equal(traceDecimalRecursive(m, 20), '0');

			// Also test ordering where large positive and negative are in separate recursion halves
			const m4 = [
				['1e50', '0', '0', '0'],
				['0', '1.2345678901234567890123456789', '0', '0'],
				['0', '0', '-1e50', '0'],
				['0', '0', '0', '0.0000000000000000000000000001'],
			];
			assert.equal(
				traceDecimalRecursive(m4, 28),
				'1.234567890123456789012345679'
			);
		});

		it('handles very large integers without precision loss', () => {
			const huge = '99999999999999999999999999999999999999999999999999';
			const m = [
				[huge, '0'],
				['0', '1'],
			];
			assert.equal(
				traceDecimalRecursive(m),
				'100000000000000000000000000000000000000000000000000'
			);
		});
	});

	describe('validation errors', () => {
		it('throws on non-array or empty matrix', () => {
			assert.throws(() => traceDecimalRecursive(null), TypeError);
			assert.throws(() => traceDecimalRecursive(undefined), TypeError);
			assert.throws(() => traceDecimalRecursive('1'), TypeError);
			assert.throws(() => traceDecimalRecursive(123), TypeError);
			assert.throws(() => traceDecimalRecursive([]), RangeError);
		});

		it('throws on non-square or ragged matrices', () => {
			assert.throws(
				() =>
					traceDecimalRecursive([
						['1', '2', '3'],
						['4', '5', '6'],
					]),
				RangeError
			);
			assert.throws(
				() =>
					traceDecimalRecursive([
						['1', '2'],
						['3'],
					]),
				RangeError
			);
			assert.throws(
				() => traceDecimalRecursive([['1', '2'], 'not-a-row']),
				TypeError
			);
			assert.throws(() => traceDecimalRecursive(['not-a-row']), TypeError);
		});

		it('throws on non-string or malformed decimal entries (including off-diagonal)', () => {
			assert.throws(() => traceDecimalRecursive([[1]]), TypeError);
			assert.throws(
				() =>
					traceDecimalRecursive([
						['1', 2],
						['3', '4'],
					]),
				TypeError
			);
			assert.throws(() => traceDecimalRecursive([['']]), RangeError);
			assert.throws(() => traceDecimalRecursive([['   ']]), RangeError);
			assert.throws(() => traceDecimalRecursive([['abc']]), RangeError);
			assert.throws(() => traceDecimalRecursive([['NaN']]), RangeError);
			assert.throws(() => traceDecimalRecursive([['Infinity']]), RangeError);
			assert.throws(() => traceDecimalRecursive([['1.2.3']]), RangeError);
			assert.throws(() => traceDecimalRecursive([['1e']]), RangeError);
			assert.throws(
				() =>
					traceDecimalRecursive([
						['1', 'bad'],
						['0', '2'],
					]),
				RangeError
			);
		});

		it('throws on invalid precision values', () => {
			assert.throws(() => traceDecimalRecursive([['1']], -1), RangeError);
			assert.throws(() => traceDecimalRecursive([['1']], 1.5), RangeError);
			assert.throws(() => traceDecimalRecursive([['1']], NaN), RangeError);
			assert.throws(() => traceDecimalRecursive([['1']], Infinity), RangeError);
			assert.throws(() => traceDecimalRecursive([['1']], '10'), TypeError);
			assert.throws(() => traceDecimalRecursive([['1']], null), TypeError);
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		it('matches independent iterative summation across varying matrix sizes and precisions', () => {
			const sizes = [1, 2, 3, 4, 5, 8, 13];
			for (const n of sizes) {
				const matrix = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => {
						const sign = (i + j) % 2 === 0 ? '' : '-';
						if (i === j && i === 0) return '1e25';
						if (i === j && i === n - 1 && n > 1) return '-1e25';
						return `${sign}${i + 1}.${String((i * 7 + j * 13) % 97).padStart(2, '0')}1234567890123456789012345`;
					})
				);

				for (const precision of [0, 5, 20, 27]) {
					const actual = traceDecimalRecursive(matrix, precision);
					const expected = iterativeTraceReference(matrix, precision);
					assert.equal(
						actual,
						expected,
						`Mismatch for n=${n}, precision=${precision}`
					);
				}
			}
		});

		it('satisfies transpose invariance tr(A^T) = tr(A) and linearity tr(A + B) = tr(A) + tr(B)', () => {
			const A = [
				['12.34567890123456789012345', '-99.1', '0.0000001', '4.5'],
				['88.2', '-45.67890123456789012345678', '12.3', '-7.8'],
				['-1.5', '2.5', '78.90123456789012345678901', '9.9'],
				['3.3', '-4.4', '5.5', '-0.00000000000000000000009'],
			];
			const B = [
				['-2.34567890123456789012345', '1.1', '-2.2', '3.3'],
				['4.4', '55.67890123456789012345678', '6.6', '7.7'],
				['8.8', '9.9', '-18.90123456789012345678901', '-1.1'],
				['-2.2', '3.3', '-4.4', '0.00000000000000000000009'],
			];

			// Transpose invariance: tr(A^T) === tr(A)
			assert.equal(
				traceDecimalRecursive(transpose(A), 25),
				traceDecimalRecursive(A, 25)
			);
			assert.equal(
				traceDecimalRecursive(transpose(B), 25),
				traceDecimalRecursive(B, 25)
			);

			// Linearity: tr(A + B) === tr(A) + tr(B)
			const sumAB = addFixedMatrices(A, B, 23);
			const traceSum = traceDecimalRecursive(sumAB, 25);
			const traceA = traceDecimalRecursive(A, 25);
			const traceB = traceDecimalRecursive(B, 25);
			const sumOfTraces = traceDecimalRecursive(
				[
					[traceA, '0'],
					['0', traceB],
				],
				25
			);

			assert.equal(traceSum, sumOfTraces);
			// Exact check: (12.345... - 2.345...) + (-45.678... + 55.678...) + (78.901... - 18.901...) + (-9e-23 + 9e-23) = 10 + 10 + 60 + 0 = 80
			assert.equal(traceSum, '80');
		});
	});
});
