---
name: Violet SaaS Logistics
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
  on-surface-variant: '#474553'
  inverse-surface: '#273141'
  inverse-on-surface: '#ebf1ff'
  outline: '#777585'
  outline-variant: '#c8c4d5'
  surface-tint: '#554dc5'
  primary: '#251297'
  on-primary: '#ffffff'
  primary-container: '#3d33ad'
  on-primary-container: '#b2aeff'
  inverse-primary: '#c4c0ff'
  secondary: '#5346ce'
  on-secondary: '#ffffff'
  secondary-container: '#6c61e8'
  on-secondary-container: '#fffbff'
  tertiary: '#303235'
  on-tertiary: '#ffffff'
  tertiary-container: '#46484c'
  on-tertiary-container: '#b6b7bb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e3dfff'
  primary-fixed-dim: '#c4c0ff'
  on-primary-fixed: '#110068'
  on-primary-fixed-variant: '#3c32ac'
  secondary-fixed: '#e3dfff'
  secondary-fixed-dim: '#c5c0ff'
  on-secondary-fixed: '#140067'
  on-secondary-fixed-variant: '#3d2cb8'
  tertiary-fixed: '#e2e2e7'
  tertiary-fixed-dim: '#c6c6cb'
  on-tertiary-fixed: '#1a1c1f'
  on-tertiary-fixed-variant: '#45474b'
  background: '#f9f9ff'
  on-background: '#121c2c'
  surface-variant: '#d9e3f9'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.03em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  sidebar-width: 260px
  gutter: 24px
  margin-desktop: 32px
  margin-mobile: 16px
  card-padding: 24px
  stack-gap: 16px
---

## Brand & Style
The brand personality is efficient, modern, and high-trust, tailored for the logistics sector. The design system utilizes a **Modern Corporate** style with a focus on high legibility and organized data visualization. It prioritizes clarity through generous white space and a structured hierarchy, ensuring that complex shipping and inventory data feel approachable.

The aesthetic combines the reliability of traditional enterprise software with the freshness of contemporary SaaS. Key visual drivers include soft surfaces, vibrant violet accents to signal premium quality, and a "squircle" influence in UI elements that softens the industrial nature of logistics.

## Colors
The palette is anchored by a deep **Midnight Violet** (#3D33AD), used for the sidebar and high-importance interactions. A vibrant secondary violet (#6E63EA) is reserved for active state indicators within the navigation.

The background uses a cool, **Light Lavender/Off-white** to reduce eye strain during long working sessions while maintaining a clean, medical-grade cleanliness. Functional colors (Positive, Negative, Warning) are saturated to ensure status clarity at a glance. For iconography backgrounds, use 10-15% opacity versions of these functional colors to create "pastel square" containers.

## Typography
This design system uses **Plus Jakarta Sans** exclusively to maintain a cohesive, modern geometric feel. Headlines utilize the Semibold weight to provide strong structural anchors for data cards and section headers. 

Body text remains in Regular weight for maximum readability in data-heavy tables and forms. Labels and navigation items use Semibold/Medium weights with slight tracking (letter spacing) to improve legibility at smaller scales.

## Layout & Spacing
The layout follows a **Fixed Sidebar** model with a fluid content area. The sidebar is 260px wide, housing navigation grouped into "Main," "Reports," and "Admin" sections with clear typographic labels for each group.

Content is organized within a responsive container using a 24px gutter. On desktop, cards are laid out in a grid that adapts to 1, 2, or 3 columns depending on the information density (e.g., small KPI cards vs. large transaction tables). Use a base-8 spacing scale (8, 16, 24, 32, 48, 64) for all internal component margins and paddings to ensure a rhythmic vertical flow.

## Elevation & Depth
The design system utilizes **Tonal Layers** supplemented by very soft ambient shadows. 
- **Level 0 (Background):** Light Lavender (#F5F5FA), flat.
- **Level 1 (Cards/Surfaces):** Pure White (#FFFFFF) with a `0px 4px 20px rgba(0, 0, 0, 0.05)` shadow.
- **Level 2 (Dropdowns/Modals):** Pure White (#FFFFFF) with a more pronounced `0px 8px 30px rgba(0, 0, 0, 0.08)` shadow.

The sidebar is treated as a solid, high-contrast layer without shadows, relying on the deep midnight violet color to separate it from the main workspace.

## Shapes
The shape language is defined by a consistent **16px (1rem)** radius for major containers like cards and modals. This "Rounded" approach creates a friendly but professional atmosphere.

Interactive elements such as buttons and status badges deviate from the standard radius to use **Full Pill (999px)** rounding. This distinct visual difference helps users immediately distinguish between "content containers" (square-ish) and "interactive/status elements" (pill-shaped).

## Components

### Buttons & Chips
- **Primary Button:** Pill-shaped, Midnight Violet background, White text.
- **Status Badges:** Pill-shaped, low-opacity background of the status color (e.g., light green) with high-contrast text (e.g., dark green).

### Navigation
- **Sidebar Items:** Clear icons with label text. Active state uses a vibrant violet pill (#6E63EA) that spans the width of the sidebar minus 16px padding on each side.
- **Group Labels:** Small caps, bold, 12px, with reduced opacity to serve as section dividers.

### Cards
- **KPI Cards:** White background, 16px radius, featuring a "pastel square" icon container (40x40px) in the top right or left corner.
- **Data Tables:** Borderless within cards. Row separators use a 1px stroke of the background color (#F5F5FA).

### Input Fields
- **Text Inputs:** Soft grey border (1px), 8px corner radius, and a vibrant violet focus ring.
- **Search Bar:** Large, pill-shaped input in the top header with a subtle search icon.

### Icons
- Use a consistent line-weight icon set (2px stroke). Icons should be nested inside 32px or 40px square containers with rounded corners (8px) and 10% opacity fills matching the icon's primary color.