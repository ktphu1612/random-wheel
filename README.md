# Random Wheel

A lucky spin app running on vinext and Cloudflare Workers, with persistent data storage in D1.

## Player Flow

- Open a campaign URL, no code required.
- The browser receives a device-specific cookie for the campaign.
- Each device gets one initial spin.
- Results and history are stored server-side.

## Admin

- Login with `ADMIN_PASSWORD`.
- Create, Pause, End & Clone campaigns.
- Manage prizes, probabilities, inventory, and handover results.
- View the device list and reset selected devices to exactly one available spin.

## Configuration

Create an `.env` from `.env.example` for local environment:

```env
ADMIN_PASSWORD=replace-with-a-long-password
SESSION_SECRET=replace-with-at-least-32-random-characters
```

D1 is declared using the `DB` binding in `.openai/hosting.json`.

## Command

```bash
npm install
npm run dev
npm run lint
npm test
npm run db:generate
```

Require Node.js `>=22.13.0`.
