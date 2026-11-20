export function add(a, b) {
	return a + b
}

export function matInv3(A) {
	if (!Array.isArray(A) || A.length !== 3 || A.some((row) => !Array.isArray(row) || row.length !== 3)) {
		throw new TypeError('Input must be a 3x3 matrix')
	}

	const [[a, b, c], [d, e, f], [g, h, i]] = A
	const entries = [a, b, c, d, e, f, g, h, i]
	let maxAbs = 0
	for (const v of entries) {
		if (typeof v !== 'number' || !Number.isFinite(v)) {
			throw new TypeError('Matrix entries must be finite numbers')
		}
		const av = Math.abs(v)
		if (av > maxAbs) maxAbs = av
	}

	const c00 = e * i - f * h
	const c01 = f * g - d * i
	const c02 = d * h - e * g
	const c10 = c * h - b * i
	const c11 = a * i - c * g
	const c12 = b * g - a * h
	const c20 = b * f - c * e
	const c21 = c * d - a * f
	const c22 = a * e - b * d

	const det = a * c00 + b * c01 + c * c02
	if (maxAbs === 0 || !Number.isFinite(det) || Math.abs(det) <= 1e-12 * maxAbs * maxAbs * maxAbs) {
		throw new Error('Matrix is singular')
	}

	const invDet = 1 / det
	const norm = (x) => (x === 0 ? 0 : x)

	return [
		[norm(c00 * invDet), norm(c10 * invDet), norm(c20 * invDet)],
		[norm(c01 * invDet), norm(c11 * invDet), norm(c21 * invDet)],
		[norm(c02 * invDet), norm(c12 * invDet), norm(c22 * invDet)],
	]
}
