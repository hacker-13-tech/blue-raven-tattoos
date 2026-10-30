# Blue Raven Tattoo — full-stack booking website

This project includes a responsive tattoo studio website, a booking request form, PostgreSQL storage, and a private admin dashboard.

## Included
- Public gallery, service prices, about section, FAQ and booking form.
- Price list: small $250+, medium $450+, large $700+, full-day $1,000+.
- Booking requests saved in PostgreSQL.
- 50% deposit policy explained to customers. The site does **not** collect card payments.
- Private admin page at `/admin` to view requests and update their status.
- Basic rate limiting, input validation, session cookies and password hashing.

## Deploy on Render
1. Create a new GitHub repository, for example `blue-raven-tattoo`.
2. Upload the **contents** of this ZIP to the repository (the `package.json` and `server.js` must be at the repository root).
3. In Render, create a **PostgreSQL** database. Copy its **Internal Database URL**.
4. Create a **Web Service** connected to the GitHub repository.
5. Use:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
6. In the web service's Environment settings, add:
   - `DATABASE_URL` = Internal Database URL from Render
   - `SESSION_SECRET` = a long, random secret
   - `ADMIN_USERNAME` = your chosen admin username
   - `ADMIN_PASSWORD` = a strong unique password
   - `NODE_ENV` = `production`
7. Deploy. On startup, the app creates its database tables and the first admin account.
8. Open your Render URL. Test a booking, then open `https://YOUR-SITE.onrender.com/admin` and sign in.

## Local run
Requires Node.js 20+ and a PostgreSQL database.
1. Run `npm install`.
2. Copy `.env.example` to `.env` and fill in the database URL and admin credentials.
3. Run `npm start`.
4. Open `http://localhost:3000`.

## Before advertising
- Replace the gallery placeholder photos with your own tattoo work or photos you have permission to publish.
- Confirm the actual studio location, contact details, currency and accepted payment methods. Prices are currently shown in USD exactly as supplied.
- Set strong production secrets and keep `.env` private.
- Configure a custom domain in Render if desired.
- Test booking notifications and check the admin dashboard regularly. This starter stores requests in the database but does not yet email or text the studio automatically.
