# Спецификация ассетов (для нейрогенераторов)

Сейчас все спрайты — процедурные заглушки (`src/visual/textures.ts`, `src/visual/scenery.ts`).
Финальные PNG кладутся в `public/assets/` и загружаются с **теми же ключами текстур и размерами** —
код сцен менять не нужно.

**Общий стиль:** 16-bit pixel art, side view, «cozy with a shadow» fantasy — тёплые таверны, фонари и луга
с намёками на мрак (руины, вороны, туман, надгробия); к концу — dark fantasy (багровое небо, мёртвый лес),
но тёплые огоньки остаются. Чёткие пиксели, без сглаживания и полупрозрачных краёв, 1px тёмная обводка у
персонажей, свет сверху-слева. Ограниченная палитра (≤ 32 цвета на спрайт).

**Общий негативный промпт:** `blurry, anti-aliasing, gradient smoothing, 3d render, photo, realistic, text, watermark, isometric, top-down`

| Ключ | Размер (px) | Кадры | Промпт (EN) |
|---|---|---|---|
| `hero-0..3` | 18×25 | 4 (ходьба), спрайт-лист 72×25 | `pixel art side view young wanderer, dark teal hooded cloak, red scarf, short sword at side, small glowing lantern on belt, walk cycle facing right, 1px dark outline, transparent background` |
| `enemy-slime` | 26×19 | 2 (idle) | `pixel art cute green meadow slime with leaf sprout, side view, glossy highlight, slightly menacing eyes` |
| `enemy-goblin` | 22×20 | 2 | `pixel art goblin bandit with dagger and leather vest, yellow glowing eyes, side view facing left` |
| `enemy-wolf` | 32×15 | 2 | `pixel art shadow wolf, dusky purple-grey fur, yellow eyes, bared teeth, side view facing left` |
| `enemy-wraith` | 24×22 | 2 | `pixel art barrow wraith, pale skull face, cyan eyes, tattered blue shroud, floating, side view` |
| `enemy-lich` | 28×25 | 2 | `pixel art lich king boss, golden crown with red gems, bone face, red eyes, purple robe with gold trim, staff with violet orb` |
| `poi-tavern` | 24×17 | 1 | `pixel art cozy medieval roadside tavern, red tiled roof, warm lit windows, hanging golden sign, chimney` |
| `poi-fire` | 18×14 | 4 | `pixel art campfire with logs, warm orange flames, animated` |
| `poi-sign` / `poi-skull` | 18×17 | 1 | `pixel art wooden signpost` / `pixel art skull on a pike, red eye glint` |
| `card-fire/air/earth/water` | 52×72 | 1 | `pixel art fantasy rune card frame, parchment center, ornate gold corners, metal border tinted {red-orange / sky blue / ochre / deep blue}, empty round socket in middle, ribbon at bottom` |
| `card-back` | 52×72 | 1 | `pixel art card back, deep plum, gold filigree border, crescent moon emblem` |
| `icon-*` | 9×9 (+1px обводка) | 1 | `pixel art icon {flame / wind / rock / water drop / spark / coin / note / moon / eye / heart / tree / skull / crown}, 9x9` |
| `env-sky` | 640×(groundY+20) | 1 | `pixel art sky gradient, golden hour → blood moon night, dithered bands` |
| `env-mountains` | 640×130 (тайл по X) | 1 | `pixel art distant mountain range silhouette, seamless horizontal tile, ruined tower on peak, atmospheric haze` |
| `env-hills` | 640×90 (тайл) | 1 | `pixel art rolling hills with forest edge, tiny village with lit windows, windmill, seamless tile` |
| `env-near` | 640×150 (тайл) | 1 | `pixel art roadside foreground: oak trees, pines, dead trees, lantern posts, gravestones, rune stone, fence, seamless tile` |
| `env-ground` | 640×100 (тайл) | 1 | `pixel art grass edge, dirt, cobblestone road, flowers and mushrooms, seamless tile` |
| `env-fg` | 640×50 (тайл) | 1 | `pixel art dark grass and fern silhouettes, foreground, seamless tile` |

Темнота этапа (0..1) сейчас меняет палитру процедурно. Для финальных фонов нужны 3 варианта каждого слоя:
`*-light` (0), `*-dusk` (0.5), `*-dark` (1) — сцена будет выбирать ближайший и плавно затемнять наложением.
