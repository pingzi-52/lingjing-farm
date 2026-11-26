# Exploration buildings v8

Created on 2026-10-21 with the built-in OpenAI image generator (`image_gen.imagegen`) for this project. Original prompts are preserved in this directory. The farmhouse in v2 was used as the visual reference; these buildings were generated specifically for this game.

- `workshop-v1.png`: selected transparent workshop refinement; red roof, saw emblem, timber side shed. Prompts: `workshop-initial-prompt.txt`, `workshop-cutout-prompt.txt`.
- `town-hall-v1.png`: blue-green roof, symmetrical porch and village emblem. Prompt: `town-hall-prompt.txt`.
- Both are unchanged generated PNGs, 1536 × 1024, RGBA. Outside pixels are transparent; some transparent pixels retain RGB values. The alpha channel was inspected with Pillow, without editing the images.
- Atlas `main` rectangles crop transparent margins and preserve the source aspect ratio. Phaser anchors each building at its existing footprint's bottom center and scales it to 192px wide. Collision footprints and doors have not changed. Missing individual atlases fall back to the existing farmhouse texture.
- These are high-resolution pixel-styled illustrations downscaled in the game, not native 32px pixel art. They are original prototype additions, separate from the licensed Cainos art and its terms.

SHA-256:

| File | SHA-256 |
| --- | --- |
| town-hall-v1.png | C0D79FD3496C29D4EAC8C23C1F8DF2BCE82E6CAD9134168492EC53404802F55A |
| workshop-v1.png | 57E1BE00CA26A6FC9EEBC215E35487650D22BE3101E8C216B9E2FD4D58EFF319 |
