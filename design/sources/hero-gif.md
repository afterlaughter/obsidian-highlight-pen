# Building docs/hero.gif

The GIF is rendered from `design/videos/render-project/stage.html`, not exported
from `hero.mp4`. Going through the video costs real colour accuracy: h.264 is
4:2:0, so chroma is stored at half resolution, and the file carries no colour
tags at all, which leaves every player to guess the matrix. Measured against the
brand spec, the mp4 turns `#FFE814` into `#FFF316` and `#8E44FF` into `#885AF9`.
Greys survive, saturated colours do not.

Rendering the page straight to frames avoids all of it, and it is also sharper,
which matters at 800 wide.

## Steps

Put `rendergif.js` next to `stage.html`, with the WebM clips in `clips/`.
Chromium cannot decode h.264, so the clips must be VP8 or VP9, with dense
keyframes so that seeking lands where you asked:

```bash
ffmpeg -i c1_on.mp4 -c:v libvpx-vp9 -crf 20 -b:v 0 -g 6 -cpu-used 4 -an clips/c1_on.webm
```

Render the frames. The arguments are start, end, fps, width, output. Skipping the
opening title card keeps a couple of megabytes and loses nothing, since the
README banner sits directly above the GIF:

```bash
node rendergif.js 4.9 30.0 10 800 clean.mkv
```

That writes lossless FFV1, so the GIF encode starts from something exact.

Then the palette, in two passes, with the plugin's own colours reserved. See
`mkpalette.py` for why this matters:

```bash
ffmpeg -i clean.mkv -vf palettegen=stats_mode=full:max_colors=241 pal.png
python3 mkpalette.py pal.png pal256.png
ffmpeg -i clean.mkv -i pal256.png \
  -filter_complex "[0][1]paletteuse=dither=none:diff_mode=rectangle" \
  -loop 0 hero.gif
```

`dither=none` is deliberate. The artwork is flat panels rather than photographic
gradients, so dithering buys nothing visible and costs about 15 percent of the
file size in noise that no frame differ can compress.

## Where it lands

25.1 seconds, 800 x 450, 10 fps, about 6 MB. All twelve swatches on the closing
card come out pixel exact, which is worth checking if you ever rebuild it.

A GIF is the only motion the README can rely on. GitHub only turns a video into a
player for its own attachment URLs, and it strips a `<video>` tag whose source is
anything else. The Obsidian community site keeps the tag but blocks the media, so
the player renders empty there whatever you point it at. An `<img>` works in both.
