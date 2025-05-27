# Dashboard Style Guide

## Color Palette
- Background Main: #121212
- Background Panel: #1E1E1E
- Text Main: #E0E0E0
- Text Muted: #AAAAAA
- Accent: #1E88E5
- Accent Hover: #1565C0
- Border Color: #2C2C2C

## Typography
- Base Font: 'Poppins', sans-serif
- Base Font Size: 16px
- Headings: 2rem and above
- Body Text: 1rem

## Component Classes (BEM)
- Sidebar: `.dashboard-sidebar`
- Header: `.dashboard-header`
- Card/Panel: `.dashboard-modern-card`
- Button Accent: `.btn-accent`
- Input/Select: Styled with utility classes

## Layout
- Main container uses flex with gaps for responsive design.
- Map and Reports panels toggle views using `.normal-view`, `.map-maximized`, and `.reports-maximized`.

## Recommendations
- Use PostCSS for autoprefixing and CSS variables.
- Switch to Vite or Webpack for better module bundling.
- Consider CSS modules or TailwindCSS for future scalability.

