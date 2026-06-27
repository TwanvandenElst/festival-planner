# Onboarding screenshots

These images are shown in the iOS "Add to Home Screen" guide
(`app/components/home-screen-guide.tsx`).

Add the two screenshots here (exact filenames required):

- `safari-share.png` — Safari with the Share button at the bottom center.
- `safari-add-home.png` — the Safari share sheet showing "Add to Home Screen".

They render at `max-height: 55vh`, `object-fit: contain`, rounded corners. A pink
highlight box is drawn over the relevant button; if a new screenshot doesn't line
up, adjust the `SHARE_HIGHLIGHT` / `ADD_HOME_HIGHLIGHT` percentages in
`home-screen-guide.tsx`. Until the PNGs are added, the guide hides the missing
image and still shows the step text.
