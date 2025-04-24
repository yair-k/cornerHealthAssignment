# Corner Health Intake Form Notification Automation

Automate provider notifications for incomplete patient intake forms using the Healthie EHR GraphQL API.

## Features
- Checks all upcoming appointments in a configurable time window (default: 24 hours for testing, 1 hour for production)
- Verifies if the patient has completed their intake form
- Sends a message to the provider if the intake form is incomplete
- Prints a colorized, boxed summary of all notifications sent

## Quick Start

1. **Install Node.js** (v16+ recommended)
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Configure your `.env` file:**
   ```
   HEALTHIE_API_KEY=your_healthie_api_key_here
   HEALTHIE_API_URL=https://api.gethealthie.com/graphql
   ```
4. **Run the script:**
   ```sh
   node notifyProviders.js
   ```

## Example Output

```
=== INTAKE FORM NOTIFICATION SYSTEM ===
Current time: 4/24/2025, 10:00:00 AM
Checking for appointments between 4/24/2025, 10:00:00 AM and 4/25/2025, 10:00:00 AM
*** TEST MODE ENABLED - Using 24 hour window and simulated time ***

┌─────────────────────────────────────────────────────────────┐
│ Found 2 appointment(s) within the time window               │
│ Processing appointments in chronological order...           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ APPOINTMENT 1 OF 2                                          │
│                                                             │
│ Appointment ID: 148120473                                   │
│ Date & Time:    Thursday, April 24, 2025 at 12:00 PM        │
│ Location:        Secure Videochat                           │
│ Provider:        Anne Gifford (ID: 6282406)                 │
│ Patient:         John Doe (ID: 78910)                       │
│ Intake Completed: No                                        │
└─────────────────────────────────────────────────────────────┘
Patient has not completed intake form. Sending notification to provider...
✓ SUCCESS: Sent message to Provider Anne Gifford about Patient John Doe's incomplete intake form for appointment on Thursday, April 24, 2025 at 12:00 PM

┌─────────────────────────────────────────────────────────────┐
│ === NOTIFICATION PROCESS SUMMARY ===                        │
│ Total appointments found: 2                                 │
│ Total notifications sent: 1                                 │
│                                                             │
│ Messages sent:                                              │
│ 1. Sent message to Provider Anne Gifford about Patient John │
│ Doe's incomplete intake form for appointment on Thursday,   │
│ April 24, 2025 at 12:00 PM                                  │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting
- **Missing dependencies:** Run `npm install`.
- **API errors:** Check your `.env` file for correct API key and URL.
- **No messages sent:** There may be no upcoming appointments with incomplete intake forms in your Healthie sandbox.

## Customization
- Edit the `TIME_WINDOW` config at the top of `notifyProviders.js` to adjust the time window or switch between test/production mode.
- Message content and formatting can be changed in the script.

## Notes
- Script uses dynamic imports for `chalk` and `boxen` for a modern terminal UI.
- For production, set `USE_TEST_MODE: false` and `HOURS_TO_CHECK: 1` in `notifyProviders.js`.

---

For questions or issues, contact your technical team or the project maintainer.
