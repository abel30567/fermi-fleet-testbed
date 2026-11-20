export function add(a, b) {
	return a + b
}

export function sphericalToCartesian(rho, theta, phi) {
	const sinPhi = Math.sin(phi)
	const x = rho * sinPhi * Math.cos(theta)
	const y = rho * sinPhi * Math.sin(theta)
	const z = rho * Math.cos(phi)
	return [x === 0 ? 0 : x, y === 0 ? 0 : y, z === 0 ? 0 : z]
}
