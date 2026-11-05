# Development setup

## Requirements

Install [NVM](https://github.com/nvm-sh/nvm) first. This repository uses Node.js `24.22.0` (Node 24 LTS); both the client and server require Node.js `>=24.22.0 <25`.

From the repository root, install and select the version recorded in `.nvmrc`, then verify the runtime:

```sh
nvm install
nvm use
node --version
npm --version
```

The Node version should be `v24.22.0`. Use the same NVM-managed runtime in each terminal where you run the project.

## Install dependencies

```sh
cd client
npm ci
cd ../server
npm ci
cd ..
```

## Run locally

Configure the server's local environment securely before starting it. The server connects to MongoDB using `MONGODB_URI`; do not put credentials in source control.

Open two terminals from the repository root. In each, run `nvm use` first:

```sh
cd server
npm run dev
```

```sh
cd client
npm run dev
```

## Test and build

```sh
cd server
npm test
cd ../client
npm test
npm run lint
npm run build
```

## Admin inquiry follow-ups

Authenticated admins can set or update a follow-up with `PATCH /api/admin/inquiries/:id/follow-up` and a JSON body such as `{ "followUpAt": "2026-11-05" }`. Send `{ "followUpAt": null }` to clear the date. Mutations require the configured client `Origin`.

Follow-up values are calendar dates supplied as `YYYY-MM-DD`; the API stores them as UTC midnight timestamps. The frontend derives the current local calendar date and sends it as `today` for dashboard counts and due/overdue/upcoming list filters, so date-only selections do not shift across UTC offsets. The list filter is `followUp=due-today`, `overdue`, `upcoming`, or `none`; omit `followUp` to show all inquiries. Completing an inquiry clears its follow-up, and a completed inquiry must be reopened before a new date can be scheduled.

## Lead priority and first response

Inquiry priority is `low`, `normal`, or `high`; new inquiries default to `normal`, and legacy inquiries without a stored value are treated as normal. Authenticated admins can change it with `PATCH /api/admin/inquiries/:id/priority` and a JSON body such as `{ "priority": "high" }`. The mutation requires the configured client `Origin` and rejects any additional body fields.

Use `POST /api/admin/inquiries/:id/first-response` with an empty JSON object (`{}`) after the first customer reply has actually been sent. The server records the timestamp in UTC once; repeated requests return the original timestamp. Both mutation routes are admin-only and require the trusted client origin.

The inquiry list supports backend filters `priority=low|normal|high` and `response=awaiting|responded`, which can be combined with search, status, service, dates, follow-up, and pagination. The dashboard includes high-priority, awaiting-first-response, and response-recorded counts. Response timestamps are displayed in the browser's local timezone. A completed inquiry without a recorded first response remains awaiting; status changes never imply a response.

## Static portfolio content

The public homepage portfolio cards read from `client/src/data/projects.js`. Keep each project's stable ID, display category, filter key, description, and technologies in that file. Optional local media can use `client/public/projects/<project-slug>/cover.webp`, `gallery-01.webp`, and `preview.mp4`; leave unavailable media paths empty. Keep original recordings outside the repository.

## New inquiry email notifications

The backend uses the Resend Node.js SDK to send a best-effort notification to the fixed business inbox `attelier.dev@gmail.com` after an inquiry has been saved. Email is sent only by the server; no provider credential is used by the frontend.

Configure these server-only variables in the deployment environment (or a local server environment file that is not committed):

- `EMAIL_PROVIDER_API_KEY`: the Resend API key.
- `EMAIL_FROM`: the sender address chosen by the project owner, optionally with a display name.

The project owner must choose a sender address on a domain they control and verify that domain in Resend before delivery can succeed. The existing `CLIENT_ORIGIN` setting is used to build the admin inquiry link; production already requires this setting.

If either email setting is missing or the sender address is malformed, the notification is skipped. The server does not fall back to a personal Gmail sender. For enabled sending, the backend makes one Resend attempt with a 4-second timeout after successful persistence. Provider errors and timeouts are safely logged and do not change the successful inquiry response. There are no automatic retries or durable delivery guarantees; the saved inquiry remains the source of truth. A client retry after an uncertain response can create another inquiry and notification. Automated tests mock Resend and never send real email.

## Portfolio projects API

Projects are stored in the MongoDB `projects` collection using the Mongoose `Project` model. The public portfolio API is `GET /api/projects`; it returns only published projects, ordered by featured status, display order, creation time, and ID. Public responses include the fields needed by portfolio cards and omit the publish flag and timestamps.

Project management uses the existing single administrator session and routes under `/api/admin/projects`:

- `GET /api/admin/projects` lists published and unpublished projects.
- `GET /api/admin/projects/:id` retrieves one project.
- `POST /api/admin/projects` creates a draft project.
- `PATCH /api/admin/projects/:id` updates validated project fields.
- `PATCH /api/admin/projects/:id/publish` accepts `{ "published": true|false }`.
- `PATCH /api/admin/projects/:id/featured` accepts `{ "featured": true|false }`.
- `PATCH /api/admin/projects/reorder` accepts `{ "items": [{ "id": "<ObjectId>", "displayOrder": 0 }] }`.

All project mutations require the existing trusted client `Origin`; all admin project routes require the existing administrator session. Permanent deletion is not supported. Slugs are generated from titles on creation when omitted; generated collisions receive a numeric suffix. Explicit slug conflicts return HTTP 409, and changing a slug requires an explicit update.

Project records contain `title`, `slug`, `shortDescription`, `category`, `technologies`, optional `coverImage`, optional `gallery`, optional HTTPS `liveUrl`, `featured`, `published`, and `displayOrder`, plus Mongoose timestamps. Image references accept only `publicId`, a secure Cloudinary delivery URL, and image dimensions/format metadata. Signed Cloudinary image upload is documented below.

## Cloudinary project image uploads

Configure the following values in the ignored local file `server/.env` or in the backend deployment's secret environment. Do not commit the file or place the API secret in frontend configuration:

```dotenv
CLOUDINARY_CLOUD_NAME=<your-cloud-name>
CLOUDINARY_API_KEY=<your-api-key>
CLOUDINARY_API_SECRET=<your-api-secret>
```

The admin endpoint `POST /api/admin/projects/upload-signature` requires the existing administrator session and trusted client `Origin`. Send an empty JSON object. The backend uses the official Cloudinary Node SDK to sign server-selected parameters only: image resource type, the `attelier-project-images` folder/prefix, JPEG/PNG/WebP/AVIF formats, unique filenames, and no overwrite. The response contains the cloud name, API key, timestamp, signature, and fixed upload parameters; it never returns the API secret. The browser then uploads the file directly to Cloudinary and sends only the returned `publicId`, `secureUrl`, `format`, `width`, and `height` when creating or updating a project.

Before saving new image metadata, the backend checks its exact shape, folder prefix, HTTPS Cloudinary host and configured cloud name, then retrieves the asset metadata from Cloudinary. The saved values come from that Cloudinary response; the client-supplied format, dimensions, URL, and public ID must match it. Only JPEG, PNG, WebP, and AVIF up to 5 MB (5,000,000 bytes) are accepted. No server-side URL fetch or automatic asset deletion is performed.

Cloudinary direct signed uploads do not provide a per-request server-enforced 5 MiB cap through the signature. The 5 MiB limit is enforced before project metadata is saved, but a modified client could transfer a larger file to Cloudinary first. A client-side preflight should be added with the future admin upload UI; account-level Cloudinary usage limits can further constrain uploads. The frontend CSP currently needs the exact image source `https://res.cloudinary.com` added to `img-src` in a frontend phase before those images are rendered publicly.
