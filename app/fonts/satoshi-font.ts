import localFont from 'next/font/local'

// Defined in its OWN module (one that does not import globals.css). next/font
// generates a `.module.css` next to the calling file; if that call lives in
// layout.tsx alongside the `globals.css` import, Turbopack bundles the global
// Tailwind output (with its `*` base reset) into the font's CSS module, which
// fails CSS Modules' "pure selector" rule. Keeping it separate avoids that.
export const satoshi = localFont({
  variable: '--font-satoshi',
  display: 'swap',
  src: [
    { path: './satoshi/Satoshi-Light.woff2', weight: '300', style: 'normal' },
    { path: './satoshi/Satoshi-LightItalic.woff2', weight: '300', style: 'italic' },
    { path: './satoshi/Satoshi-Regular.woff2', weight: '400', style: 'normal' },
    { path: './satoshi/Satoshi-Italic.woff2', weight: '400', style: 'italic' },
    { path: './satoshi/Satoshi-Medium.woff2', weight: '500', style: 'normal' },
    { path: './satoshi/Satoshi-MediumItalic.woff2', weight: '500', style: 'italic' },
    { path: './satoshi/Satoshi-Bold.woff2', weight: '700', style: 'normal' },
    { path: './satoshi/Satoshi-BoldItalic.woff2', weight: '700', style: 'italic' },
    { path: './satoshi/Satoshi-Black.woff2', weight: '900', style: 'normal' },
    { path: './satoshi/Satoshi-BlackItalic.woff2', weight: '900', style: 'italic' },
  ],
})
