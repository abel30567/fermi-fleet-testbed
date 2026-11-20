export function add(a, b) {
	return a + b
}

function assertVec3(v, name) {
	if (!Array.isArray(v) || v.length !== 3) {
		throw new TypeError(`${name} must be a 3D vector (array of length 3)`)
	}
	for (let i = 0; i < 3; i++) {
		if (typeof v[i] !== 'number' || Number.isNaN(v[i])) {
			throw new TypeError(`${name}[${i}] must be a valid number`)
		}
	}
}

export function scalarTripleProduct(a, b, c) {
	assertVec3(a, 'a')
	assertVec3(b, 'b')
	assertVec3(c, 'c')

	const crossX = b[1] * c[2] - b[2] * c[1]
	const crossY = b[2] * c[0] - b[0] * c[2]
	const crossZ = b[0] * c[1] - b[1] * c[0]

	const result = a[0] * crossX + a[1] * crossY + a[2] * crossZ
	return result === 0 ? 0 : result
}
