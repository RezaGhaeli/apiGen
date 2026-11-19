# apiGen: a simple REST API generator

**Live app:** https://rezaghaeli.github.io/apiGen/

Describe a model (its name and attributes) and apiGen writes a complete, ready-to-run Node.js REST API project
for it: **Express 5**, **MongoDB** and **Mongoose 9**. Everything runs in your browser; nothing you type is sent
anywhere.

## What you get

A folder (download it as a `.zip`, or copy the files one by one) with:

| File | What it is |
|---|---|
| `server.js` | the API: a Mongoose schema and model, five REST routes, a JSON 404 and an error handler, and "connect to MongoDB, then listen" |
| `.env` | your connection string and port (read with `dotenv`), so the password is never in the code |
| `.env.example` | the same settings with placeholders, safe to share |
| `package.json` | the dependencies (express, mongoose, dotenv, cors) and `npm start` / `npm run dev` |
| `.gitignore` | keeps `node_modules/` and `.env` out of Git |
| `README.md` | how to run it, the endpoint table, and a curl command for every endpoint |

The generated API, for a model `Book`:

| Method | Path | Success | Errors |
|---|---|---|---|
| GET | `/api/books` | 200 + every book | |
| GET | `/api/books/:id` | 200 + the book | 404 not found, 400 invalid id |
| POST | `/api/books` | 201 + the saved book | 400 invalid data |
| PUT | `/api/books/:id` | 200 + the updated book (send only the fields to change) | 404, 400 |
| DELETE | `/api/books/:id` | 204 | 404, 400 |

Errors are JSON: `{ "error": { "message": "..." } }`. A "classic" route style (`/add`, `/update/:id`,
`/delete/:id`) is also available.

## How to use it

1. Open the app and enter a **model name** (singular, e.g. `Book`). The plural, used for the URL and the
   collection name, is filled in for you.
2. Choose the database: **MongoDB Atlas** (database user, password, cluster address, database name), a **local**
   MongoDB, or **paste a connection string**.
3. Add the **attributes** (name, type, required).
4. Press **Generate API Project**, then **Download project (.zip)**.
5. Unzip it, then in that folder: `npm install` and `npm run dev`. You need Node.js 20 or newer.
6. Test it: the page lists eight requests to send in order (method, URL, body, expected status): create, list,
   get, update, invalid data, invalid id, delete, and get after the delete.

## Run the generator itself

Open `index.html` in a modern browser (keep `apigen.js` and `api.css` next to it), or serve the folder with any
static server. `ApiGen.build(spec)` in `apigen.js` is a pure function, so it can also be used from Node:
`const ApiGen = require('./apigen.js');`.

## Changes in the 2026 version

- Generated code works with current packages: the old `useNewUrlParser` / `useUnifiedTopology` options are
  rejected by today's MongoDB driver, so they are gone.
- The connection string goes in `.env` (with the password URL-encoded), not in `server.js`.
- REST paths and status codes (201, 204, 404, 400), partial updates with `findByIdAndUpdate`
  (`returnDocument: 'after'`, `runValidators: true`), one JSON error handler for CastError and ValidationError.
- Correct plurals (categories, people, statuses), used for both the URL and the collection.
- Names are checked, so the generated code always runs (no spaces, keywords, or built-in names).
- A complete project (package.json, .env, .gitignore, README) and a .zip download.
- A test plan on the page: eight requests in order, with the status each should return.

---

## Support & Donations
If you like this app and enjoy using it, you can donate any amount via:
- **PayPal**: [paypal.me/rezaghaeli](https://paypal.me/rezaghaeli)
- **Buy Me a Coffee**: [buymeacoffee.com/rezaghaeli](https://buymeacoffee.com/rezaghaeli)

Your support encourages me to create more practical apps like this!
