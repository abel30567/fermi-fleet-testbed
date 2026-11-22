/**
 * Computes the 3D vector cross product over complex numbers using a recursive
 * divide-and-conquer formulation of the formal 3x3 determinant cofactor expansion.
 *
 * Convention:
 * Uses the standard bilinear complex cross product (without complex conjugation):
 *   (u × v)_0 = u_1 * v_2 - u_2 * v_1
 *   (u × v)_1 = u_2 * v_0 - u_0 * v_2
 *   (u × v)_2 = u_0 * v_1 - u_1 * v_0
 *
 * This satisfies:
 * - Anti-commutativity: u × v = -(v × u) and u × u = 0
 * - Complex bilinearity: (a * u) × v = a * (u × v) = u × (a * v)
 * - Bilinear orthogonality: (u × v) · u = 0 and (u × v) · v = 0 (unconjugated dot product)
 * - Jacobi identity: u × (v × w) + v × (w × u) + w × (u × v) = 0
 * - BAC-CAB identity: u × (v × w) = (u · w) * v - (u · v) * w
 *
 * Algorithm:
 * 1. Validates both 3-element complex vectors and applies lossless power-of-2
 *    exponent scaling when component magnitudes are extreme (preventing spurious
 *    overflow/underflow in intermediate products without introducing rounding error).
 * 2. Partitions the output component index range [0, 3) recursively via divide-and-conquer.
 * 3. For each component j, recursively constructs the 2x2 minor matrix M_{0,j} and
 *    evaluates its determinant via recursive Laplace cofactor expansion with
 *    divide-and-conquer summation, applying cofactor sign (-1)^j.
 * 4. Rescales the result by the combined power-of-2 exponent and normalizes -0 to 0.
 *
 * @typedef {{ re: number, im: number }} Complex
 *
 * @param {Complex[]} u - First 3D complex vector (array of 3 finite { re, im } objects).
 * @param {Complex[]} v - Second 3D complex vector (array of 3 finite { re, im } objects).
 * @returns {Complex[]} The 3D complex cross product u × v as an array of 3 { re, im } objects.
 * @throws {TypeError} If u or v is not an Array, any element is not a non-null object,
 *   or any re/im property is not a number.
 * @throws {RangeError} If u or v does not have length 3, or any re/im value is not finite
 *   (NaN, Infinity, or -Infinity).
 */
export function crossProductComplexRecursive(u, v) {
	validateVector(u, 'u')
	validateVector(v, 'v')

	const expU = computeScaleExponent(u)
	const expV = computeScaleExponent(v)

	const scaledU = expU === 0 ? u : scaleVectorRecursive(u, -expU, 0)
	const scaledV = expV === 0 ? v : scaleVectorRecursive(v, -expV, 0)

	const rawResult = crossComponentsDivideAndConquer([scaledU, scaledV], 0, 3)

	const totalExp = expU + expV
	if (totalExp === 0) {
		return rawResult
	}
	return scaleVectorRecursive(rawResult, totalExp, 0)
}

const SCALE_HIGH_THRESHOLD = 2 ** 450
const SCALE_LOW_THRESHOLD = 2 ** -450
const POW2_STEP = 1000
const POW2_POS_STEP = 2 ** POW2_STEP
const POW2_NEG_STEP = 2 ** -POW2_STEP

function normalizeZero(x) {
	return x === 0 ? 0 : x
}

function normalizeComplex(z) {
	return {
		re: normalizeZero(z.re),
		im: normalizeZero(z.im),
	}
}

function validateComplex(z, vectorName, index) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError(
			`Expected ${vectorName}[${index}] to be a complex object { re, im }`
		)
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError(
			`Expected ${vectorName}[${index}].re and .im to be numbers`
		)
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError(
			`Expected ${vectorName}[${index}].re and .im to be finite numbers`
		)
	}
}

function validateVectorElementsRecursive(vec, name, index) {
	if (index === vec.length) {
		return
	}
	validateComplex(vec[index], name, index)
	validateVectorElementsRecursive(vec, name, index + 1)
}

function validateVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`Expected ${name} to be an array of 3 complex numbers`)
	}
	if (vec.length !== 3) {
		throw new RangeError(
			`Expected ${name} to have length 3, received length ${vec.length}`
		)
	}
	validateVectorElementsRecursive(vec, name, 0)
}

