# Capture App NP — Right-Side Nepali Picker & Pill Overlay Plan

Update DHIS2 Capture's in-form Nepali (Bikram Sambat, BS) date selector so every form date field stays on a single horizontal line with a right-side BS calendar icon and an overlapping top-right BS date pill, and convert the application into a standalone custom DHIS2 app named `capture-app-np` with a fresh App ID and installable ZIP bundle.

## User Review & Critical Decisions

> [!IMPORTANT]
> All core UX and packaging decisions were confirmed during clarification. Once you approve this plan, the updated picker, custom app configuration, and `capture-app-np` ZIP bundle will be built and served for download.

- **Confirmed Decision 1 — Overlapping Pill Position**: Render a compact floating pill anchored on the top-right border of the original AD date input so both AD and BS dates remain simultaneously visible, including inside narrow Age/DoB (`150px`) rows where `Years`, `Months`, and `Days` sit beside the date input.
- **Confirmed Decision 2 — Pill Display Format**: Display numeric BS dates with a `BS` tag inside the pill (e.g., `2083-08-02 BS`, matching `YYYY-MM-DD` or `DD-MM-YYYY` system settings), while retaining month names (`Baisakh`–`Chaitra`) inside the calendar popover.
- **Confirmed Decision 3 — Custom App Identity & Bundle**: Convert the DHIS2 app from a core override (`coreApp: true`) to a custom app (`name: "capture-app-np"`, `coreApp: false`) with a newly generated UUID, rebuild the production ZIP bundle (`capture-app-np-107.9.3.zip`), and update the download endpoint.

---

## 1. Overview & Core Concept

- **What It Does**: Replaces the stacked second input box below every date field with a compact single-row trigger (a Nepali calendar icon button immediately to the right of the native AD date input) plus a non-obstructive floating pill on the top-right input border showing the synchronized BS date whenever a date is populated.
- **Target Audience / Persona**: Health workers, registrars, and DHIS2 administrators in Nepal entering enrollment, DoB/Age, and event dates on DHIS2 instances without altering existing program layouts or overriding core DHIS2 Capture.
- **Key Value**: Preserves exact single-line vertical alignment in composite controls (especially Enrollment DoB beside `Years`/`Months`/`Days`), displays both AD and BS dates side-by-side at a glance, and installs cleanly alongside core Capture as an independent custom DHIS2 app.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Empty Date State**: The native AD `CalendarInput` renders normally with a compact BS calendar icon button immediately to its right; no pill is shown until a date is chosen.
  2. **Selecting via BS Picker**: Clicking the right-side BS icon opens the Bikram Sambat calendar popover (`Baisakh`–`Chaitra` month selector, `2000–2099` year selector, quick BS text jump input inside the popover, `Today`, and `Clear`). Picking a BS day converts to AD, populates the native AD field, triggers Capture's `onBlur` validation and age/rules calculations, and renders the floating `YYYY-MM-DD BS` pill on the top-right border of the AD input.
  3. **Selecting via Native AD Field or Age Inputs**: Typing/picking a date in the native AD calendar—or entering `Years`/`Months`/`Days` in the DoB Age field—automatically computes the BS date and shows/updates the floating `YYYY-MM-DD BS` pill over the top-right border of the AD input.
  4. **Clearing or Correcting**: Clicking the floating pill re-opens the BS picker; clicking `Clear` inside the popover or via Capture's field clear button removes both AD value and BS pill together.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Native DHIS2 Capture utilitarian clinical UI built strictly with `@dhis2/ui` tokens (`colors`, `elevations`, `spacers`, `IconCalendar16`) so the extension blends seamlessly with Capture's inputs.
  - *Floating Pill Styling*: Compact high-contrast pill (`font-size: 10.5px`, `line-height: 14px`, `padding: 1px 6px`, `border-radius: 999px`, `colors.blue050` background with `1px solid colors.blue300` border and `colors.blue800` text) anchored at the top-right border (`top: -9px`) above the AD input text so neither the AD digits nor the `Years`/`Months`/`Days` row is clipped or pushed out of alignment.
  - *Responsive Width Handling*: Uses a single-line flex row (`min-width: 0` on the AD input wrapper plus a fixed `32px` right-side icon button) so both standard `350px` form fields and `150px` DoB fields fit cleanly without wrapping.
  - *Search Filter Preservation*: Working-list date-range filters (`From`/`To`) continue suppressing the BS trigger and pill so table filter bars remain unchanged.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Top-Right Border Floating Pill vs. Stacked Sub-Field**
  - *Chosen Approach*: Single-row AD input + right-side BS icon button + floating top-right BS pill overlay.
  - *Why*: Eliminates vertical height expansion inside horizontal multi-input rows like `AgeField` (`DoB` + `Years` + `Months` + `Days`), keeping every row aligned while ensuring both AD and BS values stay readable simultaneously.
  - *Alternatives Considered*: Keeping a second stacked input below every field (disrupts DoB alignment); placing an inline pill inside the input box (clips AD characters in narrow `150px` DoB inputs).

