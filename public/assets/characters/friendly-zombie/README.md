# Friendly Zombie character kit

This folder is the canonical, production-ready home for the Friendly Zombie camera-effect art. The old `assets/effects` files remain as compatibility aliases; new work should use this kit.

## Folder layout

- `01-concept` — full-character visual reference and approved style direction.
- `02-rig` — full-body preview art plus the separated-parts source sheet and alpha version.
- `03-backgrounds` — scenic backdrops that match the character.
- `04-templates` — printable and scan-friendly templates for new characters.

## Naming convention

`<character>__<asset-type>__<subject>__v<revision>.<extension>`

Example: `friendly-zombie__rig__parts-sheet-alpha__v01.png`.

Use a new version rather than overwriting approved source art. Keep the chroma-key PNG as the archival source and use the `alpha` PNG in a renderer after checking its edges against light and dark backgrounds.

## Rig workflow

1. Use `friendly-zombie__concept__front__v01.png` as the visual reference.
2. Use the parts-sheet source to crop or rebuild isolated artwork at the named joints in `friendly-zombie__rig-manifest__v01.json`.
3. Parent pieces in the manifest hierarchy, then drive head, shoulders, elbows, wrists, hips, knees, and ankles when tracking is available.
4. The current live effect intentionally uses face and hand tracking only. Full-body slots are included now so the same kit can graduate to pose tracking without changing the asset convention.
5. For a child-created puppet, print the template, scan it flat, crop each box, and preserve the same slot IDs in a new character folder.

## Quality bar

Keep all parts front-facing, separated at their joints, with 8–12% transparent padding. Avoid baked shadows, scene lighting, and outlines that run across a joint. Supply both left and right hands, lower legs, and shoes as discrete pieces; the printable sheet lists the complete target set.