function findMagnitudeBoundsRecursive(vec, index, maxMag, minNonZeroMag) {
	if (index === vec.length) {
		return { maxMag, minNonZeroMag }
	}
	const ar = Math.abs(vec[index].re)
	const ai = Math.abs(vec[index].im)
	let nextMax = maxMag
	let nextMin = minNonZeroMag

	if (ar > nextMax) nextMax = ar
	if (ai > nextMax) nextMax = ai
	if (ar > 0 && ar < nextMin) nextMin = ar
	if (ai > 0 && ai < nextMin) nextMin = ai

	return findMagnitudeBoundsRecursive(vec, index + 1, nextMax, nextMin)
}

function computeScaleExponent(vec) {
	const { maxMag, minNonZeroMag } = findMagnitudeBoundsRecursive(
		vec,
		0,
		0,
		Infinity
	)
	if (maxMag === 0) {
		return 0
	}
	if (maxMag > SCALE_HIGH_THRESHOLD) {
		const maxExp = Math.floor(Math.log2(maxMag))
		const safeDownExp = Math.floor(Math.log2(minNonZeroMag)) + 1000
		return Math.max(0, Math.min(maxExp, safeDownExp))
	}
	if (maxMag < SCALE_LOW_THRESHOLD) {
		return Math.floor(Math.log2(maxMag))
	}
	return 0
}

function scaleByPow2(x, exp) {
	if (x === 0 || exp === 0) {
		return normalizeZero(x)
	}
	if (exp > POW2_STEP) {
		return scaleByPow2(x * POW2_POS_STEP, exp - POW2_STEP)
	}
	if (exp < -POW2_STEP) {
		return scaleByPow2(x * POW2_NEG_STEP, exp + POW2_STEP)
	}
	return normalizeZero(x * 2 ** exp)
}

function scaleVectorRecursive(vec, exp, index) {
	if (index === vec.length) {
		return []
	}
	const scaled = {
		re: scaleByPow2(vec[index].re, exp),
		im: scaleByPow2(vec[index].im, exp),
	}
	return [scaled, ...scaleVectorRecursive(vec, exp, index + 1)]
}

function addComplex(a, b) {
	return normalizeComplex({
		re: a.re + b.re,
		im: a.im + b.im,
	})
}

function negComplex(a) {
	return normalizeComplex({
		re: -a.re,
		im: -a.im,
	})
}

function mulComplex(a, b) {
	return normalizeComplex({
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	})
}

function omitElementRecursive(row, omitCol, colIndex) {
	if (colIndex === row.length) {
		return []
	}
	const rest = omitElementRecursive(row, omitCol, colIndex + 1)
	if (colIndex === omitCol) {
		return rest
	}
	return [row[colIndex], ...rest]
}

function buildMinorRowsRecursive(matrix, omitRow, omitCol, rowIndex) {
	if (rowIndex === matrix.length) {
		return []
	}
	const rest = buildMinorRowsRecursive(matrix, omitRow, omitCol, rowIndex + 1)
	if (rowIndex === omitRow) {
		return rest
	}
	return [omitElementRecursive(matrix[rowIndex], omitCol, 0), ...rest]
}

function expandRowDivideAndConquer(matrix, startCol, endCol) {
	if (endCol - startCol === 1) {
		const col = startCol
		const minor = buildMinorRowsRecursive(matrix, 0, col, 0)
		const subDet = detComplexRecursive(minor)
		const term = mulComplex(matrix[0][col], subDet)
		return col % 2 === 1 ? negComplex(term) : term
	}
	const mid = Math.floor((startCol + endCol) / 2)
	const leftSum = expandRowDivideAndConquer(matrix, startCol, mid)
	const rightSum = expandRowDivideAndConquer(matrix, mid, endCol)
	return addComplex(leftSum, rightSum)
}

function detComplexRecursive(matrix) {
	if (matrix.length === 1) {
		return normalizeComplex(matrix[0][0])
	}
	return expandRowDivideAndConquer(matrix, 0, matrix.length)
}

function crossComponentsDivideAndConquer(rows, start, end) {
	if (end - start === 1) {
		const col = start
		const minor = buildMinorRowsRecursive(rows, -1, col, 0)
		const minorDet = detComplexRecursive(minor)
		const cofactor = col % 2 === 1 ? negComplex(minorDet) : minorDet
		return [normalizeComplex(cofactor)]
	}
	const mid = Math.floor((start + end) / 2)
	const left = crossComponentsDivideAndConquer(rows, start, mid)
	const right = crossComponentsDivideAndConquer(rows, mid, end)
	return [...left, ...right]
}
