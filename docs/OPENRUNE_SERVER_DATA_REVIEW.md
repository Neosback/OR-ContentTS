# OpenRune server data review (generated read-only from OpenRune-Server-main)

> **Snapshot/reference only:** this is a point-in-time audit of a reference OpenRune checkout, not live project state and not a Studio-owned source file. Re-run the relevant project indexing/validation against the user's current checkout before acting on any listed conflict or range issue.

## Conflicting duplicates (same id, different content)

- npc npc.0_50_49_saltfish (#1530): .data/raw-cache/server/npcs.toml:7  vs  .data/raw-cache/server/npcs.toml:3869  | differs in: respawnRate, contentGroup
- npc npc.ap_guide_parent (#9245): .data/raw-cache/server/npcs.toml:172  vs  content/areas/city/lumbridge/pack/src/main/resources/pack/configs/lumbridge_npcs.toml:1  | differs in: moveRestrict, respawnDir
- npc npc.godwars_bandos_avatar (#2215): .data/raw-cache/server/npcs.toml:1490  vs  .data/raw-cache/server/npcs.toml:2180  | differs in: huntMode, huntRange, maxRange, defaultMode
- npc npc.godwars_saradomin_avatar (#2205): .data/raw-cache/server/npcs.toml:1550  vs  .data/raw-cache/server/npcs.toml:2234  | differs in: huntMode, huntRange, maxRange, defaultMode
- npc npc.godwars_zamorak_avatar (#3129): .data/raw-cache/server/npcs.toml:1608  vs  .data/raw-cache/server/npcs.toml:2324  | differs in: huntMode, huntRange, maxRange, defaultMode
- npc npc.godwars_spiritual_bandos_mage (#2244): .data/raw-cache/server/npcs.toml:1958  vs  .data/raw-cache/server/npcs.toml:2261  | differs in: category
- npc npc.godwars_spiritual_bandos_ranger (#2242): .data/raw-cache/server/npcs.toml:1963  vs  .data/raw-cache/server/npcs.toml:2268  | differs in: category
- npc npc.godwars_spiritual_bandos_warrior (#2243): .data/raw-cache/server/npcs.toml:1968  vs  .data/raw-cache/server/npcs.toml:2275  | differs in: category
- npc npc.godwars_spiritual_armadyl_mage (#3168): .data/raw-cache/server/npcs.toml:2043  vs  .data/raw-cache/server/npcs.toml:2240  | differs in: category
- npc npc.godwars_spiritual_armadyl_ranger (#3167): .data/raw-cache/server/npcs.toml:2048  vs  .data/raw-cache/server/npcs.toml:2247  | differs in: category
- npc npc.godwars_spiritual_armadyl_warrior (#3166): .data/raw-cache/server/npcs.toml:2053  vs  .data/raw-cache/server/npcs.toml:2254  | differs in: category
- npc npc.godwars_spiritual_saradomin_mage (#2212): .data/raw-cache/server/npcs.toml:2133  vs  .data/raw-cache/server/npcs.toml:2282  | differs in: category
- npc npc.godwars_spiritual_saradomin_ranger (#2211): .data/raw-cache/server/npcs.toml:2138  vs  .data/raw-cache/server/npcs.toml:2289  | differs in: category
- npc npc.godwars_spiritual_saradomin_warrior (#2210): .data/raw-cache/server/npcs.toml:2143  vs  .data/raw-cache/server/npcs.toml:2296  | differs in: category
- npc npc.godwars_spiritual_zamorak_mage (#3161): .data/raw-cache/server/npcs.toml:2163  vs  .data/raw-cache/server/npcs.toml:2303  | differs in: category
- npc npc.godwars_spiritual_zamorak_ranger (#3160): .data/raw-cache/server/npcs.toml:2168  vs  .data/raw-cache/server/npcs.toml:2310  | differs in: category
- npc npc.godwars_spiritual_zamorak_warrior (#3159): .data/raw-cache/server/npcs.toml:2173  vs  .data/raw-cache/server/npcs.toml:2317  | differs in: category
- inventory inv.axeshop (#1): .data/raw-cache/server/shops/axe_shop.toml:1  vs  .data/raw-cache/server/shops/axeshop.toml:1  | differs in: name, sellMultiplier, buyMultiplier, delta

## Identical copies (harmless)

- object loc.castledoubledoorl (#1521): .data/raw-cache/server/loc/doors.toml:1  and  .data/raw-cache/server/loc/loc.toml:392
- object loc.opencastledoubledoorl (#1522): .data/raw-cache/server/loc/doors.toml:9  and  .data/raw-cache/server/loc/loc.toml:400
- object loc.castledoubledoorr (#1524): .data/raw-cache/server/loc/doors.toml:17  and  .data/raw-cache/server/loc/loc.toml:408
- object loc.opencastledoubledoorr (#1525): .data/raw-cache/server/loc/doors.toml:25  and  .data/raw-cache/server/loc/loc.toml:416
- object loc.poordoor (#1535): .data/raw-cache/server/loc/doors.toml:33  and  .data/raw-cache/server/loc/loc.toml:424
- object loc.poordooropen (#1536): .data/raw-cache/server/loc/doors.toml:41  and  .data/raw-cache/server/loc/loc.toml:432
- object loc.poshdoor (#1540): .data/raw-cache/server/loc/doors.toml:49  and  .data/raw-cache/server/loc/loc.toml:456
- object loc.poshdooropen (#1541): .data/raw-cache/server/loc/doors.toml:58  and  .data/raw-cache/server/loc/loc.toml:465
- object loc.fencegate_l (#1558): .data/raw-cache/server/loc/doors.toml:84  and  .data/raw-cache/server/loc/loc.toml:490
- object loc.openfencegate_l (#1559): .data/raw-cache/server/loc/doors.toml:93  and  .data/raw-cache/server/loc/loc.toml:499
- object loc.fencegate_r (#1560): .data/raw-cache/server/loc/doors.toml:102  and  .data/raw-cache/server/loc/loc.toml:508
- object loc.openfencegate_r (#1567): .data/raw-cache/server/loc/doors.toml:111  and  .data/raw-cache/server/loc/loc.toml:517
- object loc.fai_varrock_posh_bookcase_short_east_offset (#7180): .data/raw-cache/server/loc/loc.toml:731  and  .data/raw-cache/server/loc/misthalin/varrock.toml:117
- object loc.ladder_from_cellar (#17385): .data/raw-cache/server/loc/loc.toml:1042  and  .data/raw-cache/server/loc/misthalin/dungeons/edgeville_dungeon.toml:6

## Stock values outside the server codec's range (11)

`InventoryServerCodec` stores stock `count` and `restockCycles` as signed 16-bit values, so anything above 32767 wraps negative when the cache is read back.
(`restockCycles = -1` is fine and means "never restocks".)

- shops/aldarin_gem_store.toml:31, :51: restockCycles 36000
- shops/ardougnegemstall.toml:26 (35000), :31 (60000)
- shops/fortis_shop_gems.toml:26 (35000), :31 (60000)
- shops/gemshop.toml:26 (40000), :46 (35000)
- shops/port_roberts_gem_trader.toml:26: restockCycles 35000
- shops/piscarilius_generalstore.toml:21: count 50000
- shops/slayershop.toml:36: count 50000
