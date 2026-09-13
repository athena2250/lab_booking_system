# Step 8 — External Service Setup

**Status:** 🟡 Repo side done — `.env.example` committed, `npm run check:services` added.
Blocked on the Gmail and Twilio accounts, which have to be created by hand.

Account setup and credentials. Nothing here is code, but [Step 7](07-notifications.md) can't be tested until it's done.

## 1. Gmail (email sending)

Gmail blocks plain password SMTP. You need an **App Password**, which requires 2FA.

1. On the sending Google account, enable **2-Step Verification** (Google Account → Security).
2. Go to **App Passwords**, create one named e.g. "Lab Booking System".
3. Copy the 16-character password — shown once.

```
GMAIL_USER=labbooking@theschool.edu
GMAIL_APP_PASSWORD=abcdefghijklmnop     # no spaces
RECIPIENT_EMAILS=hod@theschool.edu,principal@theschool.edu
```

**Use a dedicated account, not a personal one.** The credential ends up in Vercel env vars and grants send-as rights over that mailbox. A shared school account also means the app keeps working when whoever set it up leaves.

## 2. Twilio (WhatsApp)

No account exists yet.

### Sandbox — for development

1. Sign up at twilio.com (free trial credit).
2. **Messaging → Try it out → Send a WhatsApp message**.
3. Twilio shows a sandbox number and a join code (`join <two-words>`).
4. **The recipient sends that join code from their own phone** to the sandbox number.
5. Copy the Account SID and Auth Token from the console.

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WHATSAPP_TO=whatsapp:+91XXXXXXXXXX
```

**Sandbox limits that will bite during testing:**

- Only numbers that have joined can receive anything.
- The join **expires after 72 hours of inactivity** — the recipient must re-send the join code. A message that worked yesterday and silently fails today is almost always this.
- Messages are prefixed with sandbox boilerplate.

### Production sender — before real use

The sandbox is not acceptable for the actual lab in-charge long term. Moving to production needs:

1. A **Twilio account upgrade** (paid).
2. A **Meta Business account** with verified business details.
3. A **WhatsApp sender** registered in Twilio (a Twilio number or your own), which Meta must approve.

Approval typically takes a few days and **may need school documentation**. Start this early if there's a deadline — it's the longest-lead item in the project.

### Template message rules

WhatsApp only permits free-form messages within a **24-hour window** after the recipient last messaged you. Outside it, you must send a **pre-approved template**.

Bookings are unprompted — the recipient isn't messaging the system — so in production, **booking notifications are template messages**. That means:

- Register a template with Meta containing the field placeholders.
- Send via `contentSid` + `contentVariables`, not a free-form `body`.
- A **bilingual template needs the Kannada text submitted for approval too**, so get the wording reviewed ([Step 7](07-notifications.md)) *before* submitting, not after.

The sandbox hides all of this — free-form works there — so this is the main way "it worked in testing" fails in production. Plan for the template path.

## 3. Session secret

```bash
openssl rand -base64 32
```

```
SESSION_SECRET=<that value>
TEACHER_USERNAME=labbooking
TEACHER_PASSWORD=<something the staff room can be told>
```

## 4. `.env.example`

Committed at [`.env.example`](../.env.example) with values blank, so the required set is documented.

`.gitignore` needed an exception for it — the existing `.env*` rule matched `.env.example` too, so without `!.env.example` the file would have been silently untracked:

```
.env*
!.env.example
```

The real `.env` stays ignored.

```bash
# Database
DATABASE_URL=

# Shared teacher login
TEACHER_USERNAME=
TEACHER_PASSWORD=
SESSION_SECRET=

# Email (Gmail SMTP)
GMAIL_USER=
GMAIL_APP_PASSWORD=
RECIPIENT_EMAILS=

# WhatsApp (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
TWILIO_WHATSAPP_TO=
```

## 5. Verifying the credentials

```bash
npm run check:services            # sends a test email and a test WhatsApp
npm run check:services -- --dry   # checks .env only, sends nothing
npm run check:services -- --email
npm run check:services -- --whatsapp
```

[`scripts/check-services.mjs`](../scripts/check-services.mjs) answers one question — are the credentials in `.env` live? — so it needs no database and no booking, and can be run the moment an account exists. It maps the errors that actually come back: a Gmail `EAUTH` points at the app password, Twilio `21608`/`63024` at a lapsed sandbox join, `63015`/`63016` at the 24-hour window.

It does **not** use `lib/messages.ts`. Those templates are [Step 7](07-notifications.md)'s and are exercised by making a real booking; keeping them out means this script stays a plain Node file with no build step. The WhatsApp test body does carry a Kannada line, though — a handset that renders English fine can still show Kannada as empty boxes, and that is worth finding out before go-live rather than on a real booking.

A `queued` status only means Twilio accepted the message. Delivery still has to be confirmed on the phone.

## Security note

Every one of these is a live credential. Never commit `.env`, never paste the Twilio auth token or Gmail app password into a chat or issue, and rotate immediately if either leaks — a leaked Twilio token can be used to send messages at your expense.

## Acceptance criteria

- [ ] Gmail app password works — `npm run check:services -- --email` passes and the mail reaches both recipients
- [ ] Recipient's phone has joined the Twilio sandbox; `npm run check:services -- --whatsapp` passes and the message arrives, Kannada legible
- [x] `.env.example` committed with every key and no values
- [x] `.env` confirmed untracked (`git check-ignore -v .env`)
- [ ] Production WhatsApp sender path understood, and started if there's a go-live date
