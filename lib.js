export function add(a, b) {
	return a + b
}

export function rotate3DZ(vec, angle) {
	if (!Array.isArray(vec) || vec.length !== 3) {
		throw new TypeError('vec must be a 3D vector [x, y, z]')
	}
	if (typeof angle !== 'number' || Number.isNaN(angle)) {
		throw new TypeError('angle must be a valid number')
	}
	const [x, y, z] = vec
	const c = Math.cos(angle)
	const s = Math.sin(angle)
	return [x * c - y * s, x * s + y * c, z]
}
