---
name: Steel & Signal
colors:
  surface: '#f8f9fb'
  surface-dim: '#d9dadc'
  surface-bright: '#f8f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f6'
  surface-container: '#edeef0'
  surface-container-high: '#e7e8ea'
  surface-container-highest: '#e1e2e4'
  on-surface: '#191c1e'
  on-surface-variant: '#43474e'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f3'
  outline: '#73777f'
  outline-variant: '#c3c6cf'
  surface-tint: '#436084'
  primary: '#002444'
  on-primary: '#ffffff'
  primary-container: '#1b3a5c'
  on-primary-container: '#87a4cc'
  inverse-primary: '#abc9f2'
  secondary: '#835400'
  on-secondary: '#ffffff'
  secondary-container: '#feb64e'
  on-secondary-container: '#714800'
  tertiary: '#331f00'
  on-tertiary: '#ffffff'
  tertiary-container: '#4f3300'
  on-tertiary-container: '#c49b5f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d2e4ff'
  primary-fixed-dim: '#abc9f2'
  on-primary-fixed: '#001c38'
  on-primary-fixed-variant: '#2b486b'
  secondary-fixed: '#ffddb5'
  secondary-fixed-dim: '#ffb956'
  on-secondary-fixed: '#2a1800'
  on-secondary-fixed-variant: '#643f00'
  tertiary-fixed: '#ffddb1'
  tertiary-fixed-dim: '#ecbf80'
  on-tertiary-fixed: '#291800'
  on-tertiary-fixed-variant: '#5f410c'
  background: '#f8f9fb'
  on-background: '#191c1e'
  surface-variant: '#e1e2e4'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  code-md:
    fontFamily: Courier Prime
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-desktop: 24px
  margin-mobile: 16px
  table-cell-padding: 8px 12px
---

## Brand & Style
The design system is engineered for industrial logistics and high-stakes operations management. It adopts a **Functional Minimalism** aesthetic, prioritizing information density, rapid scanning, and utility over decorative elements. The goal is to evoke the reliability of a physical control room—precise, authoritative, and strictly organized. 

The visual language avoids softness and ambiguity, favoring a "Steel Navy" foundation that suggests structural integrity. Every pixel must serve a diagnostic or navigational purpose, ensuring that operators can manage complex global supply chains with surgical precision.

## Colors
The palette is rooted in industrial materials. **Steel Navy** is used for primary navigation, structural headers, and primary actions to ground the interface. **Amber** serves as the critical accent for warning states, active selections, and "In Transit" status indicators.

Backgrounds utilize a cool **Light Gray** to minimize eye strain during long shifts, while all interactive surfaces (cards, tables, modals) must be pure **White** to maximize contrast with the **Steel Navy** text. Status colors are highly saturated to ensure they pop against the neutral background, allowing for immediate recognition of operational health.

## Typography
This design system utilizes **Inter** exclusively to ensure maximum legibility at small sizes within data-heavy tables. 

- **Headlines:** Use SemiBold (600) for all headings to create clear hierarchy against dense data. Small headings should use uppercase with slight letter spacing to mimic industrial plate engraving.
- **Body:** Regular (400) weight is the workhorse.
- **Data:** For tracking numbers, VINs, or coordinates, use a monospaced font (Courier Prime) if the technical context requires character-level differentiation.
- **Mobile:** Scale `headline-lg` down to 20px for mobile viewports to maintain density.

## Layout & Spacing
The layout follows a **Strict Grid** model based on a 4px baseline. 

- **Density:** This is a high-density system. Vertical spacing between rows in tables and lists should be kept to a minimum (8px to 12px) to maximize the amount of information visible on a single screen.
- **Grid:** Use a 12-column fluid grid for dashboard layouts. 
- **Sidebars:** Use a fixed-width left navigation (240px) in Steel Navy to provide a persistent anchor for the user.
- **Responsive:** On tablet and mobile, the 12-column grid collapses to 4 columns. Data tables should transition to a "card-stack" view or horizontal scroll with a frozen first column for ID persistence.

## Elevation & Depth
In keeping with the "Control Room" philosophy, the design system avoids heavy shadows. 

- **Tonal Layers:** Depth is communicated primarily through color contrast. The background is `#F4F5F7`, and the active workspace is `#FFFFFF`.
- **Low-Contrast Outlines:** Instead of shadows, use 1px solid borders in `#D1D5DB` (Light Gray) to define container boundaries. 
- **Active State:** Only use a subtle, tight shadow (0px 2px 4px rgba(27, 58, 92, 0.1)) for floating elements like dropdown menus or active modals to separate them from the grid.

## Shapes
Shapes are disciplined and sharp. A consistent **4px radius** (Soft) is applied to all buttons, input fields, and cards. This slight rounding prevents the UI from feeling "hostile" while maintaining the rigid, mechanical look of industrial software. Do not use pill-shaped buttons; all interactive elements must be rectangular with the standard 4px radius.

## Components
- **Data Tables:** The primary component. Header rows should have a Steel Navy bottom border (2px). Alternate row striping is recommended for readability in wide sheets.
- **Status Badges:** Use a "Small Label" style. Rectangular with 2px radius. Backgrounds should be low-opacity versions of the status color (e.g., 10% Green) with high-contrast bold text in the full status color.
- **Buttons:** 
  - *Primary:* Solid Steel Navy with White text. 
  - *Secondary:* White background with Steel Navy border and text. 
  - *Warning:* Solid Amber with White text (reserved for critical transit actions).
- **Inputs:** 1px solid border. Focus state uses a 2px Steel Navy border. Labels are always persistent above the field, never floating.
- **Control Panels:** Use "Card" containers with clear, 1px borders and no shadows to group related telemetry data.
- **Breadcrumbs:** Essential for navigating deep logistics hierarchies (e.g., Region > Port > Terminal > Container).