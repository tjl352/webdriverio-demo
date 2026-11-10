export class EbookClient {
    constructor (baseURL, token) {
        this.baseURL = baseURL
        this.token = token
    }

    static async login (baseURL, username, password) {
        const response = await fetch(`${baseURL}/api/authenticate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, rememberMe: false }),
        })
        const body = await response.json()
        if (!response.ok) {
            throw new Error(`Login failed for ${username}: ${response.status} ${JSON.stringify(body)}`)
        }
        return new EbookClient(baseURL, body.id_token)
    }

    list () {
        return this.send('GET', '/api/ebooks')
    }

    createOrder (ebookIds) {
        return this.send('POST', '/api/ebook-orders', { ebookIds })
    }

    listOrders () {
        return this.send('GET', '/api/ebook-orders')
    }

    updateOrder (id, status) {
        return this.send('PUT', `/api/ebook-orders/${id}`, { status })
    }

    deleteOrder (id) {
        return this.send('DELETE', `/api/ebook-orders/${id}`)
    }

    async send (method, path, data) {
        const response = await fetch(`${this.baseURL}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${this.token}`,
                ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            body: data === undefined ? undefined : JSON.stringify(data),
        })
        const text = await response.text()
        const json = text ? JSON.parse(text) : null
        return { status: response.status, json, text }
    }
}

export function baseURL () {
    return process.env.BASE_URL || 'http://localhost:8080'
}
