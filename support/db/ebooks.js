import pg from 'pg'

const { Pool } = pg

/**
 * Reads the ebook store tables the API writes: ebook, ebook_order, ebook_order_item.
 * The connection must be the same database the app on BASE_URL is using.
 */
export class EbooksDb {
    constructor (connectionString) {
        this.pool = new Pool({ connectionString })
    }

    async unsoldIds () {
        const result = await this.pool.query(
            `SELECT e.id
             FROM ebook e
             LEFT JOIN ebook_order_item oi ON oi.ebook_id = e.id
             WHERE oi.id IS NULL
             ORDER BY e.id`,
        )
        return result.rows.map(row => Number(row.id))
    }

    async findByOrderId (orderId) {
        const result = await this.pool.query(
            `SELECT o.id AS order_id, oi.ebook_id, oi.quantity, oi.unit_price, o.status, u.login
             FROM ebook_order o
             JOIN jhi_user u ON u.id = o.user_id
             JOIN ebook_order_item oi ON oi.order_id = o.id
             WHERE o.id = $1`,
            [orderId],
        )
        return result.rows[0] ?? null
    }

    async close () {
        await this.pool.end()
    }
}
