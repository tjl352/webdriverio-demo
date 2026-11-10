# webdriverio-demo

WebdriverIO checks for the ebook store at `http://localhost:8080`, plus the original browser login demo. The project is JavaScript.

## Ebook API tests

`npm run test:api` runs three tests in `tests/api/ebooks.spec.js` against `BASE_URL` (default `http://localhost:8080`):

1. **`GET /api/ebooks` lists only unsold originals.** A call with no token returns 401. A signed-in user receives the catalog, every row is `PDF` or `WORD`, and none of those ids appear on an order. When `DATABASE_URL` is set, the ids must equal the unsold rows in Postgres.
2. **`POST /api/ebook-orders` validates the body and records a sale.** A data table rejects an empty id list (400 `error.validation`), a repeated id (400 “Choose one or more different ebooks”), and an unknown id (404). An id that is already on an order returns 409. A valid purchase returns 201 with status `PAID`, quantity 1, and the catalog price. The copy leaves the catalog. The test then deletes that order so the copy is for sale again.
3. **Order reads, status updates, and deletes stay with the owner.** The buyer and an admin both see the new order. The buyer gets 404 when deleting someone else’s order. A status longer than 20 characters returns 400 `size must be between 0 and 20`. Status `HELD` is saved. Deleting the order removes it from the buyer’s history and puts the copy back on sale.

Mocha runs the three tests in one file, in order. Each purchase is deleted in a `finally` block, because a copy can be sold only once.

```bash
npm ci
npm run test:api
```

`user` / `user` and `admin` / `admin` are the default accounts. Override them with `EBOOK_USER`, `EBOOK_PASSWORD`, `EBOOK_ADMIN_USER`, and `EBOOK_ADMIN_PASSWORD`.

The dev profile of fullstackapp stores data in the H2 file `target/h2db`, not in Postgres. Leave `DATABASE_URL` unset for that process. The API checks still run. Set `DATABASE_URL` only when it is the same Postgres database the app is writing to, for example after starting the app with the postgres profile:

```bash
export BASE_URL=http://localhost:8080
export DATABASE_URL=postgresql://fullstackapp@localhost:5432/fullstackapp
npm run test:api
```

## How these tests match the six points

### JavaScript, Node.js, WebdriverIO, REST, and PostgreSQL

The suite is JavaScript on Node, run by WebdriverIO’s Mocha runner (`wdio.api.conf.js`). `support/api/ebooks.client.js` signs in with `POST /api/authenticate` and calls `/api/ebooks` and `/api/ebook-orders` through `fetch`. `support/db/ebooks.js` reads `ebook`, `ebook_order`, `ebook_order_item`, and `jhi_user` with `pg`. `baseURL` comes from `BASE_URL` or `http://localhost:8080`.

### Reusable API automation for functional, integration, and data-driven tests

`EbookClient` is the shared HTTP layer. A `before` hook logs in as `user` and `admin` once for the file. The catalog test is the functional check: shape of a book, and a book on an order is not for sale. The purchase test is data-driven: one rejected-request table drives the 400 and 404 cases, then one accepted purchase checks the 201 body. The same purchase is the integration check, because the following lines read that order back from Postgres when `DATABASE_URL` is set. The browser login specs stay in `test/specs` and use the same runner.

### PostgreSQL-backed validation and structured test data

`EbooksDb.unsoldIds()` is the catalog rule in SQL: an ebook with no `ebook_order_item` row. `EbooksDb.findByOrderId()` joins the order, the line, and `jhi_user.login`. After a 201, the test expects login `user`, status `PAID`, quantity 1, and the same unit price the API returned. After the status update, it expects `HELD`. After delete, both queries show the order gone and the ebook for sale again. The id that gets purchased is taken from the live catalog, and the order id comes from the 201 response. Cleanup is the delete call in `finally`, which also removes the Postgres rows through the API. If `DATABASE_URL` is missing, `ebooksDb` is null and these queries are skipped.

### REST API automation and backend validation

Each call keeps the status code and the parsed problem body. The checks are the contract, not only a happy path:

| Call | Expected result |
| --- | --- |
| `GET /api/ebooks` with no token | 401 |
| `POST` with `ebookIds: []` | 400 `error.validation`, field `ebookIds` |
| `POST` with the same id twice | 400, detail contains “Choose one or more different ebooks” |
| `POST` with an unknown id | 404 `error.http.404` |
| `POST` with an id already sold | 409, detail contains “Ebook is already sold” |
| `POST` with one unsold id | 201, `PAID`, quantity 1, catalog price |
| `PUT` with a 21-character status | 400 `error.validation`, “size must be between 0 and 20” |
| `PUT` with `HELD` | 200 and that status |
| `DELETE` of another user’s order | 404 `error.http.404` |
| `DELETE` of the caller’s order | 204 |

`GET /api/ebook-orders` is checked twice: the buyer’s list contains the new id, and the admin list contains that same id with the buyer’s login.

### GitHub Actions

`.github/workflows/wdio.yml` runs on every push and pull request to `main` or `master`. The job starts Postgres 17, installs Node with `npm ci`, and runs `npm run test:api`. `BASE_URL` comes from a repository variable. `DATABASE_URL` comes from a repository secret and should be the database that deployed app writes to. An empty secret leaves the Postgres queries skipped. Allure results are uploaded for 30 days. In CI the spec file retries twice (`specFileRetries`).

### Maintainable architecture

The suite is split by job: `ebooks.client.js` performs HTTP, `ebooks.js` performs SQL, and `ebooks.spec.js` holds the assertions. Both accounts are created in one `before` hook. The three tests share that worker, so they cannot buy the same single copy at the same time. Created orders are deleted even when an assertion fails. `npm run wdio` still runs only the browser specs in `test/specs`.

## Browser login demo

To run the browser login specs:

```bash
cd /Users/thomas/Desktop/webdriverio-demo
npm run wdio
```
