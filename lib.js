export function add(a, b) {
	return a + b
}

export function rotate3DX(vec, angle) {
	if (!Array.isArray(vec) || vec.length !== 3) {
		throw new TypeError('vec must be a 3-element array [x, y, z]')
	}
	if (vec.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
		throw new TypeError('vec components must be finite numbers')
	}
	if (typeof angle !== 'number' || !Number.isFinite(angle)) {
		throw new TypeError('angle must be a finite number')
	}

	const [x, y, z] = vec
	const cos = Math.cos(angle)
	const sin = Math.sin(angle)
	const ry = y * cos - z * sin
	const rz = y * sin + z * cos

	return [x + 0, ry + 0, rz + 0]
}
