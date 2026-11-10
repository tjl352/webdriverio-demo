import { expect } from '@wdio/globals'

import { baseURL, EbookClient } from '../../support/api/ebooks.client.js'
import { EbooksDb } from '../../support/db/ebooks.js'

describe('ebook store API', () => {
    let userEbooks
    let adminEbooks
    let ebooksDb

    before(async () => {
        const url = baseURL()
        userEbooks = await EbookClient.login(url, process.env.EBOOK_USER || 'user', process.env.EBOOK_PASSWORD || 'user')
        adminEbooks = await EbookClient.login(url, process.env.EBOOK_ADMIN_USER || 'admin', process.env.EBOOK_ADMIN_PASSWORD || 'admin')
        ebooksDb = process.env.DATABASE_URL ? new EbooksDb(process.env.DATABASE_URL) : null
    })

    after(async () => {
        if (ebooksDb) {
            await ebooksDb.close()
        }
    })

    it('GET /api/ebooks lists only unsold originals', async () => {
        const anonymous = await fetch(`${baseURL()}/api/ebooks`)
        await expect(anonymous.status).toBe(401)

        const catalog = await userEbooks.list()
        await expect(catalog.status).toBe(200)
        const ebooks = catalog.json ?? []
        await expect(ebooks.length).toBeGreaterThan(0)
        for (const ebook of ebooks) {
            await expect(typeof ebook.id).toBe('number')
            await expect(['PDF', 'WORD']).toContain(ebook.format)
        }

        const orders = await adminEbooks.listOrders()
        await expect(orders.status).toBe(200)
        const soldIds = new Set((orders.json ?? []).flatMap(order => order.items.map(item => item.ebookId)))
        await expect(ebooks.map(ebook => ebook.id).some(id => soldIds.has(id))).toBe(false)

        if (ebooksDb) {
            const ids = ebooks.map(ebook => ebook.id).sort((a, b) => a - b)
            await expect(ids).toEqual(await ebooksDb.unsoldIds())
        }
    })

    it('POST /api/ebook-orders validates the body and records a sale', async () => {
        const catalog = await userEbooks.list()
        await expect(catalog.status).toBe(200)
        const forSale = catalog.json ?? []
        const sampleId = forSale[0]?.id ?? 101

        const rejected = [
            { ids: [], status: 400, message: 'error.validation', field: 'ebookIds' },
            { ids: [sampleId, sampleId], status: 400, message: 'error.http.400', detail: 'Choose one or more different ebooks' },
            { ids: [999999], status: 404, message: 'error.http.404' },
        ]

        for (const row of rejected) {
            const result = await userEbooks.createOrder(row.ids)
            const problem = result.json
            await expect(result.status).toBe(row.status)
            await expect(problem?.message).toBe(row.message)
            if (row.field) {
                await expect(problem?.fieldErrors).toEqual(
                    expect.arrayContaining([expect.objectContaining({ field: row.field })]),
                )
            }
            if (row.detail) {
                await expect(problem?.detail).toContain(row.detail)
            }
        }

        const orders = await adminEbooks.listOrders()
        await expect(orders.status).toBe(200)
        const soldId = (orders.json ?? []).flatMap(order => order.items.map(item => item.ebookId))[0]
        if (soldId !== undefined) {
            const conflict = await userEbooks.createOrder([soldId])
            await expect(conflict.status).toBe(409)
            await expect(conflict.json?.detail).toContain('Ebook is already sold')
        }

        const ebook = forSale[0]
        await expect(ebook).toBeTruthy()
        const created = await userEbooks.createOrder([ebook.id])
        const order = created.json
        try {
            await expect(created.status).toBe(201)
            await expect(order.customerLogin).toBe(process.env.EBOOK_USER || 'user')
            await expect(order.status).toBe('PAID')
            await expect(order.items).toEqual([
                expect.objectContaining({
                    ebookId: ebook.id,
                    format: ebook.format,
                    quantity: 1,
                    unitPrice: ebook.price,
                }),
            ])

            const afterSale = await userEbooks.list()
            await expect((afterSale.json ?? []).map(item => item.id)).not.toContain(ebook.id)

            if (ebooksDb) {
                const stored = await ebooksDb.findByOrderId(order.id)
                await expect(stored).not.toBeNull()
                await expect(stored.login).toBe(order.customerLogin)
                await expect(stored.status).toBe('PAID')
                await expect(Number(stored.ebook_id)).toBe(ebook.id)
                await expect(stored.quantity).toBe(1)
                await expect(money(stored.unit_price)).toBe(money(ebook.price))
            }
        } finally {
            if (created.status === 201) {
                const removed = await userEbooks.deleteOrder(order.id)
                await expect(removed.status).toBe(204)
            }
        }

        const restored = await userEbooks.list()
        await expect((restored.json ?? []).map(item => item.id)).toContain(ebook.id)
        if (ebooksDb && created.status === 201) {
            await expect(await ebooksDb.findByOrderId(order.id)).toBeNull()
            await expect(await ebooksDb.unsoldIds()).toContain(ebook.id)
        }
    })

    it('order reads, status updates, and deletes stay with the owner', async () => {
        const catalog = await userEbooks.list()
        const ebook = (catalog.json ?? [])[0]
        await expect(ebook).toBeTruthy()

        const created = await userEbooks.createOrder([ebook.id])
        await expect(created.status).toBe(201)
        const order = created.json

        try {
            const mine = await userEbooks.listOrders()
            await expect(mine.status).toBe(200)
            await expect((mine.json ?? []).map(item => item.id)).toContain(order.id)

            const all = await adminEbooks.listOrders()
            await expect(all.status).toBe(200)
            await expect((all.json ?? []).some(item => item.id === order.id && item.customerLogin === order.customerLogin)).toBe(true)

            const someoneElses = (all.json ?? []).find(item => item.customerLogin !== order.customerLogin)
            if (someoneElses) {
                const hidden = await userEbooks.deleteOrder(someoneElses.id)
                await expect(hidden.status).toBe(404)
                await expect(hidden.json?.message).toBe('error.http.404')
            }

            const tooLong = await userEbooks.updateOrder(order.id, 'x'.repeat(21))
            await expect(tooLong.status).toBe(400)
            await expect(tooLong.json?.message).toBe('error.validation')
            await expect(tooLong.json?.fieldErrors).toEqual(
                expect.arrayContaining([expect.objectContaining({ field: 'status', message: 'size must be between 0 and 20' })]),
            )

            const updated = await userEbooks.updateOrder(order.id, 'HELD')
            await expect(updated.status).toBe(200)
            await expect(updated.json.status).toBe('HELD')
            if (ebooksDb) {
                const stored = await ebooksDb.findByOrderId(order.id)
                await expect(stored?.status).toBe('HELD')
                await expect(stored?.login).toBe(order.customerLogin)
            }
        } finally {
            const removed = await userEbooks.deleteOrder(order.id)
            await expect(removed.status).toBe(204)
        }

        const mineAfter = await userEbooks.listOrders()
        await expect((mineAfter.json ?? []).map(item => item.id)).not.toContain(order.id)
        const catalogAfter = await userEbooks.list()
        await expect((catalogAfter.json ?? []).map(item => item.id)).toContain(ebook.id)
        if (ebooksDb) {
            await expect(await ebooksDb.findByOrderId(order.id)).toBeNull()
        }
    })
})

function money (value) {
    if (value === null || value === undefined) {
        return null
    }
    return Number(value)
}
