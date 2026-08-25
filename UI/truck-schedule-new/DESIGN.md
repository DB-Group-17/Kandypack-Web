---
name: Kandypack Logistics System
colors:
  surface: '#f9f9ff'
  surface-dim: '#d0daf0'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d9e3f9'
  on-surface: '#121c2c'
  on-surface-variant: '#474554'
  inverse-surface: '#273141'
  inverse-on-surface: '#ebf1ff'
  outline: '#777586'
  outline-variant: '#c8c4d7'
  surface-tint: '#5247d8'
  primary: '#4132c7'
  on-primary: '#ffffff'
  primary-container: '#5a4fe0'
  on-primary-container: '#e5e1ff'
  inverse-primary: '#c4c0ff'
  secondary: '#5b3cdd'
  on-secondary: '#ffffff'
  secondary-container: '#7459f7'
  on-secondary-container: '#fffbff'
  tertiary: '#4c4d51'
  on-tertiary: '#ffffff'
  tertiary-container: '#646569'
  on-tertiary-container: '#e3e3e8'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e3dfff'
  primary-fixed-dim: '#c4c0ff'
  on-primary-fixed: '#120068'
  on-primary-fixed-variant: '#3928c0'
  secondary-fixed: '#e5deff'
  secondary-fixed-dim: '#c9bfff'
  on-secondary-fixed: '#1a0063'
  on-secondary-fixed-variant: '#441cc8'
  tertiary-fixed: '#e2e2e7'
  tertiary-fixed-dim: '#c6c6cb'
  on-tertiary-fixed: '#1a1c1f'
  on-tertiary-fixed-variant: '#45474b'
  background: '#f9f9ff'
  on-background: '#121c2c'
  surface-variant: '#d9e3f9'
  sidebar-bg: '#5A4FE0'
  main-bg: '#F5F5FA'
  surface-card: '#FFFFFF'
  status-success-bg: '#E6F6F4'
  status-success-text: '#00B69B'
  status-error-bg: '#FFF0F0'
  status-error-text: '#F93C65'
  status-warning-bg: '#FFF9E6'
  status-warning-text: '#FFB800'
  badge-pastel-blue: '#E0F2FF'
  badge-pastel-purple: '#EBE9FE'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-bold:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-caps:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  sidebar-width: 260px
  container-padding: 2rem
  gutter: 1.5rem
  card-gap: 1rem
  stack-sm: 0.5rem
  stack-md: 1rem
---

## Brand & Style

The design system for Kandypack Logistics is rooted in **Modern Corporate** aesthetics with a focus on efficiency, reliability, and visual clarity. It balances high-productivity utility with a soft, approachable professional interface. The mood is systematic and organized, utilizing a sophisticated palette of deep violets and soft lavenders to differentiate from the typical utilitarian "industrial" look of logistics software.

The visual style employs a refined layering technique:
- **Clean Surfaces:** High-contrast white cards against tinted backgrounds.
- **Strategic Color:** Using pastel accents for status-heavy information.
- **High-End Utility:** Professional typography and consistent geometry to ensure the complex data of rail and road distribution remains legible and navigable.

## Colors

The palette is centered around a commanding "Deep Violet" for primary navigation and a "Light Lavender" for the application canvas. This high-contrast pairing separates the global navigation from the workspace effectively.

- **Primary & Sidebar:** `#5A4FE0` is the structural anchor, used for the sidebar and primary actions.
- **Backgrounds:** The interface uses `#F5F5FA` to provide a soft, low-strain backdrop for white data cards.
- **Semantic Pastels:** For logistics statuses (Pending, In Transit, Delivered), the system uses low-saturation "Pastel-Badge" colors. These allow for multi-status lists (like the Orders table) to be colorful without being visually overwhelming.

## Typography

This design system exclusively uses **Plus Jakarta Sans** to provide a contemporary, geometric humanist feel. The type scale is optimized for data density and hierarchical clarity.

- **Hierarchy:** Large display headings use tighter letter spacing and bold weights to ground the page.
- **Data Clarity:** Tables and lists utilize the 14px `body-sm` for maximum information density without sacrificing legibility.
- **Utility:** Uppercase labels with slight letter-spacing are used for table headers and secondary navigation items to distinguish them from interactive data.

## Layout & Spacing

The layout follows a **Fixed Sidebar + Fluid Content** model. The primary workspace is contained within a fluid grid that adapts to the browser width but maintains consistent internal breathing room.

- **Grid Model:** 12-column grid for dashboard widgets and form layouts.
- **Sidebar:** A fixed 260px vertical navigation bar anchored to the left.
- **Rhythm:** An 8px base unit (0.5rem) governs all spacing. Section headers are separated from content by 1.5rem, while internal card elements use 1rem spacing.
- **Mobile Adaptation:** On mobile, the sidebar collapses into a hamburger menu, and the 12-column layout reflows into a single vertical column with reduced container padding (1rem).

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and soft, ambient shadows rather than heavy borders.

- **Levels:**
  - **Level 0 (Background):** `#F5F5FA` (Main canvas).
  - **Level 1 (Cards/Surface):** Pure `#FFFFFF` with a very soft, diffused shadow (`0px 4px 20px rgba(0, 0, 0, 0.03)`).
  - **Level 2 (Modals/Popovers):** Elevated white surfaces with a more pronounced shadow to indicate focus.
- **Interaction:** Buttons and interactive cards use a subtle "lift" effect (increased shadow depth) on hover to provide tactile feedback.

## Shapes

The shape language is defined by a "Soft Geometric" approach. It avoids harsh corners to maintain an approachable feel while remaining professional.

- **Containers & Cards:** A consistent **16px corner radius** (rounded-lg) is applied to all dashboard widgets, table containers, and modal windows.
- **Interactive Elements:** Buttons, tags, and status badges utilize a **Full Pill** (rounded-full) radius. This visual distinction helps users immediately identify "clickable" or "status" items versus "layout" containers.
- **Inputs:** Form fields use an 8px radius to sit comfortably between the card and button styles.

## Components

### Buttons
- **Primary:** Deep Violet (#5A4FE0) background, white text, pill-shaped.
- **Secondary:** Transparent background, Deep Violet border and text, pill-shaped.
- **Ghost:** No background or border, Deep Violet text.

### Badges & Chips
- Status indicators must use the pastel palette (e.g., "Delivered" uses a light green background with dark green text).
- Always pill-shaped with `label-caps` typography.

### Input Fields
- White background with a 1px border (#E2E8F0).
- Focused state: 1px Deep Violet border with a soft violet outer glow.
- Labels are positioned above the field using `label-bold`.

### Cards
- White background, 16px corner radius, and subtle ambient shadow.
- Used for summary stats, list containers, and form sections.

### Data Tables
- Header row uses the `label-caps` style with a subtle background tint (#F8F9FC).
- Row height is generous (min-height 56px) with 1px horizontal dividers.
- Alternate row striping is not used; depth is created via hover states.