- **Decision 2 — In-Popover Manual BS Entry**
  - *Chosen Approach*: Move optional manual BS date typing (`YYYY-MM-DD` / `DD-MM-YYYY`) into a compact header input inside the BS calendar popover rather than keeping a second persistent text box in the form.
  - *Why*: Power users still have fast keyboard BS entry (`Enter` to commit & convert to AD) without taking up form real estate.

- **Decision 3 — Custom App Identity (`capture-app-np`)**
  - *Chosen Approach*: Set `coreApp: false`, `name: 'capture-app-np'`, `title: 'Capture NP'`, and assign a newly generated UUID in the DHIS2 app manifest/config.
  - *Why*: Prevents AppHub ID or URL slug collisions with DHIS2's built-in core Capture app (`/dhis-web-capture/`), ensures non-standalone builds automatically resolve relative API root `'../../..'` from `/api/apps/capture-app-np/`, and produces a clean `capture-app-np-107.9.3.zip` package.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ DHIS2 Capture Forms (Enrollment / Single Event / Edit Event / DoB Age) │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ value (AD), calendarMax, dateFormat
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Shared DateField Container (relative flex row, single-line height)      │
│  ┌───────────────────────────────────────┐   ┌───────────────────────┐  │
│  │ Native @dhis2/ui CalendarInput (AD)   │   │ Right-Side BS Icon    │  │
│  │  • Displays AD date (YYYY-MM-DD)      │   │ Button (32px square)  │  │
│  └──────────────────────────▲────────────┘   └───────────┬───────────┘  │
│                             │                            │              │
│   ┌─────────────────────────┴──────────────────────┐     │ opens        │
│   │ Floating Top-Right Pill (when AD date is valid)│◀────┤              │
│   │  "2083-08-02 BS" (clickable to open popover)   │     ▼              │
│   └────────────────────────────────────────────────┘ ┌───────────────┐  │
│                                                      │ BS Calendar   │  │
│                                                      │ Popover       │  │
│                                                      │ • Month/Year  │  │
│                                                      │ • Quick BS in │  │
│                                                      │ • Today/Clear │  │
│                                                      └───────┬───────┘  │
└──────────────────────────────────────────────────────────────┼──────────┘
                                                               │
                 onSelectAdDate(adFormatted, validation) ──────┘
                 via nepali-date-converter (AD ↔ BS)
```

- **State & Conversion Flow**:
  - `DateField` remains controlled by Capture's Redux / form state (`value` is always Gregorian/ISO AD).
  - Derived `syncedBs = adStringToBsParts(adValue, activeFormat)` memoizes the active BS representation (`2083-08-02 BS` / `02-08-2083 BS`) whenever `adValue` updates from the AD calendar, form initialization, or `AgeField` (`Years`/`Months`/`Days`) calculations.
  - Selecting a BS date or committing a typed BS date inside the popover runs `parseAndConvertBsInput` / `bsPartsToAd`, validates against `calendarMax`, and calls `onBlur(adFormatted, validationOptions)` so Capture updates its store and derived fields seamlessly.

- **Custom App & Packaging Flow**:
  - DHIS2 manifest generation emits `appType: "APP"`, `core_app: false`, `short_name: "capture-app-np"`, and the new unique UUID.
  - Running the production custom-app build produces `capture-app-np-107.9.3.zip`, exposed via the server's download route for direct upload in DHIS2 App Management.
