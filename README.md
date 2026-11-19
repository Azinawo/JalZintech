# JalZintech POS: offline app + shared cloud database + SMS

Files: index.html (app), sw.js + manifest + icons (offline install), functions/api/sync.js (shared database API),
functions/api/sms.js (Arkesel SMS), schema.sql (database tables), wrangler.toml (Cloudflare settings).

## One-time deploy (Cloudflare Pages + D1, free tier is enough for a shop)
1. Install Node.js. In this folder run:  npx wrangler login
2. Create the database:  npx wrangler d1 create jalzintech
   Copy the database_id it prints into wrangler.toml (replace PASTE-YOUR-DATABASE-ID-HERE).
3. Create the tables:  npx wrangler d1 execute jalzintech --remote --file=schema.sql
4. Deploy:  npx wrangler pages deploy . --project-name jalzintech-pos
5. In Cloudflare dashboard > Workers & Pages > jalzintech-pos > Settings > Variables and Secrets add:
   - SHOP_TOKEN       a long secret. This is the one-time "setup code" used in step 7.
   - SESSION_SECRET   another long random secret (signs sign-in tokens)
   - ARKESEL_API_KEY and SMS_SENDER  (optional, for automatic SMS receipts)
   Then deploy again (step 4) so the variables apply.
6. In index.html set smsToken to the same value as SHOP_TOKEN only if you use SMS; then deploy again.

## First use
7. Open the site on the administrator's device. Create the administrator, add the Owner and Attendants in the Admin tab,
   then in Admin > Cloud sync enter the setup code (SHOP_TOKEN) and press "Connect to cloud".
8. On every other phone/tablet: open the site, on the first screen press "Shop already set up on another device? Connect this device",
   enter your name exactly as created and your PIN (online, once). After that the device works offline.
9. Use "Install app" / "Add to Home screen" on each device while online.

## How sync works
- Every device saves first and uploads when internet is available (every 30 seconds, after each sale, and when it comes back online).
- Stock is merged by the server: each sale subtracts, each owner restock adds, so two phones selling at once stay correct.
- Attendants can upload only sales. Owners can upload products, customers, suppliers, orders and payments. Only the Admin changes users.
- 5 wrong PINs lock sign-in from that device for 10 minutes. Sign-in tokens last 30 days.

## Limits to know
- A 4-digit PIN is weak by nature. Use 6 digits for owners and the admin, and keep the setup code private.
- Offline PIN checking on a device uses a light hash. Do not reuse your bank PIN.
- Changes made on two devices to the same product name/price at the same moment: the last upload wins (stock is always merged safely).
- Erase-all is disabled while cloud sync is on.
- Update the app: change V in sw.js and redeploy.
