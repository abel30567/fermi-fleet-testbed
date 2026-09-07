export function add(a, b) {
	return a + b
}

// Jacobian determinant of the polar transform x = r cos(theta), y = r sin(theta).
// Closed form is simply r; verified numerically via finite differences since
// the transform's partial derivatives are cheap to check directly.
export function polarJacobian(r) {
	const analytic = r

	const theta = 0.37 // arbitrary; the Jacobian does not depend on theta
	const h = 1e-6
	const x = (r, theta) => r * Math.cos(theta)
	const y = (r, theta) => r * Math.sin(theta)

	const dxdr = (x(r + h, theta) - x(r - h, theta)) / (2 * h)
	const dydr = (y(r + h, theta) - y(r - h, theta)) / (2 * h)
	const dxdt = (x(r, theta + h) - x(r, theta - h)) / (2 * h)
	const dydt = (y(r, theta + h) - y(r, theta - h)) / (2 * h)

	const numeric = dxdr * dydt - dydr * dxdt

	if (Math.abs(numeric - analytic) > 1e-4) {
		throw new Error(`polarJacobian mismatch: analytic ${analytic}, numeric ${numeric}`)
	}

	return analytic
}
