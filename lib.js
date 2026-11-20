export function add(a, b) {
	return a + b
}

function validateVec3(v, name) {
	if (
		!Array.isArray(v) ||
		v.length !== 3 ||
		typeof v[0] !== 'number' ||
		typeof v[1] !== 'number' ||
		typeof v[2] !== 'number' ||
		!Number.isFinite(v[0]) ||
		!Number.isFinite(v[1]) ||
		!Number.isFinite(v[2])
	) {
		throw new TypeError(`${name} must be a 3D vector of finite numbers`)
	}
}

export function vectorTripleProduct(a, b, c) {
	validateVec3(a, 'a')
	validateVec3(b, 'b')
	validateVec3(c, 'c')

	const bcx = b[1] * c[2] - b[2] * c[1]
	const bcy = b[2] * c[0] - b[0] * c[2]
	const bcz = b[0] * c[1] - b[1] * c[0]

	const x = a[1] * bcz - a[2] * bcy
	const y = a[2] * bcx - a[0] * bcz
	const z = a[0] * bcy - a[1] * bcx

	return [x === 0 ? 0 : x, y === 0 ? 0 : y, z === 0 ? 0 : z]
}
