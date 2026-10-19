# Fonts

Three families, each self-hosted under the SIL Open Font License 1.1 with its
licence beside the files. No page loads fonts from another origin.

| Family | Use | Files | Licence | Upstream |
| --- | --- | --- | --- | --- |
| Source Serif 4 | headings and the Willow wordmark (run site, app, sign-in) | `source-serif-4/` (Latin; weights 200–900, optical sizes) | `source-serif-4/LICENSE.txt` | https://github.com/adobe-fonts/source-serif |
| Figtree | body text on the run site, in the app and on sign-in | `figtree/` (Latin, Latin Extended; weights 300–900) | `figtree/LICENSE.txt` | https://github.com/erikdkennedy/figtree |
| JetBrains Mono | the run site's terminal and code cards | `jetbrains-mono/` (Latin; weights 100–800) | `jetbrains-mono/LICENSE.txt` | https://github.com/JetBrains/JetBrainsMono |

The variable WOFF2 subsets come from Fontsource's distributions (5.3.0).

The run site's faces are declared once in `public/site/theme.css` with its
tokens. The app's pages link `/fonts/fonts.css`; `public/rer-theme.css`
declares the faces for the shared installer, sign-in and `/setup` frames.
